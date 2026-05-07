import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface TickerConsensusRow {
  metric: string;
  period: string;
  value:  number;
}

export interface TickerConsensusPayload {
  rows: TickerConsensusRow[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker);

  try {
    const all = await prisma.consensusEstimate.findMany({
      where: {
        ticker,
        metric: { in: ["NET_INCOME", "EBITDA", "REVENUE"] },
      },
      orderBy: { date: "desc" },
      select:  { metric: true, period: true, value: true },
    });

    // Deduplicate: first row per (metric, period) = latest date
    const seen = new Set<string>();
    const rows: TickerConsensusRow[] = [];
    for (const r of all) {
      const key = `${r.metric}::${r.period}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push({ metric: r.metric, period: r.period, value: r.value });
      }
    }

    return NextResponse.json({ rows } satisfies TickerConsensusPayload);
  } catch (e) {
    console.error("[consensus]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
