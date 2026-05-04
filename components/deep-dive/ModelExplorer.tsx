"use client";

import { useState, useEffect, useMemo } from "react";
import type {
  ModelHistoryPayload,
  ModelFinancialRow,
} from "@/app/api/companies/[ticker]/model/route";

// ── Design palette ─────────────────────────────────────────────────────────────
const C = {
  HDR:   "#1E3A8A", // dark blue — year header bg
  SEC:   "#475569", // slate-600 — section row bg
  DRV:   "#EFF6FF", // blue-50  — derived row bg
  EST:   "#FFF9C4", // yellow-100 — estimated input cell bg
  BDR:   "#E2E8F0", // slate-200 — table borders
  BLUE:  "#1D4ED8", // positive values
  RED:   "#B91C1C", // negative values
  TXT:   "#0F172A", // primary text
  TXT2:  "#475569", // derived/secondary text
  WHITE: "#FFFFFF",
};

// ── Consensus types (passed from parent via deepDive) ──────────────────────────
export interface ConsensusPoint {
  date:   string;
  metric: string;
  period: string;
  value:  number;
}

// ── Safe math ─────────────────────────────────────────────────────────────────
const sdiv  = (a: number | null, b: number | null) => (!a || !b || b === 0 ? null : a / b);
const ssub  = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
const sadd  = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);
const sgrow = (c: number | null, p: number | null) =>
  c === null || p === null || p === 0 ? null : c / p - 1;
const nopat = (ebit: number | null, tax: number | null) =>
  ebit === null || tax === null ? null : ebit * (1 - tax);

// ── Formatters ─────────────────────────────────────────────────────────────────
const fmtAbs = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 0 });

const fmtPct = (v: number | null, plain = false) => {
  if (v === null) return "—";
  const p = v * 100;
  return plain ? p.toFixed(1) + "%" : (p >= 0 ? "+" : "") + p.toFixed(1) + "%";
};

const fmtMult = (v: number | null) => (v === null ? "—" : v.toFixed(1) + "x");

const fmtSmall = (v: number | null) =>
  v === null
    ? "—"
    : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Enriched per-year data (forward multiples pre-computed) ────────────────────
interface YearData extends ModelFinancialRow {
  isEst:        boolean;
  effPrice:     number | null; // propagated spot price for est years
  effMarketCap: number | null; // price × sharesOut for est years
}

function enrich(financials: ModelFinancialRow[]): YearData[] {
  const now = new Date().getFullYear();
  // Last historical row that has a share price
  const hist = financials.filter(f => f.year < now && f.sharePrice !== null);
  const spot  = hist.at(-1)?.sharePrice ?? null;

  return financials.map(f => {
    const isEst        = f.year >= now;
    const effPrice     = isEst ? spot : f.sharePrice;
    const effMarketCap = isEst
      ? (spot !== null && f.sharesOut !== null ? spot * f.sharesOut : null)
      : f.marketCap;
    return { ...f, isEst, effPrice, effMarketCap };
  });
}

// ── Row types ──────────────────────────────────────────────────────────────────
type Fmt    = "abs" | "pct" | "pct_plain" | "mult" | "small";
type RowKind = "input" | "derived" | "consensus";

interface RowSpec {
  key:         string;
  label:       string;
  kind:        RowKind;
  fmt:         Fmt;
  colorize?:   boolean;
  // For input/derived rows — receives current YearData, previous YearData
  fn?:         (d: YearData, p: YearData | null) => number | null;
  // For consensus rows — receives the year number
  bbgKeys?:    string[];  // partial match keys to find the metric
}

interface Section {
  key:   string;
  title: string;
  rows:  RowSpec[];
}

// ── Section/row definitions ────────────────────────────────────────────────────
const SECTIONS: Section[] = [
  // ── 1. INCOME STATEMENT ──────────────────────────────────────────────────────
  {
    key: "is", title: "Income Statement",
    rows: [
      { key: "rev",      label: "Revenue",           kind: "input",   fmt: "abs",
        fn: d => d.revenue },
      { key: "rev_g",    label: "Var % Revenue",     kind: "derived", fmt: "pct",  colorize: true,
        fn: (d,p) => sgrow(d.revenue, p?.revenue ?? null) },
      { key: "ebit",     label: "EBIT",              kind: "input",   fmt: "abs",
        fn: d => d.ebit },
      { key: "ebit_mg",  label: "EBIT Margin",       kind: "derived", fmt: "pct_plain",
        fn: d => sdiv(d.ebit, d.revenue) },
      { key: "da",       label: "D&A",               kind: "input",   fmt: "abs",
        fn: d => d.da },
      { key: "ebitda",   label: "EBITDA",            kind: "input",   fmt: "abs",
        fn: d => d.ebitda },
      { key: "ebitda_g", label: "Var % EBITDA",      kind: "derived", fmt: "pct",  colorize: true,
        fn: (d,p) => sgrow(d.ebitda, p?.ebitda ?? null) },
      { key: "ebitda_mg",label: "EBITDA Margin",     kind: "derived", fmt: "pct_plain",
        fn: d => sdiv(d.ebitda, d.revenue) },
      { key: "nfe",      label: "Net Fin. Expenses", kind: "input",   fmt: "abs",
        fn: d => d.netFinExp },
      { key: "ni",       label: "Net Income",        kind: "input",   fmt: "abs",
        fn: d => d.netIncome },
      { key: "ni_g",     label: "Var % Net Income",  kind: "derived", fmt: "pct",  colorize: true,
        fn: (d,p) => sgrow(d.netIncome, p?.netIncome ?? null) },
      { key: "eps",      label: "EPS",               kind: "input",   fmt: "small",
        fn: d => d.eps },
      { key: "shares",   label: "Shares Out",        kind: "input",   fmt: "abs",
        fn: d => d.sharesOut },
      { key: "tax",      label: "Tax Rate",          kind: "input",   fmt: "pct_plain",
        fn: d => d.taxRate },
    ],
  },

  // ── 2. BLOOMBERG CONSENSUS ────────────────────────────────────────────────────
  {
    key: "bbg", title: "Bloomberg Consensus",
    rows: [
      { key: "bbg_rev",    label: "BBG Revenue",    kind: "consensus", fmt: "abs",
        bbgKeys: ["revenue", "revenues", "sales", "net revenues"] },
      { key: "bbg_ebitda", label: "BBG EBITDA",     kind: "consensus", fmt: "abs",
        bbgKeys: ["ebitda"] },
      { key: "bbg_ni",     label: "BBG Net Income", kind: "consensus", fmt: "abs",
        bbgKeys: ["ni", "net income", "net profit", "netincome"] },
      { key: "bbg_eps",    label: "BBG EPS",        kind: "consensus", fmt: "small",
        bbgKeys: ["eps", "earnings per share"] },
    ],
  },

  // ── 3. BALANCE SHEET ──────────────────────────────────────────────────────────
  {
    key: "bs", title: "Balance Sheet",
    rows: [
      { key: "wk",       label: "Working Capital",   kind: "input",   fmt: "abs",
        fn: d => d.workingCapital },
      { key: "wk_var",   label: "WK Variation",      kind: "derived", fmt: "abs",
        fn: (d,p) => ssub(d.workingCapital, p?.workingCapital ?? null) },
      { key: "ppe",      label: "PP&E",               kind: "input",   fmt: "abs",
        fn: d => d.ppe },
      { key: "nd",       label: "Net Debt",           kind: "input",   fmt: "abs",
        fn: d => d.netDebt },
      { key: "nd_eb",    label: "Net Debt / EBITDA",  kind: "derived", fmt: "mult",
        fn: d => sdiv(d.netDebt, d.ebitda) },
      { key: "min",      label: "Minorities",         kind: "input",   fmt: "abs",
        fn: d => d.minorities },
      { key: "ctrl_eq",  label: "Controlling Equity", kind: "input",   fmt: "abs",
        fn: d => d.controllingEq },
      { key: "tan_eq",   label: "Tangible Equity",    kind: "input",   fmt: "abs",
        fn: d => d.tangibleEq },
    ],
  },

  // ── 4. CASH FLOW ──────────────────────────────────────────────────────────────
  {
    key: "cf", title: "Cash Flow",
    rows: [
      { key: "fcf",        label: "FCF",              kind: "input",   fmt: "abs",
        fn: d => d.fcf },
      { key: "fcf_yield",  label: "FCF Yield",        kind: "derived", fmt: "pct",  colorize: true,
        fn: d => sdiv(d.fcf, d.effMarketCap) },
      { key: "capex",      label: "Capex",            kind: "input",   fmt: "abs",
        fn: d => d.capex },
      { key: "capex_rev",  label: "Capex % Rev",      kind: "derived", fmt: "pct_plain",
        fn: d => d.capex !== null ? sdiv(Math.abs(d.capex), d.revenue) : null },
      { key: "asset_s",    label: "Asset Sales",      kind: "input",   fmt: "abs",
        fn: d => d.assetSales },
      { key: "fcfe",       label: "FCFE",             kind: "input",   fmt: "abs",
        fn: d => d.fcfe },
      { key: "fcfe_yield", label: "FCFE Yield",       kind: "derived", fmt: "pct",  colorize: true,
        fn: d => sdiv(d.fcfe, d.effMarketCap) },
      { key: "div",        label: "Dividend",         kind: "input",   fmt: "abs",
        fn: d => d.dividend },
      { key: "buybacks",   label: "Buybacks",         kind: "input",   fmt: "abs",
        fn: d => d.buybacks },
      { key: "div_bb",     label: "Div + Buyback",    kind: "derived", fmt: "abs",
        fn: d => sadd(d.dividend, d.buybacks) },
      { key: "tot_yield",  label: "Total Yield",      kind: "derived", fmt: "pct",  colorize: true,
        fn: d => {
          const tot = sadd(d.dividend, d.buybacks);
          return tot !== null && d.effMarketCap ? Math.abs(tot) / d.effMarketCap : null;
        } },
      { key: "payout_r",   label: "Payout Ratio",     kind: "derived", fmt: "pct_plain",
        fn: (d, p) =>
          d.dividend !== null && p?.netIncome
            ? Math.abs(d.dividend) / p.netIncome
            : null },
      { key: "div_yield",  label: "Dividend Yield",   kind: "derived", fmt: "pct",  colorize: true,
        fn: d => d.dividend !== null && d.effMarketCap
          ? Math.abs(d.dividend) / d.effMarketCap : null },
      { key: "bb_yield",   label: "Buyback Yield",    kind: "derived", fmt: "pct",  colorize: true,
        fn: d => d.buybacks !== null && d.effMarketCap
          ? Math.abs(d.buybacks) / d.effMarketCap : null },
      { key: "dps",        label: "DPS",              kind: "input",   fmt: "small",
        fn: d => d.dps },
    ],
  },

  // ── 5. MARKET MULTIPLES ───────────────────────────────────────────────────────
  {
    key: "mm", title: "Market Multiples",
    rows: [
      { key: "price",    label: "Share Price",        kind: "input",   fmt: "small",
        fn: d => d.effPrice },
      { key: "mktcap",   label: "Market Cap",         kind: "input",   fmt: "abs",
        fn: d => d.effMarketCap },
      { key: "ev",       label: "EV",                 kind: "derived", fmt: "abs",
        fn: d => {
          if (d.effMarketCap === null || d.netDebt === null || d.minorities === null) return null;
          return d.effMarketCap + d.netDebt + d.minorities;
        } },
      { key: "ev_eb",    label: "EV / EBITDA",        kind: "derived", fmt: "mult",
        fn: d => {
          if (d.effMarketCap === null || d.netDebt === null || d.minorities === null) return null;
          return sdiv(d.effMarketCap + d.netDebt + d.minorities, d.ebitda);
        } },
      { key: "pe",       label: "P / E",              kind: "derived", fmt: "mult",
        fn: d => sdiv(d.effMarketCap, d.netIncome) },
      { key: "pbv",      label: "P / BV",             kind: "derived", fmt: "mult",
        fn: d => sdiv(d.effMarketCap, d.controllingEq) },
      { key: "roe",      label: "ROE",                kind: "derived", fmt: "pct",  colorize: true,
        fn: (d,p) => sdiv(d.netIncome, p?.controllingEq ?? null) },
      { key: "roe_tan",  label: "ROE (Tangible)",     kind: "derived", fmt: "pct",  colorize: true,
        fn: (d,p) => sdiv(d.netIncome, p?.tangibleEq ?? null) },
      { key: "roic",     label: "ROIC (Standard)",    kind: "derived", fmt: "pct",  colorize: true,
        fn: (d,p) => {
          if (!p) return null;
          const np = nopat(d.ebit, d.taxRate);
          const ic = p.netDebt !== null && p.minorities !== null && p.controllingEq !== null
            ? p.netDebt + p.minorities + p.controllingEq : null;
          return sdiv(np, ic);
        } },
      { key: "roic_tan", label: "ROIC (Tangible)",    kind: "derived", fmt: "pct",  colorize: true,
        fn: (d,p) => {
          if (!p) return null;
          const np = nopat(d.ebit, d.taxRate);
          const ic = p.netDebt !== null && p.minorities !== null && p.tangibleEq !== null
            ? p.netDebt + p.minorities + p.tangibleEq : null;
          return sdiv(np, ic);
        } },
      { key: "roic_op",  label: "ROIC (Op. Assets)",  kind: "derived", fmt: "pct",  colorize: true,
        fn: (d,p) => {
          if (!p) return null;
          const np = nopat(d.ebit, d.taxRate);
          const ic = p.workingCapital !== null && p.ppe !== null
            ? p.workingCapital + p.ppe : null;
          return sdiv(np, ic);
        } },
    ],
  },
];

// ── Cell value renderer ────────────────────────────────────────────────────────
function renderCell(value: number | null, fmt: Fmt, colorize: boolean) {
  if (value === null) return { text: "—", color: "#94A3B8" };
  let text: string;
  let color = C.TXT;
  switch (fmt) {
    case "abs":       text = fmtAbs(value);          break;
    case "pct":       text = fmtPct(value, false);
      if (colorize) color = value > 0.0005 ? C.BLUE : value < -0.0005 ? C.RED : C.TXT2;
      break;
    case "pct_plain": text = fmtPct(value, true);    break;
    case "mult":      text = fmtMult(value);         break;
    case "small":     text = fmtSmall(value);        break;
  }
  return { text, color };
}

// ── Recc badge ─────────────────────────────────────────────────────────────────
function ReccBadge({ recc }: { recc: string | null }) {
  if (!recc) return null;
  const u     = recc.toUpperCase();
  const isBuy = u.includes("BUY") || u === "OW";
  const isSell= u.includes("SELL") || u === "UW";
  const color = isBuy ? C.BLUE : isSell ? C.RED : C.TXT2;
  const bg    = isBuy ? "rgba(29,78,216,0.10)" : isSell ? "rgba(185,28,28,0.10)" : "rgba(100,116,139,0.10)";
  const bdr   = isBuy ? "rgba(29,78,216,0.28)" : isSell ? "rgba(185,28,28,0.28)" : "rgba(100,116,139,0.22)";
  return (
    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.07em", padding: "2px 8px",
      borderRadius: 4, background: bg, color, border: `1px solid ${bdr}`, flexShrink: 0 }}>
      {u}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
interface ModelExplorerProps {
  ticker:              string;
  consensusEstimates?: ConsensusPoint[];
}

export default function ModelExplorer({ ticker, consensusEstimates = [] }: ModelExplorerProps) {
  const [history,      setHistory]      = useState<ModelHistoryPayload | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");

  // Fetch model history
  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setHistory(null);
    setSelectedDate("");

    fetch(`/api/companies/${encodeURIComponent(ticker)}/model`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: ModelHistoryPayload) => {
        setHistory(d);
        setSelectedDate(d.snapshots[0]?.header.updateDate ?? "");
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [ticker]);

  // Active snapshot
  const snapshot = useMemo(
    () => history?.snapshots.find(s => s.header.updateDate === selectedDate) ?? history?.snapshots[0] ?? null,
    [history, selectedDate],
  );

  // Enriched year data (forward multiples)
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

  // Bloomberg consensus — latest value per (metric, period)
  const latestConsensus = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    // consensusEstimates are ordered by date asc; later entries overwrite → last wins
    for (const c of consensusEstimates) {
      if (!map.has(c.metric)) map.set(c.metric, new Map());
      map.get(c.metric)!.set(c.period, c.value);
    }
    return map;
  }, [consensusEstimates]);

  const getConsensus = (keys: string[], year: number): number | null => {
    const now = new Date().getFullYear();
    const period = year === now ? "1FY" : year === now + 1 ? "2FY" : null;
    if (!period) return null;
    for (const [dbMetric, periods] of latestConsensus) {
      const lc = dbMetric.toLowerCase();
      if (keys.some(k => lc.includes(k) || k.includes(lc))) {
        return periods.get(period) ?? null;
      }
    }
    return null;
  };

  // ── Render states ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 10 }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid rgba(29,78,216,0.18)`,
          borderTopColor: C.BLUE, animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 12, color: C.TXT2, fontFamily: "JetBrains Mono, monospace" }}>Loading model…</span>
      </div>
    );
  }
  if (error) return (
    <div style={{ textAlign: "center", padding: "60px 0", color: C.RED, fontSize: 13 }}>
      Error: {error}
    </div>
  );
  if (!snapshot) return (
    <div style={{ textAlign: "center", padding: "80px 0", color: C.TXT2, fontSize: 13 }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.25 }}>📊</div>
      No analyst model available for this company.
    </div>
  );

  const { header } = snapshot;
  const snapshots  = history!.snapshots;
  const isLatest   = selectedDate === snapshots[0]?.header.updateDate;

  // ── Shared cell geometry ───────────────────────────────────────────────────
  const PAD   = "3px 8px";
  const MONO  = { fontFamily: "JetBrains Mono, monospace" };
  const BDR_R = { borderRight: `1px solid ${C.BDR}` };

  const labelSticky: React.CSSProperties = {
    position: "sticky", left: 0, zIndex: 1,
    minWidth: 178, maxWidth: 178,
    borderRight: `1px solid ${C.BDR}`,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  const yearColW: React.CSSProperties = { minWidth: 86, width: 86 };

  const now = new Date().getFullYear();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── Header info bar ───────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12,
        padding: "10px 14px",
        background: "#F8FAFC",
        border: `1px solid ${C.BDR}`,
        borderRadius: 10,
      }}>
        {/* Left: model metadata */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flex: 1 }}>
          <ReccBadge recc={header.recc} />
          {header.tp !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: C.TXT2, textTransform: "uppercase", letterSpacing: "0.07em" }}>TP</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: C.TXT, ...MONO }}>
                {fmtSmall(header.tp)}
              </span>
            </div>
          )}
          {header.analyst && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: C.TXT2, textTransform: "uppercase", letterSpacing: "0.07em" }}>Analyst</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.TXT }}>{header.analyst}</span>
            </div>
          )}
          {header.link && (
            <a href={header.link} target="_blank" rel="noopener noreferrer" style={{
              display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11,
              fontWeight: 600, color: C.BLUE, background: "rgba(29,78,216,0.07)",
              border: "1px solid rgba(29,78,216,0.18)", borderRadius: 5, padding: "3px 9px",
              textDecoration: "none",
            }}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 10h8M6 2v6M3 5l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Model
            </a>
          )}
        </div>

        {/* Right: version selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.TXT2, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            As of:
          </span>
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{
              border: `2px solid ${C.TXT}`, borderRadius: 4, padding: "4px 8px",
              fontSize: 12, ...MONO, background: C.WHITE, color: C.TXT,
              fontWeight: 700, cursor: "pointer", outline: "none",
            }}
          >
            {snapshots.map(s => (
              <option key={s.header.updateDate} value={s.header.updateDate}>
                {s.header.updateDate}
              </option>
            ))}
          </select>
          {!isLatest && (
            <button
              onClick={() => setSelectedDate(snapshots[0].header.updateDate)}
              style={{
                padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: C.BLUE, color: C.WHITE, border: "none", borderRadius: 5,
                letterSpacing: "0.03em", outline: "none",
              }}
            >
              Latest
            </button>
          )}
        </div>
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        {[
          { bg: C.WHITE,  label: "Reported data" },
          { bg: C.EST,    label: "Estimated / Forward" },
          { bg: C.DRV,    label: "Derived metric" },
        ].map(({ bg, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: bg,
              border: `1px solid ${C.BDR}`, display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: C.TXT2 }}>{label}</span>
          </div>
        ))}
        <span style={{ fontSize: 10, color: "#94A3B8", fontStyle: "italic" }}>
          Forward multiples use last reported share price propagated right
        </span>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: C.WHITE, border: `1px solid ${C.BDR}`,
        borderRadius: 10, boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
        overflowX: "auto",
      }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed", width: "100%" }}>

          {/* ── Year header ─────────────────────────────────────────────── */}
          <thead>
            <tr>
              <th style={{
                ...labelSticky, position: "sticky", left: 0, top: 0, zIndex: 3,
                padding: "7px 10px", background: C.HDR, color: C.WHITE,
                fontWeight: 700, fontSize: 10, letterSpacing: "0.08em",
                textTransform: "uppercase", textAlign: "left",
              }}>
                Reported CCY
              </th>
              {years.map(yr => {
                const isEst = yr >= now;
                return (
                  <th key={yr} style={{
                    ...yearColW, position: "sticky", top: 0, zIndex: 2,
                    padding: "7px 8px", background: C.HDR, color: C.WHITE,
                    fontWeight: 700, fontSize: 11, textAlign: "right",
                    borderLeft: `1px solid rgba(255,255,255,0.12)`,
                    ...MONO,
                  }}>
                    {yr}{isEst ? <span style={{ fontSize: 9, opacity: 0.75, marginLeft: 1 }}>E</span> : ""}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {SECTIONS.map(section => (
              <>
                {/* ── Section header ───────────────────────────────────── */}
                <tr key={`sec-${section.key}`}>
                  <td colSpan={years.length + 1} style={{
                    ...labelSticky, position: "sticky", left: 0,
                    padding: "5px 10px", background: C.SEC, color: C.WHITE,
                    fontWeight: 700, fontSize: 10, letterSpacing: "0.10em",
                    textTransform: "uppercase", borderTop: "1px solid rgba(255,255,255,0.07)",
                    maxWidth: "none",
                  }}>
                    {section.title}
                  </td>
                </tr>

                {/* ── Rows within section ──────────────────────────────── */}
                {section.rows.map((row, rowIdx) => {
                  const isDerived   = row.kind === "derived";
                  const isConsensus = row.kind === "consensus";
                  const rowBg       = isDerived ? C.DRV : C.WHITE;
                  const labelPL     = isDerived ? 18 : isConsensus ? 14 : 10;

                  return (
                    <tr
                      key={row.key}
                      style={{ borderBottom: `1px solid ${C.BDR}` }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(29,78,216,0.035)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      {/* Label cell */}
                      <td style={{
                        ...labelSticky,
                        padding: PAD,
                        paddingLeft: labelPL,
                        background: rowBg,
                        color:      isDerived ? C.TXT2 : C.TXT,
                        fontWeight: isDerived ? 400 : isConsensus ? 500 : 500,
                        fontStyle:  isDerived ? "italic" : "normal",
                        fontSize:   isDerived ? 10.5 : 11,
                      }}>
                        {row.label}
                      </td>

                      {/* Value cells */}
                      {years.map((yr, colIdx) => {
                        const d    = byYear.get(yr)!;
                        const prev = byYear.get(yr - 1) ?? null;
                        const isEst = d.isEst;

                        // Compute value
                        let value: number | null = null;
                        if (isConsensus && row.bbgKeys) {
                          value = getConsensus(row.bbgKeys, yr);
                        } else if (row.fn) {
                          value = row.fn(d, prev);
                        }

                        // Cell background
                        const cellBg = isDerived
                          ? C.DRV
                          : isConsensus && isEst
                          ? C.EST
                          : !isDerived && isEst
                          ? C.EST
                          : C.WHITE;

                        const { text, color } = renderCell(value, row.fmt, !!row.colorize);

                        return (
                          <td key={yr} style={{
                            ...yearColW,
                            padding: PAD,
                            textAlign: "right",
                            background: cellBg,
                            color,
                            fontWeight: isDerived ? 400 : 600,
                            fontStyle:  isDerived ? "italic" : "normal",
                            fontSize:   isDerived ? 10.5 : 11,
                            borderLeft: `1px solid ${C.BDR}`,
                            ...MONO,
                          }}>
                            {text}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer note ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "4px 2px" }}>
        <span style={{ fontSize: 10, color: "#94A3B8", fontStyle: "italic" }}>
          {snapshot.financials.length} years · Model updated {header.updateDate}
          {!isLatest && ` · Viewing historical version`}
        </span>
        <span style={{ fontSize: 10, color: "#94A3B8" }}>Source: Bloomberg / Internal Model</span>
      </div>
    </div>
  );
}
