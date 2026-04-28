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
  revBeatMiss:     number | null;
  revYoy:          number | null;
  revQoq:          number | null;
  ebitdaBeatMiss:  number | null;
  ebitdaYoy:       number | null;
  ebitdaQoq:       number | null;
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
    // 1. Resolve fund → ticker whitelist
    let fundTickers: string[] | null = null;
    const fundName = FUND_NAMES[fund] ?? null;

    if (fundName) {
      const latestEntry = await prisma.fundPortfolioWeight.findFirst({
        where:   { fundName },
        orderBy: { reportDate: "desc" },
        select:  { reportDate: true },
      });

      if (latestEntry) {
        const weights = await prisma.fundPortfolioWeight.findMany({
          where:  { fundName, reportDate: latestEntry.reportDate },
          select: { company: true },
        });

        const companyNames = weights.map((w) => w.company);
        const empresas = await prisma.empresasIndustrias.findMany({
          where:  { nombreLatam: { in: companyNames }, tickerBloomberg: { not: null } },
          select: { tickerBloomberg: true },
        });

        fundTickers = empresas.map((e) => e.tickerBloomberg!).filter(Boolean);
      }
    }

    // 2. Build where clause
    const earningsWhere: {
      quarter?:        string;
      reportDate?:     Date;
      tickerBloomberg?: { in: string[] };
    } = {};

    if (quarter) earningsWhere.quarter    = quarter;
    if (date)    earningsWhere.reportDate = new Date(date + "T00:00:00.000Z");
    if (fundTickers) earningsWhere.tickerBloomberg = { in: fundTickers };

    // 3. Fetch earnings rows
    const rows = await prisma.earningsSurprise.findMany({
      where:   earningsWhere,
      orderBy: [{ reportDate: "desc" }, { tickerBloomberg: "asc" }],
      select: {
        tickerBloomberg: true,
        quarter:         true,
        reportDate:      true,
        revBeatMiss:     true,
        revYoy:          true,
        revQoq:          true,
        ebitdaBeatMiss:  true,
        ebitdaYoy:       true,
        ebitdaQoq:       true,
        niBeatMiss:      true,
        niYoy:           true,
        niQoq:           true,
      },
    });

    // 4. Enrich with sector
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

    // 5. Build response data
    const data: EarningsRow[] = rows.map((r) => ({
      tickerBloomberg: r.tickerBloomberg,
      sector:          sectorMap.get(r.tickerBloomberg) ?? null,
      quarter:         r.quarter,
      reportDate:      r.reportDate.toISOString().slice(0, 10),
      revBeatMiss:     r.revBeatMiss    ?? null,
      revYoy:          r.revYoy         ?? null,
      revQoq:          r.revQoq         ?? null,
      ebitdaBeatMiss:  r.ebitdaBeatMiss ?? null,
      ebitdaYoy:       r.ebitdaYoy      ?? null,
      ebitdaQoq:       r.ebitdaQoq      ?? null,
      niBeatMiss:      r.niBeatMiss     ?? null,
      niYoy:           r.niYoy          ?? null,
      niQoq:           r.niQoq          ?? null,
    }));

    // 6. All unique quarters + report dates (unfiltered) for selectors
    const [quarterRows, dateRows] = await Promise.all([
      prisma.earningsSurprise.findMany({
        select:   { quarter: true },
        distinct: ["quarter"],
        orderBy:  { quarter: "desc" },
      }),
      prisma.earningsSurprise.findMany({
        select:   { reportDate: true },
        distinct: ["reportDate"],
        orderBy:  { reportDate: "desc" },
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
