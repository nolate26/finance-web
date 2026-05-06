import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ModelFinancialRow {
  year:          number;
  revenue:       number | null;
  ebit:          number | null;
  taxRate:       number | null;
  da:            number | null;
  ebitda:        number | null;
  netFinExp:     number | null;
  taxes:         number | null;
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
  currency:   string | null;
  thesis:     string | null;
}

export interface ModelKpiRow {
  year:        number;
  sectionName: string;
  kpiName:     string;
  kpiOrder:    number;
  value:       number | null;
}

export interface ModelSnapshot {
  header:     ModelHeaderSnap;
  financials: ModelFinancialRow[];
  kpis:       ModelKpiRow[];
}

export interface ModelHistoryPayload {
  snapshots: ModelSnapshot[];
}

// Keep backward compat alias
export interface ModelPayload {
  header:     ModelHeaderSnap | null;
  financials: ModelFinancialRow[];
}

// ── Helper ─────────────────────────────────────────────────────────────────────
function mapRow(r: {
  year: number; revenue: number | null; ebit: number | null; taxRate: number | null;
  da: number | null; ebitda: number | null; netFinExp: number | null;
  taxes: number | null; netIncome: number | null;
  eps: number | null; sharesOut: number | null; netDebt: number | null; minorities: number | null;
  controllingEq: number | null; tangibleEq: number | null; ppe: number | null;
  workingCapital: number | null; fcf: number | null; capex: number | null;
  assetSales: number | null; fcfe: number | null; dividend: number | null;
  payout: number | null; buybacks: number | null; dps: number | null;
  sharePrice: number | null; marketCap: number | null;
}): ModelFinancialRow {
  return {
    year:           r.year,
    revenue:        r.revenue        ?? null,
    ebit:           r.ebit           ?? null,
    taxRate:        r.taxRate        ?? null,
    da:             r.da             ?? null,
    ebitda:         r.ebitda         ?? null,
    netFinExp:      r.netFinExp      ?? null,
    taxes:          r.taxes          ?? null,
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
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker);

  try {
    const headers = await prisma.modelHeader.findMany({
      where:   { ticker },
      orderBy: { updateDate: "desc" },
      take:    12,
      select:  {
        ticker:     true,
        updateDate: true,
        recc:       true,
        tp:         true,
        analyst:    true,
        link:       true,
        currency:   true,
        thesis:     true,
        financials: {
          orderBy: { year: "asc" },
          select: {
            year: true, revenue: true, ebit: true, taxRate: true, da: true,
            ebitda: true, netFinExp: true, taxes: true, netIncome: true, eps: true,
            sharesOut: true, netDebt: true, minorities: true, controllingEq: true,
            tangibleEq: true, ppe: true, workingCapital: true, fcf: true, capex: true,
            assetSales: true, fcfe: true, dividend: true, payout: true, buybacks: true,
            dps: true, sharePrice: true, marketCap: true,
          },
        },
        kpis: {
          orderBy: [{ sectionName: "asc" }, { kpiOrder: "asc" }, { year: "asc" }],
          select: {
            year: true, sectionName: true, kpiName: true, kpiOrder: true, value: true,
          },
        },
      },
    });

    const snapshots: ModelSnapshot[] = headers.map((h) => ({
      header: {
        ticker:     h.ticker,
        updateDate: h.updateDate.toISOString().slice(0, 10),
        recc:       h.recc     ?? null,
        tp:         h.tp       ?? null,
        analyst:    h.analyst  ?? null,
        link:       h.link     ?? null,
        currency:   h.currency ?? null,
        thesis:     h.thesis   ?? null,
      },
      financials: h.financials.map(mapRow),
      kpis: h.kpis.map(k => ({
        year:        k.year,
        sectionName: k.sectionName,
        kpiName:     k.kpiName,
        kpiOrder:    k.kpiOrder,
        value:       k.value ?? null,
      })),
    }));

    return NextResponse.json({ snapshots } satisfies ModelHistoryPayload);
  } catch (e) {
    console.error("[model]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
