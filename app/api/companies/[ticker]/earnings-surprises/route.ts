import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface EarningsSurpriseRow {
  quarter:       string;
  reportDate:    string;
  revBeatMiss:   number | null;
  revYoy:        number | null;
  revQoq:        number | null;
  ebitdaBeatMiss: number | null;
  ebitdaYoy:     number | null;
  ebitdaQoq:     number | null;
  niBeatMiss:    number | null;
  niYoy:         number | null;
  niQoq:         number | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const decodedTicker = decodeURIComponent(ticker);

  try {
    const rows = await prisma.earningsSurprise.findMany({
      where: { tickerBloomberg: { equals: decodedTicker, mode: "insensitive" } },
      orderBy: { reportDate: "desc" },
      select: {
        quarter:        true,
        reportDate:     true,
        revBeatMiss:    true,
        revYoy:         true,
        revQoq:         true,
        ebitdaBeatMiss: true,
        ebitdaYoy:      true,
        ebitdaQoq:      true,
        niBeatMiss:     true,
        niYoy:          true,
        niQoq:          true,
      },
    });

    const data: EarningsSurpriseRow[] = rows.map((r) => ({
      quarter:        r.quarter,
      reportDate:     r.reportDate.toISOString().slice(0, 10),
      revBeatMiss:    r.revBeatMiss   ?? null,
      revYoy:         r.revYoy        ?? null,
      revQoq:         r.revQoq        ?? null,
      ebitdaBeatMiss: r.ebitdaBeatMiss ?? null,
      ebitdaYoy:      r.ebitdaYoy     ?? null,
      ebitdaQoq:      r.ebitdaQoq     ?? null,
      niBeatMiss:     r.niBeatMiss    ?? null,
      niYoy:          r.niYoy         ?? null,
      niQoq:          r.niQoq         ?? null,
    }));

    return NextResponse.json({ data });
  } catch (e) {
    console.error("[earnings-surprises]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
