import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ModelFinancialRow {
  year:          number;
  fxConsensus:   number | null;   // model → consensus currency (per year)
  fxEop:         number | null;   // market cap → model currency (per year, hist + proj)
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
  unit:       string | null;   // "mn" | "000 mn" — analyst's number scale
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
  // Precio de mercado más reciente (price_range_52w). El explorer lo usa para sobre-escribir
  // el precio de los años proyectados y recalcular los múltiplos con el precio vivo.
  livePrice: { value: number; date: string } | null;
}

// Keep backward compat alias
export interface ModelPayload {
  header:     ModelHeaderSnap | null;
  financials: ModelFinancialRow[];
}

// ── Helper ─────────────────────────────────────────────────────────────────────
function mapRow(r: {
  year: number; fxConsensus: number | null; fxEop: number | null;
  revenue: number | null; ebit: number | null; taxRate: number | null;
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
    fxConsensus:    r.fxConsensus    ?? null,
    fxEop:          r.fxEop          ?? null,
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
  const ticker = decodeURIComponent(rawTicker).trim();

  try {
    const headers = await prisma.modelHeader.findMany({
      // El ticker llega desde companies/list en MAYÚSCULAS (empresas_industrias_v2) y
      // model_headers usa su propia capitalización → comparar con UPPER en ambos lados.
      where:   { ticker: { equals: ticker, mode: "insensitive" } },
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
        unit:       true,
        thesis:     true,
        financials: {
          orderBy: { year: "asc" },
          select: {
            year: true, fxConsensus: true, fxEop: true,
            revenue: true, ebit: true, taxRate: true, da: true,
            ebitda: true, netFinExp: true, taxes: true, netIncome: true, eps: true,
            sharesOut: true, netDebt: true, minorities: true, controllingEq: true,
            tangibleEq: true, ppe: true, workingCapital: true, fcf: true, capex: true,
            assetSales: true, fcfe: true, dividend: true, payout: true, buybacks: true,
            dps: true, sharePrice: true, marketCap: true,
          },
        },
        kpis: {
          // Orden de inserción (≈ orden de la planilla); el builder preserva este orden.
          orderBy: { id: "asc" },
          select: {
            year: true, sectionName: true, kpiName: true, kpiOrder: true, value: true,
          },
        },
      },
    });

    // Precio de mercado más reciente (px_last). Match case-insensitive: los tickers difieren
    // en casing/espacios entre tablas (price_range_52w está limpio; el param viene de empresas).
    const priceRow = await prisma.priceRange52w.findFirst({
      where:   { ticker: { equals: ticker, mode: "insensitive" } },
      orderBy: { date: "desc" },
      select:  { pxLast: true, date: true },
    });
    const livePrice = priceRow
      ? { value: priceRow.pxLast, date: priceRow.date.toISOString().slice(0, 10) }
      : null;

    const snapshots: ModelSnapshot[] = headers.map((h) => ({
      header: {
        ticker:     h.ticker,
        updateDate: h.updateDate.toISOString().slice(0, 10),
        recc:       h.recc     ?? null,
        tp:         h.tp       ?? null,
        analyst:    h.analyst  ?? null,
        link:       h.link     ?? null,
        currency:   h.currency ?? null,
        unit:       h.unit     ?? null,
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

    return NextResponse.json({ snapshots, livePrice } satisfies ModelHistoryPayload);
  } catch (e) {
    console.error("[model]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
