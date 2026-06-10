import { NextResponse, NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import YahooFinance from "yahoo-finance2";

// One client per server instance; silence Yahoo's one-time survey notice.
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Types shared with the frontend ──────────────────────────────────────────────
export interface PreviewRow {
  id:             number;
  date:           string;   // YYYY-MM-DD
  type:           string;
  analyst:        string;
  company:        string;
  recommendation: string;
  currentPrice:   number;
  targetPrice:    number;
}

export type Direction = "long" | "short" | "flat";

export interface CalcRow {
  id:           number;
  entryDate:    string | null;
  entryPrice:   number | null;   // adjusted, in target currency
  exitDate:     string | null;
  exitPrice:    number | null;   // adjusted, in target currency
  direction:    Direction;       // implied by the recommendation
  priceReturn:  number | null;   // raw price move %, long-only
  periodReturn: number | null;   // directional %: long=+price, short=-price, flat=0
  compound:     number | null;   // cumulative compound of periodReturn, %
}

export interface PreviewPayload { rows: PreviewRow[] }

export interface PricePoint { date: string; price: number }

export interface Marker {
  id:             number;
  date:           string;
  direction:      Direction;
  recommendation: string;
  price:          number | null;   // native adjclose at the recommendation date
  target:         number | null;   // analyst target (native)
}

export interface EquityPoint {
  date:  string;
  strat: number;          // cumulative compound % of the directional strategy (target ccy)
  bench: number | null;   // cumulative buy&hold % of the benchmark (target ccy)
}

export interface BenchmarkInfo { ticker: string; label: string; totalReturn: number | null }

export interface Summary {
  compound:        number | null;
  cagr:            number | null;
  alpha:           number | null;   // compound − benchmark total return
  hitRate:         number | null;
  positions:       number;
  longs:           number;
  shorts:          number;
  flats:           number;
  bestCall:        number | null;
  worstCall:       number | null;
  avgHoldDays:     number | null;
  timeInMarketPct: number | null;
  lastDirection:   Direction;
  lastTarget:      number | null;   // native
  lastPrice:       number | null;   // native (latest adjclose)
  impliedUpside:   number | null;   // last target vs last price, %
}

export interface CalcPayload {
  ticker:         string;
  nativeCurrency: string;
  targetCurrency: string;
  rows:           CalcRow[];
  priceLine?:     PricePoint[];     // native adjclose (aligns with target prices)
  markers?:       Marker[];         // one per recommendation (native)
  equityCurve?:   EquityPoint[];    // strategy vs benchmark, cumulative % (target ccy)
  benchmark?:     BenchmarkInfo | null;
  summary?:       Summary | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────
// All dates collapse to a UTC-midnight epoch (ms) keyed by calendar day, so prices
// from Yahoo and recommendation dates from Prisma (@db.Date) compare cleanly.
function dayT(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function isoFromT(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}
function round2(v: number | null): number | null {
  return v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
}

// Map a recommendation to the position taken while it's the standing call.
// Buy ⇒ long, Sell ⇒ short, anything else (Hold/Mantener/neutral) ⇒ flat (no trade).
function directionOf(recommendation: string): Direction {
  const r = recommendation.toLowerCase();
  if (/comprar|buy|sobreponder|overweight|outperform|acumular/.test(r)) return "long";
  if (/vender|sell|subponder|underweight|underperform|reducir/.test(r))  return "short";
  return "flat";
}

// Cap an array to ~`max` points (keeps first and last) to keep the payload light.
function downsample<T>(arr: T[], max = 400): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  const out: T[] = [];
  for (let i = 0; i < arr.length; i += step) out.push(arr[i]);
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
  return out;
}

// Total-return ETFs (USD, complete Yahoo history via adjclose) — avoids the gaps /
// stale series of raw indices like ^IPSA, which Yahoo stops updating.
const BENCH_LABELS: Record<string, string> = {
  "SPY": "S&P 500 (SPY)", "ACWI": "MSCI ACWI", "ILF": "iShares LatAm 40",
  "ECH": "MSCI Chile (ECH)", "EWZ": "MSCI Brazil (EWZ)", "EWW": "MSCI Mexico (EWW)",
};
// Pick the benchmark: explicit selection, else default by the stock's market suffix.
function resolveBenchmark(sel: string | undefined, stockTicker: string): { ticker: string; label: string } {
  if (sel && sel !== "auto") return { ticker: sel, label: BENCH_LABELS[sel] ?? sel };
  const t = stockTicker.toUpperCase();
  if (t.endsWith(".SN")) return { ticker: "ECH", label: BENCH_LABELS["ECH"] };
  if (t.endsWith(".SA")) return { ticker: "EWZ", label: BENCH_LABELS["EWZ"] };
  if (t.endsWith(".MX")) return { ticker: "EWW", label: BENCH_LABELS["EWW"] };
  return { ticker: "ACWI", label: BENCH_LABELS["ACWI"] };
}

type Point = { t: number; v: number };

interface YahooQuote { date: Date; close: number | null; adjclose?: number | null }

// Build a sorted, deduped (keep-first) day→value series.
function buildSeries(quotes: YahooQuote[] | undefined, field: "adjclose" | "close"): Point[] {
  const pts: Point[] = [];
  for (const q of quotes ?? []) {
    const raw = field === "adjclose" ? (q.adjclose ?? q.close) : q.close;
    if (q.date == null || raw == null || !isFinite(raw)) continue;
    pts.push({ t: dayT(new Date(q.date)), v: raw });
  }
  pts.sort((a, b) => a.t - b.t);
  const out: Point[] = [];
  let last = Number.NEGATIVE_INFINITY;
  for (const p of pts) if (p.t !== last) { out.push(p); last = p.t; }
  return out;
}

// Forward lookup: first value on or after the target day (replicates the Python
// `lookup_forward` over a sorted index — handles weekends/holidays).
function lookupForward(series: Point[], targetT: number): number | null {
  let lo = 0, hi = series.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t < targetT) lo = mid + 1; else hi = mid;
  }
  return lo < series.length ? series[lo].v : null;
}

// Like lookupForward, but if the target is past the last data point (e.g. an exit
// dated "today" before today's bar exists), fall back to the most recent close.
function lookupOrLast(series: Point[], targetT: number): number | null {
  const fwd = lookupForward(series, targetT);
  if (fwd != null) return fwd;
  return series.length ? series[series.length - 1].v : null;
}

function dateFilter(startDate?: string | null, endDate?: string | null): Prisma.DateTimeFilter | undefined {
  if (!startDate && !endDate) return undefined;
  const f: Prisma.DateTimeFilter = {};
  if (startDate) f.gte = new Date(startDate + "T00:00:00.000Z");
  if (endDate)   f.lte = new Date(endDate + "T00:00:00.000Z");
  return f;
}

// ── GET — preview rows straight from the DB (no Yahoo) ───────────────────────────
export async function GET(request: NextRequest) {
  try {
    const sp        = request.nextUrl.searchParams;
    const startDate = sp.get("startDate");
    const endDate   = sp.get("endDate");
    const analyst   = sp.get("analyst");
    const company   = sp.get("company");

    const where: Prisma.AnalystRecommendationHistoryWhereInput = {};
    if (analyst) where.analyst = { equals: analyst, mode: "insensitive" };
    if (company) where.company = company;
    const df = dateFilter(startDate, endDate);
    if (df) where.date = df;

    const rows = await prisma.analystRecommendationHistory.findMany({
      where,
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });

    const out: PreviewRow[] = rows.map((r) => ({
      id:             r.id,
      date:           r.date.toISOString().slice(0, 10),
      type:           r.type,
      analyst:        r.analyst.toUpperCase(),
      company:        r.company,
      recommendation: r.recommendation,
      currentPrice:   r.currentPrice,
      targetPrice:    r.targetPrice,
    }));

    return NextResponse.json({ rows: out } satisfies PreviewPayload);
  } catch (e) {
    console.error("[analysis/track-record GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST — backtest with Yahoo prices + per-date FX conversion ───────────────────
export async function POST(request: NextRequest) {
  let body: {
    startDate?: string; endDate?: string;
    analyst?: string; company?: string; currency?: string; benchmark?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { startDate, endDate, analyst, company } = body;
  const currency = body.currency || "Local";

  if (!company) {
    return NextResponse.json({ error: "Company is required to calculate." }, { status: 400 });
  }

  try {
    // 1. Filtered recommendations.
    const where: Prisma.AnalystRecommendationHistoryWhereInput = { company };
    if (analyst) where.analyst = { equals: analyst, mode: "insensitive" };
    const df = dateFilter(startDate, endDate);
    if (df) where.date = df;

    const recs = await prisma.analystRecommendationHistory.findMany({
      where,
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });

    if (recs.length === 0) {
      return NextResponse.json({
        ticker: "", nativeCurrency: "", targetCurrency: currency, rows: [],
      } satisfies CalcPayload);
    }

    // 2. Resolve Yahoo ticker.
    const isin   = await prisma.companyIsin.findUnique({ where: { companyName: company } });
    const ticker = isin?.yahooFinanceTicker;
    if (!ticker) {
      return NextResponse.json(
        { error: `No Yahoo Finance ticker mapped for "${company}".` },
        { status: 400 },
      );
    }

    // 3. Download window: first rec → max(endDate, last rec) + buffer.
    const recTimes = recs.map((r) => r.date.getTime());
    const endTs    = endDate ? new Date(endDate + "T00:00:00.000Z") : new Date(Math.max(...recTimes));

    const period1 = new Date(Math.min(...recTimes));
    period1.setUTCDate(period1.getUTCDate() - 5);
    const period2 = new Date(Math.max(endTs.getTime(), ...recTimes));
    period2.setUTCDate(period2.getUTCDate() + 7);

    // 4. Prices + native currency. adjclose (total return: dividends/splits) drives
    //    the returns/equity; raw close is the nominal price shown in the price chart
    //    so it's comparable to the analyst's nominal target price.
    const priceChart     = await yf.chart(ticker, { period1, period2, interval: "1d" });
    const nativeCurrency = priceChart.meta?.currency ?? "";
    const priceSeries    = buildSeries(priceChart.quotes, "adjclose");
    const rawSeries      = buildSeries(priceChart.quotes, "close");

    if (priceSeries.length === 0) {
      return NextResponse.json(
        { error: `Yahoo Finance returned no price data for "${ticker}".` },
        { status: 502 },
      );
    }

    // 5. FX series (per-date conversion). null series ⇒ rate is a constant 1 (USD leg).
    const noConversion = currency === "Local" || currency === nativeCurrency;

    async function fxSeries(ccy: string): Promise<Point[] | null> {
      if (ccy === "USD") return null;
      const fx = await yf.chart(`USD${ccy}=X`, { period1, period2, interval: "1d" });
      return buildSeries(fx.quotes, "close");
    }

    let fxNative: Point[] | null = null;
    let fxTarget: Point[] | null = null;
    if (!noConversion) {
      [fxNative, fxTarget] = await Promise.all([
        fxSeries(nativeCurrency),  // native units per USD
        fxSeries(currency),        // target units per USD
      ]);
    }

    function fxRate(series: Point[] | null, targetT: number): number | null {
      return series === null ? 1 : lookupOrLast(series, targetT);
    }

    // Convert a native-currency price at a given day to the target currency.
    function convert(priceNat: number, targetT: number): number | null {
      if (noConversion) return priceNat;
      const rNat = fxRate(fxNative, targetT);   // native per USD
      const rTgt = fxRate(fxTarget, targetT);   // target per USD
      if (rNat == null || rTgt == null || rNat === 0) return null;
      return (priceNat / rNat) * rTgt;
    }

    // 6. Single chronological chain (date order). Each recommendation is held from
    //    its date until the next recommendation; the last one exits at endDate. The
    //    standing recommendation sets the direction (long/short/flat) for the period,
    //    and directional returns compound across the whole chain.
    const chain = recs.slice().sort((a, b) => a.date.getTime() - b.date.getTime());

    const rows: CalcRow[] = [];
    let equity = 1;
    for (let i = 0; i < chain.length; i++) {
      const rec     = chain[i];
      const entryT  = dayT(rec.date);
      const exitRaw = i < chain.length - 1 ? chain[i + 1].date : endTs;
      const exitT   = dayT(exitRaw);

      const entryNat = lookupForward(priceSeries, entryT);
      const exitNat  = lookupOrLast(priceSeries, exitT);   // mark-to-market if exit ≥ today
      const entry    = entryNat == null ? null : convert(entryNat, entryT);
      const exit     = exitNat  == null ? null : convert(exitNat, exitT);

      const dir = directionOf(rec.recommendation);
      const priceRet =
        entry != null && exit != null && entry > 0 ? exit / entry - 1 : null;
      const stratRet =
        priceRet == null ? null : dir === "long" ? priceRet : dir === "short" ? -priceRet : 0;

      if (stratRet != null) equity *= 1 + stratRet;

      rows.push({
        id:           rec.id,
        entryDate:    isoFromT(entryT),
        entryPrice:   round2(entry),
        exitDate:     isoFromT(exitT),
        exitPrice:    round2(exit),
        direction:    dir,
        priceReturn:  round2(priceRet  == null ? null : priceRet  * 100),
        periodReturn: round2(stratRet  == null ? null : stratRet  * 100),
        compound:     round2((equity - 1) * 100),
      });
    }

    // ── 7. Price line (nominal close, native) + per-recommendation markers ───
    const firstT  = dayT(recs[0].date);
    const endTUTC = dayT(endTs);

    // Nominal price (raw close) so it lines up with the analyst's nominal targets;
    // fall back to adjclose only if a raw close is missing.
    const lineSeries = rawSeries.length ? rawSeries : priceSeries;

    const priceLine: PricePoint[] = downsample(
      lineSeries
        .filter((p) => p.t >= firstT && p.t <= endTUTC)
        .map((p) => ({ date: isoFromT(p.t), price: round2(p.v)! })),
    );

    const markers: Marker[] = chain.map((r) => {
      const t = dayT(r.date);
      return {
        id:             r.id,
        date:           isoFromT(t),
        direction:      directionOf(r.recommendation),
        recommendation: r.recommendation,
        price:          round2(lookupForward(lineSeries, t)),
        target:         round2(r.targetPrice),
      };
    });

    // ── 8. Daily strategy equity (target ccy): position flips with the calls ──
    const changes = chain.map((r) => ({ t: dayT(r.date), dir: directionOf(r.recommendation) }));
    const equityCurve: EquityPoint[] = [];
    const eqTs: number[] = [];
    let eq = 1, prevConv: number | null = null, ci = 0;
    for (const p of priceSeries) {
      if (p.t < firstT) continue;
      if (p.t > endTUTC) break;
      while (ci + 1 < changes.length && changes[ci + 1].t <= p.t) ci++;
      const conv = convert(p.v, p.t);
      if (prevConv != null && conv != null && prevConv > 0) {
        const r   = conv / prevConv - 1;
        const dir = changes[ci].dir;
        eq *= 1 + (dir === "long" ? r : dir === "short" ? -r : 0);
      }
      if (conv != null) prevConv = conv;
      equityCurve.push({ date: isoFromT(p.t), strat: round2((eq - 1) * 100) ?? 0, bench: null });
      eqTs.push(p.t);
    }

    // ── 9. Benchmark buy&hold (target ccy) overlaid on the same dates ────────
    let benchmark: BenchmarkInfo | null = null;
    try {
      const bench   = resolveBenchmark(body.benchmark, ticker);
      const bChart  = await yf.chart(bench.ticker, { period1, period2, interval: "1d" });
      const bNative = (bChart.meta?.currency as string | undefined) ?? "";
      // adjclose → ETF benchmarks (ILF/ACWI/SPY) include dividends (total return);
      // pure price indices (^IPSA/^BVSP/^MXX) have no adjclose so this falls back to close.
      const bSeries = buildSeries(bChart.quotes, "adjclose");
      if (bSeries.length) {
        const bFx = (!noConversion && bNative !== "USD" && bNative !== currency) ? await fxSeries(bNative) : null;
        const convBench = (v: number, t: number): number | null => {
          if (noConversion) return v;
          const rNat = bNative === "USD" ? 1 : (bFx ? lookupOrLast(bFx, t) : 1);
          const rTgt = fxRate(fxTarget, t);
          if (rNat == null || rTgt == null || rNat === 0) return null;
          return (v / rNat) * rTgt;
        };
        // Only plot the benchmark within its actual data coverage — outside it we
        // leave null (line stops) instead of flat-filling a stale last value, which
        // would otherwise turn gaps/short histories into a misleading flat line.
        const bFirst = bSeries[0].t;
        const bLast  = bSeries[bSeries.length - 1].t;
        const baseRaw = lookupForward(bSeries, firstT);
        const base    = baseRaw == null ? null : convBench(baseRaw, firstT);
        if (base != null && base > 0) {
          let lastBench: number | null = null;
          for (let i = 0; i < equityCurve.length; i++) {
            const t  = eqTs[i];
            const bp = (t < bFirst || t > bLast) ? null : lookupForward(bSeries, t);
            const bc = bp == null ? null : convBench(bp, t);
            const val = bc == null ? null : round2((bc / base - 1) * 100);
            equityCurve[i].bench = val;
            if (val != null) lastBench = val;
          }
          benchmark = { ticker: bench.ticker, label: bench.label, totalReturn: lastBench };
        }
      }
    } catch { /* benchmark is optional — leave it null on failure */ }

    // ── 10. Summary metrics (for the right-hand rail) ────────────────────────
    const span     = (endTUTC - firstT) / 86_400_000;
    const lastRow  = rows[rows.length - 1];
    // Headline compound = the equity-curve endpoint (daily mark-to-market) so it
    // matches the hero chart; falls back to the per-period compound if no curve.
    const compound = equityCurve.length ? equityCurve[equityCurve.length - 1].strat : (lastRow?.compound ?? null);
    const nonFlat  = rows.filter((r) => r.direction !== "flat" && r.periodReturn != null);
    const wins     = nonFlat.filter((r) => (r.periodReturn ?? 0) > 0).length;
    const rets     = nonFlat.map((r) => r.periodReturn!);
    const holdDays = rows.map((r) => {
      const e = r.entryDate ? dayT(new Date(r.entryDate + "T00:00:00.000Z")) : null;
      const x = r.exitDate  ? dayT(new Date(r.exitDate  + "T00:00:00.000Z")) : null;
      return e != null && x != null ? (x - e) / 86_400_000 : 0;
    });
    const inMarketDays = rows.reduce((s, r, i) => s + (r.direction !== "flat" ? holdDays[i] : 0), 0);
    const lastTarget   = recs[recs.length - 1]?.targetPrice ?? null;
    const lastPrice    = priceLine.length ? priceLine[priceLine.length - 1].price : null;

    const summary: Summary = {
      compound,
      cagr:  compound != null && span > 0 ? round2((Math.pow(1 + compound / 100, 365 / span) - 1) * 100) : null,
      alpha: compound != null && benchmark?.totalReturn != null ? round2(compound - benchmark.totalReturn) : null,
      hitRate: nonFlat.length ? round2((wins / nonFlat.length) * 100) : null,
      positions: nonFlat.length,
      longs:  rows.filter((r) => r.direction === "long").length,
      shorts: rows.filter((r) => r.direction === "short").length,
      flats:  rows.filter((r) => r.direction === "flat").length,
      bestCall:  rets.length ? round2(Math.max(...rets)) : null,
      worstCall: rets.length ? round2(Math.min(...rets)) : null,
      avgHoldDays: rows.length ? Math.round(holdDays.reduce((a, b) => a + b, 0) / rows.length) : null,
      timeInMarketPct: span > 0 ? round2((inMarketDays / span) * 100) : null,
      lastDirection: lastRow?.direction ?? "flat",
      lastTarget:    round2(lastTarget),
      lastPrice,
      impliedUpside: lastTarget != null && lastPrice != null && lastPrice > 0
        ? round2((lastTarget / lastPrice - 1) * 100) : null,
    };

    return NextResponse.json({
      ticker,
      nativeCurrency,
      targetCurrency: noConversion ? (currency === "Local" ? nativeCurrency : currency) : currency,
      rows,
      priceLine,
      markers,
      equityCurve: downsample(equityCurve),
      benchmark,
      summary,
    } satisfies CalcPayload);
  } catch (e) {
    console.error("[analysis/track-record POST]", e);
    return NextResponse.json(
      { error: "Failed to fetch market data from Yahoo Finance." },
      { status: 502 },
    );
  }
}
