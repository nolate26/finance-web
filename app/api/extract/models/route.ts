import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { METRIC_BY_ID, type ModelKind } from "@/lib/extractMetrics";
import { DERIVED_FORMULAS, effectiveMarketCap } from "@/lib/modelDerived";
import type { LiveQuote } from "@/lib/modelMultiples";

export const dynamic = "force-dynamic";

/**
 * POST /api/extract/models
 * body: { tickers: string[]; metrics: string[]; yearFrom?: number; yearTo?: number }
 *
 * Devuelve, para el ÚLTIMO snapshot de cada ticker, los valores de las métricas
 * pedidas por año, en formato largo (una fila por ticker × año). El cliente pivotea
 * a la vista que prefiera (métricas como filas o años como filas). Los valores van
 * crudos, en la moneda/unidad que declara el header del modelo — no se convierten.
 *
 * Las métricas `derived` del catálogo (márgenes, crecimientos, retornos, múltiplos y
 * yields) se calculan acá con lib/modelDerived — mismas fórmulas que el deep-dive, con
 * el precio vivo de price_range_52w en los años estimados.
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
  // El rango de años se aplica DESPUÉS de calcular: las derivadas miran el año anterior
  // (crecimientos, ROE sobre patrimonio inicial) y el siguiente (PEG), así que se leen
  // todos los años del snapshot.
  const inRange = (y: number) => (yearFrom == null || y >= yearFrom) && (yearTo == null || y <= yearTo);
  const derivedIds = metrics.filter((m) => METRIC_BY_ID.get(m)!.derived);

  try {
    const wantedSet = new Set(wanted);

    // Último header por ticker. Los headers guardan el ticker con casing propio, así que
    // traemos todos (son ~60) y filtramos normalizando, en vez de un `in` exacto.
    const [companyHeadersAll, bankHeadersAll, empresas] = await Promise.all([
      prisma.modelHeader.findMany({
        distinct: ["ticker"], orderBy: { updateDate: "desc" },
        select: { ticker: true, updateDate: true, analyst: true, recc: true, tp: true, currency: true, unit: true, hasSeries: true },
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

    const allHeaderTickers = [...companyHeaders, ...bankHeaders].map((h) => normTicker(h.ticker));

    const [companyFin, bankFin, quotes] = await Promise.all([
      companyHeaders.length
        ? prisma.modelFinancials.findMany({
            where: { OR: companyHeaders.map((h) => ({ ticker: h.ticker, updateDate: h.updateDate })) },
            orderBy: [{ ticker: "asc" }, { year: "asc" }],
          })
        : Promise.resolve([]),
      bankHeaders.length
        ? prisma.bankFinancials.findMany({
            where: { OR: bankHeaders.map((h) => ({ ticker: h.ticker, updateDate: h.updateDate })) },
            orderBy: [{ ticker: "asc" }, { year: "asc" }],
          })
        : Promise.resolve([]),
      // Último precio por ticker (sólo si se piden derivadas): el deep-dive marca los
      // años estimados a este precio, y las derivadas tienen que dar lo mismo.
      derivedIds.length && allHeaderTickers.length
        ? prisma.priceRange52w.findMany({
            where:    { ticker: { in: allHeaderTickers } },
            distinct: ["ticker"],
            orderBy:  [{ ticker: "asc" }, { date: "desc" }],
            select:   { ticker: true, pxLast: true, marketCap: true },
          })
        : Promise.resolve([]),
    ]);

    const liveByTicker = new Map<string, LiveQuote>();
    for (const q of quotes) {
      if (q.pxLast != null) liveByTicker.set(normTicker(q.ticker), { price: q.pxLast, marketCap: q.marketCap ?? null });
    }
    const hasSeriesByTicker = new Map(companyHeaders.map((h) => [normTicker(h.ticker), h.hasSeries]));

    const toHeader = (h: typeof bankHeaders[number], kind: ModelKind): ExtractModelHeader => {
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
    type Fin = Record<string, unknown>;
    // Las derivadas reciben el año anterior y el siguiente DEL MISMO ticker (las filas ya
    // vienen ordenadas por ticker, año).
    const project = (fin: Fin, prev: Fin | null, next: Fin | null, kind: ModelKind): Record<string, number | null> => {
      const out: Record<string, number | null> = {};
      const t = normTicker(String(fin.ticker));
      const mcap = derivedIds.length
        ? effectiveMarketCap(kind, fin, Number(fin.year), liveByTicker.get(t) ?? null, hasSeriesByTicker.get(t) ?? false)
        : null;
      for (const id of metrics) {
        const def = METRIC_BY_ID.get(id)!;
        if (!(kind === "company" ? def.company : def.bank)) { out[id] = null; continue; }
        let v: unknown;
        if (def.derived) {
          v = DERIVED_FORMULAS[id]?.({ kind, cur: fin, prev, next, mcap }) ?? null;
        } else {
          v = fin[(kind === "company" ? def.company : def.bank)!];
        }
        out[id] = typeof v === "number" && Number.isFinite(v) ? v : null;
      }
      return out;
    };

    const shape = (list: Fin[], kind: ModelKind): ExtractModelRow[] => {
      const out: ExtractModelRow[] = [];
      list.forEach((f, i) => {
        const year = Number(f.year);
        if (!inRange(year)) return;
        const prevRow = list[i - 1], nextRow = list[i + 1];
        const prev = prevRow && prevRow.ticker === f.ticker && Number(prevRow.year) === year - 1 ? prevRow : null;
        const next = nextRow && nextRow.ticker === f.ticker && Number(nextRow.year) === year + 1 ? nextRow : null;
        out.push({ ticker: String(f.ticker), year, values: project(f, prev, next, kind) });
      });
      return out;
    };

    const rows: ExtractModelRow[] = [
      ...shape(companyFin as unknown as Fin[], "company"),
      ...shape(bankFin    as unknown as Fin[], "bank"),
    ];

    const years = Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => a - b);

    return NextResponse.json({ headers, rows, years, metrics } satisfies ExtractModelsPayload);
  } catch (e) {
    console.error("[extract/models]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
