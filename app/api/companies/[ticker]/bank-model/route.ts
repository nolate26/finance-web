import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface BankFinancialRow {
  year:               number;
  // Income Statement
  netInterestIncome:  number | null;
  netFeeIncome:       number | null;
  treasuryIncome:     number | null;
  otherIncome:        number | null;
  revenue:            number | null;
  nim:                number | null;
  riskAdjustedNim:    number | null;
  provisionExpenses:  number | null;
  cor:                number | null;
  nplRatio:           number | null;
  totalCoverageRatio: number | null;
  sga:                number | null;
  efficiency:         number | null;
  costToAssets:       number | null;
  ebt:                number | null;
  taxes:              number | null;
  minorityInterest:   number | null;
  controllingNetIncome: number | null;
  eps:                number | null;
  shares:             number | null;
  // Balance
  grossLoans:                 number | null;
  securities:                 number | null;
  interestEarningAssets:      number | null;
  avgInterestEarningAssets:   number | null;
  allowancesLoanLosses:       number | null;
  totalAssets:                number | null;
  avgTotalAssets:             number | null;
  demandDeposits:             number | null;
  timeDeposits:               number | null;
  totalDeposits:              number | null;
  otherFunding:               number | null;
  interestBearingLiabilities: number | null;
  totalFunding:               number | null;
  totalLiabilities:           number | null;
  minorities:                 number | null;
  controllingEquity:          number | null;
  avgControllingEquity:       number | null;
  tangibleEquity:             number | null;
  overdueLoans:               number | null;
  voluntaryProvisions:        number | null;
  // Cash Flow / Market
  capex:      number | null;
  dividend:   number | null;
  payout:     number | null;
  buybacks:   number | null;
  dps:        number | null;
  sharePrice: number | null;
  marketCap:  number | null;
}

export interface BankModelHeaderSnap {
  ticker:     string;
  updateDate: string;
  recc:       string | null;
  tp:         number | null;
  analyst:    string | null;
  link:       string | null;
  currency:   string | null;
  thesis:     string | null;
}

export interface BankKpiRow {
  year:        number;
  sectionName: string;
  kpiName:     string;
  kpiOrder:    number;
  value:       number | null;
}

export interface BankModelSnapshot {
  header:     BankModelHeaderSnap;
  financials: BankFinancialRow[];
  kpis:       BankKpiRow[];
}

export interface BankModelHistoryPayload {
  snapshots: BankModelSnapshot[];
}

// ── Helper ─────────────────────────────────────────────────────────────────────
type RawBankFinancials = {
  year: number;
  netInterestIncome: number | null; netFeeIncome: number | null; treasuryIncome: number | null;
  otherIncome: number | null; revenue: number | null; nim: number | null;
  riskAdjustedNim: number | null; provisionExpenses: number | null; cor: number | null;
  nplRatio: number | null; totalCoverageRatio: number | null; sga: number | null;
  efficiency: number | null; costToAssets: number | null; ebt: number | null;
  taxes: number | null; minorityInterest: number | null; controllingNetIncome: number | null;
  eps: number | null; shares: number | null;
  grossLoans: number | null; securities: number | null; interestEarningAssets: number | null;
  avgInterestEarningAssets: number | null; allowancesLoanLosses: number | null;
  totalAssets: number | null; avgTotalAssets: number | null; demandDeposits: number | null;
  timeDeposits: number | null; totalDeposits: number | null; otherFunding: number | null;
  interestBearingLiabilities: number | null; totalFunding: number | null;
  totalLiabilities: number | null; minorities: number | null; controllingEquity: number | null;
  avgControllingEquity: number | null; tangibleEquity: number | null; overdueLoans: number | null;
  voluntaryProvisions: number | null;
  capex: number | null; dividend: number | null; payout: number | null; buybacks: number | null;
  dps: number | null; sharePrice: number | null; marketCap: number | null;
};

function mapRow(r: RawBankFinancials): BankFinancialRow {
  return {
    year:                       r.year,
    netInterestIncome:          r.netInterestIncome          ?? null,
    netFeeIncome:               r.netFeeIncome               ?? null,
    treasuryIncome:             r.treasuryIncome             ?? null,
    otherIncome:                r.otherIncome                ?? null,
    revenue:                    r.revenue                    ?? null,
    nim:                        r.nim                        ?? null,
    riskAdjustedNim:            r.riskAdjustedNim            ?? null,
    provisionExpenses:          r.provisionExpenses          ?? null,
    cor:                        r.cor                        ?? null,
    nplRatio:                   r.nplRatio                   ?? null,
    totalCoverageRatio:         r.totalCoverageRatio         ?? null,
    sga:                        r.sga                        ?? null,
    efficiency:                 r.efficiency                 ?? null,
    costToAssets:               r.costToAssets               ?? null,
    ebt:                        r.ebt                        ?? null,
    taxes:                      r.taxes                      ?? null,
    minorityInterest:           r.minorityInterest           ?? null,
    controllingNetIncome:       r.controllingNetIncome       ?? null,
    eps:                        r.eps                        ?? null,
    shares:                     r.shares                     ?? null,
    grossLoans:                 r.grossLoans                 ?? null,
    securities:                 r.securities                 ?? null,
    interestEarningAssets:      r.interestEarningAssets      ?? null,
    avgInterestEarningAssets:   r.avgInterestEarningAssets   ?? null,
    allowancesLoanLosses:       r.allowancesLoanLosses       ?? null,
    totalAssets:                r.totalAssets                ?? null,
    avgTotalAssets:             r.avgTotalAssets             ?? null,
    demandDeposits:             r.demandDeposits             ?? null,
    timeDeposits:               r.timeDeposits               ?? null,
    totalDeposits:              r.totalDeposits              ?? null,
    otherFunding:               r.otherFunding               ?? null,
    interestBearingLiabilities: r.interestBearingLiabilities ?? null,
    totalFunding:               r.totalFunding               ?? null,
    totalLiabilities:           r.totalLiabilities           ?? null,
    minorities:                 r.minorities                 ?? null,
    controllingEquity:          r.controllingEquity          ?? null,
    avgControllingEquity:       r.avgControllingEquity       ?? null,
    tangibleEquity:             r.tangibleEquity             ?? null,
    overdueLoans:               r.overdueLoans               ?? null,
    voluntaryProvisions:        r.voluntaryProvisions        ?? null,
    capex:                      r.capex                      ?? null,
    dividend:                   r.dividend                   ?? null,
    payout:                     r.payout                     ?? null,
    buybacks:                   r.buybacks                   ?? null,
    dps:                        r.dps                        ?? null,
    sharePrice:                 r.sharePrice                 ?? null,
    marketCap:                  r.marketCap                  ?? null,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker);

  try {
    const headers = await prisma.bankHeader.findMany({
      // El ticker llega desde companies/list en MAYÚSCULAS (empresas_industrias_v2) y
      // bank_headers usa su propia capitalización → comparar con UPPER en ambos lados.
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
        thesis:     true,
        financials: {
          orderBy: { year: "asc" },
          select: {
            year: true,
            netInterestIncome: true, netFeeIncome: true, treasuryIncome: true,
            otherIncome: true, revenue: true, nim: true, riskAdjustedNim: true,
            provisionExpenses: true, cor: true, nplRatio: true, totalCoverageRatio: true,
            sga: true, efficiency: true, costToAssets: true, ebt: true, taxes: true,
            minorityInterest: true, controllingNetIncome: true, eps: true, shares: true,
            grossLoans: true, securities: true, interestEarningAssets: true,
            avgInterestEarningAssets: true, allowancesLoanLosses: true, totalAssets: true,
            avgTotalAssets: true, demandDeposits: true, timeDeposits: true, totalDeposits: true,
            otherFunding: true, interestBearingLiabilities: true, totalFunding: true,
            totalLiabilities: true, minorities: true, controllingEquity: true,
            avgControllingEquity: true, tangibleEquity: true, overdueLoans: true,
            voluntaryProvisions: true,
            capex: true, dividend: true, payout: true, buybacks: true, dps: true,
            sharePrice: true, marketCap: true,
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

    const snapshots: BankModelSnapshot[] = headers.map((h) => ({
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
      kpis: h.kpis.map((k) => ({
        year:        k.year,
        sectionName: k.sectionName,
        kpiName:     k.kpiName,
        kpiOrder:    k.kpiOrder,
        value:       k.value ?? null,
      })),
    }));

    return NextResponse.json({ snapshots } satisfies BankModelHistoryPayload);
  } catch (e) {
    console.error("[bank-model]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
