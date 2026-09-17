import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { consensusScaleFactor } from "@/lib/consensusScale";
import { bankEffMarketCap, bankPe, companyEffMarketCap, companyEvEbitda, companyPe, type LiveQuote } from "@/lib/modelMultiples";
import { CONSENSUS_METRICS, type ConsensusMetricKey, type ModelKind } from "@/lib/extractMetrics";

export const dynamic = "force-dynamic";

/**
 * POST /api/extract/consensus
 * body: { tickers: string[]; years?: number[]; mode?: "compare" | "history" }
 *
 *  · compare (default): una fila por ticker × año con el ÚLTIMO consenso Bloomberg
 *    (Revenue / EBITDA / Net Income), el valor del modelo Moneda, la desviación % y los
 *    múltiplos del modelo al precio vivo (P/E, EV/EBITDA — mismo cálculo que Estimates).
 *  · history: una fila por ticker × año × métrica × fecha de foto del consenso, para ver
 *    cómo fue moviéndose el consenso contra el modelo (formato largo, listo para pivotear).
 *
 * Escala: consensus_estimates llega en escalas inconsistentes por ticker (a veces 1000× el
 * modelo). Se detecta el factor por ticker con consensusScaleFactor y el consenso se entrega
 * YA en la escala del modelo (convertido a la moneda del consenso vía fx_consensus), así las
 * dos columnas son comparables directo y el Excel no necesita dividir nada.
 */
export interface ExtractConsensusRequest {
  tickers: string[];
  years?:  number[];
  mode?:   "compare" | "history";
}

type Trio = Record<ConsensusMetricKey, number | null>;

export interface ConsensusCompareRow {
  ticker:        string;
  name:          string;
  country:       string | null;
  kind:          ModelKind;
  year:          number;
  updateDate:    string;          // snapshot del modelo
  currency:      string | null;
  unit:          string | null;
  consensusDate: string | null;   // fecha de la foto de consenso usada
  consensus:     Trio;            // en escala del modelo
  model:         Trio;            // × fx_consensus (moneda del consenso)
  varPct:        Trio;            // (model − consensus) / |consensus| × 100
  multiples:     { pe: number | null; evEbitda: number | null };
}

export interface ConsensusHistoryRow {
  ticker:    string;
  name:      string;
  year:      number;
  metric:    string;              // label
  date:      string;              // fecha de la foto
  consensus: number | null;       // en escala del modelo
  model:     number | null;       // valor del modelo (fijo por ticker × año × métrica)
}

export interface ExtractConsensusPayload {
  mode:           "compare" | "history";
  years:          number[];
  availableYears: number[];
  pricesAsOf:     string | null;
  compare:        ConsensusCompareRow[];
  history:        ConsensusHistoryRow[];
}

const MAX_TICKERS = 200;
const normTicker = (t: string) => t.trim().toUpperCase();
const emptyTrio = (): Trio => ({ revenue: null, ebitda: null, netIncome: null });

export async function POST(request: Request) {
  let body: ExtractConsensusRequest;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const wanted = Array.isArray(body.tickers) ? body.tickers.map(normTicker).filter(Boolean) : [];
  if (wanted.length === 0) return NextResponse.json({ error: "tickers is required" }, { status: 400 });
  if (wanted.length > MAX_TICKERS) return NextResponse.json({ error: `Max ${MAX_TICKERS} tickers per request` }, { status: 400 });
  const mode: "compare" | "history" = body.mode === "history" ? "history" : "compare";

  try {
    // Años con consenso cargado (hoy 2026/2027). Si el cliente no pide años, van todos.
    const periodRows = await prisma.consensusEstimate.findMany({ distinct: ["period"], select: { period: true } });
    const availableYears = periodRows.map((p) => Number(p.period)).filter(Number.isInteger).sort((a, b) => a - b);
    const years = (Array.isArray(body.years) && body.years.length
      ? body.years.filter((y) => availableYears.includes(y))
      : availableYears);
    if (years.length === 0) {
      return NextResponse.json({ mode, years: [], availableYears, pricesAsOf: null, compare: [], history: [] } satisfies ExtractConsensusPayload);
    }

    const wantedSet = new Set(wanted);
    const [companyHeadersAll, bankHeadersAll, empresas, latestPriceRow] = await Promise.all([
      prisma.modelHeader.findMany({ distinct: ["ticker"], orderBy: { updateDate: "desc" },
        select: { ticker: true, updateDate: true, currency: true, unit: true, hasSeries: true } }),
      prisma.bankHeader.findMany({ distinct: ["ticker"], orderBy: { updateDate: "desc" },
        select: { ticker: true, updateDate: true, currency: true, unit: true } }),
      prisma.empresasIndustriasV2.findMany({ select: { tickerBloomberg: true, nombreLatam: true, countryRisk: true } }),
      prisma.priceRange52w.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    ]);

    const companyHeaders = companyHeadersAll.filter((h) => wantedSet.has(normTicker(h.ticker)));
    const companySet     = new Set(companyHeaders.map((h) => normTicker(h.ticker)));
    const bankHeaders    = bankHeadersAll.filter((h) => wantedSet.has(normTicker(h.ticker)) && !companySet.has(normTicker(h.ticker)));

    const eiMap = new Map<string, { name: string; country: string | null }>();
    for (const e of empresas) if (e.tickerBloomberg) eiMap.set(normTicker(e.tickerBloomberg), { name: e.nombreLatam, country: e.countryRisk || null });

    // Precio vivo (misma ventana de 14 días que Estimates) para los múltiplos.
    const pricesAsOfDate = latestPriceRow?.date ?? null;
    const pricesAsOf     = pricesAsOfDate ? pricesAsOfDate.toISOString().slice(0, 10) : null;
    const priceWindowStart = pricesAsOfDate ? new Date(pricesAsOfDate.getTime() - 14 * 86_400_000) : null;

    const allTickerKeys = [...companyHeaders, ...bankHeaders].map((h) => normTicker(h.ticker));

    const [companyFin, bankFin, consensusRows, prices] = await Promise.all([
      companyHeaders.length
        ? prisma.modelFinancials.findMany({
            where: { OR: companyHeaders.map((h) => ({ ticker: h.ticker, updateDate: h.updateDate, year: { in: years } })) },
            select: { ticker: true, year: true, revenue: true, ebitda: true, netIncome: true, fxConsensus: true, sharesOut: true, fxEop: true, marketCap: true, netDebt: true, sharePrice: true },
          })
        : Promise.resolve([]),
      bankHeaders.length
        ? prisma.bankFinancials.findMany({
            where: { OR: bankHeaders.map((h) => ({ ticker: h.ticker, updateDate: h.updateDate, year: { in: years } })) },
            select: { ticker: true, year: true, revenue: true, controllingNetIncome: true, fxConsensus: true, sharePrice: true, shares: true, marketCap: true },
          })
        : Promise.resolve([]),
      // El ticker del consenso trae casing distinto → match por UPPER(BTRIM()).
      allTickerKeys.length
        ? prisma.$queryRaw<{ ticker: string; date: Date; metric: string; period: string; value: number }[]>`
            SELECT ticker, date, metric, period, value
            FROM consensus_estimates
            WHERE UPPER(BTRIM(ticker)) IN (${Prisma.join(allTickerKeys)})
              AND metric IN ('REVENUE', 'EBITDA', 'NET_INCOME')
              AND period IN (${Prisma.join(years.map(String))})
            ORDER BY date DESC`
        : Promise.resolve([]),
      priceWindowStart
        ? prisma.priceRange52w.findMany({ where: { date: { gte: priceWindowStart } }, orderBy: { date: "desc" }, select: { ticker: true, pxLast: true, marketCap: true } })
        : Promise.resolve([] as { ticker: string; pxLast: number; marketCap: number | null }[]),
    ]);

    const priceMap = new Map<string, LiveQuote>();
    for (const p of prices) { const k = normTicker(p.ticker); if (!priceMap.has(k)) priceMap.set(k, { price: p.pxLast, marketCap: p.marketCap ?? null }); }

    // Modelo por ticker × año, ya en moneda del consenso (× fx_consensus), y los insumos
    // de múltiplos en escala cruda.
    type ModelCell = { trio: Trio; pe: number | null; evEbitda: number | null };
    const modelMap = new Map<string, ModelCell>();   // `${TICKER}::${year}`
    for (const f of companyFin) {
      const hdr  = companyHeaders.find((h) => h.ticker === f.ticker)!;
      const fx   = f.fxConsensus ?? 1;
      const live = priceMap.get(normTicker(f.ticker)) ?? null;
      const mcap = companyEffMarketCap({ sharePrice: f.sharePrice, sharesOut: f.sharesOut, marketCap: f.marketCap, fxEop: f.fxEop }, live, hdr.hasSeries);
      modelMap.set(`${normTicker(f.ticker)}::${f.year}`, {
        trio:     { revenue: f.revenue != null ? f.revenue * fx : null, ebitda: f.ebitda != null ? f.ebitda * fx : null, netIncome: f.netIncome != null ? f.netIncome * fx : null },
        pe:       companyPe(mcap, f.netIncome),
        evEbitda: companyEvEbitda(mcap, f.netDebt, f.ebitda),
      });
    }
    for (const f of bankFin) {
      const fx   = f.fxConsensus ?? 1;
      const live = priceMap.get(normTicker(f.ticker))?.price ?? null;
      const mcap = bankEffMarketCap({ sharePrice: f.sharePrice, shares: f.shares, marketCap: f.marketCap }, live);
      modelMap.set(`${normTicker(f.ticker)}::${f.year}`, {
        trio:     { revenue: f.revenue != null ? f.revenue * fx : null, ebitda: null, netIncome: f.controllingNetIncome != null ? f.controllingNetIncome * fx : null },
        pe:       bankPe(mcap, f.controllingNetIncome),
        evEbitda: null,
      });
    }

    // Consenso: último por (ticker, métrica, año) para el modo compare; todo para history.
    const bbgToKey = new Map(CONSENSUS_METRICS.map((m) => [m.bbg, m.key]));
    const latestCon = new Map<string, { value: number; date: Date }>();   // `${T}::${year}::${key}`
    for (const r of consensusRows) {
      const key = bbgToKey.get(r.metric.toUpperCase());
      if (!key) continue;
      const id = `${normTicker(r.ticker)}::${r.period}::${key}`;
      if (!latestCon.has(id)) latestCon.set(id, { value: r.value, date: r.date });
    }

    // Factor de escala por ticker: se decide con todas las parejas modelo/consenso disponibles.
    const scaleByTicker = new Map<string, number>();
    for (const t of allTickerKeys) {
      const m: (number | null)[] = [], c: (number | null)[] = [];
      for (const y of years) for (const k of CONSENSUS_METRICS) {
        m.push(modelMap.get(`${t}::${y}`)?.trio[k.key] ?? null);
        c.push(latestCon.get(`${t}::${y}::${k.key}`)?.value ?? null);
      }
      scaleByTicker.set(t, consensusScaleFactor(m, c, 1));
    }

    const headerFor = (t: string) => {
      const ch = companyHeaders.find((h) => normTicker(h.ticker) === t);
      if (ch) return { ...ch, kind: "company" as ModelKind };
      const bh = bankHeaders.find((h) => normTicker(h.ticker) === t)!;
      return { ...bh, kind: "bank" as ModelKind };
    };

    const compare: ConsensusCompareRow[] = [];
    const history: ConsensusHistoryRow[] = [];

    for (const t of allTickerKeys) {
      const hdr = headerFor(t);
      const ei  = eiMap.get(t);
      const k   = scaleByTicker.get(t) ?? 1;
      const name = ei?.name ?? hdr.ticker.replace(/ EQUITY$/i, "");

      for (const y of years) {
        const model = modelMap.get(`${t}::${y}`);
        const consensus = emptyTrio(), varPct = emptyTrio();
        let consensusDate: Date | null = null;
        for (const m of CONSENSUS_METRICS) {
          const c = latestCon.get(`${t}::${y}::${m.key}`);
          if (c) {
            consensus[m.key] = c.value / k;
            if (!consensusDate || c.date > consensusDate) consensusDate = c.date;
          }
          const mv = model?.trio[m.key] ?? null;
          const cv = consensus[m.key];
          varPct[m.key] = mv != null && cv != null && cv !== 0 ? ((mv - cv) / Math.abs(cv)) * 100 : null;
        }
        if (mode === "compare") {
          compare.push({
            ticker: hdr.ticker, name, country: ei?.country ?? null, kind: hdr.kind, year: y,
            updateDate: hdr.updateDate.toISOString().slice(0, 10),
            currency: hdr.currency ?? null, unit: hdr.unit ?? null,
            consensusDate: consensusDate ? consensusDate.toISOString().slice(0, 10) : null,
            consensus, model: model?.trio ?? emptyTrio(), varPct,
            multiples: { pe: model?.pe ?? null, evEbitda: model?.evEbitda ?? null },
          });
        }
      }

      if (mode === "history") {
        for (const r of consensusRows) {
          if (normTicker(r.ticker) !== t) continue;
          const key = bbgToKey.get(r.metric.toUpperCase());
          if (!key) continue;
          const y = Number(r.period);
          history.push({
            ticker: hdr.ticker, name, year: y,
            metric:    CONSENSUS_METRICS.find((m) => m.key === key)!.label,
            date:      r.date.toISOString().slice(0, 10),
            consensus: r.value / k,
            model:     modelMap.get(`${t}::${y}`)?.trio[key] ?? null,
          });
        }
      }
    }

    history.sort((a, b) => a.name.localeCompare(b.name) || a.year - b.year || a.metric.localeCompare(b.metric) || a.date.localeCompare(b.date));
    compare.sort((a, b) => a.name.localeCompare(b.name) || a.year - b.year);

    return NextResponse.json({ mode, years, availableYears, pricesAsOf, compare, history } satisfies ExtractConsensusPayload);
  } catch (e) {
    console.error("[extract/consensus]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
