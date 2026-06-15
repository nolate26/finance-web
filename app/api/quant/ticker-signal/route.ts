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

// Price-momentum signal for the same ticker (separate model / date cadence).
export interface TickerMomentumData {
  signalDate: string;
  signal:     number | null;   // raw momentum return, in %
  score:      number | null;   // rank-percentile 0–100
  zscore:     number | null;   // sigmas above the cross-section mean
  rank:       number | null;   // ordinal rank (1 = best)
}

export interface TickerSignalPayload {
  data:     TickerSignalData | null;
  momentum: TickerMomentumData | null;
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });

  // signals_raw guarda los tickers en capitalización propia y companies/list ahora
  // entrega el ticker en MAYÚSCULAS (empresas_industrias_v2) → comparar UPPER ambos lados.
  const [row, momentumRow] = await Promise.all([
    prisma.signalRaw.findFirst({
      where:   { ticker: { equals: ticker, mode: "insensitive" } },
      orderBy: { signalDate: "desc" },
      select: {
        signalDate: true,
        score: true, value: true, quality: true,
        pe: true, dy: true, roe: true, deltaRoe: true,
        price: true, top20: true,
      },
    }),
    prisma.momentumSignal.findFirst({
      where:   { ticker: { equals: ticker, mode: "insensitive" } },
      orderBy: { signalDate: "desc" },
      select:  { signalDate: true, signal: true, score: true, zscore: true, rank: true },
    }),
  ]);

  const momentum: TickerMomentumData | null = momentumRow
    ? {
        signalDate: momentumRow.signalDate.toISOString().split("T")[0],
        signal:     momentumRow.signal ?? null,
        score:      momentumRow.score  ?? null,
        zscore:     momentumRow.zscore ?? null,
        rank:       momentumRow.rank   ?? null,
      }
    : null;

  if (!row) {
    return NextResponse.json({ data: null, momentum } satisfies TickerSignalPayload);
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
    momentum,
  } satisfies TickerSignalPayload);
}
