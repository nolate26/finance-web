import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface HoldingRow {
  ticker: string;
  side: string;
  rank: number | null;
  pxSignal: number | null;
  weight: number | null;        // %
  modeloVeredicto: string | null;
  entryDate: string | null;     // first date of current uninterrupted run
  entryPx: number | null;       // px_signal on entry date
  entryReturn: number | null;   // % return since entry (current px / entry px - 1)
}

export interface MoveRow {
  ticker: string;
  action: string;
  pxSignal: number | null;
}

export interface SignalsPayload {
  holdings: HoldingRow[];
  moves: MoveRow[];
  prevTickers: string[];
  nLongs: number;
  nShorts: number;
}

export async function GET(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get("date");
  if (!dateStr) return NextResponse.json({ error: "Missing date" }, { status: 400 });

  // Parse date robustly (add noon to avoid UTC offset issues)
  const targetDate = new Date(dateStr + "T12:00:00");
  if (isNaN(targetDate.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  // Current holdings
  const rawHoldings = await prisma.signalRaw.findMany({
    where: { signalDate: targetDate },
    orderBy: [{ side: "asc" }, { rank: "asc" }],
    select: { ticker: true, side: true, rank: true, pxSignal: true, nLongs: true, nShorts: true, modeloVeredicto: true },
  });

  if (rawHoldings.length === 0) {
    return NextResponse.json({
      holdings: [], moves: [], prevTickers: [], nLongs: 0, nShorts: 0,
    } satisfies SignalsPayload);
  }

  const nLongs  = rawHoldings.find((h) => h.nLongs  != null)?.nLongs  ?? 0;
  const nShorts = rawHoldings.find((h) => h.nShorts != null)?.nShorts ?? 0;

  // ── Entry-date & entry-return per holding ────────────────────────────────
  // Strategy: walk backwards through ALL signal dates from targetDate.
  // The entry is the oldest date in the *uninterrupted* run where the ticker
  // appears with the same side. A gap (ticker absent OR side change) ends the run.

  const currentTickers = rawHoldings.map((h) => h.ticker);

  // 1. All signal dates ≤ targetDate sorted descending (for the walk-back)
  const allDateRows = await prisma.signalRaw.findMany({
    where:    { signalDate: { lte: targetDate } },
    distinct: ["signalDate"],
    orderBy:  { signalDate: "desc" },
    select:   { signalDate: true },
  });
  const allDatesDesc = allDateRows.map((r) => r.signalDate.toISOString().split("T")[0]);

  // 2. Historical signals for current tickers only (one batch query)
  const histRows = await prisma.signalRaw.findMany({
    where:   { ticker: { in: currentTickers }, signalDate: { lte: targetDate } },
    orderBy: { signalDate: "asc" },
    select:  { ticker: true, signalDate: true, side: true, pxSignal: true },
  });

  // Build: ticker → Map<date, { side, px }>
  const histByTicker = new Map<string, Map<string, { side: string; px: number | null }>>();
  for (const r of histRows) {
    const d = r.signalDate.toISOString().split("T")[0];
    if (!histByTicker.has(r.ticker)) histByTicker.set(r.ticker, new Map());
    histByTicker.get(r.ticker)!.set(d, { side: r.side, px: r.pxSignal });
  }

  // Walk backwards to find the oldest date in the current uninterrupted run
  function findEntry(ticker: string, currentSide: string): { date: string; px: number | null } | null {
    const map = histByTicker.get(ticker);
    if (!map) return null;
    let entryDate: string | null = null;
    let entryPx:   number | null = null;
    for (const d of allDatesDesc) {           // newest → oldest
      const rec = map.get(d);
      if (rec && rec.side === currentSide) {
        entryDate = d;                         // keep pushing entry further back
        entryPx   = rec.px;
      } else {
        break;                                 // gap or side-change → run ended
      }
    }
    return entryDate ? { date: entryDate, px: entryPx } : null;
  }

  const holdings: HoldingRow[] = rawHoldings.map((h) => {
    const entry = findEntry(h.ticker, h.side);
    const entryReturn =
      entry?.px && entry.px > 0 && h.pxSignal != null
        ? Math.round(((h.pxSignal / entry.px) - 1) * 10000) / 100
        : null;

    return {
      ticker: h.ticker,
      side:   h.side,
      rank:   h.rank,
      pxSignal: h.pxSignal,
      weight:
        h.side === "LONG"  && nLongs  > 0 ? Math.round((0.5 / nLongs)  * 10000) / 100 :
        h.side === "SHORT" && nShorts > 0 ? Math.round((0.5 / nShorts) * 10000) / 100 :
        null,
      modeloVeredicto: h.modeloVeredicto,
      entryDate:   entry?.date   ?? null,
      entryPx:     entry?.px     ?? null,
      entryReturn,
    };
  });

  // ── Previous signal date ──────────────────────────────────────────────────
  const prevSignalRow = await prisma.signalRaw.findFirst({
    where: { signalDate: { lt: targetDate } },
    orderBy: { signalDate: "desc" },
    select: { signalDate: true },
  });

  const moves: MoveRow[] = [];
  let prevTickers: string[] = [];

  if (prevSignalRow) {
    const prevHoldings = await prisma.signalRaw.findMany({
      where: { signalDate: prevSignalRow.signalDate },
      select: { ticker: true, side: true, pxSignal: true },
    });
    prevTickers = prevHoldings.map((h) => h.ticker);

    const prevMap  = new Map(prevHoldings.map((h) => [h.ticker, h.side]));
    const currMap  = new Map(rawHoldings.map((h) => [h.ticker, h.side]));

    // Entries / side flips
    for (const h of rawHoldings) {
      const prevSide = prevMap.get(h.ticker);
      if (!prevSide) {
        moves.push({
          ticker: h.ticker,
          action: h.side === "LONG" ? "BUY LONG" : "SELL SHORT",
          pxSignal: h.pxSignal,
        });
      } else if (prevSide !== h.side) {
        moves.push({
          ticker: h.ticker,
          action: h.side === "LONG" ? "FLIP → LONG" : "FLIP → SHORT",
          pxSignal: h.pxSignal,
        });
      }
    }

    // Exits
    for (const h of prevHoldings) {
      if (!currMap.has(h.ticker)) {
        moves.push({
          ticker: h.ticker,
          action: h.side === "LONG" ? "CLOSE LONG" : "COVER SHORT",
          pxSignal: h.pxSignal, // last known price
        });
      }
    }
  }

  return NextResponse.json({
    holdings,
    moves,
    prevTickers,
    nLongs,
    nShorts,
  } satisfies SignalsPayload);
}
