import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface ModelFinancialRow {
  year:          number;
  revenue:       number | null;
  ebit:          number | null;
  taxRate:       number | null;
  da:            number | null;
  ebitda:        number | null;
  netFinExp:     number | null;
  netIncome:     number | null;
  eps:           number | null;
  sharesOut:     number | null;
  netDebt:       number | null;
  minorities:    number | null;
  controllingEq: number | null;
  tangibleEq:    number | null;
  ppe:           number | null;
  workingCapital:number | null;
  fcf:           number | null;
  capex:         number | null;
  assetSales:    number | null;
  fcfe:          number | null;
  dividend:      number | null;
  payout:        number | null;
  buybacks:      number | null;
  dps:           number | null;
  sharePrice:    number | null;
  marketCap:     number | null;
}

export interface ModelHeaderSnap {
  ticker:     string;
  updateDate: string;
  recc:       string | null;
  tp:         number | null;
  analyst:    string | null;
  link:       string | null;
}

export interface ModelPayload {
  header:     ModelHeaderSnap | null;
  financials: ModelFinancialRow[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker);

  try {
    const header = await prisma.modelHeader.findFirst({
      where:   { ticker },
      orderBy: { updateDate: "desc" },
      select:  { ticker: true, updateDate: true, recc: true, tp: true, analyst: true, link: true },
    });

    if (!header) {
      return NextResponse.json({ header: null, financials: [] } satisfies ModelPayload);
    }

    const rows = await prisma.modelFinancials.findMany({
      where:   { ticker, updateDate: header.updateDate },
      orderBy: { year: "asc" },
      select: {
        year: true, revenue: true, ebit: true, taxRate: true, da: true,
        ebitda: true, netFinExp: true, netIncome: true, eps: true, sharesOut: true,
        netDebt: true, minorities: true, controllingEq: true, tangibleEq: true,
        ppe: true, workingCapital: true, fcf: true, capex: true, assetSales: true,
        fcfe: true, dividend: true, payout: true, buybacks: true, dps: true,
        sharePrice: true, marketCap: true,
      },
    });

    const financials: ModelFinancialRow[] = rows.map((r) => ({
      year:           r.year,
      revenue:        r.revenue        ?? null,
      ebit:           r.ebit           ?? null,
      taxRate:        r.taxRate        ?? null,
      da:             r.da             ?? null,
      ebitda:         r.ebitda         ?? null,
      netFinExp:      r.netFinExp      ?? null,
      netIncome:      r.netIncome      ?? null,
      eps:            r.eps            ?? null,
      sharesOut:      r.sharesOut      ?? null,
      netDebt:        r.netDebt        ?? null,
      minorities:     r.minorities     ?? null,
      controllingEq:  r.controllingEq  ?? null,
      tangibleEq:     r.tangibleEq     ?? null,
      ppe:            r.ppe            ?? null,
      workingCapital: r.workingCapital ?? null,
      fcf:            r.fcf            ?? null,
      capex:          r.capex          ?? null,
      assetSales:     r.assetSales     ?? null,
      fcfe:           r.fcfe           ?? null,
      dividend:       r.dividend       ?? null,
      payout:         r.payout         ?? null,
      buybacks:       r.buybacks       ?? null,
      dps:            r.dps            ?? null,
      sharePrice:     r.sharePrice     ?? null,
      marketCap:      r.marketCap      ?? null,
    }));

    return NextResponse.json({
      header: {
        ticker:     header.ticker,
        updateDate: header.updateDate.toISOString().slice(0, 10),
        recc:       header.recc    ?? null,
        tp:         header.tp      ?? null,
        analyst:    header.analyst ?? null,
        link:       header.link    ?? null,
      },
      financials,
    } satisfies ModelPayload);
  } catch (e) {
    console.error("[model]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
