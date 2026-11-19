import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeTicker } from "@/lib/issuer";
import { normBBG } from "@/lib/bbg";

export const dynamic = "force-dynamic";

// Chile → Last Ficha: resumen de resultados de UNA compañía a partir de lo que subió la macro
// "Send Ficha" (ficha_statements + ficha_kpis), con los comentarios de los analistas.
//
//   GET /api/chile/last-ficha                       → compañías con ficha (para el selector)
//   GET /api/chile/last-ficha?ticker=X[&fy=&q=]     → la ficha, con trimestre base fy/q
//                                                    (por defecto el último cargado)
//
// Columnas: todos los años ("A") + el LTM de la hoja ("L", uno por compañía) + "Acumulado n-1"
// y "Acumulado" ("Y", un par por compañía) + los últimos 5 trimestres terminando en el base,
// y para el base la Var% YoY y QoQ.
//
// Moneda: una ficha en CLP se muestra en USD dividiendo los montos por el FX de la última
// subida (CLP mn ÷ FX = USD mn). Ratios, KPIs y "Otros datos" (salvo Market Cap) quedan como
// vienen. ?ccy=local la devuelve sin convertir.
//
// Filas: la misma plantilla que la hoja "Send Ficha" (TEMPLATE). Las líneas subidas se ubican
// por nombre; los ratios (márgenes, Net Debt/EBITDA, ROE, ROIC…) se calculan acá a partir de
// esas líneas. Lo que se subió y no está en la plantilla va al final, en "Otros datos".

export interface LastFichaCompany {
  ticker: string;
  name: string | null;
  lastLabel: string | null; // "3Q26"
  updatedAt: string;        // última carga de la ficha (ISO)
}

// num = montos (enteros, negativos entre paréntesis) · dec = KPIs y precios (1 decimal bajo
// 1.000) · pct = ratio en decimal (0,147 = 14,7%) · x = múltiplo (1.5x)
export type LastFichaFmt = "num" | "dec" | "pct" | "x";

export interface LastFichaRow {
  // Clave del comentario: (source, section, line). section es la sección de origen de la
  // línea, que en "Otros datos" no coincide con la sección donde se muestra.
  source: "statement" | "kpi";
  section: string;
  line: string;
  kind: "value" | "blank";       // blank = fila separadora vacía de la plantilla
  fmt: LastFichaFmt;
  computed: boolean;             // calculada acá, no viene de la hoja
  indent?: boolean;              // sub-línea (COGS, SG&A…): sangría + fondo celeste
  bold?: boolean;
  borderTop?: boolean;           // subtotal: raya arriba
  borderBottom?: boolean;
  band?: boolean;                // CFO / CFI / CFF: banda celeste
  annual: (number | null)[];     // alineado con `years`
  ltm: number | null;            // columna LTM de la hoja (ver ltmLabel)
  ytdPrev: number | null;        // "Acumulado n-1" (ver ytd.prev)
  ytd: number | null;            // "Acumulado" (ver ytd.cur)
  quarterly: (number | null)[];  // alineado con `quarters`
  // Variación del trimestre base. Montos: cur/prev − 1. Ratios y múltiplos: diferencia
  // (cur − prev). null = falta un dato; "NM" = base 0 o cambio de signo.
  yoy: number | "NM" | null;
  qoq: number | "NM" | null;
}

export interface LastFichaSection {
  source: "statement" | "kpi";
  section: string;               // nombre de la sección (KPIs: el subtítulo del bloque)
  title: string;                 // lo que dice la barra oscura
  rows: LastFichaRow[];
}

export interface LastFichaComment {
  source: "statement" | "kpi";
  section: string;
  line: string;
  target: string;            // "line" | "yoy" | "qoq" | "ltm" | "A2025" | "Q2026-3"
  comment: string;
  updatedBy: string | null;
  updatedAt: string;
}

export interface LastFichaPayload {
  ticker: string;
  name: string | null;
  currency: string;              // moneda en que vienen los montos (USD si se convirtió)
  reportedCurrency: string;      // moneda de la hoja
  converted: boolean;            // CLP → USD con `fx`
  fx: number | null;             // FX de la última subida
  updatedAt: string;
  periods: { fy: number; q: number; label: string }[]; // trimestres disponibles (desc), selector del base
  base: { fy: number; q: number; label: string };
  years: number[];                                      // asc
  ltmLabel: string | null;                              // trimestre al que llega el LTM ("3Q26"); null = sin LTM
  ytd: { prev: string; cur: string } | null;            // acumulados: { prev: "9M 2025", cur: "9M 2026" }; null = sin columnas
  quarters: { fy: number; q: number; label: string }[]; // los 5 mostrados (asc)
  yoyLabel: string;                                     // "3Q26 vs 3Q25"
  qoqLabel: string;                                     // "3Q26 vs 2Q26"
  sections: LastFichaSection[];
  comments: LastFichaComment[];
}

const IS = "Income Statement", BS = "Balance Sheet", CF = "Cash Flow";
const N_QUARTERS = 5;

const qLabel = (fy: number, q: number) => `${q}Q${String(fy).slice(2)}`;
const qIdx = (fy: number, q: number) => fy * 4 + (q - 1);

// Ratios subidos (KPIs y "Otros datos"): se detectan por el nombre de la línea o de la
// sección ("Unit Cases Growth (YoY)"). Palabras completas: "Corporate" contiene "rate".
const PCT_RE = /\b(margin|margen|rate|tasa|growth|crecimiento|yoy|qoq|payout|roe|roic)\b|%/i;

// ── Columnas y acceso a valores ─────────────────────────────────────────────────
type Col = { t: "A"; y: number } | { t: "L" } | { t: "Y"; y: number } | { t: "Q"; i: number };
type Num = number | null;

const div = (a: Num, b: Num): Num => (a == null || b == null || b === 0 ? null : a / b);
const abs = (a: Num): Num => (a == null ? null : Math.abs(a));

interface Ctx {
  /** Valor tal como se subió en la columna (sin cálculos). */
  raw: (sec: string, line: string, c: Col) => Num;
  /** Flujo de 12 meses que termina en la columna: año, LTM, o suma de 4 trimestres. */
  flow12: (line: string, c: Col) => Num;
  /** Saldo de balance un año antes de la columna (denominador de ROE / ROIC). */
  prevStock: (line: string, c: Col) => Num;
}

// ── Plantilla (= hoja "Send Ficha") ────────────────────────────────────────────
type Style = Pick<LastFichaRow, "indent" | "bold" | "borderTop" | "borderBottom" | "band">;
type TRow =
  | ({ k: "line"; line: string; from?: string; fmt?: LastFichaFmt } & Style) // from = otra sección (PP&E del balance)
  | ({ k: "calc"; line: string; fmt: "pct" | "x"; f: (ctx: Ctx, c: Col) => Num } & Style)
  | { k: "blank" };

const margin = (num: string, absolute = false) => (x: Ctx, c: Col) => {
  const n = x.raw(IS, num, c);
  return div(absolute ? abs(n) : n, x.raw(IS, "Revenues", c));
};

const TEMPLATE: Record<string, TRow[]> = {
  [IS]: [
    { k: "line", line: "Revenues" },
    { k: "line", line: "Operating Expenses" },
    { k: "line", line: "COGS", indent: true },
    { k: "line", line: "SG&A", indent: true },
    { k: "line", line: "EBIT", bold: true },
    { k: "line", line: "D&A" },
    { k: "line", line: "PP&E", from: BS, indent: true },
    { k: "line", line: "EBITDA", bold: true, borderTop: true },
    { k: "line", line: "Financial Income" },
    { k: "line", line: "Financial Expenses" },
    { k: "line", line: "Equity Income" },
    { k: "line", line: "Other Income / Expenses" },
    { k: "line", line: "FX Gain / Loss" },
    { k: "line", line: "Monetary Correction" },
    { k: "line", line: "EBT", bold: true, borderTop: true },
    { k: "line", line: "Tax" },
    { k: "line", line: "Minorities" },
    { k: "line", line: "Ectraordinary items / Disc. Oper" },
    { k: "line", line: "Controlling Net Income", bold: true, borderTop: true, borderBottom: true },
    // Margen bruto = (Revenues + COGS) / Revenues, con COGS en negativo como en la hoja.
    { k: "calc", line: "Gross Margin", fmt: "pct", f: (x, c) => {
      const rev = x.raw(IS, "Revenues", c), cogs = abs(x.raw(IS, "COGS", c));
      return rev == null || cogs == null ? null : div(rev - cogs, rev);
    } },
    { k: "calc", line: "SG&A / Revenues", fmt: "pct", f: margin("SG&A", true) },
    { k: "calc", line: "EBIT Margin", fmt: "pct", f: margin("EBIT") },
    { k: "calc", line: "D&A / Revenues", fmt: "pct", f: margin("D&A", true) },
    { k: "calc", line: "EBITDA Margin", fmt: "pct", f: margin("EBITDA") },
    { k: "calc", line: "Net Margin", fmt: "pct", f: margin("Controlling Net Income") },
  ],
  [BS]: [
    { k: "line", line: "Cash & Equivalents" },
    { k: "line", line: "Derivatives" },
    { k: "line", line: "Financial Debt" },
    { k: "line", line: "Leases" },
    { k: "line", line: "Total Net Debt", bold: true, borderTop: true },
    { k: "blank" },
    // Deuda neta del cierre sobre EBITDA de 12 meses (en un trimestre: suma de los últimos 4).
    { k: "calc", line: "Net Debt / EBITDA", fmt: "x", bold: true, f: (x, c) => div(x.raw(BS, "Total Net Debt", c), x.flow12("EBITDA", c)) },
    { k: "calc", line: "Net Debt / Equity", fmt: "x", bold: true, f: (x, c) => div(x.raw(BS, "Total Net Debt", c), x.raw(BS, "Controlling Equity", c)) },
    { k: "blank" },
    // Utilidad de 12 meses sobre el patrimonio de un año antes (como la hoja: 2025 = NI 2025 / Equity 2024).
    { k: "calc", line: "ROE", fmt: "pct", f: (x, c) => div(x.flow12("Controlling Net Income", c), x.prevStock("Controlling Equity", c)) },
    { k: "line", line: "Controlling Equity", indent: true },
    // NOPAT de 12 meses (EBIT × (1 − Tax Rate for ROIC)) sobre el capital invertido de un año
    // antes (patrimonio controlador + minoritarios + deuda neta).
    { k: "calc", line: "ROIC", fmt: "pct", f: (x, c) => {
      const ebit = x.flow12("EBIT", c);
      const tax = x.raw(IS, "Tax Rate for ROIC", c) ?? x.raw(IS, "Tax Rate for ROIC", { t: "L" });
      const eq = x.prevStock("Controlling Equity", c), nd = x.prevStock("Total Net Debt", c);
      if (ebit == null || tax == null || eq == null || nd == null) return null;
      return div(ebit * (1 - tax), eq + (x.prevStock("Minorities", c) ?? 0) + nd);
    } },
  ],
  [CF]: [
    { k: "line", line: "CFO", band: true },
    { k: "line", line: "Acquisitions Capex" },
    { k: "line", line: "PP&E Capex" },
    { k: "line", line: "Intangible Capex" },
    { k: "line", line: "PP&E Sale" },
    { k: "line", line: "CFI", band: true },
    { k: "line", line: "Debt changes (Issue + Amort)" },
    { k: "line", line: "Payment of lease liabilities" },
    { k: "line", line: "Interest Paid" },
    { k: "line", line: "Dividends Paid" },
    { k: "line", line: "Stock Buy Back/Issuance" },
    { k: "line", line: "CFF", band: true },
    { k: "line", line: "FX Impact on Cash" },
  ],
};

function variation(cur: Num, prev: Num, fmt: LastFichaFmt): number | "NM" | null {
  if (cur == null || prev == null) return null;
  if (fmt === "pct" || fmt === "x") return cur - prev;
  if (prev === 0 || Math.sign(cur) * Math.sign(prev) < 0) return "NM";
  return cur / prev - 1; // con ambos negativos (costos) mide el crecimiento en magnitud
}

async function companyNames(): Promise<Map<string, string>> {
  const emp = await prisma.empresasIndustriasV2.findMany({ select: { tickerBloomberg: true, nombreChile: true, nombreLatam: true } });
  const m = new Map<string, string>();
  for (const e of emp) {
    // nombre_chile de una serie viene como "Andina-B": la ficha es de la compañía.
    const k = normBBG(e.tickerBloomberg), nm = (e.nombreChile?.trim() || e.nombreLatam?.trim())?.replace(/-[AB]$/i, "");
    if (k && nm && !m.has(k)) m.set(k, nm);
  }
  return m;
}

export async function GET(request: NextRequest) {
  const tickerParam = request.nextUrl.searchParams.get("ticker");
  try {
    // ── Lista de compañías ──
    if (!tickerParam) {
      const [rows, last, names] = await Promise.all([
        prisma.fichaStatement.groupBy({ by: ["ticker"], _max: { updatedAt: true } }),
        prisma.fichaStatement.groupBy({ by: ["ticker"], where: { periodType: "Q" }, _max: { year: true } }),
        companyNames(),
      ]);
      const lastYear = new Map(last.map((r) => [r.ticker, r._max.year]));
      const lastQ = await Promise.all(rows.map(async (r) => {
        const y = lastYear.get(r.ticker);
        if (y == null) return null;
        const q = await prisma.fichaStatement.aggregate({ where: { ticker: r.ticker, periodType: "Q", year: y }, _max: { quarter: true } });
        return q._max.quarter == null ? null : qLabel(y, q._max.quarter);
      }));
      const companies: LastFichaCompany[] = rows
        .map((r, i) => ({
          ticker: r.ticker,
          name: names.get(normBBG(r.ticker) ?? "") ?? null,
          lastLabel: lastQ[i],
          updatedAt: (r._max.updatedAt ?? new Date(0)).toISOString(),
        }))
        .sort((a, b) => (a.name ?? a.ticker).localeCompare(b.name ?? b.ticker));
      return NextResponse.json({ companies });
    }

    // ── Una compañía ──
    const ticker = normalizeTicker(tickerParam);
    const [st, kp, names] = await Promise.all([
      prisma.fichaStatement.findMany({ where: { ticker }, orderBy: { id: "asc" } }),
      prisma.fichaKpi.findMany({ where: { ticker }, orderBy: { id: "asc" } }),
      companyNames(),
    ]);
    if (st.length === 0 && kp.length === 0) {
      return NextResponse.json({ error: `No hay ficha cargada para ${ticker}` }, { status: 404 });
    }

    // Períodos
    const years = [...new Set([...st, ...kp].filter((r) => r.periodType === "A").map((r) => r.year))].sort((a, b) => a - b);
    const qSet = new Map<number, { fy: number; q: number }>();
    for (const r of [...st, ...kp]) if (r.periodType === "Q") qSet.set(qIdx(r.year, r.quarter), { fy: r.year, q: r.quarter });
    const periods = [...qSet.entries()].sort((a, b) => b[0] - a[0]).map(([, p]) => ({ ...p, label: qLabel(p.fy, p.q) }));
    if (periods.length === 0) {
      return NextResponse.json({ error: `La ficha de ${ticker} no tiene trimestres cargados` }, { status: 404 });
    }
    const fy = Number(request.nextUrl.searchParams.get("fy")), q = Number(request.nextUrl.searchParams.get("q"));
    const base = periods.find((p) => p.fy === fy && p.q === q) ?? periods[0];
    const baseI = qIdx(base.fy, base.q);
    const fromIdx = (i: number) => ({ fy: Math.floor(i / 4), q: (i % 4) + 1 });
    const quarters = Array.from({ length: N_QUARTERS }, (_, k) => fromIdx(baseI - (N_QUARTERS - 1) + k))
      .map((p) => ({ ...p, label: qLabel(p.fy, p.q) }));
    const yoyP = fromIdx(baseI - 4), qoqP = fromIdx(baseI - 1);
    const ltmRow = [...st, ...kp].find((r) => r.periodType === "L");
    const ltmI = ltmRow ? qIdx(ltmRow.year, ltmRow.quarter) : null;
    // Acumulados: el par más nuevo ("Acumulado" = año mayor; "Acumulado n-1" = el anterior).
    const ytdRow = [...st, ...kp].filter((r) => r.periodType === "Y").sort((a, b) => b.year - a.year)[0];
    const ytdHead = (y: number) => `${ytdRow!.quarter * 3}M ${y}`;

    // Valores: "statement|<sección>|<línea>|<A2025 · L · Y2026 · Q8105>"
    const pk = (c: Col) => (c.t === "A" ? `A${c.y}` : c.t === "L" ? "L" : c.t === "Y" ? `Y${c.y}` : `Q${c.i}`);
    const colOf = (r: { periodType: string; year: number; quarter: number }): Col =>
      r.periodType === "A" ? { t: "A", y: r.year } : r.periodType === "L" ? { t: "L" } : r.periodType === "Y" ? { t: "Y", y: r.year } : { t: "Q", i: qIdx(r.year, r.quarter) };
    const vals = new Map<string, number>();
    const lineOrder = new Map<string, { section: string; line: string; order: number }>(); // statements subidos
    for (const r of st) {
      vals.set(`statement|${r.section}|${r.line}|${pk(colOf(r))}`, Number(r.value));
      lineOrder.set(`${r.section}|${r.line}`, { section: r.section, line: r.line, order: r.lineOrder });
    }

    const get = (sec: string, line: string, key: string): Num => vals.get(`statement|${sec}|${line}|${key}`) ?? null;
    const ctx: Ctx = {
      raw: (sec, line, c) => {
        const v = get(sec, line, pk(c));
        if (v != null || sec !== BS) return v;
        // Balance sin valor propio en LTM / acumulado: el saldo del trimestre al que llegan.
        if (c.t === "L" && ltmI != null) return get(sec, line, `Q${ltmI}`);
        if (c.t === "Y" && ytdRow) return get(sec, line, `Q${qIdx(c.y, ytdRow.quarter)}`);
        return null;
      },
      flow12: (line, c) => {
        if (c.t === "Y") return null; // un acumulado no es un flujo de 12 meses
        if (c.t !== "Q") return get(IS, line, pk(c));
        // 4Q: el año completo sirve igual (y evita depender de que estén los 4 trimestres).
        if (c.i % 4 === 3) { const a = get(IS, line, `A${Math.floor(c.i / 4)}`); if (a != null) return a; }
        let s = 0;
        for (let i = c.i - 3; i <= c.i; i++) { const v = get(IS, line, `Q${i}`); if (v == null) return null; s += v; }
        return s;
      },
      prevStock: (line, c) => {
        if (c.t === "Y") return null;
        const i = c.t === "A" ? null : c.t === "L" ? ltmI : c.i;
        if (i == null) return c.t === "A" ? get(BS, line, `A${c.y - 1}`) : null;
        return get(BS, line, `Q${i - 4}`) ?? ((i - 4) % 4 === 3 ? get(BS, line, `A${Math.floor((i - 4) / 4)}`) : null);
      },
    };

    // Una fila con sus valores en todas las columnas + la variación del base.
    const cols = {
      annual: years.map((y): Col => ({ t: "A", y })),
      quarterly: quarters.map((p): Col => ({ t: "Q", i: qIdx(p.fy, p.q) })),
    };
    const makeRow = (meta: Omit<LastFichaRow, "annual" | "ltm" | "ytdPrev" | "ytd" | "quarterly" | "yoy" | "qoq">, at: (c: Col) => Num): LastFichaRow => ({
      ...meta,
      annual: cols.annual.map(at),
      ltm: ltmRow ? at({ t: "L" }) : null,
      ytdPrev: ytdRow ? at({ t: "Y", y: ytdRow.year - 1 }) : null,
      ytd: ytdRow ? at({ t: "Y", y: ytdRow.year }) : null,
      quarterly: cols.quarterly.map(at),
      yoy: variation(at({ t: "Q", i: baseI }), at({ t: "Q", i: baseI - 4 }), meta.fmt),
      qoq: variation(at({ t: "Q", i: baseI }), at({ t: "Q", i: baseI - 1 }), meta.fmt),
    });

    // Estados: plantilla + "Otros datos" con lo subido que la plantilla no usa.
    const used = new Set<string>();
    const sections: LastFichaSection[] = [];
    for (const sec of [IS, BS, CF]) {
      const rows = TEMPLATE[sec].map((t): LastFichaRow => {
        if (t.k === "blank") {
          return makeRow({ source: "statement", section: sec, line: "", kind: "blank", fmt: "num", computed: false }, () => null);
        }
        const style: Style = { indent: t.indent, bold: t.bold, borderTop: t.borderTop, borderBottom: t.borderBottom, band: t.band };
        const meta = { source: "statement" as const, section: sec, line: t.line, kind: "value" as const, ...style };
        if (t.k === "calc") return makeRow({ ...meta, fmt: t.fmt, computed: true }, (c) => t.f(ctx, c));
        const from = t.from ?? sec;
        used.add(`${from}|${t.line}`);
        return makeRow({ ...meta, fmt: t.fmt ?? "num", computed: false }, (c) => ctx.raw(from, t.line, c));
      });
      sections.push({ source: "statement", section: sec, title: sec, rows });
    }
    // Comentario de PP&E: es la línea del balance aunque se muestre en el estado de resultados.
    for (const r of sections[0].rows) if (r.line === "PP&E") r.section = BS;

    const SEC_ORDER = [IS, BS, CF];
    const others = [...lineOrder.values()]
      .filter((l) => !used.has(`${l.section}|${l.line}`))
      .sort((a, b) => SEC_ORDER.indexOf(a.section) - SEC_ORDER.indexOf(b.section) || a.order - b.order)
      .map((l) => makeRow(
        { source: "statement", section: l.section, line: l.line, kind: "value", fmt: PCT_RE.test(l.line) ? "pct" : "dec", computed: false },
        (c) => ctx.raw(l.section, l.line, c),
      ));

    // KPIs: un bloque por subtítulo, en el orden de la planilla.
    const kpiVals = new Map<string, number>();
    const kpiSecs = new Map<string, Map<string, number>>(); // sección → kpi → orden
    for (const r of kp) {
      kpiVals.set(`${r.section}|${r.kpi}|${pk(colOf(r))}`, Number(r.value));
      if (!kpiSecs.has(r.section)) kpiSecs.set(r.section, new Map());
      kpiSecs.get(r.section)!.set(r.kpi, r.kpiOrder);
    }
    for (const [section, kpis] of kpiSecs) {
      const rows = [...kpis.entries()].sort((a, b) => a[1] - b[1]).map(([line]) => makeRow(
        { source: "kpi", section, line, kind: "value", fmt: PCT_RE.test(line) || PCT_RE.test(section) ? "pct" : "dec", computed: false, indent: true },
        (c) => kpiVals.get(`${section}|${line}|${pk(c)}`) ?? null,
      ));
      sections.push({ source: "kpi", section, title: "KPIs", rows });
    }
    if (others.length) sections.push({ source: "statement", section: "Otros", title: "Otros datos de la ficha", rows: others });

    const comments = await prisma.fichaComment.findMany({ where: { ticker, year: base.fy, quarter: base.q } });
    // La fila subida más recientemente manda: su moneda y su FX son los de la última carga.
    const latest = [...st, ...kp].reduce((mx, r) => (r.updatedAt > mx.updatedAt ? r : mx));
    const fx = latest.fx == null ? null : Number(latest.fx);

    // CLP → USD: sólo montos de los estados (y Market Cap). Los ratios ya están calculados y
    // no cambian; las variaciones % tampoco.
    const converted = latest.currency === "CLP" && fx != null && fx > 0 && request.nextUrl.searchParams.get("ccy") !== "local";
    if (converted) {
      const conv = (v: Num) => (v == null ? null : v / fx!);
      const money = (r: LastFichaRow) =>
        r.kind === "value" && !r.computed && r.source === "statement" && (r.fmt === "num" || r.line === "Market Cap");
      for (const s of sections) for (const r of s.rows) if (money(r)) {
        r.annual = r.annual.map(conv); r.quarterly = r.quarterly.map(conv);
        r.ltm = conv(r.ltm); r.ytdPrev = conv(r.ytdPrev); r.ytd = conv(r.ytd);
      }
    }

    const payload: LastFichaPayload = {
      ticker,
      name: names.get(normBBG(ticker) ?? "") ?? null,
      currency: converted ? "USD" : latest.currency,
      reportedCurrency: latest.currency,
      converted,
      fx,
      updatedAt: latest.updatedAt.toISOString(),
      periods, base, years, quarters,
      ltmLabel: ltmRow ? qLabel(ltmRow.year, ltmRow.quarter) : null,
      ytd: ytdRow ? { prev: ytdHead(ytdRow.year - 1), cur: ytdHead(ytdRow.year) } : null,
      yoyLabel: `${base.label} vs ${qLabel(yoyP.fy, yoyP.q)}`,
      qoqLabel: `${base.label} vs ${qLabel(qoqP.fy, qoqP.q)}`,
      sections,
      comments: comments.map((c) => ({
        source: c.source as LastFichaComment["source"], section: c.section, line: c.line,
        target: c.target, comment: c.comment,
        updatedBy: c.updatedBy ?? c.createdBy, updatedAt: c.updatedAt.toISOString(),
      })),
    };
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[last-ficha]", e);
    return NextResponse.json({ error: "Error interno del servidor", details: String(e) }, { status: 500 });
  }
}
