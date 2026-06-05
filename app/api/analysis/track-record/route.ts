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

export interface CalcPayload {
  ticker:         string;
  nativeCurrency: string;
  targetCurrency: string;
  rows:           CalcRow[];
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
    analyst?: string; company?: string; currency?: string;
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

    // 4. Prices (adjusted close) + native currency.
    const priceChart     = await yf.chart(ticker, { period1, period2, interval: "1d" });
    const nativeCurrency = priceChart.meta?.currency ?? "";
    const priceSeries    = buildSeries(priceChart.quotes, "adjclose");

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
      return series === null ? 1 : lookupForward(series, targetT);
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
      const exitNat  = lookupForward(priceSeries, exitT);
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

    return NextResponse.json({
      ticker,
      nativeCurrency,
      targetCurrency: noConversion ? (currency === "Local" ? nativeCurrency : currency) : currency,
      rows,
    } satisfies CalcPayload);
  } catch (e) {
    console.error("[analysis/track-record POST]", e);
    return NextResponse.json(
      { error: "Failed to fetch market data from Yahoo Finance." },
      { status: 502 },
    );
  }
}
