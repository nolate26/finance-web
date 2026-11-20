import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normBBG } from "@/lib/bbg";

export const dynamic = "force-dynamic";

// Extract Data → Ficha. Query builder sobre las fichas (macro "Send Ficha"):
//   GET  → universo: compañías con ficha, líneas disponibles (estados + KPIs) y años.
//   POST → filas en formato largo (una por compañía × línea × período), con los valores tal
//          como vienen en la ficha: moneda reportada, millones. Se devuelven moneda y FX de
//          cada fila para convertir en el Excel si hace falta (no se convierte acá: la ficha
//          mezcla montos con ratios y KPIs, y dividir todo por el FX los rompería).

export type FichaSource = "statement" | "kpi";
export type FichaPeriodType = "A" | "Q" | "L" | "Y";

export interface ExtractFichaCompany {
  ticker: string; name: string; industry: string | null; currency: string;
  lastLabel: string; updatedAt: string;
}
export interface ExtractFichaLine { key: string; source: FichaSource; section: string; line: string; order: number }
export interface ExtractFichaUniverse { companies: ExtractFichaCompany[]; lines: ExtractFichaLine[]; years: number[] }

export interface ExtractFichaRequest {
  tickers: string[];
  lines?: string[];                // claves "source|section|line"; vacío = todas
  periodTypes: FichaPeriodType[];
  yearFrom?: number;
  yearTo?: number;
}
export interface ExtractFichaRow {
  ticker: string; name: string; currency: string; fx: number;
  source: FichaSource; section: string; line: string; order: number;
  periodType: FichaPeriodType; year: number; quarter: number;
  period: string;                  // "2025" · "3Q 2026" · "LTM 3Q 2026" · "9M 2026"
  periodEnd: string;               // YYYY-MM-DD
  value: number;
}
export interface ExtractFichaPayload { rows: ExtractFichaRow[]; truncated: boolean }

const lineKey = (source: FichaSource, section: string, line: string) => `${source}|${section}|${line}`;
const periodLabel = (t: string, y: number, q: number) =>
  t === "A" ? String(y) : t === "Q" ? `${q}Q ${y}` : t === "L" ? `LTM ${q}Q ${y}` : q === 4 ? `FY ${y}` : `${q * 3}M ${y}`;
const MAX_ROWS = 200_000;

async function namesByTicker(tickers: string[]): Promise<Map<string, { name: string; industry: string | null }>> {
  const emp = await prisma.empresasIndustriasV2.findMany({
    select: { tickerBloomberg: true, nombreChile: true, nombreLatam: true, industriaChile: true },
  });
  const wanted = new Set(tickers.map((t) => normBBG(t)));
  const out = new Map<string, { name: string; industry: string | null }>();
  for (const e of emp) {
    const k = normBBG(e.tickerBloomberg);
    if (!k || !wanted.has(k) || out.has(k)) continue;
    out.set(k, { name: e.nombreChile?.trim() || e.nombreLatam.trim(), industry: e.industriaChile || null });
  }
  return out;
}

export async function GET() {
  try {
    const [cos, stLines, kpiLines, yrs] = await Promise.all([
      prisma.$queryRaw<{ ticker: string; currency: string; k: number; upd: Date }[]>`
        SELECT ticker, MAX(currency) AS currency, MAX(CASE WHEN period_type = 'Q' THEN year * 10 + quarter END)::int AS k, MAX(updated_at) AS upd
        FROM ficha_statements GROUP BY ticker`,
      prisma.$queryRaw<{ section: string; line: string; ord: number }[]>`
        SELECT section, line, MIN(line_order)::int AS ord FROM ficha_statements GROUP BY section, line`,
      prisma.$queryRaw<{ section: string; line: string; ord: number }[]>`
        SELECT section, kpi AS line, MIN(kpi_order)::int AS ord FROM ficha_kpis GROUP BY section, kpi`,
      prisma.$queryRaw<{ year: number }[]>`
        SELECT DISTINCT year FROM ficha_statements UNION SELECT DISTINCT year FROM ficha_kpis ORDER BY 1`,
    ]);
    const names = await namesByTicker(cos.map((c) => c.ticker));
    const SECTION_ORDER = ["Income Statement", "Balance Sheet", "Cash Flow"];
    const secIdx = (s: string) => { const i = SECTION_ORDER.indexOf(s); return i < 0 ? 99 : i; };
    const lines: ExtractFichaLine[] = [
      ...stLines
        .sort((a, b) => secIdx(a.section) - secIdx(b.section) || a.ord - b.ord)
        .map((l) => ({ key: lineKey("statement", l.section, l.line), source: "statement" as const, section: l.section, line: l.line, order: l.ord })),
      ...kpiLines
        .sort((a, b) => a.section.localeCompare(b.section) || a.ord - b.ord)
        .map((l) => ({ key: lineKey("kpi", l.section, l.line), source: "kpi" as const, section: l.section, line: l.line, order: l.ord })),
    ];
    const companies: ExtractFichaCompany[] = cos.map((c) => {
      const n = names.get(normBBG(c.ticker) ?? "");
      return {
        ticker: c.ticker, name: n?.name ?? c.ticker, industry: n?.industry ?? null, currency: c.currency,
        lastLabel: c.k ? `${c.k % 10}Q ${Math.floor(c.k / 10)}` : "—", updatedAt: c.upd.toISOString().slice(0, 10),
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    const payload: ExtractFichaUniverse = { companies, lines, years: yrs.map((y) => y.year) };
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[extract/ficha GET]", e);
    return NextResponse.json({ error: "Internal server error", details: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExtractFichaRequest;
    const tickers = (body.tickers ?? []).filter((t) => typeof t === "string" && t.trim()).slice(0, 500);
    const types = (body.periodTypes ?? []).filter((t): t is FichaPeriodType => ["A", "Q", "L", "Y"].includes(t));
    if (!tickers.length || !types.length) return NextResponse.json({ error: "Pick at least one company and one period type" }, { status: 400 });
    const yFrom = Number.isFinite(body.yearFrom) ? Number(body.yearFrom) : 0;
    const yTo = Number.isFinite(body.yearTo) ? Number(body.yearTo) : 9999;
    const wanted = body.lines?.length ? new Set(body.lines) : null;

    const where = { ticker: { in: tickers }, periodType: { in: types }, year: { gte: yFrom, lte: yTo } };
    const [st, kp] = await Promise.all([
      prisma.fichaStatement.findMany({ where, select: { ticker: true, currency: true, fx: true, periodType: true, year: true, quarter: true, periodEnd: true, section: true, line: true, lineOrder: true, value: true } }),
      prisma.fichaKpi.findMany({ where, select: { ticker: true, currency: true, fx: true, periodType: true, year: true, quarter: true, periodEnd: true, section: true, kpi: true, kpiOrder: true, value: true } }),
    ]);
    const names = await namesByTicker(tickers);
    const nameOf = (t: string) => names.get(normBBG(t) ?? "")?.name ?? t;
    const toNum = (d: Prisma.Decimal) => Number(d);

    const rows: ExtractFichaRow[] = [];
    const push = (r: { ticker: string; currency: string; fx: Prisma.Decimal; periodType: string; year: number; quarter: number; periodEnd: Date; value: Prisma.Decimal }, source: FichaSource, section: string, line: string, order: number) => {
      if (wanted && !wanted.has(lineKey(source, section, line))) return;
      rows.push({
        ticker: r.ticker, name: nameOf(r.ticker), currency: r.currency, fx: toNum(r.fx),
        source, section, line, order,
        periodType: r.periodType as FichaPeriodType, year: r.year, quarter: r.quarter,
        period: periodLabel(r.periodType, r.year, r.quarter), periodEnd: r.periodEnd.toISOString().slice(0, 10),
        value: toNum(r.value),
      });
    };
    for (const r of st) push(r, "statement", r.section, r.line, r.lineOrder);
    for (const r of kp) push(r, "kpi", r.section, r.kpi, r.kpiOrder);

    const SECTION_ORDER = ["Income Statement", "Balance Sheet", "Cash Flow"];
    const secIdx = (s: string) => { const i = SECTION_ORDER.indexOf(s); return i < 0 ? 99 : i; };
    rows.sort((a, b) =>
      a.name.localeCompare(b.name) || (a.source === b.source ? 0 : a.source === "statement" ? -1 : 1)
      || secIdx(a.section) - secIdx(b.section) || a.section.localeCompare(b.section) || a.order - b.order
      || a.periodEnd.localeCompare(b.periodEnd) || a.periodType.localeCompare(b.periodType));
    const truncated = rows.length > MAX_ROWS;
    const payload: ExtractFichaPayload = { rows: truncated ? rows.slice(0, MAX_ROWS) : rows, truncated };
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[extract/ficha POST]", e);
    return NextResponse.json({ error: "Internal server error", details: String(e) }, { status: 500 });
  }
}
