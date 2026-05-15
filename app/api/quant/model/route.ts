import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface ModelRow {
  ticker:   string;
  name:     string | null;
  industry: string | null;
  score:    number | null;
  value:    number | null;
  quality:  number | null;
  pe:       number | null;
  dy:       number | null;
  roe:      number | null;
  deltaRoe: number | null;
  price:    number | null;
  top20:    boolean;
}

export interface ModelPayload {
  date:  string;
  dates: string[];
  rows:  ModelRow[];
}

export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get("date");

  // All available signal dates (for selector)
  const allDateRows = await prisma.signalRaw.findMany({
    distinct: ["signalDate"],
    orderBy:  { signalDate: "desc" },
    select:   { signalDate: true },
  });
  const dates = allDateRows.map((d) => d.signalDate.toISOString().split("T")[0]);

  if (dates.length === 0) {
    return NextResponse.json({ date: "", dates: [], rows: [] } satisfies ModelPayload);
  }

  const targetDateStr = dateParam && dates.includes(dateParam) ? dateParam : dates[0];
  const targetDate    = new Date(targetDateStr + "T12:00:00");

  // Signals for the selected date
  const signals = await prisma.signalRaw.findMany({
    where:   { signalDate: targetDate },
    orderBy: { score: "desc" },
    select:  {
      ticker: true, score: true, value: true, quality: true,
      pe: true, dy: true, roe: true, deltaRoe: true, price: true, top20: true,
    },
  });

  if (signals.length === 0) {
    return NextResponse.json({ date: targetDateStr, dates, rows: [] } satisfies ModelPayload);
  }

  // Join with EmpresasIndustrias for name + industry
  const tickers   = signals.map((s) => s.ticker);
  const companies = await prisma.empresasIndustrias.findMany({
    where:  { tickerBloomberg: { in: tickers } },
    select: { tickerBloomberg: true, nombreLatam: true, industriaGics: true },
  });

  const coMap = new Map(companies.map((c) => [c.tickerBloomberg, c]));

  const rows: ModelRow[] = signals.map((s) => {
    const co = s.ticker ? coMap.get(s.ticker) : undefined;
    return {
      ticker:   s.ticker,
      name:     co?.nombreLatam  ?? null,
      industry: co?.industriaGics ?? null,
      score:    s.score    ?? null,
      value:    s.value    ?? null,
      quality:  s.quality  ?? null,
      pe:       s.pe       ?? null,
      dy:       s.dy       ?? null,
      roe:      s.roe      ?? null,
      deltaRoe: s.deltaRoe ?? null,
      price:    s.price    ?? null,
      top20:    s.top20    ?? false,
    };
  });

  return NextResponse.json({ date: targetDateStr, dates, rows } satisfies ModelPayload);
}
