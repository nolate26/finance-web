import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface EarningsSurpriseAllRow {
  tickerBloomberg: string;
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

export async function GET() {
  try {
    const rows = await prisma.earningsSurprise.findMany({
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

    const data: EarningsSurpriseAllRow[] = rows.map((r) => ({
      tickerBloomberg: r.tickerBloomberg,
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

    // Build sorted list of unique report dates for the date picker
    const dates = [...new Set(data.map((r) => r.reportDate))].sort((a, b) => b.localeCompare(a));

    return NextResponse.json({ data, dates });
  } catch (e) {
    console.error("[quant/earnings-surprises]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
