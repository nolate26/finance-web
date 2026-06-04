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
  owMle:    number | null;   // active weight (overweight) in MLE fund
  owMsc:    number | null;   // active weight (overweight) in MSC fund
  funds:    string[];        // fund/index membership, subset of ["MLE","MSC"]
}

// ── Fund positioning (active weight per fund) ───────────────────────────────────
const FUND_NAMES: Record<"MLE" | "MSC", string> = {
  MLE: "Moneda_Latin_America_Equities_(LX)",
  MSC: "Moneda_Latin_America_Small_Cap_(LX)",
};

// company (nombreLatam) → overweight, from the latest reportDate of the fund.
// `has(company)` ⇒ the name is in the fund or its benchmark index.
async function fundOverweights(fundName: string): Promise<Map<string, number | null>> {
  const latest = await prisma.fundPortfolioWeight.findFirst({
    where:   { fundName },
    orderBy: { reportDate: "desc" },
    select:  { reportDate: true },
  });
  if (!latest) return new Map();
  const rows = await prisma.fundPortfolioWeight.findMany({
    where:  { fundName, reportDate: latest.reportDate },
    select: { company: true, overweight: true },
  });
  return new Map(rows.map((r) => [r.company, r.overweight ?? null]));
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

  // Fund positioning (latest reportDate per fund), keyed by nombreLatam
  const [mleMap, mscMap] = await Promise.all([
    fundOverweights(FUND_NAMES.MLE),
    fundOverweights(FUND_NAMES.MSC),
  ]);

  const rows: ModelRow[] = signals.map((s) => {
    const co = s.ticker ? coMap.get(s.ticker) : undefined;
    const nl = co?.nombreLatam ?? null;
    const inMle = nl != null && mleMap.has(nl);
    const inMsc = nl != null && mscMap.has(nl);
    const funds: string[] = [];
    if (inMle) funds.push("MLE");
    if (inMsc) funds.push("MSC");
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
      owMle:    nl != null ? (mleMap.get(nl) ?? null) : null,
      owMsc:    nl != null ? (mscMap.get(nl) ?? null) : null,
      funds,
    };
  });

  return NextResponse.json({ date: targetDateStr, dates, rows } satisfies ModelPayload);
}
