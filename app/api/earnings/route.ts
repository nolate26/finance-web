import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const FUND_NAMES: Record<string, string> = {
  MLE: "Moneda_Latin_America_Equities_(LX)",
  MSC: "Moneda_Latin_America_Small_Cap_(LX)",
};

export interface EarningsRow {
  tickerBloomberg: string;
  sector:          string | null;
  quarter:         string;
  reportDate:      string;
  currency:        string | null;
  // FX rate (avg quarterly rate vs USD) — null when no FX data available
  avgRate:         number | null;
  // Fund positioning — null when fund = ALL or ticker not in fund
  portfolioWeight: number | null;
  benchmarkWeight: number | null;
  overweight:      number | null;
  // Actuals (in local currency, as stored in DB)
  revActual:       number | null;
  revBeatMiss:     number | null;
  revYoy:          number | null;
  revQoq:          number | null;
  ebitdaActual:    number | null;
  ebitdaBeatMiss:  number | null;
  ebitdaYoy:       number | null;
  ebitdaQoq:       number | null;
  niActual:        number | null;
  niBeatMiss:      number | null;
  niYoy:           number | null;
  niQoq:           number | null;
}

export interface EarningsPayload {
  data:     EarningsRow[];
  quarters: string[];
  dates:    string[];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const quarter = searchParams.get("quarter");
  const date    = searchParams.get("date");
  const fund    = searchParams.get("fund") ?? "ALL";

  try {
    // ── 1. Fund resolution: build ticker filter + weights map ─────────────────
    let fundTickers: string[] | null = null;

    // tickerBloomberg → { portfolioWeight, benchmarkWeight, overweight }
    const tickerWeightsMap = new Map<string, {
      pw: number | null;
      bw: number | null;
      ow: number | null;
    }>();

    const fundName = FUND_NAMES[fund] ?? null;

    if (fundName) {
      const latestEntry = await prisma.fundPortfolioWeight.findFirst({
        where:   { fundName },
        orderBy: { reportDate: "desc" },
        select:  { reportDate: true },
      });

      if (latestEntry) {
        const fpwRows = await prisma.fundPortfolioWeight.findMany({
          where:  { fundName, reportDate: latestEntry.reportDate },
          select: { company: true, portfolioWeight: true, benchmarkWeight: true, overweight: true },
        });

        // company (nombreLatam) → weights
        const companyWeights = new Map(
          fpwRows.map((r) => [r.company, {
            pw: r.portfolioWeight ?? null,
            bw: r.benchmarkWeight ?? null,
            ow: r.overweight      ?? null,
          }])
        );

        const companyNames = fpwRows.map((r) => r.company);
        const empresas = await prisma.empresasIndustrias.findMany({
          where:  { nombreLatam: { in: companyNames }, tickerBloomberg: { not: null } },
          select: { tickerBloomberg: true, nombreLatam: true },
        });

        fundTickers = empresas.map((e) => e.tickerBloomberg!).filter(Boolean);

        for (const e of empresas) {
          if (e.tickerBloomberg) {
            const w = companyWeights.get(e.nombreLatam);
            if (w) tickerWeightsMap.set(e.tickerBloomberg, w);
          }
        }
      }
    }

    // ── 2. Build where clause ─────────────────────────────────────────────────
    const earningsWhere: {
      quarter?:         string;
      reportDate?:      Date;
      tickerBloomberg?: { in: string[] };
    } = {};

    if (quarter)     earningsWhere.quarter        = quarter;
    if (date)        earningsWhere.reportDate      = new Date(date + "T00:00:00.000Z");
    if (fundTickers) earningsWhere.tickerBloomberg = { in: fundTickers };

    // ── 3. Fetch earnings rows ─────────────────────────────────────────────────
    const rows = await prisma.earningsSurprise.findMany({
      where:   earningsWhere,
      orderBy: [{ reportDate: "desc" }, { tickerBloomberg: "asc" }],
      select: {
        tickerBloomberg: true,
        quarter:         true,
        reportDate:      true,
        currency:        true,
        revActual:       true,
        revBeatMiss:     true,
        revYoy:          true,
        revQoq:          true,
        ebitdaActual:    true,
        ebitdaBeatMiss:  true,
        ebitdaYoy:       true,
        ebitdaQoq:       true,
        niActual:        true,
        niBeatMiss:      true,
        niYoy:           true,
        niQoq:           true,
      },
    });

    // ── 4. Sector enrichment ───────────────────────────────────────────────────
    const uniqueTickers = [...new Set(rows.map((r) => r.tickerBloomberg))];
    const sectorMap = new Map<string, string | null>();

    if (uniqueTickers.length > 0) {
      const empresas = await prisma.empresasIndustrias.findMany({
        where:  { tickerBloomberg: { in: uniqueTickers } },
        select: { tickerBloomberg: true, industriaGics: true },
      });
      for (const e of empresas) {
        if (e.tickerBloomberg && !sectorMap.has(e.tickerBloomberg)) {
          sectorMap.set(e.tickerBloomberg, e.industriaGics);
        }
      }
    }

    // ── 5. FX rate lookup by (quarter, currency) ───────────────────────────────
    const fxMap = new Map<string, number | null>();

    const uniqueQC = [
      ...new Set(
        rows
          .filter((r) => r.currency)
          .map((r) => `${r.quarter}|${r.currency}`)
      ),
    ];

    if (uniqueQC.length > 0) {
      const fxRows = await prisma.quarterlyFxRate.findMany({
        where: {
          OR: uniqueQC.map((qc) => {
            const [q, c] = qc.split("|");
            return { quarter: q, currency: c };
          }),
        },
        select: { quarter: true, currency: true, avgRate: true },
      });
      for (const fx of fxRows) {
        fxMap.set(`${fx.quarter}|${fx.currency}`, fx.avgRate ?? null);
      }
    }

    // ── 6. Build response ──────────────────────────────────────────────────────
    const data: EarningsRow[] = rows.map((r) => {
      const wts = tickerWeightsMap.get(r.tickerBloomberg);
      return {
        tickerBloomberg: r.tickerBloomberg,
        sector:          sectorMap.get(r.tickerBloomberg) ?? null,
        quarter:         r.quarter,
        reportDate:      r.reportDate.toISOString().slice(0, 10),
        currency:        r.currency        ?? null,
        avgRate:         r.currency
                           ? (fxMap.get(`${r.quarter}|${r.currency}`) ?? null)
                           : null,
        portfolioWeight: wts?.pw ?? null,
        benchmarkWeight: wts?.bw ?? null,
        overweight:      wts?.ow ?? null,
        revActual:       r.revActual       ?? null,
        revBeatMiss:     r.revBeatMiss     ?? null,
        revYoy:          r.revYoy          ?? null,
        revQoq:          r.revQoq          ?? null,
        ebitdaActual:    r.ebitdaActual    ?? null,
        ebitdaBeatMiss:  r.ebitdaBeatMiss  ?? null,
        ebitdaYoy:       r.ebitdaYoy       ?? null,
        ebitdaQoq:       r.ebitdaQoq       ?? null,
        niActual:        r.niActual        ?? null,
        niBeatMiss:      r.niBeatMiss      ?? null,
        niYoy:           r.niYoy           ?? null,
        niQoq:           r.niQoq           ?? null,
      };
    });

    // ── 7. Selector options (always unfiltered) ────────────────────────────────
    const [quarterRows, dateRows] = await Promise.all([
      prisma.earningsSurprise.findMany({
        select: { quarter: true }, distinct: ["quarter"], orderBy: { quarter: "desc" },
      }),
      prisma.earningsSurprise.findMany({
        select: { reportDate: true }, distinct: ["reportDate"], orderBy: { reportDate: "desc" },
      }),
    ]);

    const quarters = quarterRows.map((r) => r.quarter);
    const dates    = dateRows.map((r) => r.reportDate.toISOString().slice(0, 10));

    return NextResponse.json({ data, quarters, dates } satisfies EarningsPayload);
  } catch (e) {
    console.error("[earnings]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
