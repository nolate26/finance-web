import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface NavPoint {
  date: string;
  portfolio: number;
  mxla: number | null;
}

export interface WeeklyPeriod {
  date: string;                     // period END date
  portfolioReturn: number | null;   // null = open period (no T1 yet)
  mxlaReturn: number | null;
  nLongs: number;
  nShorts: number;
  coveredLongs: number;             // how many longs had a valid T1 price
  coveredShorts: number;
}

export interface NavPayload {
  navSeries: NavPoint[];
  weeklyPeriods: WeeklyPeriod[];
  signalDates: string[];
}

// ─── price-history helpers ────────────────────────────────────────────────────

type PHEntry = { date: string; px: number };

/** Return the last price in a sorted-asc history array that is ≤ targetDate. */
function lastPxAtOrBefore(arr: PHEntry[], targetDate: string): number | null {
  let result: number | null = null;
  for (const { date, px } of arr) {
    if (date <= targetDate) result = px;
    else break;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  // ── 1. Fetch everything in parallel ────────────────────────────────────────
  // Use allSettled so a missing table (P2021) degrades gracefully instead of
  // crashing the whole route. Core queries (signals, mxla) still throw on error.
  const [signalsResult, mxlaResult, pveResult, triResult] = await Promise.allSettled([
    prisma.signalRaw.findMany({
      orderBy: [{ signalDate: "asc" }, { ticker: "asc" }],
      select: { signalDate: true, ticker: true, side: true, pxSignal: true },
    }),

    prisma.benchmarkMxla.findMany({
      orderBy: { date: "asc" },
      select: { date: true, pxClose: true },
      where: { pxClose: { gt: 0 } },
    }),

    // Fallback price source 1: PriceVsEarnings (pxLast)
    prisma.priceVsEarnings.findMany({
      orderBy: [{ ticker: "asc" }, { date: "asc" }],
      select: { ticker: true, date: true, pxLast: true },
      where: { pxLast: { gt: 0 } },
    }),

    // Fallback price source 2: TotalReturnIndex (triToday = price level)
    prisma.totalReturnIndex.findMany({
      orderBy: [{ ticker: "asc" }, { date: "asc" }],
      select: { ticker: true, date: true, triToday: true },
      where: { triToday: { gt: 0 } },
    }),
  ]);

  // Core queries must succeed
  if (signalsResult.status === "rejected") throw signalsResult.reason;
  if (mxlaResult.status    === "rejected") {
    console.warn("[nav] benchmark_mxla query failed:", mxlaResult.reason?.message);
  }
  if (pveResult.status === "rejected") {
    console.warn("[nav] price_vs_earnings query failed:", pveResult.reason?.message);
  }
  if (triResult.status === "rejected") {
    console.warn("[nav] total_return_index query failed:", triResult.reason?.message);
  }

  const allSignals = signalsResult.value;
  const mxlaAll   = mxlaResult.status   === "fulfilled" ? mxlaResult.value   : [];
  const pveRows   = pveResult.status    === "fulfilled" ? pveResult.value    : [];
  const triRows   = triResult.status    === "fulfilled" ? triResult.value    : [];

  if (allSignals.length === 0) {
    return NextResponse.json({
      navSeries: [], weeklyPeriods: [], signalDates: [],
    } satisfies NavPayload);
  }

  // ── 2. Group signals by date ─────────────────────────────────────────────
  const byDate = new Map<string, typeof allSignals>();
  for (const s of allSignals) {
    const d = s.signalDate.toISOString().split("T")[0];
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(s);
  }
  const sortedDates = Array.from(byDate.keys()).sort();

  // ── 3. MXLA price lookup (last known price at or before a date) ───────────
  const mxlaArr: PHEntry[] = mxlaAll
    .map((r) => ({ date: r.date.toISOString().split("T")[0], px: Number(r.pxClose) }))
    .filter((r) => isFinite(r.px) && r.px > 0);

  function mxlaPriceAt(d: string): number | null {
    return lastPxAtOrBefore(mxlaArr, d);
  }

  // ── 4. Price histories per ticker (sorted asc) ───────────────────────────
  const pvePH = new Map<string, PHEntry[]>();
  for (const r of pveRows) {
    const px = Number(r.pxLast);
    if (!isFinite(px) || px <= 0) continue;
    if (!pvePH.has(r.ticker)) pvePH.set(r.ticker, []);
    pvePH.get(r.ticker)!.push({ date: r.date.toISOString().split("T")[0], px });
  }

  const triPH = new Map<string, PHEntry[]>();
  for (const r of triRows) {
    const px = Number(r.triToday);
    if (!isFinite(px) || px <= 0) continue;
    if (!triPH.has(r.ticker)) triPH.set(r.ticker, []);
    triPH.get(r.ticker)!.push({ date: r.date.toISOString().split("T")[0], px });
  }

  /**
   * Fallback exit price for `ticker` at T1 when the ticker is NOT in the T1
   * signal roster (i.e., it exited the portfolio at T1).
   *  1. PriceVsEarnings — last price ≤ T1
   *  2. TotalReturnIndex — last price ≤ T1
   *  3. null → exclude from denominator
   */
  function getExitPx(ticker: string, T1: string): number | null {
    const fromPve = pvePH.has(ticker)
      ? lastPxAtOrBefore(pvePH.get(ticker)!, T1)
      : null;
    if (fromPve != null) return fromPve;

    const fromTri = triPH.has(ticker)
      ? lastPxAtOrBefore(triPH.get(ticker)!, T1)
      : null;
    if (fromTri != null) return fromTri;

    return null;  // no price available → exclude ticker from calculation
  }

  // ── 6. Build NAV series ───────────────────────────────────────────────────
  //
  // Equal-weight gross 200% L/S (weekly compounding):
  //   Ret_Longs  = mean( pxT1/pxT0 − 1 )  for LONG tickers with both prices
  //   Ret_Shorts = mean( pxT1/pxT0 − 1 )  for SHORT tickers with both prices
  //   Ret_Week   = Ret_Longs − Ret_Shorts          (decimal)
  //   NAV_T1     = NAV_T0 × (1 + Ret_Week)         (compounding)
  //
  // Exit price resolution (per ticker at T1):
  //   1. pxSignal from T1's SignalRaw row — the Friday close, refreshed every
  //      week for every position still in the portfolio (primary source).
  //   2. PriceVsEarnings.pxLast — for tickers that exited by T1.
  //   3. TotalReturnIndex.triToday — second fallback for exiting tickers.
  //   4. null → exclude from the equal-weight denominator (never counted as 0).
  //
  // weeklyPeriods is keyed by T0 (signal formation date):
  //   weeklyPeriods[k].date = signalDates[k]
  //   This lets the frontend do find(p => p.date === selectedDate) to get the
  //   return for the portfolio FORMED on selectedDate, not the one ending there.
  //   The last entry (the OPEN period) also uses T0, so there are no duplicate dates.

  let portNAV = 100;
  let mxlaNAV  = 100;   // MXLA indexed to 100 at inception, compounded weekly

  const navSeries: NavPoint[]     = [{ date: sortedDates[0], portfolio: 100, mxla: 100 }];
  const weeklyPeriods: WeeklyPeriod[] = [];

  for (let i = 1; i < sortedDates.length; i++) {
    const T0 = sortedDates[i - 1];   // signal formation date (portfolio held from here)
    const T1 = sortedDates[i];       // next signal date (exit / rebalance date)

    const holdingsT0 = byDate.get(T0)!;
    const holdingsT1 = byDate.get(T1)!;

    // ── T1 exit-price map ───────────────────────────────────────────────────
    // Primary exit price source: pxSignal from the T1 SignalRaw row (Friday
    // close, refreshed every week).  Number() + isFinite() guards against
    // Prisma returning a Decimal object when the underlying PG column is
    // NUMERIC/DECIMAL instead of FLOAT8 — arithmetic on a Decimal object
    // silently produces NaN without this coercion.
    const t1PxMap = new Map<string, number>();
    for (const h of holdingsT1) {
      const px = Number(h.pxSignal);
      if (isFinite(px) && px > 0) t1PxMap.set(h.ticker, px);
    }

    if (t1PxMap.size === 0) {
      console.warn(`[nav] t1PxMap empty for T1=${T1} — pxSignal may be null in SignalRaw for this date`);
    }

    const longs  = holdingsT0.filter((h) => h.side === "LONG");
    const shorts = holdingsT0.filter((h) => h.side === "SHORT");

    // ── Ret_Longs (decimal) ─────────────────────────────────────────────────
    let sumRetLongs = 0, coveredLongs = 0;
    for (const h of longs) {
      const pxEntry = Number(h.pxSignal);            // coerce: Decimal → number
      if (!isFinite(pxEntry) || pxEntry <= 0) continue;
      const pxExit = t1PxMap.get(h.ticker) ?? getExitPx(h.ticker, T1);
      if (pxExit != null && isFinite(pxExit) && pxExit > 0) {
        sumRetLongs += pxExit / pxEntry - 1;
        coveredLongs++;
      }
    }
    const retLongs = coveredLongs > 0 ? sumRetLongs / coveredLongs : null;

    // ── Ret_Shorts (decimal) ────────────────────────────────────────────────
    let sumRetShorts = 0, coveredShorts = 0;
    for (const h of shorts) {
      const pxEntry = Number(h.pxSignal);
      if (!isFinite(pxEntry) || pxEntry <= 0) continue;
      const pxExit = t1PxMap.get(h.ticker) ?? getExitPx(h.ticker, T1);
      if (pxExit != null && isFinite(pxExit) && pxExit > 0) {
        sumRetShorts += pxExit / pxEntry - 1;
        coveredShorts++;
      }
    }
    const retShorts = coveredShorts > 0 ? sumRetShorts / coveredShorts : null;

    // ── Portfolio weekly return & compound NAV ──────────────────────────────
    // weekRet is in DECIMAL (e.g. 0.015 = 1.5%).  null only when BOTH sides
    // have zero price coverage — never treat a null side as a 0 return.
    const weekRet = (retLongs !== null || retShorts !== null)
      ? (retLongs ?? 0) - (retShorts ?? 0)
      : null;
    if (weekRet !== null) portNAV *= 1 + weekRet;   // NAV_T1 = NAV_T0 × (1 + r)

    // ── MXLA compound NAV ───────────────────────────────────────────────────
    // Indexed to 100 at inception and compounded period-by-period — identical
    // methodology to the portfolio so the chart is a true apples-to-apples view.
    const currMxla = mxlaPriceAt(T1);
    const prevMxla = mxlaPriceAt(T0);
    const mxlaWeekRet = currMxla != null && prevMxla != null && prevMxla > 0
      ? currMxla / prevMxla - 1   // decimal
      : null;
    if (mxlaWeekRet !== null) mxlaNAV *= 1 + mxlaWeekRet;

    // ── Persist ─────────────────────────────────────────────────────────────
    navSeries.push({
      date:      T1,
      portfolio: Math.round(portNAV * 100) / 100,
      mxla:      Math.round(mxlaNAV * 100) / 100,
    });

    // weeklyPeriods keyed by T0 so find(p.date === selectedDate) returns the
    // return for the portfolio FORMED on selectedDate (not the one ending there).
    weeklyPeriods.push({
      date:            T0,                                                   // ← T0
      portfolioReturn: weekRet !== null ? Math.round(weekRet  * 10000) / 100 : null,  // → %
      mxlaReturn:      mxlaWeekRet != null ? Math.round(mxlaWeekRet * 10000) / 100 : null,
      nLongs:          longs.length,
      nShorts:         shorts.length,
      coveredLongs,
      coveredShorts,
    });
  }

  // ── 7. OPEN period for the latest signal date ─────────────────────────────
  // The most recent signal date (sortedDates[N-1]) has formed a portfolio but
  // has no T1 yet.  Append it with date = T0 = lastDate and null returns so
  // the frontend can detect it as the current open period without any date
  // collision (the loop never writes T0 = lastDate as a weeklyPeriods entry).
  const lastDate     = sortedDates[sortedDates.length - 1];
  const lastHoldings = byDate.get(lastDate)!;
  weeklyPeriods.push({
    date:            lastDate,    // T0 of the open period — no duplicate with loop
    portfolioReturn: null,
    mxlaReturn:      null,
    nLongs:          lastHoldings.filter((h) => h.side === "LONG").length,
    nShorts:         lastHoldings.filter((h) => h.side === "SHORT").length,
    coveredLongs:    0,
    coveredShorts:   0,
  });

  return NextResponse.json({
    navSeries, weeklyPeriods, signalDates: sortedDates,
  } satisfies NavPayload);
}
