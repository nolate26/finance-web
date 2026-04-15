import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── Public shape sent to the frontend ─────────────────────────────────────────

export interface ValuationPoint {
  date: string;
  peFwd: number | null;
  evEbitdaFwd: number | null;
  pbv: number | null;
  roeFwd: number | null;
}

export interface PriceEarningsPoint {
  date: string;
  pxLast: number;
  ni1bf: number | null;
}

export interface ConsensusPoint {
  date: string;
  metric: string;
  period: string;
  value: number;
}

export interface AnalystRecSnap {
  totAnalysts: number;
  buy: number;
  hold: number;
  sell: number;
  consenso: string | null;
  targetPrice: number | null;
}

export interface PriceRange52wSnap {
  date: string;
  pxLast: number;
  high52w: number;
  low52w: number;
  pctRange: number | null;
}

export interface ShortInterestSnap {
  shortIntRatio: number;
}

export interface PortfolioWeightSnap {
  fundName:       string;
  benchmarkWeight: number | null;
  overweight:      number | null;
}

export interface DeepDivePayload {
  ticker: string;
  valuationHistory: ValuationPoint[];
  priceVsEarnings: PriceEarningsPoint[];
  consensusEstimates: ConsensusPoint[];
  analystRec: AnalystRecSnap | null;
  priceRange52w: PriceRange52wSnap | null;
  shortInterest: ShortInterestSnap | null;
  portfolioWeights: PortfolioWeightSnap[];
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const decodedTicker = decodeURIComponent(ticker);

  try {
    const where = { equals: decodedTicker, mode: "insensitive" as const };

    // Step A: resolve nombre_latam from ticker (needed for portfolio weights join)
    const empresa = await prisma.empresasIndustrias.findFirst({
      where: { tickerBloomberg: { equals: decodedTicker, mode: "insensitive" } },
      select: { nombreLatam: true },
    });

    const [valuation, priceEarnings, consensus, analystRec, priceRange, shortInt, rawWeights] =
      await Promise.all([
        // 1. Valuation history — ascending date
        prisma.valuationHistory.findMany({
          where: { ticker: where },
          orderBy: { date: "asc" },
          select: { date: true, peFwd: true, evEbitdaFwd: true, pbv: true, roeFwd: true },
        }),

        // 2. Price vs Earnings — ascending date
        prisma.priceVsEarnings.findMany({
          where: { ticker: where },
          orderBy: { date: "asc" },
          select: { date: true, pxLast: true, ni1bf: true },
        }),

        // 3. Consensus estimates — all periods
        prisma.consensusEstimate.findMany({
          where: { ticker: where },
          orderBy: { date: "asc" },
          select: { date: true, metric: true, period: true, value: true },
        }),

        // 4. Analyst recommendation — most recent
        prisma.analystRecommendation.findFirst({
          where: { ticker: where },
          orderBy: { date: "desc" },
          select: { totAnalysts: true, buy: true, hold: true, sell: true, consenso: true, targetPrice: true },
        }),

        // 5. 52-week price range — most recent
        prisma.priceRange52w.findFirst({
          where: { ticker: where },
          orderBy: { date: "desc" },
          select: { date: true, pxLast: true, high52w: true, low52w: true, pctRange: true },
        }),

        // 6. Short interest — most recent
        prisma.shortInterest.findFirst({
          where: { ticker: where },
          orderBy: { date: "desc" },
          select: { shortIntRatio: true },
        }),

        // 7. Portfolio weights — most recent per fund (Step B of the ticker→company join)
        empresa?.nombreLatam
          ? prisma.fundPortfolioWeight.findMany({
              where: { company: empresa.nombreLatam },
              orderBy: { reportDate: "desc" },
              select: { fundName: true, reportDate: true, benchmarkWeight: true, overweight: true },
            })
          : Promise.resolve([]),
      ]);

    // Keep only the most recent record per fund (rawWeights is already sorted desc)
    const seenFunds = new Set<string>();
    const portfolioWeights: PortfolioWeightSnap[] = rawWeights
      .filter((w) => {
        if (seenFunds.has(w.fundName)) return false;
        seenFunds.add(w.fundName);
        return true;
      })
      .map((w) => ({
        fundName:        w.fundName,
        benchmarkWeight: w.benchmarkWeight ?? null,
        overweight:      w.overweight      ?? null,
      }));

    const payload: DeepDivePayload = {
      ticker: decodedTicker,

      valuationHistory: valuation.map((r) => ({
        date: r.date.toISOString().split("T")[0],
        peFwd: r.peFwd,
        evEbitdaFwd: r.evEbitdaFwd,
        pbv: r.pbv,
        roeFwd: r.roeFwd,
      })),

      priceVsEarnings: priceEarnings.map((r) => ({
        date: r.date.toISOString().split("T")[0],
        pxLast: r.pxLast,
        ni1bf: r.ni1bf,
      })),

      consensusEstimates: consensus.map((r) => ({
        date: r.date.toISOString().split("T")[0],
        metric: r.metric,
        period: r.period,
        value: r.value,
      })),

      analystRec: analystRec
        ? {
            totAnalysts: analystRec.totAnalysts,
            buy: analystRec.buy,
            hold: analystRec.hold,
            sell: analystRec.sell,
            consenso: analystRec.consenso,
            targetPrice: analystRec.targetPrice ?? null,
          }
        : null,

      priceRange52w: priceRange
        ? {
            date:    priceRange.date.toISOString().split("T")[0],
            pxLast:  priceRange.pxLast,
            high52w: priceRange.high52w,
            low52w:  priceRange.low52w,
            pctRange: priceRange.pctRange,
          }
        : null,

      shortInterest: shortInt ? { shortIntRatio: shortInt.shortIntRatio } : null,
      portfolioWeights,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error(`Company deep dive error [${decodedTicker}]:`, err);
    return NextResponse.json(
      { error: "Failed to fetch company data" },
      { status: 500 }
    );
  }
}
