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
// Columnas: todos los años ("A") + los últimos 5 trimestres terminando en el base, y para el
// base la Var% YoY (vs mismo trimestre del año anterior) y QoQ (vs trimestre anterior).

export interface LastFichaCompany {
  ticker: string;
  name: string | null;
  lastLabel: string | null; // "3Q26"
  updatedAt: string;        // última carga de la ficha (ISO)
}

export interface LastFichaRow {
  line: string;
  order: number;
  pct: boolean;                  // la línea es un ratio (margen, tasa, crecimiento): se muestra en %
  annual: (number | null)[];     // alineado con `years`
  quarterly: (number | null)[];  // alineado con `quarters`
  // Variación del trimestre base. Montos: cur/prev − 1. Ratios (pct): diferencia en puntos
  // (cur − prev). null = falta un dato; "NM" = base 0 o cambio de signo.
  yoy: number | "NM" | null;
  qoq: number | "NM" | null;
}

export interface LastFichaSection {
  source: "statement" | "kpi";
  section: string;
  rows: LastFichaRow[];
}

export interface LastFichaComment {
  source: "statement" | "kpi";
  section: string;
  line: string;
  target: string;            // "line" | "yoy" | "qoq" | "A2025" | "Q2026-3"
  comment: string;
  updatedBy: string | null;
  updatedAt: string;
}

export interface LastFichaPayload {
  ticker: string;
  name: string | null;
  currency: string;
  fx: number | null;
  updatedAt: string;
  periods: { fy: number; q: number; label: string }[]; // trimestres disponibles (desc), selector del base
  base: { fy: number; q: number; label: string };
  years: number[];                                      // asc
  quarters: { fy: number; q: number; label: string }[]; // los 5 mostrados (asc)
  yoyLabel: string;                                     // "3Q26 vs 3Q25"
  qoqLabel: string;                                     // "3Q26 vs 2Q26"
  sections: LastFichaSection[];
  comments: LastFichaComment[];
}

const STATEMENT_ORDER = ["Income Statement", "Balance Sheet", "Cash Flow"];
const N_QUARTERS = 5;

const qLabel = (fy: number, q: number) => `${q}Q${String(fy).slice(2)}`;
const qIdx = (fy: number, q: number) => fy * 4 + (q - 1);

// Ratios de la planilla (vienen en decimal: 0,147 = 14,7%). Se detectan por el nombre de la
// línea o de la sección ("Unit Cases Growth (YoY)"). Palabras completas: "Corporate" contiene
// "rate" y es un monto.
const PCT_RE = /\b(margin|margen|rate|tasa|growth|crecimiento|yoy|qoq|payout|roe|roic)\b|%/i;

function variation(cur: number | null, prev: number | null, pct: boolean): number | "NM" | null {
  if (cur == null || prev == null) return null;
  if (pct) return cur - prev;
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

    // Filas: una por (fuente, sección, línea), con sus valores por período.
    type Acc = { source: "statement" | "kpi"; section: string; line: string; order: number; firstId: number; vals: Map<string, number> };
    const acc = new Map<string, Acc>();
    const add = (source: Acc["source"], r: { id: number; section: string; periodType: string; year: number; quarter: number; value: unknown }, line: string, order: number) => {
      const k = `${source}|${r.section}|${line}`;
      let a = acc.get(k);
      if (!a) { a = { source, section: r.section, line, order, firstId: r.id, vals: new Map() }; acc.set(k, a); }
      a.vals.set(r.periodType === "A" ? `A${r.year}` : `Q${qIdx(r.year, r.quarter)}`, Number(r.value));
    };
    for (const r of st) add("statement", r, r.line, r.lineOrder);
    for (const r of kp) add("kpi", r, r.kpi, r.kpiOrder);

    const sectionsMap = new Map<string, LastFichaSection & { firstId: number }>();
    for (const a of acc.values()) {
      const sk = `${a.source}|${a.section}`;
      let s = sectionsMap.get(sk);
      if (!s) { s = { source: a.source, section: a.section, rows: [], firstId: a.firstId }; sectionsMap.set(sk, s); }
      s.firstId = Math.min(s.firstId, a.firstId);
      const pct = PCT_RE.test(a.line) || PCT_RE.test(a.section);
      const at = (fy: number, q: number) => a.vals.get(`Q${qIdx(fy, q)}`) ?? null;
      const cur = at(base.fy, base.q);
      s.rows.push({
        line: a.line, order: a.order, pct,
        annual: years.map((y) => a.vals.get(`A${y}`) ?? null),
        quarterly: quarters.map((p) => at(p.fy, p.q)),
        yoy: variation(cur, at(yoyP.fy, yoyP.q), pct),
        qoq: variation(cur, at(qoqP.fy, qoqP.q), pct),
      });
    }
    // Estados en su orden fijo; KPIs en el orden de la planilla (el de inserción).
    const sections = [...sectionsMap.values()]
      .sort((a, b) =>
        a.source !== b.source ? (a.source === "statement" ? -1 : 1)
        : a.source === "statement" ? STATEMENT_ORDER.indexOf(a.section) - STATEMENT_ORDER.indexOf(b.section)
        : a.firstId - b.firstId)
      .map(({ firstId: _f, ...s }) => ({ ...s, rows: s.rows.sort((x, y) => x.order - y.order) }));

    const comments = await prisma.fichaComment.findMany({ where: { ticker, year: base.fy, quarter: base.q } });
    const any = st[0] ?? kp[0];
    const updatedAt = [...st, ...kp].reduce((mx, r) => (r.updatedAt > mx ? r.updatedAt : mx), any.updatedAt);

    const payload: LastFichaPayload = {
      ticker,
      name: names.get(normBBG(ticker) ?? "") ?? null,
      currency: any.currency,
      fx: any.fx == null ? null : Number(any.fx),
      updatedAt: updatedAt.toISOString(),
      periods, base, years, quarters,
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
