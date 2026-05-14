import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface TickerHistoryPoint {
  date: string;
  pxSignal: number | null;
  side: string;
  rank: number | null;
}

export interface TickerHistoryPayload {
  ticker: string;
  history: TickerHistoryPoint[];
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });

  const rows = await prisma.signalRaw.findMany({
    where: { ticker },
    orderBy: { signalDate: "asc" },
    select: { signalDate: true, price: true, top20: true, score: true },
  });

  return NextResponse.json({
    ticker,
    history: rows.map((r) => ({
      date: r.signalDate.toISOString().split("T")[0],
      pxSignal: r.price,
      side: r.top20 === true ? "LONG" : "SHORT",
      rank: r.score != null ? Math.round(r.score * 1000) / 1000 : null,
    })),
  } satisfies TickerHistoryPayload);
}
