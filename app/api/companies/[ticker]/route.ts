import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { tickerFromPath } from "@/lib/issuer";
import { normBBG } from "@/lib/bbg";

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
  high52w: number| null;
  low52w: number| null;
  pctRange: number | null;
}

export interface ShortInterestSnap {
  shortIntRatio: number;
}

export interface PortfolioWeightSnap {
  fundName:        string;
  portfolioWeight: number | null;   // % in fund (portfolioPct)
  benchmarkWeight: number | null;
  overweight:      number | null;
}

/** ticker_return_snapshot: retornos en DECIMAL (0.0512 = +5,12%); 3y y 5y anualizados. */
export interface TotalReturnSnap {
  asOf:     string;
  retMonth: number | null;
  retYtd:   number | null;
  retYear:  number | null;
  ret3y:    number | null;
  ret5y:    number | null;
}

export interface DeepDivePayload {
  ticker: string;
  companyDescription: string | null;
  valuationHistory: ValuationPoint[];
  priceVsEarnings: PriceEarningsPoint[];
  consensusEstimates: ConsensusPoint[];
  analystRec: AnalystRecSnap | null;
  priceRange52w: PriceRange52wSnap | null;
  shortInterest: ShortInterestSnap | null;
  portfolioWeights: PortfolioWeightSnap[];
  totalReturn: TotalReturnSnap | null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  // Se normaliza UNA vez acá; de ahí en adelante todo compara por igualdad.
  const decodedTicker = tickerFromPath(ticker);

  try {

    // Step A: resolve nombre_latam from ticker (needed for portfolio weights join)
    const empresa = await prisma.empresasIndustriasV2.findFirst({
      where: { tickerBloomberg: decodedTicker },
      select: { nombreLatam: true, companyDescription: true },
    });

    const [valuation, priceEarnings, consensus, analystRec, priceRange, shortInt, rawWeights, retRow] =
      await Promise.all([
        // 1. Valuation history — ascending date
        prisma.valuationHistory.findMany({
          where: { ticker: decodedTicker },
          orderBy: { date: "asc" },
          select: { date: true, peFwd: true, evEbitdaFwd: true, pbv: true, roeFwd: true },
        }),

        // 2. Price vs Earnings — ascending date
        prisma.priceVsEarnings.findMany({
          where: { ticker: decodedTicker },
          orderBy: { date: "asc" },
          select: { date: true, pxLast: true, ni1bf: true },
        }),

        // 3. Consensus estimates — all periods
        prisma.consensusEstimate.findMany({
          where: { ticker: decodedTicker },
          orderBy: { date: "asc" },
          select: { date: true, metric: true, period: true, value: true },
        }),

        // 4. Analyst recommendation — most recent
        prisma.analystRecommendation.findFirst({
          where: { ticker: decodedTicker },
          orderBy: { date: "desc" },
          select: { totAnalysts: true, buy: true, hold: true, sell: true, consenso: true, targetPrice: true },
        }),

        // 5. 52-week price range — most recent
        prisma.priceRange52w.findFirst({
          where: { ticker: decodedTicker },
          orderBy: { date: "desc" },
          select: { date: true, pxLast: true, high52w: true, low52w: true, pctRange: true },
        }),

        // 6. Short interest — most recent
        prisma.shortInterest.findFirst({
          where: { ticker: decodedTicker },
          orderBy: { date: "desc" },
          select: { shortIntRatio: true },
        }),

        // 7. Portfolio weights — most recent per fund (Step B of the ticker→company join).
        // Los fondos de Brasil guardan el ticker BBG en `company` en vez del nombre.
        empresa?.nombreLatam
          ? prisma.fundPortfolioWeight.findMany({
              where: { company: { in: [empresa.nombreLatam, decodedTicker] } },
              orderBy: { reportDate: "desc" },
              select: { fundName: true, reportDate: true, portfolioWeight: true, benchmarkWeight: true, overweight: true },
            })
          : Promise.resolve([]),

        // 8. Retorno total (Bloomberg, dividendos brutos) — ticker_return_snapshot, la misma
        // tabla de Stock Selection. Guarda el ticker sin " Equity" ("CAP CI"). Sólo cubre el
        // universo que carga el script: para el resto la fila no se muestra.
        prisma.tickerReturnSnapshot.findUnique({
          where:  { tickerBBG: normBBG(decodedTicker) ?? "" },
          select: { asOf: true, retMonth: true, retYtd: true, retYear: true, ret3y: true, ret5y: true },
        }),
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
        portfolioWeight: w.portfolioWeight ?? null,
        benchmarkWeight: w.benchmarkWeight ?? null,
        overweight:      w.overweight      ?? null,
      }));

    const payload: DeepDivePayload = {
      ticker: decodedTicker,
      companyDescription: empresa?.companyDescription ?? null,

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

      totalReturn: retRow
        ? {
            asOf:     retRow.asOf.toISOString().split("T")[0],
            retMonth: retRow.retMonth,
            retYtd:   retRow.retYtd,
            retYear:  retRow.retYear,
            ret3y:    retRow.ret3y,
            ret5y:    retRow.ret5y,
          }
        : null,
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
