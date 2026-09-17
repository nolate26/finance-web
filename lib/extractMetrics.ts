/**
 * Catálogo de métricas para Extract Data (/extract → Financial Models).
 *
 * Una id por CONCEPTO, no por columna: "net_income" apunta a model_financials.net_income
 * en empresas y a bank_financials.controlling_net_income en bancos, así el exportador
 * puede mezclar los dos tipos de modelo en una misma tabla. Una métrica sin mapeo para
 * un tipo sale como "—" para esas filas (p.ej. EBITDA en un banco, NIM en una empresa).
 *
 * Los campos son los nombres Prisma (camelCase) de ModelFinancials / BankFinancials.
 */

export type ModelKind = "company" | "bank";

export type MetricSection = "Income Statement" | "Balance Sheet" | "Cash Flow" | "Market";

export type MetricFormat = "abs" | "pct" | "small";

export interface MetricDef {
  id:       string;
  label:    string;
  section:  MetricSection;
  /** Campo en ModelFinancials (empresas). Ausente = no aplica a empresas. */
  company?: string;
  /** Campo en BankFinancials (bancos). Ausente = no aplica a bancos. */
  bank?:    string;
  format:   MetricFormat;
}

// Orden = orden de display en el selector y en la salida.
export const METRICS: MetricDef[] = [
  // ── Income Statement ────────────────────────────────────────────────────────
  { id: "revenue",          label: "Revenue",                section: "Income Statement", company: "revenue",       bank: "revenue",              format: "abs" },
  { id: "ebit",             label: "EBIT",                   section: "Income Statement", company: "ebit",                                        format: "abs" },
  { id: "da",               label: "D&A",                    section: "Income Statement", company: "da",                                          format: "abs" },
  { id: "ebitda",           label: "EBITDA",                 section: "Income Statement", company: "ebitda",                                      format: "abs" },
  { id: "net_fin_exp",      label: "Net Fin. Expenses",      section: "Income Statement", company: "netFinExp",                                   format: "abs" },
  { id: "tax_rate",         label: "Tax Rate",               section: "Income Statement", company: "taxRate",                                     format: "pct" },
  { id: "taxes",            label: "Taxes",                  section: "Income Statement", company: "taxes",         bank: "taxes",                format: "abs" },
  { id: "net_income",       label: "Net Income",             section: "Income Statement", company: "netIncome",     bank: "controllingNetIncome", format: "abs" },
  { id: "eps",              label: "EPS",                    section: "Income Statement", company: "eps",           bank: "eps",                  format: "small" },
  { id: "shares",           label: "Shares Outstanding",     section: "Income Statement", company: "sharesOut",     bank: "shares",               format: "abs" },
  // bancos
  { id: "net_interest_inc", label: "Net Interest Income",    section: "Income Statement",                           bank: "netInterestIncome",    format: "abs" },
  { id: "net_fee_inc",      label: "Net Fee Income",         section: "Income Statement",                           bank: "netFeeIncome",         format: "abs" },
  { id: "treasury_inc",     label: "Treasury Income",        section: "Income Statement",                           bank: "treasuryIncome",       format: "abs" },
  { id: "other_inc",        label: "Other Income",           section: "Income Statement",                           bank: "otherIncome",          format: "abs" },
  { id: "nim",              label: "NIM",                    section: "Income Statement",                           bank: "nim",                  format: "pct" },
  { id: "risk_adj_nim",     label: "Risk-adjusted NIM",      section: "Income Statement",                           bank: "riskAdjustedNim",      format: "pct" },
  { id: "provisions",       label: "Provision Expenses",     section: "Income Statement",                           bank: "provisionExpenses",    format: "abs" },
  { id: "cor",              label: "Cost of Risk",           section: "Income Statement",                           bank: "cor",                  format: "pct" },
  { id: "npl_ratio",        label: "NPL Ratio",              section: "Income Statement",                           bank: "nplRatio",             format: "pct" },
  { id: "coverage",         label: "Total Coverage Ratio",   section: "Income Statement",                           bank: "totalCoverageRatio",   format: "pct" },
  { id: "sga",              label: "SG&A",                   section: "Income Statement",                           bank: "sga",                  format: "abs" },
  { id: "efficiency",       label: "Efficiency",             section: "Income Statement",                           bank: "efficiency",           format: "pct" },
  { id: "cost_to_assets",   label: "Cost to Assets",         section: "Income Statement",                           bank: "costToAssets",         format: "pct" },
  { id: "ebt",              label: "EBT",                    section: "Income Statement",                           bank: "ebt",                  format: "abs" },
  { id: "minority_int",     label: "Minority Interest (P&L)",section: "Income Statement",                           bank: "minorityInterest",     format: "abs" },

  // ── Balance Sheet ───────────────────────────────────────────────────────────
  { id: "net_debt",         label: "Net Debt",               section: "Balance Sheet",    company: "netDebt",                                     format: "abs" },
  { id: "minorities",       label: "Minorities",             section: "Balance Sheet",    company: "minorities",    bank: "minorities",           format: "abs" },
  { id: "controlling_eq",   label: "Controlling Equity",     section: "Balance Sheet",    company: "controllingEq", bank: "controllingEquity",    format: "abs" },
  { id: "tangible_eq",      label: "Tangible Equity",        section: "Balance Sheet",    company: "tangibleEq",    bank: "tangibleEquity",       format: "abs" },
  { id: "ppe",              label: "PP&E",                   section: "Balance Sheet",    company: "ppe",                                         format: "abs" },
  { id: "working_capital",  label: "Working Capital",        section: "Balance Sheet",    company: "workingCapital",                              format: "abs" },
  // bancos
  { id: "gross_loans",      label: "Gross Loans",            section: "Balance Sheet",                              bank: "grossLoans",           format: "abs" },
  { id: "securities",       label: "Securities",             section: "Balance Sheet",                              bank: "securities",           format: "abs" },
  { id: "iea",              label: "Interest-earning Assets",section: "Balance Sheet",                              bank: "interestEarningAssets",format: "abs" },
  { id: "avg_iea",          label: "Avg Interest-earning Assets", section: "Balance Sheet",                         bank: "avgInterestEarningAssets", format: "abs" },
  { id: "allowances",       label: "Allowances (loan losses)", section: "Balance Sheet",                            bank: "allowancesLoanLosses", format: "abs" },
  { id: "total_assets",     label: "Total Assets",           section: "Balance Sheet",                              bank: "totalAssets",          format: "abs" },
  { id: "avg_total_assets", label: "Avg Total Assets",       section: "Balance Sheet",                              bank: "avgTotalAssets",       format: "abs" },
  { id: "demand_deposits",  label: "Demand Deposits",        section: "Balance Sheet",                              bank: "demandDeposits",       format: "abs" },
  { id: "time_deposits",    label: "Time Deposits",          section: "Balance Sheet",                              bank: "timeDeposits",         format: "abs" },
  { id: "total_deposits",   label: "Total Deposits",         section: "Balance Sheet",                              bank: "totalDeposits",        format: "abs" },
  { id: "other_funding",    label: "Other Funding",          section: "Balance Sheet",                              bank: "otherFunding",         format: "abs" },
  { id: "ibl",              label: "Interest-bearing Liabilities", section: "Balance Sheet",                        bank: "interestBearingLiabilities", format: "abs" },
  { id: "total_funding",    label: "Total Funding",          section: "Balance Sheet",                              bank: "totalFunding",         format: "abs" },
  { id: "total_liabilities",label: "Total Liabilities",      section: "Balance Sheet",                              bank: "totalLiabilities",     format: "abs" },
  { id: "avg_ctrl_eq",      label: "Avg Controlling Equity", section: "Balance Sheet",                              bank: "avgControllingEquity", format: "abs" },
  { id: "overdue_loans",    label: "Overdue Loans",          section: "Balance Sheet",                              bank: "overdueLoans",         format: "abs" },
  { id: "vol_provisions",   label: "Voluntary Provisions",   section: "Balance Sheet",                              bank: "voluntaryProvisions",  format: "abs" },

  // ── Cash Flow ───────────────────────────────────────────────────────────────
  { id: "fcf",              label: "FCF",                    section: "Cash Flow",        company: "fcf",                                         format: "abs" },
  { id: "fcfe",             label: "FCFE",                   section: "Cash Flow",        company: "fcfe",                                        format: "abs" },
  { id: "capex",            label: "Capex",                  section: "Cash Flow",        company: "capex",         bank: "capex",                format: "abs" },
  { id: "asset_sales",      label: "Asset Sales",            section: "Cash Flow",        company: "assetSales",                                  format: "abs" },
  { id: "dividend",         label: "Dividend",               section: "Cash Flow",        company: "dividend",      bank: "dividend",             format: "abs" },
  { id: "payout",           label: "Payout",                 section: "Cash Flow",        company: "payout",        bank: "payout",               format: "pct" },
  { id: "buybacks",         label: "Buybacks",               section: "Cash Flow",        company: "buybacks",      bank: "buybacks",             format: "abs" },
  { id: "dps",              label: "DPS",                    section: "Cash Flow",        company: "dps",           bank: "dps",                  format: "small" },

  // ── Market ──────────────────────────────────────────────────────────────────
  { id: "share_price",      label: "Share Price",            section: "Market",           company: "sharePrice",    bank: "sharePrice",           format: "small" },
  { id: "market_cap",       label: "Market Cap",             section: "Market",           company: "marketCap",     bank: "marketCap",            format: "abs" },
  { id: "fx_consensus",     label: "FX → Consensus",         section: "Market",           company: "fxConsensus",   bank: "fxConsensus",          format: "small" },
  { id: "fx_eop",           label: "FX EoP",                 section: "Market",           company: "fxEop",         bank: "fxEop",                format: "small" },
];

export const METRIC_BY_ID: Map<string, MetricDef> = new Map(METRICS.map((m) => [m.id, m]));

export const SECTIONS: MetricSection[] = ["Income Statement", "Balance Sheet", "Cash Flow", "Market"];

/** Selección inicial del exportador: lo que se pide 9 de cada 10 veces. */
export const DEFAULT_METRIC_IDS = ["revenue", "ebitda", "net_income", "eps"];

export function metricAppliesTo(m: MetricDef, kind: ModelKind): boolean {
  return kind === "company" ? m.company != null : m.bank != null;
}

// ── Consensus View ────────────────────────────────────────────────────────────
// Las tres métricas que trae consensus_estimates (Bloomberg) y su nombre visible.
export type ConsensusMetricKey = "revenue" | "ebitda" | "netIncome";
export const CONSENSUS_METRICS: { key: ConsensusMetricKey; bbg: string; label: string }[] = [
  { key: "revenue",   bbg: "REVENUE",    label: "Revenue"    },
  { key: "ebitda",    bbg: "EBITDA",     label: "EBITDA"     },
  { key: "netIncome", bbg: "NET_INCOME", label: "Net Income" },
];
