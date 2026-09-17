import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { METRIC_BY_ID, type ModelKind } from "@/lib/extractMetrics";

export const dynamic = "force-dynamic";

/**
 * POST /api/extract/models
 * body: { tickers: string[]; metrics: string[]; yearFrom?: number; yearTo?: number }
 *
 * Devuelve, para el ÚLTIMO snapshot de cada ticker, los valores de las métricas
 * pedidas por año, en formato largo (una fila por ticker × año). El cliente pivotea
 * a la vista que prefiera (métricas como filas o años como filas). Los valores van
 * crudos, en la moneda/unidad que declara el header del modelo — no se convierten.
 */
export interface ExtractModelsRequest {
  tickers:   string[];
  metrics:   string[];
  yearFrom?: number;
  yearTo?:   number;
}

export interface ExtractModelHeader {
  ticker:     string;
  name:       string;
  country:    string | null;
  industry:   string | null;
  kind:       ModelKind;
  updateDate: string;
  analyst:    string | null;
  recc:       string | null;
  tp:         number | null;
  currency:   string | null;
  unit:       string | null;
}

export interface ExtractModelRow {
  ticker: string;
  year:   number;
  values: Record<string, number | null>;   // metricId → valor
}

export interface ExtractModelsPayload {
  headers: ExtractModelHeader[];
  rows:    ExtractModelRow[];
  years:   number[];      // unión ordenada de los años presentes
  metrics: string[];      // ids válidas, en el orden pedido
}

const MAX_TICKERS = 400;
const normTicker = (t: string) => t.trim().toUpperCase();

export async function POST(request: Request) {
  let body: ExtractModelsRequest;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const wanted  = Array.isArray(body.tickers) ? body.tickers.map(normTicker).filter(Boolean) : [];
  const metrics = Array.isArray(body.metrics) ? body.metrics.filter((m) => METRIC_BY_ID.has(m)) : [];
  if (wanted.length === 0)  return NextResponse.json({ error: "tickers is required" }, { status: 400 });
  if (metrics.length === 0) return NextResponse.json({ error: "metrics is required" }, { status: 400 });
  if (wanted.length > MAX_TICKERS) return NextResponse.json({ error: `Max ${MAX_TICKERS} tickers per request` }, { status: 400 });

  const yearFrom = Number.isInteger(body.yearFrom) ? body.yearFrom! : undefined;
  const yearTo   = Number.isInteger(body.yearTo)   ? body.yearTo!   : undefined;
  const yearWhere = yearFrom != null || yearTo != null ? { gte: yearFrom, lte: yearTo } : undefined;

  try {
    const wantedSet = new Set(wanted);

    // Último header por ticker. Los headers guardan el ticker con casing propio, así que
    // traemos todos (son ~60) y filtramos normalizando, en vez de un `in` exacto.
    const [companyHeadersAll, bankHeadersAll, empresas] = await Promise.all([
      prisma.modelHeader.findMany({
        distinct: ["ticker"], orderBy: { updateDate: "desc" },
        select: { ticker: true, updateDate: true, analyst: true, recc: true, tp: true, currency: true, unit: true },
      }),
      prisma.bankHeader.findMany({
        distinct: ["ticker"], orderBy: { updateDate: "desc" },
        select: { ticker: true, updateDate: true, analyst: true, recc: true, tp: true, currency: true, unit: true },
      }),
      prisma.empresasIndustriasV2.findMany({
        select: { tickerBloomberg: true, nombreLatam: true, countryRisk: true, industriaGics: true },
      }),
    ]);

    const companyHeaders = companyHeadersAll.filter((h) => wantedSet.has(normTicker(h.ticker)));
    const companySet     = new Set(companyHeaders.map((h) => normTicker(h.ticker)));
    const bankHeaders    = bankHeadersAll.filter((h) => wantedSet.has(normTicker(h.ticker)) && !companySet.has(normTicker(h.ticker)));

    const eiMap = new Map<string, { name: string; country: string | null; industry: string | null }>();
    for (const e of empresas) {
      if (e.tickerBloomberg) eiMap.set(normTicker(e.tickerBloomberg), { name: e.nombreLatam, country: e.countryRisk || null, industry: e.industriaGics || null });
    }

    const [companyFin, bankFin] = await Promise.all([
      companyHeaders.length
        ? prisma.modelFinancials.findMany({
            where: { OR: companyHeaders.map((h) => ({ ticker: h.ticker, updateDate: h.updateDate, year: yearWhere })) },
            orderBy: [{ ticker: "asc" }, { year: "asc" }],
          })
        : Promise.resolve([]),
      bankHeaders.length
        ? prisma.bankFinancials.findMany({
            where: { OR: bankHeaders.map((h) => ({ ticker: h.ticker, updateDate: h.updateDate, year: yearWhere })) },
            orderBy: [{ ticker: "asc" }, { year: "asc" }],
          })
        : Promise.resolve([]),
    ]);

    const toHeader = (h: typeof companyHeaders[number], kind: ModelKind): ExtractModelHeader => {
      const ei = eiMap.get(normTicker(h.ticker));
      return {
        ticker:     h.ticker,
        name:       ei?.name ?? h.ticker.replace(/ EQUITY$/i, ""),
        country:    ei?.country  ?? null,
        industry:   ei?.industry ?? null,
        kind,
        updateDate: h.updateDate.toISOString().slice(0, 10),
        analyst:    h.analyst  ?? null,
        recc:       h.recc     ?? null,
        tp:         h.tp       ?? null,
        currency:   h.currency ?? null,
        unit:       h.unit     ?? null,
      };
    };

    const headers = [
      ...companyHeaders.map((h) => toHeader(h, "company")),
      ...bankHeaders.map((h)    => toHeader(h, "bank")),
    ];

    // Proyección de una fila de financials a las métricas pedidas, según el tipo de modelo.
    const project = (fin: Record<string, unknown>, kind: ModelKind): Record<string, number | null> => {
      const out: Record<string, number | null> = {};
      for (const id of metrics) {
        const def   = METRIC_BY_ID.get(id)!;
        const field = kind === "company" ? def.company : def.bank;
        const v     = field ? fin[field] : null;
        out[id] = typeof v === "number" && Number.isFinite(v) ? v : null;
      }
      return out;
    };

    const rows: ExtractModelRow[] = [
      ...companyFin.map((f) => ({ ticker: f.ticker, year: f.year, values: project(f as unknown as Record<string, unknown>, "company") })),
      ...bankFin.map((f)    => ({ ticker: f.ticker, year: f.year, values: project(f as unknown as Record<string, unknown>, "bank") })),
    ];

    const years = Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => a - b);

    return NextResponse.json({ headers, rows, years, metrics } satisfies ExtractModelsPayload);
  } catch (e) {
    console.error("[extract/models]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
