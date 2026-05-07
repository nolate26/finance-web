import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface ConsensusCheckRow {
  ticker:     string;
  updateDate: string;
  analyst:    string | null;
  moneda: {
    rev1FY:    number | null;
    rev2FY:    number | null;
    ebitda1FY: number | null;
    ebitda2FY: number | null;
    ni1FY:     number | null;
    ni2FY:     number | null;
  };
  consensus: {
    rev1FY:    number | null;
    rev2FY:    number | null;
    ebitda1FY: number | null;
    ebitda2FY: number | null;
    ni1FY:     number | null;
    ni2FY:     number | null;
  };
}

export interface ConsensusCheckPayload {
  rows:    ConsensusCheckRow[];
  year1FY: number;
  year2FY: number;
}

export async function GET() {
  try {
    const year1FY = new Date().getFullYear();
    const year2FY = year1FY + 1;

    // Latest ModelHeader per ticker
    const latestHeaders = await prisma.modelHeader.findMany({
      distinct: ["ticker"],
      orderBy:  { updateDate: "desc" },
      select:   { ticker: true, updateDate: true, analyst: true },
    });

    if (latestHeaders.length === 0) {
      return NextResponse.json({ rows: [], year1FY, year2FY } satisfies ConsensusCheckPayload);
    }

    const tickers = latestHeaders.map((h) => h.ticker);

    // Financials from each ticker's latest snapshot for year1FY and year2FY
    const financials = await prisma.modelFinancials.findMany({
      where: {
        OR: latestHeaders.map((h) => ({
          ticker:     h.ticker,
          updateDate: h.updateDate,
          year:       { in: [year1FY, year2FY] },
        })),
      },
      select: { ticker: true, year: true, revenue: true, ebitda: true, netIncome: true },
    });

    // Latest consensus per (ticker, metric, period) — ordered desc, take first
    // Periods stored in DB as calendar year strings: '2026', '2027'
    const consensusRows = await prisma.consensusEstimate.findMany({
      where: {
        ticker: { in: tickers },
        metric: { in: ["NET_INCOME", "EBITDA", "REVENUE"] },
        period: { in: [String(year1FY), String(year2FY)] },
      },
      orderBy: { date: "desc" },
      select:  { ticker: true, metric: true, period: true, value: true },
    });

    // Build maps
    // financials: (ticker, year) → { revenue, ebitda, netIncome }
    const finMap = new Map<string, { revenue: number | null; ebitda: number | null; netIncome: number | null }>();
    for (const f of financials) {
      finMap.set(`${f.ticker}::${f.year}`, {
        revenue:   f.revenue   ?? null,
        ebitda:    f.ebitda    ?? null,
        netIncome: f.netIncome ?? null,
      });
    }

    // consensus: (ticker, metric, period) → value (deduplicated, first = latest)
    const conMap  = new Map<string, number>();
    const seenCon = new Set<string>();
    for (const r of consensusRows) {
      const key = `${r.ticker}::${r.metric}::${r.period}`;
      if (!seenCon.has(key)) {
        seenCon.add(key);
        conMap.set(key, r.value);
      }
    }

    const rows: ConsensusCheckRow[] = latestHeaders.map((h) => {
      const fin1 = finMap.get(`${h.ticker}::${year1FY}`);
      const fin2 = finMap.get(`${h.ticker}::${year2FY}`);

      const getCon = (metric: string, period: string) =>
        conMap.get(`${h.ticker}::${metric}::${period}`) ?? null;

      return {
        ticker:     h.ticker,
        updateDate: h.updateDate.toISOString().slice(0, 10),
        analyst:    h.analyst ?? null,
        moneda: {
          rev1FY:    fin1?.revenue   ?? null,
          rev2FY:    fin2?.revenue   ?? null,
          ebitda1FY: fin1?.ebitda    ?? null,
          ebitda2FY: fin2?.ebitda    ?? null,
          ni1FY:     fin1?.netIncome ?? null,
          ni2FY:     fin2?.netIncome ?? null,
        },
        consensus: {
          rev1FY:    getCon("REVENUE",    String(year1FY)),
          rev2FY:    getCon("REVENUE",    String(year2FY)),
          ebitda1FY: getCon("EBITDA",     String(year1FY)),
          ebitda2FY: getCon("EBITDA",     String(year2FY)),
          ni1FY:     getCon("NET_INCOME", String(year1FY)),
          ni2FY:     getCon("NET_INCOME", String(year2FY)),
        },
      };
    });

    return NextResponse.json({ rows, year1FY, year2FY } satisfies ConsensusCheckPayload);
  } catch (e) {
    console.error("[consensus-check]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
