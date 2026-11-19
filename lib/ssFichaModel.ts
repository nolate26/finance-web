// Fuentes nuevas de Stock Selection (Chile):
//   · Fundamentales trimestrales → ficha_statements (macro SubirFicha → POST /api/ficha/ingest)
//   · Proyecciones, payout, Rec y TP → model_headers/model_financials y bank_headers/bank_financials
//
// Reemplazan a stock_selection_v1 y a proyecciones_financieras (+ proyecciones_override, ya
// eliminadas). Mientras no todas las compañías tengan ficha, la ruta cae a stock_selection_v1;
// sin modelo, las proyecciones quedan vacías. Lo informa en fundSource / projSource para que la
// vista lo pinte.
//
// Todo se cruza por TICKER Bloomberg (normBBG), no por nombre: es lo que trae la ficha y el
// modelo, y evita la homologación por nombre de las tablas viejas.
import { prisma } from "@/lib/prisma";
import { normBBG } from "@/lib/bbg";

export const qKey = (fy: number, q: number) => fy * 10 + q;

/** Fundamentales de una compañía. Misma forma para la ficha y para stock_selection_v1. */
export interface Fund {
  currency: "CLP" | "USD";
  metrics: Map<string, Map<number, number>>;      // métrica → qKey → valor (serie TOTAL)
  sharesSeries: Map<string, Map<number, number>>; // "A" | "B" → qKey → acciones (millones)
  annual?: Map<string, Map<number, number>>;      // sólo ficha: métrica → año → valor del período "A"
}

const put = (mm: Map<string, Map<number, number>>, k: string, key: number, v: number) => {
  let m = mm.get(k);
  if (!m) { m = new Map(); mm.set(k, m); }
  m.set(key, v);
};

// Métrica de Stock Selection → línea de la hoja "Send Ficha". Verificado contra
// stock_selection_v1 con Andina (3Q24–1Q26):
//   · balance (debt/equity/minority_interest) y shares calzan exacto en todos los trimestres;
//   · resultados calzan exacto en 1Q y en el año, pero 2Q–4Q reparten distinto entre trimestres
//     (re-expresión por hiperinflación de Argentina). El LTM da igual: 1Q26 = 3.380.920 en ambas.
// La sección importa: "Minorities" existe en el Income Statement (resultado) y en el Balance
// Sheet (patrimonio); minority_interest es el de balance.
export const FICHA_LINES: { metric: string; section: string; line: string; series?: "A" | "B" }[] = [
  { metric: "revenue",           section: "Income Statement", line: "Revenues" },
  { metric: "ebitda",            section: "Income Statement", line: "EBITDA" },
  { metric: "ebit",              section: "Income Statement", line: "EBIT" },
  { metric: "utilidad",          section: "Income Statement", line: "Controlling Net Income" },
  { metric: "shares",            section: "Income Statement", line: "# Shares (mn)" },
  { metric: "shares",            section: "Income Statement", line: "# Shares (mn) A", series: "A" },
  { metric: "shares",            section: "Income Statement", line: "# Shares (mn) B", series: "B" },
  { metric: "debt",              section: "Balance Sheet",    line: "Total Net Debt" },
  { metric: "equity",            section: "Balance Sheet",    line: "Controlling Equity" },
  { metric: "minority_interest", section: "Balance Sheet",    line: "Minorities" },
];

/** Fundamentales de todas las fichas cargadas, por ticker normalizado ("ANDINAB CI"). */
export async function loadFichaFunds(): Promise<Map<string, Fund>> {
  const rows = await prisma.fichaStatement.findMany({
    // Sin la columna LTM ("L"): Stock Selection arma su LTM sumando trimestres.
    where: { periodType: { in: ["A", "Q"] }, OR: FICHA_LINES.map(({ section, line }) => ({ section, line })) },
    select: { ticker: true, currency: true, periodType: true, year: true, quarter: true, section: true, line: true, value: true },
  });
  const byLine = new Map(FICHA_LINES.map((m) => [`${m.section}|${m.line}`, m]));
  const out = new Map<string, Fund>();
  for (const r of rows) {
    const k = normBBG(r.ticker);
    const m = byLine.get(`${r.section}|${r.line}`);
    if (!k || !m) continue;
    let f = out.get(k);
    if (!f) {
      f = { currency: r.currency === "USD" ? "USD" : "CLP", metrics: new Map(), sharesSeries: new Map(), annual: new Map() };
      out.set(k, f);
    }
    const v = Number(r.value);
    if (r.periodType === "A") {
      if (!m.series) put(f.annual!, m.metric, r.year, v);
    } else {
      put(m.series ? f.sharesSeries : f.metrics, m.series ?? m.metric, qKey(r.year, r.quarter), v);
    }
  }
  return out;
}

/** ¿Tiene fundamentales (no sólo acciones) en ese trimestre? */
export const hasPeriod = (f: Fund | undefined, key: number): boolean => {
  if (!f) return false;
  for (const [metric, mm] of f.metrics) if (metric !== "shares" && mm.has(key)) return true;
  return false;
};

// ── Modelos del analista ────────────────────────────────────────────────────────
export interface ModelYear {
  revenue: number | null; ebitda: number | null; ebit: number | null;
  utilidad: number | null; payout: number | null;
}
export interface ModelPick {
  kind: "company" | "bank";
  ticker: string;            // tal como está en el header
  updateDate: Date;
  recc: string | null;
  tp: number | null;
  currency: "CLP" | "USD" | null;
  unit: string | null;
  years: Map<number, ModelYear>; // en la escala del modelo: usar modelScale() antes de mostrar
}

const ccyOf = (raw: string | null): "CLP" | "USD" | null => {
  const m = raw?.trim().toUpperCase().match(/^(CLP|USD)/);
  return m ? (m[1] as "CLP" | "USD") : null;
};

/**
 * Último modelo (compañía o banco) de cada ticker, con los años pedidos.
 * Si un ticker tuviera modelo de compañía y de banco, gana el de fecha más reciente.
 */
export async function loadModelPicks(years: number[]): Promise<Map<string, ModelPick>> {
  const [mh, bh] = await Promise.all([
    prisma.modelHeader.findMany({ select: { ticker: true, updateDate: true, recc: true, tp: true, currency: true, unit: true } }),
    prisma.bankHeader.findMany({ select: { ticker: true, updateDate: true, recc: true, tp: true, currency: true, unit: true } }),
  ]);
  const latest = new Map<string, ModelPick>();
  const consider = (kind: ModelPick["kind"], h: (typeof mh)[number]) => {
    const k = normBBG(h.ticker);
    if (!k) return;
    const prev = latest.get(k);
    if (prev && prev.updateDate >= h.updateDate) return;
    latest.set(k, {
      kind, ticker: h.ticker, updateDate: h.updateDate, recc: h.recc?.trim() || null,
      tp: h.tp != null && h.tp > 0 ? h.tp : null, currency: ccyOf(h.currency), unit: h.unit, years: new Map(),
    });
  };
  for (const h of mh) consider("company", h);
  for (const h of bh) consider("bank", h);

  const picks = [...latest.values()];
  const keyOf = (ticker: string, d: Date) => `${ticker}|${d.toISOString().slice(0, 10)}`;
  const byKey = new Map(picks.map((p) => [keyOf(p.ticker, p.updateDate), p]));
  const where = (kind: ModelPick["kind"]) => ({
    year: { in: years },
    OR: picks.filter((p) => p.kind === kind).map((p) => ({ ticker: p.ticker, updateDate: p.updateDate })),
  });
  const [mf, bf] = await Promise.all([
    picks.some((p) => p.kind === "company")
      ? prisma.modelFinancials.findMany({ where: where("company"), select: { ticker: true, updateDate: true, year: true, revenue: true, ebitda: true, ebit: true, netIncome: true, payout: true } })
      : [],
    picks.some((p) => p.kind === "bank")
      ? prisma.bankFinancials.findMany({ where: where("bank"), select: { ticker: true, updateDate: true, year: true, revenue: true, controllingNetIncome: true, payout: true } })
      : [],
  ]);
  for (const r of mf) {
    byKey.get(keyOf(r.ticker, r.updateDate))?.years.set(r.year, {
      revenue: r.revenue, ebitda: r.ebitda, ebit: r.ebit, utilidad: r.netIncome, payout: r.payout,
    });
  }
  // Bancos: sin EBITDA ni EBIT; la utilidad es la controladora.
  for (const r of bf) {
    byKey.get(keyOf(r.ticker, r.updateDate))?.years.set(r.year, {
      revenue: r.revenue, ebitda: null, ebit: null, utilidad: r.controllingNetIncome, payout: r.payout,
    });
  }
  return latest;
}

/**
 * Factor que lleva los montos del modelo a MILLONES (la escala de la ficha y de la vista).
 *
 * La etiqueta `unit` del header no es confiable: Entel dice "000 mn" y viene en millones, LTM
 * dice "000 mn" en USD y también viene en millones; Andina dice "bn" y sí viene en miles de
 * millones. Por eso se mide: el año reportado del modelo contra el mismo año reportado de la
 * compañía (ficha o stock_selection_v1), y el cociente se aproxima a ×1 o ×1000. Sólo con la
 * MISMA moneda — CLP/USD ≈ 970 se confundiría con ×1000 — y sólo si el cociente cae cerca
 * (±40%). Si no hay con qué medir, la etiqueta:
 * "bn"/"000 mn" en CLP → ×1000; todo lo demás → ×1.
 */
export function modelScale(
  pick: ModelPick,
  reportedYear: number,
  reported: { revenue: number | null; ebitda: number | null; utilidad: number | null } | null,
  reportedCcy: "CLP" | "USD" | null,
): number {
  const my = pick.years.get(reportedYear);
  if (my && reported && pick.currency && pick.currency === reportedCcy) {
    for (const f of ["ebitda", "utilidad", "revenue"] as const) {
      const a = reported[f], b = my[f];
      if (a == null || b == null || a === 0 || b === 0 || Math.sign(a) !== Math.sign(b)) continue;
      const lg = Math.log10(a / b);
      const e = Math.round(lg);
      // Sólo ×1 o ×1000 son escalas reales de una planilla; otro exponente es un modelo con
      // números rotos (Cristales daba ×10) y no debe "corregirse" midiendo.
      if (Math.abs(lg - e) <= 0.15 && (e === 0 || e === 3)) return 10 ** e;
    }
  }
  return pick.currency === "CLP" && /bn|000/i.test(pick.unit ?? "") ? 1000 : 1;
}

/** Recomendación del modelo en el idioma de la vista. */
export function recLabel(recc: string | null): string | null {
  if (!recc) return null;
  const k = recc.trim().toLowerCase();
  return k === "buy" ? "Comprar" : k === "hold" ? "Mantener" : k === "sell" ? "Vender" : recc.trim();
}
