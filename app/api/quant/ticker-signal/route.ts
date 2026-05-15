import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface TickerSignalData {
  ticker:     string;
  signalDate: string;
  score:      number | null;
  value:      number | null;
  quality:    number | null;
  pe:         number | null;
  dy:         number | null;
  roe:        number | null;
  deltaRoe:   number | null;
  price:      number | null;
  top20:      boolean;
}

export interface TickerSignalPayload {
  data: TickerSignalData | null;
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });

  const row = await prisma.signalRaw.findFirst({
    where:   { ticker },
    orderBy: { signalDate: "desc" },
    select: {
      signalDate: true,
      score: true, value: true, quality: true,
      pe: true, dy: true, roe: true, deltaRoe: true,
      price: true, top20: true,
    },
  });

  if (!row) {
    return NextResponse.json({ data: null } satisfies TickerSignalPayload);
  }

  return NextResponse.json({
    data: {
      ticker,
      signalDate: row.signalDate.toISOString().split("T")[0],
      score:    row.score    ?? null,
      value:    row.value    ?? null,
      quality:  row.quality  ?? null,
      pe:       row.pe       ?? null,
      dy:       row.dy       ?? null,
      roe:      row.roe      ?? null,
      deltaRoe: row.deltaRoe ?? null,
      price:    row.price    ?? null,
      top20:    row.top20    ?? false,
    },
  } satisfies TickerSignalPayload);
}
