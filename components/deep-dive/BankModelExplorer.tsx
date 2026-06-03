"use client";

import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx-js-style";
import type {
  BankModelHistoryPayload,
  BankFinancialRow,
  BankKpiRow,
} from "@/app/api/companies/[ticker]/bank-model/route";

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  HDR:     "#1E3A8A",
  SEC_SUB: "#374151",
  EST_BG:  "#FFFDE7",
  DRV_BG:  "#DBEAFE",
  BDR:     "#9CA3AF",
  BLUE:    "#1D4ED8",
  RED:     "#DC2626",
  GREEN:   "#15803D",
  TXT:     "#111827",
  TXT2:    "#374151",
  WHITE:   "#FFFFFF",
};

// ── Safe math ──────────────────────────────────────────────────────────────────
const divz = (a: number | null, b: number | null): number | null =>
  a === null || b === null || b === 0 ? null : a / b;
const yoy = (cur: number | null, prev: number | null): number | null =>
  cur === null || prev === null || prev === 0 ? null : cur / prev - 1;

// ── Formatters ─────────────────────────────────────────────────────────────────
// Montos: #,##0 con negativos entre paréntesis, cero/null = "-".
const fmtMoney = (v: number | null): string => {
  if (v === null) return "-";
  const r = Math.round(v);
  if (r === 0) return "-";
  const abs = Math.abs(r).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return r < 0 ? `(${abs})` : abs;
};
// Porcentajes: 0.0% (signo + para filas con colorize / variaciones).
const fmtPct = (v: number | null, signed = false): string => {
  if (v === null) return "-";
  const p = v * 100;
  return (signed && p >= 0 ? "+" : "") + p.toFixed(1) + "%";
};
// Múltiplos: 0.0x.
const fmtMult = (v: number | null): string => (v === null ? "-" : v.toFixed(1) + "x");

// ── Enriched year data ─────────────────────────────────────────────────────────
interface YearData extends BankFinancialRow {
  isEst: boolean;
}
function enrich(financials: BankFinancialRow[]): YearData[] {
  const now = new Date().getFullYear();
  return financials.map(f => ({ ...f, isEst: f.year >= now }));
}

// ── Row types ──────────────────────────────────────────────────────────────────
type Fmt = "money" | "pct" | "mult";
type RowKind = "raw" | "derived" | "consensus" | "vs_consensus";

interface RowSpec {
  key:       string;
  label:     string;
  kind:      RowKind;
  fmt:       Fmt;
  indent?:   number;
  colorize?: boolean;                                   // pct rows: blue/red + signed
  fn?:       (y: number, by: Map<number, YearData>) => number | null;
  conKeys?:  string[];                                  // consensus / vs_consensus metric match
  modelFn?:  (d: YearData) => number | null;            // vs_consensus: model side
}

interface Section {
  key:   string;
  title: string;
  rows:  RowSpec[];
}

// Consensus metric matchers (Bloomberg metric name → bank field).
const REV_KEYS = ["revenue", "revenues", "sales", "net revenues"];
const NI_KEYS  = ["ni", "net income", "net profit", "netincome", "controlling", "net_income"];

// ── Derived helpers used by row fns (pure: read the year map directly) ───────────
const fld = (by: Map<number, YearData>, y: number, k: keyof BankFinancialRow): number | null =>
  (by.get(y)?.[k] as number | null | undefined) ?? null;
const neg = (v: number | null): number | null => (v === null ? null : -v);
function divBuyback(by: Map<number, YearData>, y: number): number | null {
  const dv = neg(fld(by, y, "dividend"));
  const bb = neg(fld(by, y, "buybacks"));
  if (dv === null && bb === null) return null;
  return (dv ?? 0) + (bb ?? 0);
}
function peRatio(by: Map<number, YearData>, y: number): number | null {
  return divz(fld(by, y, "marketCap"), fld(by, y, "controllingNetIncome"));
}
function peg1(y: number, by: Map<number, YearData>): number | null {
  const pe = peRatio(by, y);
  const e0 = fld(by, y, "eps");
  const e1 = fld(by, y + 1, "eps");
  if (pe === null || e0 === null || e0 === 0 || e1 === null) return null;
  const gPct = (e1 / e0 - 1) * 100;
  if (gPct === 0) return null;
  return pe / gPct;
}
function peg2(y: number, by: Map<number, YearData>): number | null {
  const pe = peRatio(by, y);
  const e0 = fld(by, y, "eps");
  const e2 = fld(by, y + 2, "eps");
  if (pe === null || e0 === null || e0 <= 0 || e2 === null || e2 <= 0) return null;
  const cagrPct = (Math.pow(e2 / e0, 1 / 2) - 1) * 100;
  if (cagrPct === 0) return null;
  return pe / cagrPct;
}

// ── Section definitions (Vista Analista order) ──────────────────────────────────
const SECTIONS: Section[] = [
  // 1. INCOME STATEMENT
  {
    key: "is", title: "Income Statement",
    rows: [
      { key: "nii",        label: "Net interest income ($)",   kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "netInterestIncome") },
      { key: "nii_pr",     label: "% Revenues",                kind: "derived", fmt: "pct", indent: 1, fn: (y, by) => divz(fld(by, y, "netInterestIncome"), fld(by, y, "revenue")) },
      { key: "nfi",        label: "Net fee income ($)",        kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "netFeeIncome") },
      { key: "nfi_pr",     label: "% Revenues",                kind: "derived", fmt: "pct", indent: 1, fn: (y, by) => divz(fld(by, y, "netFeeIncome"), fld(by, y, "revenue")) },
      { key: "treas",      label: "Treasury income ($)",       kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "treasuryIncome") },
      { key: "treas_pr",   label: "% Revenues",                kind: "derived", fmt: "pct", indent: 1, fn: (y, by) => divz(fld(by, y, "treasuryIncome"), fld(by, y, "revenue")) },
      { key: "other",      label: "Other income ($)",          kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "otherIncome") },
      { key: "other_pr",   label: "% Revenues",                kind: "derived", fmt: "pct", indent: 1, fn: (y, by) => divz(fld(by, y, "otherIncome"), fld(by, y, "revenue")) },
      { key: "rev",        label: "Revenue ($)",               kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "revenue") },
      { key: "rev_yoy",    label: "Var %",                     kind: "derived", fmt: "pct", colorize: true, indent: 1, fn: (y, by) => yoy(fld(by, y, "revenue"), fld(by, y - 1, "revenue")) },
      { key: "nim",        label: "NIM (%)",                   kind: "raw",     fmt: "pct", fn: (y, by) => fld(by, y, "nim") },
      { key: "prov",       label: "Provision expenses ($)",    kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "provisionExpenses") },
      { key: "cor",        label: "CoR (%)",                   kind: "raw",     fmt: "pct", fn: (y, by) => fld(by, y, "cor") },
      { key: "ra_nim",     label: "Risk adjusted NIM (%)",     kind: "raw",     fmt: "pct", fn: (y, by) => fld(by, y, "riskAdjustedNim") },
      { key: "sga",        label: "SG&A ($)",                  kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "sga") },
      { key: "sga_yoy",    label: "Var %",                     kind: "derived", fmt: "pct", colorize: true, indent: 1, fn: (y, by) => yoy(fld(by, y, "sga"), fld(by, y - 1, "sga")) },
      { key: "eff",        label: "Efficiency (%)",            kind: "raw",     fmt: "pct", fn: (y, by) => fld(by, y, "efficiency") },
      { key: "cta",        label: "Cost to assets (%)",        kind: "raw",     fmt: "pct", fn: (y, by) => fld(by, y, "costToAssets") },
      { key: "ebt",        label: "EBT ($)",                   kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "ebt") },
      { key: "taxes",      label: "Taxes ($)",                 kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "taxes") },
      { key: "cni",        label: "Controlling Net Income ($)", kind: "raw",    fmt: "money", fn: (y, by) => fld(by, y, "controllingNetIncome") },
      { key: "cni_yoy",    label: "Var %",                     kind: "derived", fmt: "pct", colorize: true, indent: 1, fn: (y, by) => yoy(fld(by, y, "controllingNetIncome"), fld(by, y - 1, "controllingNetIncome")) },
      { key: "eps",        label: "EPS ($)",                   kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "eps") },
      { key: "shares",     label: "# Shares (mn)",             kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "shares") },
    ],
  },

  // 2. BLOOMBERG CONSENSUS (sourced from consensus_estimates, like the company view)
  {
    key: "bbg", title: "Bloomberg Consensus",
    rows: [
      { key: "bbg_rev",    label: "Revenue ($)",               kind: "consensus",    fmt: "money", conKeys: REV_KEYS },
      { key: "bbg_rev_vs", label: "vs Consensus (%)",          kind: "vs_consensus", fmt: "pct", indent: 1, conKeys: REV_KEYS, modelFn: d => d.revenue ?? null },
      { key: "bbg_ni",     label: "Controlling Net Income ($)", kind: "consensus",   fmt: "money", conKeys: NI_KEYS },
      { key: "bbg_ni_vs",  label: "vs Consensus (%)",          kind: "vs_consensus", fmt: "pct", indent: 1, conKeys: NI_KEYS, modelFn: d => d.controllingNetIncome ?? null },
    ],
  },

  // 3. BALANCE
  {
    key: "bs", title: "Balance",
    rows: [
      { key: "gloans",   label: "Gross loans ($)",                 kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "grossLoans") },
      { key: "allow",    label: "Allowances for loan losses ($)",  kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "allowancesLoanLosses") },
      { key: "vprov",    label: "Voluntary provisions ($)",        kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "voluntaryProvisions") },
      { key: "overdue",  label: "Overdue loans ($)",               kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "overdueLoans") },
      { key: "sec",      label: "Securities ($)",                  kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "securities") },
      { key: "iea",      label: "Interest earning assets ($)",     kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "interestEarningAssets") },
      { key: "tassets",  label: "Total assets ($)",                kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "totalAssets") },
      { key: "ddep",     label: "Demand deposits ($)",             kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "demandDeposits") },
      { key: "tdep",     label: "Time deposits ($)",               kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "timeDeposits") },
      { key: "totdep",   label: "Total deposits ($)",              kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "totalDeposits") },
      { key: "ibl",      label: "Interest bearing liabilities ($)", kind: "raw",    fmt: "money", fn: (y, by) => fld(by, y, "interestBearingLiabilities") },
      { key: "tfund",    label: "Total funding ($)",               kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "totalFunding") },
      { key: "ceq",      label: "Controlling Equity ($)",          kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "controllingEquity") },
      { key: "teq",      label: "Tangible Equity ($)",             kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "tangibleEquity") },
      { key: "a_e",      label: "Assets / Equity",                 kind: "derived", fmt: "mult", fn: (y, by) => divz(fld(by, y, "totalAssets"), fld(by, y, "controllingEquity")) },
      { key: "l_d",      label: "Loans / Deposits",                kind: "derived", fmt: "mult", fn: (y, by) => divz(fld(by, y, "grossLoans"), fld(by, y, "totalDeposits")) },
      { key: "d_f",      label: "Deposits / Funding",              kind: "derived", fmt: "mult", fn: (y, by) => divz(fld(by, y, "totalDeposits"), fld(by, y, "totalFunding")) },
      { key: "div_bb",   label: "Dividend + Buyback",              kind: "derived", fmt: "money", fn: (y, by) => divBuyback(by, y) },
      { key: "dbb_yld",  label: "Yield (%)",                       kind: "derived", fmt: "pct", colorize: true, indent: 1, fn: (y, by) => divz(divBuyback(by, y), fld(by, y, "marketCap")) },
    ],
  },

  // 4. CASH FLOW / RETURNS
  {
    key: "cf", title: "Cash Flow / Returns",
    rows: [
      { key: "div",     label: "Dividend ($)",         kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "dividend") },
      { key: "payout",  label: "Payout",               kind: "raw",     fmt: "pct", fn: (y, by) => fld(by, y, "payout") },
      { key: "div_yld", label: "Dividend Yield (%)",   kind: "derived", fmt: "pct", colorize: true, indent: 1, fn: (y, by) => divz(neg(fld(by, y, "dividend")), fld(by, y, "marketCap")) },
      { key: "dps",     label: "DPS ($)",              kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "dps") },
      { key: "bb",      label: "Buybacks ($)",         kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "buybacks") },
    ],
  },

  // 5. MARKET MULTIPLES
  {
    key: "mm", title: "Market Multiples",
    rows: [
      { key: "price",   label: "Share Price ($) - LCCY", kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "sharePrice") },
      { key: "mktcap",  label: "Market Cap ($) - LCCY",  kind: "raw",     fmt: "money", fn: (y, by) => fld(by, y, "marketCap") },
      { key: "pe",      label: "P/E",                    kind: "derived", fmt: "mult", fn: (y, by) => divz(fld(by, y, "marketCap"), fld(by, y, "controllingNetIncome")) },
      { key: "ptbv",    label: "P/TBV",                  kind: "derived", fmt: "mult", fn: (y, by) => divz(fld(by, y, "marketCap"), fld(by, y, "tangibleEquity")) },
      { key: "roe",     label: "ROE (NI / Equity)",      kind: "derived", fmt: "pct", fn: (y, by) => divz(fld(by, y, "controllingNetIncome"), fld(by, y - 1, "controllingEquity")) },
      { key: "roe_t",   label: "ROE* (NI / Tang. Equity)", kind: "derived", fmt: "pct", fn: (y, by) => divz(fld(by, y, "controllingNetIncome"), fld(by, y - 1, "tangibleEquity")) },
      { key: "peg1",    label: "PEG (PE / next year EPS g%)", kind: "derived", fmt: "mult", fn: (y, by) => peg1(y, by) },
      { key: "peg2",    label: "PEG (PE / next 2y EPS CAGR)", kind: "derived", fmt: "mult", fn: (y, by) => peg2(y, by) },
    ],
  },
];

// ── Cell renderer ──────────────────────────────────────────────────────────────
function renderCell(value: number | null, fmt: Fmt, colorize: boolean): { text: string; color: string } {
  if (value === null) return { text: "-", color: "#9CA3AF" };
  let text: string;
  let color = C.TXT;
  switch (fmt) {
    case "money": text = fmtMoney(value); break;
    case "pct":
      text = fmtPct(value, colorize);
      if (colorize) color = value > 0.0005 ? C.BLUE : value < -0.0005 ? C.RED : C.TXT2;
      break;
    case "mult":  text = fmtMult(value);  break;
  }
  return { text, color };
}

function vsConStyle(v: number | null): React.CSSProperties {
  if (v === null) return { color: "#9CA3AF" };
  if (v > 0.001)  return { background: "rgba(21,128,61,0.12)", color: C.GREEN, fontWeight: 700 };
  if (v < -0.001) return { background: "rgba(220,38,38,0.12)", color: C.RED,   fontWeight: 700 };
  return { color: C.TXT2 };
}

// ── Recommendation badge ───────────────────────────────────────────────────────
function ReccBadge({ recc }: { recc: string | null }) {
  if (!recc) return <span style={{ color: C.TXT2, fontSize: 12 }}>—</span>;
  const u = recc.toUpperCase();
  const isBuy  = u.includes("BUY") || u === "OW";
  const isSell = u.includes("SELL") || u === "UW";
  const color  = isBuy ? C.BLUE : isSell ? C.RED : C.TXT2;
  const bg     = isBuy ? "rgba(29,78,216,0.10)" : isSell ? "rgba(185,28,28,0.10)" : "rgba(107,114,128,0.10)";
  const bdr    = isBuy ? "rgba(29,78,216,0.30)" : isSell ? "rgba(185,28,28,0.30)" : "rgba(107,114,128,0.25)";
  return (
    <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em",
      padding: "2px 10px", borderRadius: 4, background: bg, color, border: `1px solid ${bdr}` }}>
      {u}
    </span>
  );
}

// ── KPI section helpers ────────────────────────────────────────────────────────
function isVarMetric(name: string): boolean {
  return /var/i.test(name);
}
function isPctMetric(name: string): boolean {
  const lc = name.toLowerCase();
  return /\b(margin|yield|rate)\b/.test(lc) || lc.includes("%");
}
function kpiFmt(name: string): Fmt {
  if (isVarMetric(name) || isPctMetric(name)) return "pct";
  return "money";
}

interface BankKpiSection {
  sectionName: string;
  kpis: { kpiName: string; kpiOrder: number; byYear: Map<number, number | null> }[];
}

// Keyed by kpiOrder (NOT kpiName) — kpiName repeats within a section ("Var %").
function buildBankKpiSections(kpis: BankKpiRow[]): BankKpiSection[] {
  const sectionOrder = new Map<string, number>();
  const sectionMap   = new Map<string, Map<number, { kpiName: string; order: number; byYear: Map<number, number | null> }>>();

  for (const k of kpis) {
    if (!sectionMap.has(k.sectionName)) {
      sectionMap.set(k.sectionName, new Map());
      sectionOrder.set(k.sectionName, k.kpiOrder);
    } else {
      const cur = sectionOrder.get(k.sectionName)!;
      if (k.kpiOrder < cur) sectionOrder.set(k.sectionName, k.kpiOrder);
    }
    const sec = sectionMap.get(k.sectionName)!;
    if (!sec.has(k.kpiOrder)) sec.set(k.kpiOrder, { kpiName: k.kpiName, order: k.kpiOrder, byYear: new Map() });
    sec.get(k.kpiOrder)!.byYear.set(k.year, k.value);
  }

  return Array.from(sectionMap.entries())
    .sort((a, b) => (sectionOrder.get(a[0]) ?? 0) - (sectionOrder.get(b[0]) ?? 0))
    .map(([sectionName, kpiMap]) => ({
      sectionName,
      kpis: Array.from(kpiMap.values())
        .sort((a, b) => a.order - b.order)
        .map(({ kpiName, order, byYear }) => ({ kpiName, kpiOrder: order, byYear })),
    }));
}

// ── Consensus types ────────────────────────────────────────────────────────────
export interface ConsensusPoint {
  date:   string;
  metric: string;
  period: string;
  value:  number;
}

// ── Compute a single (row, year) value ──────────────────────────────────────────
function rowValue(
  row: RowSpec,
  year: number,
  by: Map<number, YearData>,
  getCon: (keys: string[], year: number) => number | null,
): number | null {
  if (row.kind === "consensus" && row.conKeys) {
    return getCon(row.conKeys, year);
  }
  if (row.kind === "vs_consensus" && row.conKeys && row.modelFn) {
    const con = getCon(row.conKeys, year);
    const mod = row.modelFn(by.get(year) ?? ({} as YearData));
    if (con === null || mod === null || con === 0) return null;
    return (mod - con) / Math.abs(con);
  }
  return row.fn ? row.fn(year, by) : null;
}

// ── Main component ─────────────────────────────────────────────────────────────
interface BankModelExplorerProps {
  ticker:              string;
  consensusEstimates?: ConsensusPoint[];
}

export default function BankModelExplorer({ ticker, consensusEstimates = [] }: BankModelExplorerProps) {
  const [history,      setHistory]      = useState<BankModelHistoryPayload | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setHistory(null);
    setSelectedDate("");

    fetch(`/api/companies/${encodeURIComponent(ticker)}/bank-model`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: BankModelHistoryPayload) => {
        setHistory(d);
        setSelectedDate(d.snapshots[0]?.header.updateDate ?? "");
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [ticker]);

  const snapshot = useMemo(
    () => history?.snapshots.find(s => s.header.updateDate === selectedDate) ?? history?.snapshots[0] ?? null,
    [history, selectedDate],
  );

  const enriched = useMemo(
    () => (snapshot ? enrich(snapshot.financials) : []),
    [snapshot],
  );

  const byYear = useMemo(() => {
    const m = new Map<number, YearData>();
    for (const d of enriched) m.set(d.year, d);
    return m;
  }, [enriched]);

  const years = useMemo(() => enriched.map(d => d.year), [enriched]);

  const kpiSections = useMemo(
    () => buildBankKpiSections(snapshot?.kpis ?? []),
    [snapshot],
  );

  // Latest consensus value per (metric, period).
  const latestConsensus = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const c of consensusEstimates) {
      if (!map.has(c.metric)) map.set(c.metric, new Map());
      map.get(c.metric)!.set(c.period, c.value);
    }
    return map;
  }, [consensusEstimates]);

  // Bank model fields share the raw consensus scale — do NOT divide by 1000.
  const getConsensus = useMemo(() => (keys: string[], year: number): number | null => {
    const period = String(year);
    for (const [dbMetric, periods] of latestConsensus) {
      const lc = dbMetric.toLowerCase();
      if (keys.some(k => lc === k || lc.replace(/_/g, "") === k.replace(/[\s_]/g, ""))) {
        const v = periods.get(period);
        return v != null ? v : null;
      }
    }
    return null;
  }, [latestConsensus]);

  // Actual Price = last estimate year's share price (most recently set by analyst).
  const actualPrice = useMemo(
    () => enriched.filter(d => d.isEst && d.sharePrice !== null).at(-1)?.sharePrice
       ?? enriched.filter(d => d.sharePrice !== null).at(-1)?.sharePrice
       ?? null,
    [enriched],
  );
  const upside = snapshot?.header.tp && actualPrice
    ? snapshot.header.tp / actualPrice - 1
    : null;

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 10 }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ width: 20, height: 20, borderRadius: "50%",
          border: `2px solid rgba(29,78,216,0.18)`, borderTopColor: C.BLUE,
          animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 12, color: C.TXT2, fontFamily: "JetBrains Mono, monospace" }}>Loading model…</span>
      </div>
    );
  }
  if (error) return (
    <div style={{ textAlign: "center", padding: "60px 0", color: C.RED, fontSize: 13 }}>Error: {error}</div>
  );
  if (!snapshot) return (
    <div style={{ textAlign: "center", padding: "80px 0", color: C.TXT2, fontSize: 13 }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.25 }}>📊</div>
      No analyst model available for this bank.
    </div>
  );

  const { header }  = snapshot;
  const snapshots   = history!.snapshots;
  const isLatest    = selectedDate === snapshots[0]?.header.updateDate;
  const now         = new Date().getFullYear();

  // ── Shared cell geometry ───────────────────────────────────────────────────
  const MONO: React.CSSProperties = { fontFamily: "JetBrains Mono, monospace" };
  const labelSticky: React.CSSProperties = {
    position: "sticky", left: 0, zIndex: 1,
    width: 200, minWidth: 200, maxWidth: 200,
    borderRight: `1px solid ${C.BDR}`,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  };
  const yearColW: React.CSSProperties = { minWidth: 78, width: 78 };
  const CELL_PAD = "3px 6px";

  function fmtDate(iso: string) {
    const [y, m, d] = iso.split("-");
    return `${d}-${m}-${y}`;
  }

  // ── Excel export ──────────────────────────────────────────────────────────
  function exportToExcel() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type XCell = Record<string, any>;
    type XRow  = (XCell | null)[];

    const fill = (rgb: string) => ({ patternType: "solid", fgColor: { rgb } });
    const F_HDR    = fill("1E3A8A");
    const F_SUB    = fill("374151");
    const F_EST    = fill("FFFDE7");
    const F_DRV    = fill("DBEAFE");
    const F_WHITE  = fill("FFFFFF");
    const F_GRAY   = fill("F0F4FA");
    const F_POS    = fill("DCFCE7");
    const F_NEG    = fill("FEE2E2");

    const bdr = (rgb = "9CA3AF") => ({
      top:    { style: "thin", color: { rgb } },
      bottom: { style: "thin", color: { rgb } },
      left:   { style: "thin", color: { rgb } },
      right:  { style: "thin", color: { rgb } },
    });

    function xc(v: string | number | null, s: object = {}): XCell {
      const val = v ?? "";
      return { v: val, t: typeof val === "number" ? "n" : "s", s };
    }

    const rows: XRow[] = [];

    const metaItems: [string, string][] = [
      ["Ticker Bloomberg", header.ticker],
      ["Recommendation",   header.recc ?? "—"],
      ["Actual Price",     actualPrice !== null ? fmtMoney(actualPrice) : "—"],
      ["TP",               header.tp   !== null ? fmtMoney(header.tp)   : "—"],
      ["Upside",           upside !== null ? fmtPct(upside, true) : "—"],
      ["Thesis",           header.thesis ?? "—"],
      ["Analyst",          header.analyst ?? "—"],
      ["Updated",          header.updateDate],
    ];
    for (const [lbl, val] of metaItems) {
      rows.push([
        xc(lbl, { font: { bold: true, sz: 10 }, fill: F_GRAY, alignment: { horizontal: "left" } }),
        xc(val, { font: { sz: 10 }, fill: F_GRAY, alignment: { horizontal: "left" } }),
        ...Array.from({ length: Math.max(years.length - 1, 0) }, () => xc("", { fill: F_GRAY })),
      ]);
    }
    rows.push(Array.from({ length: 1 + years.length }, () => null));

    rows.push([
      xc(`CCY${header.currency ? ` : ${header.currency}` : ""}`, {
        font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } }, fill: F_HDR,
        alignment: { horizontal: "left", vertical: "center" },
      }),
      ...years.map(yr => xc(`${yr}${yr >= now ? "E" : ""}`, {
        font: { bold: true, sz: 11, name: "Courier New", color: { rgb: yr >= now ? "FDE68A" : "FFFFFF" } },
        fill: F_HDR, alignment: { horizontal: "center", vertical: "center" },
      })),
    ]);

    for (const section of SECTIONS) {
      rows.push([
        xc(section.title.toUpperCase(), { font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } }, fill: F_HDR, alignment: { horizontal: "left" } }),
        ...Array.from({ length: years.length }, () => xc("", { fill: F_HDR })),
      ]);

      for (const row of section.rows) {
        const isDerived = row.kind === "derived";
        const isVs      = row.kind === "vs_consensus";
        const indent    = "  ".repeat(row.indent ?? 0);
        rows.push([
          xc(`${indent}${row.label}`, {
            font: { bold: !isDerived && !isVs, italic: isDerived || isVs, sz: 10, color: { rgb: isDerived || isVs ? "374151" : "111827" } },
            fill: isDerived ? F_DRV : F_WHITE, alignment: { horizontal: "left" },
          }),
          ...years.map(yr => {
            const v = rowValue(row, yr, byYear, getConsensus);
            const isEst = (byYear.get(yr)?.isEst) ?? false;
            let text = "-";
            let fColor = "111827";
            let cellFill = isDerived ? F_DRV : isEst ? F_EST : F_WHITE;
            if (isVs) {
              if (v !== null) {
                text = fmtPct(v, true);
                fColor = v > 0.001 ? "15803D" : v < -0.001 ? "DC2626" : "374151";
                cellFill = v > 0.001 ? F_POS : v < -0.001 ? F_NEG : F_WHITE;
              }
            } else {
              const r = renderCell(v, row.fmt, !!row.colorize);
              text = r.text;
              if (row.colorize) fColor = r.color === C.BLUE ? "1D4ED8" : r.color === C.RED ? "DC2626" : "111827";
            }
            return xc(text, {
              font: { name: "Courier New", sz: 10, bold: !isDerived && !isVs, italic: isDerived || isVs, color: { rgb: fColor } },
              fill: cellFill, alignment: { horizontal: "center" }, border: bdr(),
            });
          }),
        ]);
      }
    }

    if (kpiSections.length > 0) {
      rows.push([
        xc("KPI", { font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } }, fill: F_HDR }),
        ...Array.from({ length: years.length }, () => xc("", { fill: F_HDR })),
      ]);
      for (const { sectionName, kpis } of kpiSections) {
        rows.push([
          xc(sectionName.toUpperCase(), { font: { bold: true, sz: 9, color: { rgb: "E5E7EB" } }, fill: F_SUB }),
          ...Array.from({ length: years.length }, () => xc("", { fill: F_SUB })),
        ]);
        for (const { kpiName, byYear: kByYear } of kpis) {
          const fmt   = kpiFmt(kpiName);
          const isVar = isVarMetric(kpiName);
          rows.push([
            xc(kpiName, { font: { bold: !isVar, italic: isVar, sz: 10, color: { rgb: isVar ? "374151" : "111827" } }, fill: isVar ? F_DRV : F_WHITE, alignment: { horizontal: "left" } }),
            ...years.map(yr => {
              const v = kByYear.get(yr) ?? null;
              const isEst = (byYear.get(yr)?.isEst) ?? false;
              const r = renderCell(v, fmt, fmt === "pct" && isVar);
              let fColor = "111827";
              if (fmt === "pct" && isVar && v !== null) fColor = v > 0.0005 ? "1D4ED8" : v < -0.0005 ? "DC2626" : "374151";
              return xc(r.text, {
                font: { name: "Courier New", sz: 10, bold: !isVar, italic: isVar, color: { rgb: fColor } },
                fill: isVar ? F_DRV : isEst ? F_EST : F_WHITE, alignment: { horizontal: "center" }, border: bdr(),
              });
            }),
          ]);
        }
      }
    }

    const ws: Record<string, unknown> = {};
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const cd = rows[r][c];
        if (cd !== null) ws[XLSX.utils.encode_cell({ r, c })] = cd;
      }
    }
    ws["!ref"]  = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: years.length } });
    ws["!cols"] = [{ wch: 34 }, ...years.map(() => ({ wch: 12 }))];
    ws["!views"] = [{ state: "frozen", xSplit: 1, ySplit: metaItems.length + 2 }];

    const wb = XLSX.utils.book_new();
    const sheetName = header.ticker.replace(/[\\/:*?[\]]/g, "").slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${sheetName}_${header.updateDate}.xlsx`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 6px" }}>

      {/* ── TOP PANEL: Info + Version ─────────────────────────────────────── */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr auto",
        gap: 16, alignItems: "start",
        padding: "12px 16px", background: "#F8FAFC",
        border: `1px solid ${C.BDR}`, borderRadius: 10,
      }}>
        {/* Left: model info */}
        <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {[
              { label: "Ticker Bloomberg", value: <span style={{ fontWeight: 700, color: C.TXT, ...MONO }}>{header.ticker}</span> },
              { label: "Recommendation",  value: <ReccBadge recc={header.recc} /> },
              { label: "Actual Price",    value: actualPrice !== null
                  ? <span style={{ fontWeight: 700, color: C.TXT, ...MONO }}>{fmtMoney(actualPrice)}</span>
                  : <span style={{ color: C.TXT2 }}>—</span> },
              { label: "TP",              value: header.tp !== null
                  ? <span style={{ fontWeight: 800, color: C.TXT, ...MONO }}>{fmtMoney(header.tp)}</span>
                  : <span style={{ color: C.TXT2 }}>—</span> },
              { label: "Upside",          value: upside !== null
                  ? <span style={{
                      padding: "1px 10px", borderRadius: 4, fontWeight: 800,
                      background: upside > 0 ? "rgba(21,128,61,0.12)" : "rgba(220,38,38,0.12)",
                      color: upside > 0 ? C.GREEN : C.RED,
                    }}>{fmtPct(upside, true)}</span>
                  : <span style={{ color: C.TXT2 }}>—</span> },
              { label: "Thesis",          value: header.thesis
                  ? <span style={{ color: C.TXT, fontStyle: "italic" }}>{header.thesis}</span>
                  : <span style={{ color: C.TXT2 }}>—</span> },
              { label: "Analyst",         value: <span style={{ color: C.TXT, fontWeight: 600 }}>{header.analyst ?? "—"}</span> },
              { label: "Link to Model",   value: header.link
                  ? <a href={header.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "3px 12px", borderRadius: 5, cursor: "pointer",
                        background: C.BLUE, color: C.WHITE, fontWeight: 700, fontSize: 11, letterSpacing: "0.02em",
                      }}>
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                          <path d="M7 2h3v3M10 2L5 7M3 4H2a1 1 0 00-1 1v5a1 1 0 001 1h5a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        View Model
                      </span>
                    </a>
                  : <span style={{ color: C.TXT2 }}>—</span> },
            ].map(({ label, value }) => (
              <tr key={label}>
                <td style={{ padding: "3px 12px 3px 0", color: C.TXT2, fontWeight: 500, whiteSpace: "nowrap", verticalAlign: "top" }}>
                  {label}
                </td>
                <td style={{ padding: "3px 0", verticalAlign: "top" }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Right: export + version */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={exportToExcel}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 5, cursor: "pointer",
                background: "#16A34A", color: C.WHITE, fontWeight: 700, fontSize: 11,
                letterSpacing: "0.02em", border: "none", outline: "none",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M4 7l3 3 3-3M7 4v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Export Excel
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 0, border: `2px solid ${C.TXT}`, borderRadius: 6, overflow: "hidden" }}>
              <span style={{ padding: "5px 14px", background: C.HDR, color: C.WHITE, fontWeight: 800, fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Update
              </span>
              <select
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                style={{ border: "none", padding: "5px 10px", fontSize: 13, ...MONO, background: C.WHITE, color: C.TXT, fontWeight: 700, cursor: "pointer", outline: "none", minWidth: 110 }}
              >
                {snapshots.map(s => (
                  <option key={s.header.updateDate} value={s.header.updateDate}>
                    {fmtDate(s.header.updateDate)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!isLatest && (
            <button
              onClick={() => setSelectedDate(snapshots[0].header.updateDate)}
              style={{ padding: "3px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", background: C.BLUE, color: C.WHITE, border: "none", borderRadius: 5, outline: "none" }}
            >
              ← Latest
            </button>
          )}
        </div>
      </div>

      {/* ── TABLE ─────────────────────────────────────────────────────────── */}
      <div style={{ overflow: "clip", borderRadius: 10 }}>
      <div style={{ background: C.WHITE, overflowX: "auto", padding: "0 12px 12px" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed", width: "100%" }}>
          <thead>
            <tr>
              <th style={{
                ...labelSticky, position: "sticky", left: 0, top: 0, zIndex: 3,
                padding: "7px 10px", background: C.HDR, color: C.WHITE,
                fontWeight: 700, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "left",
              }}>
                Reported CCY{header.currency ? ` : ${header.currency}` : ""}
              </th>
              {years.map(yr => {
                const isEst = yr >= now;
                return (
                  <th key={yr} style={{
                    ...yearColW, position: "sticky", top: 0, zIndex: 2,
                    padding: "7px 7px", textAlign: "center", background: C.HDR,
                    color: isEst ? "#FDE68A" : C.WHITE, fontWeight: 700, fontSize: 11,
                    borderLeft: `1px solid rgba(255,255,255,0.10)`, ...MONO,
                  }}>
                    {yr}{isEst ? <span style={{ fontSize: 8, opacity: 0.8, marginLeft: 1 }}>E</span> : ""}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {SECTIONS.map(section => (
              <React.Fragment key={section.key}>
                <tr>
                  <td colSpan={years.length + 1} style={{
                    ...labelSticky, position: "sticky", left: 0,
                    padding: "4px 10px", background: C.HDR, color: C.WHITE,
                    fontWeight: 700, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase",
                    maxWidth: "none", borderTop: "2px solid rgba(255,255,255,0.05)",
                  }}>
                    {section.title}
                  </td>
                </tr>

                {section.rows.map(row => {
                  const isDerived = row.kind === "derived";
                  const isVs      = row.kind === "vs_consensus";
                  const isCon     = row.kind === "consensus";
                  const rowBg     = isDerived ? C.DRV_BG : C.WHITE;
                  const paddingLeft = 10 + (row.indent ?? 0) * 14;
                  return (
                    <tr
                      key={row.key}
                      style={{ borderBottom: `1px solid ${C.BDR}` }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(29,78,216,0.04)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
                    >
                      <td style={{
                        ...labelSticky, padding: CELL_PAD, paddingLeft,
                        background: rowBg,
                        color:      isDerived || isVs ? C.TXT2 : isCon ? "#374151" : C.TXT,
                        fontWeight: isDerived || isVs ? 400 : 500,
                        fontStyle:  isDerived || isVs ? "italic" : "normal",
                        fontSize:   isDerived || isVs ? 10.5 : 11,
                      }}>
                        {row.label}
                      </td>

                      {years.map(yr => {
                        const value = rowValue(row, yr, byYear, getConsensus);
                        const isEst = (byYear.get(yr)?.isEst) ?? false;
                        const cellBg = isDerived ? C.DRV_BG : (isCon || row.kind === "raw") && isEst ? C.EST_BG : C.WHITE;

                        if (isVs) {
                          const vstyle = vsConStyle(value);
                          return (
                            <td key={yr} style={{
                              ...yearColW, padding: CELL_PAD, textAlign: "center",
                              borderLeft: `1px solid ${C.BDR}`, ...MONO, fontSize: 10.5,
                              background: cellBg, ...vstyle,
                            }}>
                              {value === null ? "-" : fmtPct(value, true)}
                            </td>
                          );
                        }

                        const { text, color } = renderCell(value, row.fmt, !!row.colorize);
                        return (
                          <td key={yr} style={{
                            ...yearColW, padding: CELL_PAD, textAlign: "center",
                            background: cellBg, color,
                            fontWeight: isDerived ? 400 : 600,
                            fontStyle:  isDerived ? "italic" : "normal",
                            fontSize:   isDerived ? 10.5 : 11,
                            borderLeft: `1px solid ${C.BDR}`, ...MONO,
                          }}>
                            {text}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}

            {/* ── KPI sections ────────────────────────────────────────────── */}
            {kpiSections.length > 0 && (
              <>
                <tr>
                  <td colSpan={years.length + 1} style={{
                    ...labelSticky, position: "sticky", left: 0,
                    padding: "4px 10px", background: C.HDR, color: C.WHITE,
                    fontWeight: 700, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase",
                    maxWidth: "none", borderTop: "2px solid rgba(255,255,255,0.05)",
                  }}>
                    KPI
                  </td>
                </tr>

                {kpiSections.map(({ sectionName, kpis }) => (
                  <React.Fragment key={`kpisec-${sectionName}`}>
                    <tr>
                      <td colSpan={years.length + 1} style={{
                        ...labelSticky, position: "sticky", left: 0,
                        padding: "3px 16px", background: C.SEC_SUB, color: "#E5E7EB",
                        fontWeight: 700, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
                        maxWidth: "none", borderTop: `1px solid rgba(255,255,255,0.07)`,
                      }}>
                        {sectionName}
                      </td>
                    </tr>

                    {kpis.map(({ kpiName, kpiOrder, byYear: kByYear }) => {
                      const fmt   = kpiFmt(kpiName);
                      const isVar = isVarMetric(kpiName);
                      return (
                        <tr
                          key={`kpi-${sectionName}-${kpiOrder}`}
                          style={{ borderBottom: `1px solid ${C.BDR}` }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(29,78,216,0.04)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
                        >
                          <td style={{
                            ...labelSticky, padding: CELL_PAD, paddingLeft: isVar ? 32 : 22,
                            background: isVar ? C.DRV_BG : C.WHITE,
                            color: isVar ? C.TXT2 : C.TXT,
                            fontWeight: isVar ? 400 : 500,
                            fontStyle: isVar ? "italic" : "normal",
                            fontSize: isVar ? 10.5 : 11,
                          }}>
                            {kpiName}
                          </td>
                          {years.map(yr => {
                            const v = kByYear.get(yr) ?? null;
                            const isEst = (byYear.get(yr)?.isEst) ?? false;
                            const { text, color } = renderCell(v, fmt, fmt === "pct" && isVar);
                            const cellBg = isVar ? C.DRV_BG : isEst ? C.EST_BG : C.WHITE;
                            return (
                              <td key={yr} style={{
                                ...yearColW, padding: CELL_PAD, textAlign: "center",
                                background: cellBg, color,
                                fontWeight: isVar ? 400 : 600,
                                fontStyle: isVar ? "italic" : "normal",
                                fontSize: isVar ? 10.5 : 11,
                                borderLeft: `1px solid ${C.BDR}`, ...MONO,
                              }}>
                                {text}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 2px" }}>
        <span style={{ fontSize: 10, color: "#9CA3AF", fontStyle: "italic" }}>
           Updated {header.updateDate}
          {!isLatest && " · Viewing historical version"}
        </span>
        <span style={{ fontSize: 10, color: "#9CA3AF" }}>Bloomberg / Internal</span>
      </div>
    </div>
  );
}
