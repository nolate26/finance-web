import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface MomentumRow {
  ticker:   string;
  name:     string | null;
  industry: string | null;
  signal:   number | null;   // raw momentum return, in % (e.g. 359.26 = +359%)
  score:    number | null;   // rank-percentile 0–100 (best of date = 100)
  zscore:   number | null;   // sigmas above the cross-section mean of the date
  rank:     number | null;   // ordinal rank (1 = best momentum)
}

export interface MomentumPayload {
  date:  string;        // selected signal date (YYYY-MM-DD)
  dates: string[];      // all available signal dates, newest first
  rows:  MomentumRow[];
}

export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get("date");

  // All available signal dates (for the date selector)
  const allDateRows = await prisma.momentumSignal.findMany({
    distinct: ["signalDate"],
    orderBy:  { signalDate: "desc" },
    select:   { signalDate: true },
  });
  const dates = allDateRows.map((d) => d.signalDate.toISOString().split("T")[0]);

  if (dates.length === 0) {
    return NextResponse.json({ date: "", dates: [], rows: [] } satisfies MomentumPayload);
  }

  const targetDateStr = dateParam && dates.includes(dateParam) ? dateParam : dates[0];
  const targetDate    = new Date(targetDateStr + "T12:00:00");

  // The full cross-section for the selected date
  const signals = await prisma.momentumSignal.findMany({
    where:   { signalDate: targetDate },
    orderBy: { rank: "asc" },
    select:  { ticker: true, signal: true, score: true, zscore: true, rank: true },
  });

  if (signals.length === 0) {
    return NextResponse.json({ date: targetDateStr, dates, rows: [] } satisfies MomentumPayload);
  }

  // Join with EmpresasIndustriasV2 for name + industry.
  // v2 guarda los tickers en MAYÚSCULAS → normalizamos ambos lados del cruce.
  const tickers   = signals.flatMap((s) => (s.ticker ? [s.ticker.toUpperCase()] : []));
  const companies = await prisma.empresasIndustriasV2.findMany({
    where:  { tickerBloomberg: { in: tickers } },
    select: { tickerBloomberg: true, nombreLatam: true, industriaGics: true },
  });
  const coMap = new Map(companies.map((c) => [c.tickerBloomberg.toUpperCase(), c]));

  const rows: MomentumRow[] = signals.map((s) => {
    const co = s.ticker ? coMap.get(s.ticker.toUpperCase()) : undefined;
    return {
      ticker:   s.ticker,
      name:     co?.nombreLatam   ?? null,
      industry: co?.industriaGics ?? null,
      signal:   s.signal ?? null,
      score:    s.score  ?? null,
      zscore:   s.zscore ?? null,
      rank:     s.rank   ?? null,
    };
  });

  return NextResponse.json({ date: targetDateStr, dates, rows } satisfies MomentumPayload);
}
