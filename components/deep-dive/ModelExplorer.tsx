"use client";

import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx-js-style";
import type {
  ModelHistoryPayload,
  ModelFinancialRow,
  ModelKpiRow,
} from "@/app/api/companies/[ticker]/model/route";
import { consensusScaleFactor } from "@/lib/consensusScale";
import ModelEstimateChart, { buildEstimateRows, type EstimateMetric, type EstimateRow } from "@/components/deep-dive/ModelEstimateChart";

// ── Estimate-evolution chart metrics (Net Income default) ────────────────────────
const ESTIMATE_METRICS: EstimateMetric[] = [
  { key: "NI",     label: "Net Income", gradId: "me_ni",   colors: ["#7C3AED", "#A78BFA"] },
  { key: "EBITDA", label: "EBITDA",     gradId: "me_ebd",  colors: ["#2B5CE0", "#60A5FA"] },
  { key: "FCFE",   label: "FCFE",       gradId: "me_fcfe", colors: ["#059669", "#34D399"] },
];

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  HDR:     "#1E3A8A",
  SEC_SUB: "#374151",
  HIST_BG: "#FFFFFF",
  EST_BG:  "#FFFDE7",
  DRV_BG:  "#DBEAFE",   // stronger blue for derived rows
  CON_BG:  "#FFFDE7",
  BDR:     "#9CA3AF",   // stronger borders
  BLUE:    "#1D4ED8",
  RED:     "#DC2626",
  GREEN:   "#15803D",
  TXT:     "#111827",
  TXT2:    "#374151",   // darker secondary text
  WHITE:   "#FFFFFF",
};

// ── Math helpers ───────────────────────────────────────────────────────────────
const sdiv  = (a: number | null, b: number | null) => (!a || !b || b === 0 ? null : a / b);
const ssub  = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
const sadd  = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);
const sgrow = (c: number | null, p: number | null) =>
  c === null || p === null || p === 0 ? null : c / p - 1;
const nopat = (ebit: number | null, tax: number | null) =>
  ebit === null || tax === null ? null : ebit * (1 - tax);

// ── Formatters ─────────────────────────────────────────────────────────────────
const fmtAbs = (v: number | null) => {
  if (v === null) return "—";
  const abs = Math.abs(v);
  // |v| < 10 → 2 decimales · 10–50 → 1 decimal · ≥50 → entero con miles.
  if (abs < 10) return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs < 50) return v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
};
const fmtPct = (v: number | null, plain = false) => {
  if (v === null) return "—";
  const p = v * 100;
  return plain ? p.toFixed(1) + "%" : (p >= 0 ? "+" : "") + p.toFixed(1) + "%";
};
const fmtMult = (v: number | null) => (v === null ? "—" : v.toFixed(1) + "x");
const fmtSmall = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Enriched year data ─────────────────────────────────────────────────────────
interface YearData extends ModelFinancialRow {
  isEst:        boolean;
  effPrice:     number | null;
  effMarketCap: number | null;
}

function enrich(financials: ModelFinancialRow[]): YearData[] {
  const now = new Date().getFullYear();
  return financials.map(f => {
    const isEst        = f.year >= now;
    const effPrice     = f.sharePrice;
    const effMarketCap = f.marketCap ??
      (f.sharePrice !== null && f.sharesOut !== null ? f.sharePrice * f.sharesOut : null);
    return { ...f, isEst, effPrice, effMarketCap };
  });
}

// ── Consensus types ────────────────────────────────────────────────────────────
export interface ConsensusPoint {
  date:   string;
  metric: string;
  period: string;
  value:  number;
}

// ── Row types ──────────────────────────────────────────────────────────────────
type Fmt = "abs" | "pct" | "pct_plain" | "mult" | "small";
type RowKind = "input" | "derived" | "consensus" | "vs_consensus";

interface RowSpec {
  key:       string;
  label:     string;
  kind:      RowKind;
  fmt:       Fmt;
  colorize?: boolean;
  indent?:   number;     // 0 = normal, 1 = one indent, 2 = double
  fn?:       (d: YearData, p: YearData | null) => number | null;
  bbgKeys?:  string[];
  modelFn?:  (d: YearData) => number | null;  // for vs_consensus: computes model side
}

interface Section {
  key:   string;
  title: string;
  rows:  RowSpec[];
}

// Consensus metric matchers (Bloomberg metric name → model field).
const REV_KEYS    = ["revenue", "revenues", "sales", "net revenues"];
const EBITDA_KEYS = ["ebitda"];
const NI_KEYS     = ["ni", "net income", "net profit", "netincome", "controlling"];

// ── Section definitions ────────────────────────────────────────────────────────
const SECTIONS: Section[] = [
  // 1. INCOME STATEMENT
  {
    key: "is", title: "Income Statement",
    rows: [
      { key: "rev",      label: "Revenue ($)",              kind: "input",   fmt: "abs",       fn: d => d.revenue },
      { key: "rev_g",    label: "Var %",                    kind: "derived", fmt: "pct",       colorize: true, indent: 1,
        fn: (d,p) => sgrow(d.revenue, p?.revenue ?? null) },
      { key: "ebit",     label: "EBIT ($)",                 kind: "input",   fmt: "abs",       fn: d => d.ebit },
      { key: "ebit_mg",  label: "EBIT Mg",                  kind: "derived", fmt: "pct_plain", indent: 1,
        fn: d => sdiv(d.ebit, d.revenue) },
      { key: "da",       label: "D&A ($)",                  kind: "input",   fmt: "abs",       fn: d => d.da },
      { key: "ebitda",   label: "EBITDA ($)",               kind: "input",   fmt: "abs",       fn: d => d.ebitda },
      { key: "ebitda_g", label: "Var %",                    kind: "derived", fmt: "pct",       colorize: true, indent: 1,
        fn: (d,p) => sgrow(d.ebitda, p?.ebitda ?? null) },
      { key: "ebitda_mg",label: "EBITDAMg",                 kind: "derived", fmt: "pct_plain", indent: 1,
        fn: d => sdiv(d.ebitda, d.revenue) },
      { key: "nfe",      label: "Net Fin. Expenses ($)",    kind: "input",   fmt: "abs",       fn: d => d.netFinExp },
      { key: "taxes",    label: "Taxes ($)",                kind: "input",   fmt: "abs",       fn: d => d.taxes },
      { key: "ctrl_ni",  label: "Controlling Net Income ($)",kind: "input",  fmt: "abs",       fn: d => d.netIncome },
      { key: "ni_g",     label: "Var %",                    kind: "derived", fmt: "pct",       colorize: true, indent: 1,
        fn: (d,p) => sgrow(d.netIncome, p?.netIncome ?? null) },
      { key: "eps",      label: "EPS ($)",                  kind: "input",   fmt: "small",     fn: d => d.eps },
      { key: "shares",   label: "# Shares (mm)",            kind: "input",   fmt: "abs",       fn: d => d.sharesOut },
    ],
  },

  // 2. BLOOMBERG CONSENSUS
  {
    key: "bbg", title: "Bloomberg Consensus",
    rows: [
      { key: "bbg_rev",     label: "Revenue ($)",                    kind: "consensus",    fmt: "abs",
        bbgKeys: REV_KEYS },
      { key: "bbg_rev_vs",  label: "vs Consensus (%)",               kind: "vs_consensus", fmt: "pct", indent: 1,
        bbgKeys: REV_KEYS,
        modelFn: d => d.revenue },
      { key: "bbg_ebitda",  label: "EBITDA ($)",                     kind: "consensus",    fmt: "abs",
        bbgKeys: EBITDA_KEYS },
      { key: "bbg_eb_vs",   label: "vs Consensus (%)",               kind: "vs_consensus", fmt: "pct", indent: 1,
        bbgKeys: EBITDA_KEYS,
        modelFn: d => d.ebitda },
      { key: "bbg_ni",      label: "Controlling Net Income ($)",      kind: "consensus",    fmt: "abs",
        bbgKeys: NI_KEYS },
      { key: "bbg_ni_vs",   label: "vs Consensus (%)",               kind: "vs_consensus", fmt: "pct", indent: 1,
        bbgKeys: NI_KEYS,
        modelFn: d => d.netIncome },
    ],
  },

  // 3. BALANCE
  {
    key: "bs", title: "Balance",
    rows: [
      { key: "ppe",      label: "PP&E (from balance)",    kind: "input",   fmt: "abs",  fn: d => d.ppe },
      { key: "wk",       label: "Working Capital ($)",    kind: "input",   fmt: "abs",  fn: d => d.workingCapital },
      { key: "wk_var",   label: "WK Var",                 kind: "derived", fmt: "abs",  indent: 1,
        fn: (d,p) => ssub(d.workingCapital, p?.workingCapital ?? null) },
      { key: "min",      label: "Minorities ($)",          kind: "input",   fmt: "abs",  fn: d => d.minorities },
      { key: "ctrl_eq",  label: "Controlling Equity ($)",  kind: "input",   fmt: "abs",  fn: d => d.controllingEq },
      { key: "tan_eq",   label: "Tangible Equity ($)",     kind: "input",   fmt: "abs",  fn: d => d.tangibleEq },
      { key: "nd",       label: "Net Debt YE ($)",         kind: "input",   fmt: "abs",  fn: d => d.netDebt },
      { key: "nd_eb",    label: "Net debt / EBITDA",       kind: "derived", fmt: "mult", indent: 1,
        fn: d => sdiv(d.netDebt, d.ebitda) },
    ],
  },

  // 4. CASH FLOW
  {
    key: "cf", title: "Cash Flow",
    rows: [
      { key: "capex",      label: "Capex ($)",                    kind: "input",   fmt: "abs",
        fn: d => d.capex },
      { key: "capex_rev",  label: "% Revenues",                   kind: "derived", fmt: "pct_plain", indent: 1,
        fn: d => d.capex !== null ? sdiv(Math.abs(d.capex), d.revenue) : null },
      { key: "asset_s",    label: "Asset Sales ($)",              kind: "input",   fmt: "abs",
        fn: d => d.assetSales },
      { key: "fcf",        label: "FCF ($): CFO-CFI",             kind: "input",   fmt: "abs",
        fn: d => d.fcf },
      { key: "fcf_yield",  label: "FCF Yield (%)",                kind: "derived", fmt: "pct", colorize: true, indent: 1,
        fn: d => sdiv(d.fcf, d.effMarketCap) },
      { key: "fcfe",       label: "FCFE ($): FCF-CFF ex Divs/I",  kind: "input",   fmt: "abs",
        fn: d => d.fcfe },
      { key: "fcfe_yield", label: "FCFE Yield (%)",               kind: "derived", fmt: "pct", colorize: true, indent: 1,
        fn: d => sdiv(d.fcfe, d.effMarketCap) },
      { key: "div_bb",     label: "Dividend + Buyback",           kind: "derived", fmt: "abs",
        fn: d => sadd(d.dividend, d.buybacks) },
      { key: "tot_yield",  label: "Yield (%)",                    kind: "derived", fmt: "pct", colorize: true, indent: 1,
        fn: d => {
          const tot = sadd(d.dividend, d.buybacks);
          return tot !== null && d.effMarketCap ? Math.abs(tot) / d.effMarketCap : null;
        } },
      { key: "div",        label: "Dividend ($) - negative",      kind: "input",   fmt: "abs",
        fn: d => d.dividend },
      { key: "payout_r",   label: "Payout - positive",            kind: "derived", fmt: "pct_plain", indent: 1,
        fn: (d, p) =>
          d.dividend !== null && p?.netIncome
            ? Math.abs(d.dividend) / p.netIncome : null },
      { key: "div_yield",  label: "Dividend Yield (%)",           kind: "derived", fmt: "pct", colorize: true, indent: 1,
        fn: d => d.dividend !== null && d.effMarketCap
          ? Math.abs(d.dividend) / d.effMarketCap : null },
      { key: "dps",        label: "DPS ($) - negative",           kind: "input",   fmt: "small",
        fn: d => d.dps },
      { key: "buybacks",   label: "Buybacks ($) - negative",      kind: "input",   fmt: "abs",
        fn: d => d.buybacks },
      { key: "bb_yield",   label: "Buybacks Yield (%)",           kind: "derived", fmt: "pct", colorize: true, indent: 1,
        fn: d => d.buybacks !== null && d.effMarketCap
          ? Math.abs(d.buybacks) / d.effMarketCap : null },
    ],
  },

  // 5. MARKET MULTIPLES
  {
    key: "mm", title: "Market Multiples",
    rows: [
      { key: "price",    label: "Share Price ($) - LCCY",      kind: "input",   fmt: "small",
        fn: d => d.effPrice },
      { key: "mktcap",   label: "Market Cap ($) - LCCY",       kind: "input",   fmt: "abs",
        fn: d => d.effMarketCap },
      { key: "ev",       label: "EV",                           kind: "derived", fmt: "abs",
        fn: d => {
          if (d.effMarketCap === null || d.netDebt === null || d.minorities === null) return null;
          return d.effMarketCap + d.netDebt + d.minorities;
        } },
      { key: "ev_eb",    label: "EV/EBITDA",                    kind: "derived", fmt: "mult",
        fn: d => {
          if (d.effMarketCap === null || d.netDebt === null || d.minorities === null) return null;
          return sdiv(d.effMarketCap + d.netDebt + d.minorities, d.ebitda);
        } },
      { key: "pe",       label: "P/E",                          kind: "derived", fmt: "mult",
        fn: d => sdiv(d.effMarketCap, d.netIncome) },
      { key: "pbv",      label: "P/BV",                         kind: "derived", fmt: "mult",
        fn: d => sdiv(d.effMarketCap, d.controllingEq) },
      { key: "roe",      label: "ROE (NI / Equity)",            kind: "derived", fmt: "pct_plain",
        fn: (d,p) => sdiv(d.netIncome, p?.controllingEq ?? null) },
      { key: "roe_tan",  label: "ROE* (NI / Tang. Equity)",     kind: "derived", fmt: "pct_plain",
        fn: (d,p) => sdiv(d.netIncome, p?.tangibleEq ?? null) },
      { key: "roic",     label: "ROIC (NOPAT / ND+IM+Eq)",      kind: "derived", fmt: "pct_plain",
        fn: (d,p) => {
          if (!p) return null;
          const np = nopat(d.ebit, d.taxRate);
          const ic = p.netDebt !== null && p.minorities !== null && p.controllingEq !== null
            ? p.netDebt + p.minorities + p.controllingEq : null;
          return sdiv(np, ic);
        } },
      { key: "roic_tan", label: "ROIC** (NOPAT / ND + IM + Tang Eq)", kind: "derived", fmt: "pct_plain",
        fn: (d,p) => {
          if (!p) return null;
          const np = nopat(d.ebit, d.taxRate);
          const ic = p.netDebt !== null && p.minorities !== null && p.tangibleEq !== null
            ? p.netDebt + p.minorities + p.tangibleEq : null;
          return sdiv(np, ic);
        } },
      { key: "roic_op",  label: "ROIC* (NOPAT / WK + PP&E)",   kind: "derived", fmt: "pct_plain",
        fn: (d,p) => {
          if (!p) return null;
          const np = nopat(d.ebit, d.taxRate);
          const ic = p.workingCapital !== null && p.ppe !== null
            ? p.workingCapital + p.ppe : null;
          return sdiv(np, ic);
        } },
      { key: "taxrate",  label: "Tax rate for NOPAT/ROIC (%)",  kind: "input",   fmt: "pct_plain",
        fn: d => d.taxRate },
    ],
  },
];

// ── Cell renderer ──────────────────────────────────────────────────────────────
function renderCell(value: number | null, fmt: Fmt, colorize: boolean) {
  if (value === null) return { text: "—", color: "#9CA3AF" };
  let text: string;
  let color = C.TXT;
  switch (fmt) {
    case "abs":       text = fmtAbs(value);       break;
    case "pct":       text = fmtPct(value, false);
      if (colorize) color = value > 0.0005 ? C.BLUE : value < -0.0005 ? C.RED : C.TXT2;
      break;
    case "pct_plain": text = fmtPct(value, true);  break;
    case "mult":      text = fmtMult(value);       break;
    case "small":     text = fmtSmall(value);      break;
  }
  return { text, color };
}

function vsConStyle(v: number | null): React.CSSProperties {
  if (v === null) return { color: "#9CA3AF" };
  if (v > 0.001)  return { background: "rgba(21,128,61,0.12)",  color: C.GREEN, fontWeight: 700 };
  if (v < -0.001) return { background: "rgba(220,38,38,0.12)",  color: C.RED,   fontWeight: 700 };
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
interface KpiSection {
  sectionName: string;
  kpis: { kpiName: string; kpiOrder: number; byYear: Map<number, number | null> }[];
}

function buildKpiSections(kpis: ModelKpiRow[]): KpiSection[] {
  // `kpis` llega en orden de inserción (≈ planilla); el Map preserva el orden de
  // primer-encuentro de cada sección, así respetamos el orden de origen.
  const sectionMap = new Map<string, Map<string, { order: number; byYear: Map<number, number | null> }>>();

  for (const k of kpis) {
    if (!sectionMap.has(k.sectionName)) sectionMap.set(k.sectionName, new Map());
    const sec = sectionMap.get(k.sectionName)!;
    if (!sec.has(k.kpiName)) sec.set(k.kpiName, { order: k.kpiOrder, byYear: new Map() });
    sec.get(k.kpiName)!.byYear.set(k.year, k.value);
  }

  return Array.from(sectionMap.entries())
    .map(([sectionName, kpiMap]) => ({
      sectionName,
      kpis: Array.from(kpiMap.entries())
        .sort((a, b) => a[1].order - b[1].order)
        .map(([kpiName, { order, byYear }]) => ({ kpiName, kpiOrder: order, byYear })),
    }));
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
    () => buildKpiSections(snapshot?.kpis ?? []),
    [snapshot],
  );

  // Estimate evolution: how the analyst's projections for the current + next year
  // moved across every published revision (oldest → newest).
  const estimate = useMemo(() => {
    const snaps = history?.snapshots ?? [];
    const cy = new Date().getFullYear();
    const yrs = [cy, cy + 1];
    const rowsByMetric: Record<string, EstimateRow[]> = {
      NI:     buildEstimateRows(snaps, yrs, (r) => r.netIncome),
      EBITDA: buildEstimateRows(snaps, yrs, (r) => r.ebitda),
      FCFE:   buildEstimateRows(snaps, yrs, (r) => r.fcfe),
    };
    return { rowsByMetric, years: yrs.map(String) };
  }, [history]);

  // Latest consensus value per (metric, period)
  const latestConsensus = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const c of consensusEstimates) {
      if (!map.has(c.metric)) map.set(c.metric, new Map());
      map.get(c.metric)!.set(c.period, c.value);
    }
    return map;
  }, [consensusEstimates]);

  // Raw consensus value (sin escalar) para una métrica/año.
  const rawCon = (keys: string[], year: number): number | null => {
    const period = String(year);
    for (const [dbMetric, periods] of latestConsensus) {
      const lc = dbMetric.toLowerCase();
      if (keys.some(k => lc === k || lc.replace(/_/g, "") === k.replace(/\s/g, ""))) {
        const v = periods.get(period);
        return v != null ? v : null;
      }
    }
    return null;
  };

  // consensus_estimates llega en escala inconsistente por ticker (1× o 1000× el modelo).
  // Detectamos el factor potencia-de-1000 comparando consenso crudo vs modelo; fallback 1000
  // preserva el comportamiento histórico (÷1000) cuando no hay overlap para detectar.
  const scaleFactor = useMemo(() => {
    const model: (number | null)[] = [];
    const cons:  (number | null)[] = [];
    const add = (keys: string[], modelOf: (d: YearData) => number | null) => {
      for (const d of enriched) { model.push(modelOf(d)); cons.push(rawCon(keys, d.year)); }
    };
    add(NI_KEYS,     d => d.netIncome);
    add(REV_KEYS,    d => d.revenue);
    add(EBITDA_KEYS, d => d.ebitda);
    return consensusScaleFactor(model, cons, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched, latestConsensus]);

  const getConsensus = (keys: string[], year: number): number | null => {
    const v = rawCon(keys, year);
    return v != null ? v / scaleFactor : null;
  };

  // Actual Price = last estimate year's share price (most recently set by analyst)
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
      No analyst model available for this company.
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
    width: 160, minWidth: 160, maxWidth: 160,
    borderRight: `1px solid ${C.BDR}`,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  };
  const yearColW: React.CSSProperties = { minWidth: 74, width: 74 };
  const CELL_PAD = "3px 6px";

  // ── Format update date for display ────────────────────────────────────────
  function fmtDate(iso: string) {
    const [y, m, d] = iso.split("-");
    return `${d}-${m}-${y}`;
  }

  // ── Excel export ──────────────────────────────────────────────────────────
  function exportToExcel() {
    // ── Style helpers ──────────────────────────────────────────────────────
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

    // ── Build rows ─────────────────────────────────────────────────────────
    const rows: XRow[] = [];

    // Metadata block
    const metaItems: [string, string][] = [
      ["Ticker Bloomberg", header.ticker],
      ["Recommendation",   header.recc ?? "—"],
      ["Actual Price",     actualPrice !== null ? fmtSmall(actualPrice) : "—"],
      ["TP",               header.tp   !== null ? fmtSmall(header.tp)   : "—"],
      ["Upside",           upside !== null ? fmtPct(upside) : "—"],
      ["Thesis",           header.thesis ?? "—"],
      ["Analyst",          header.analyst ?? "—"],
      ["Updated",          header.updateDate],
    ];
    for (const [lbl, val] of metaItems) {
      rows.push([
        xc(lbl, { font: { bold: true, sz: 10 }, fill: F_GRAY, alignment: { horizontal: "left" } }),
        xc(val, { font: { sz: 10 }, fill: F_GRAY, alignment: { horizontal: "left" } }),
        ...Array.from({ length: years.length - 1 }, () => xc("", { fill: F_GRAY })),
      ]);
    }

    // Blank separator
    rows.push(Array.from({ length: 1 + years.length }, () => null));

    // Year header row
    rows.push([
      xc(`CCY${header.currency ? ` : ${header.currency}` : ""}`, {
        font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
        fill: F_HDR,
        alignment: { horizontal: "left", vertical: "center" },
      }),
      ...years.map(yr => {
        const isEst = yr >= now;
        return xc(`${yr}${isEst ? "E" : ""}`, {
          font: { bold: true, sz: 11, name: "Courier New", color: { rgb: isEst ? "FDE68A" : "FFFFFF" } },
          fill: F_HDR,
          alignment: { horizontal: "center", vertical: "center" },
        });
      }),
    ]);

    // Standard sections
    for (const section of SECTIONS) {
      rows.push([
        xc(section.title.toUpperCase(), {
          font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
          fill: F_HDR,
          alignment: { horizontal: "left" },
        }),
        ...Array.from({ length: years.length }, () => xc("", { fill: F_HDR })),
      ]);

      for (const row of section.rows) {
        const isDerived   = row.kind === "derived";
        const isConsensus = row.kind === "consensus";
        const isVsCons    = row.kind === "vs_consensus";
        const indent = "  ".repeat(row.indent ?? 0);

        rows.push([
          xc(`${indent}${row.label}`, {
            font: {
              bold:   !isDerived && !isVsCons,
              italic: isDerived,
              sz:     10,
              color:  { rgb: isDerived || isVsCons ? "374151" : "111827" },
            },
            fill:      isDerived ? F_DRV : F_WHITE,
            alignment: { horizontal: "left" },
          }),
          ...years.map(yr => {
            const d    = byYear.get(yr)!;
            const prev = byYear.get(yr - 1) ?? null;
            const isEst = d.isEst;

            let text   = "—";
            let fColor = "111827";
            let fFill  = isDerived ? F_DRV : isEst ? F_EST : F_WHITE;

            if (isVsCons && row.bbgKeys && row.modelFn) {
              const bbg   = getConsensus(row.bbgKeys, yr);
              const model = row.modelFn(d);
              if (bbg !== null && model !== null && bbg !== 0) {
                const v = (model - bbg) / Math.abs(bbg);
                text   = fmtPct(v, false);
                fColor = v > 0.001 ? "15803D" : v < -0.001 ? "DC2626" : "374151";
                fFill  = v > 0.001 ? F_POS : v < -0.001 ? F_NEG : F_WHITE;
              }
            } else if (isConsensus && row.bbgKeys) {
              const v = getConsensus(row.bbgKeys, yr);
              if (v !== null) text = fmtAbs(v);
              fFill = isEst ? F_EST : F_WHITE;
            } else if (row.fn) {
              const v = row.fn(d, prev);
              if (v !== null) {
                const r = renderCell(v, row.fmt, !!row.colorize);
                text = r.text;
                if (row.colorize) fColor = r.color === C.BLUE ? "1D4ED8" : r.color === C.RED ? "DC2626" : "111827";
              }
            }

            return xc(text, {
              font:      { name: "Courier New", sz: 10, bold: !isDerived && !isVsCons, italic: isDerived, color: { rgb: fColor } },
              fill:      fFill,
              alignment: { horizontal: "center" },
              border:    bdr(),
            });
          }),
        ]);
      }
    }

    // KPI sections
    if (kpiSections.length > 0) {
      rows.push([
        xc("KPI", { font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } }, fill: F_HDR }),
        ...Array.from({ length: years.length }, () => xc("", { fill: F_HDR })),
      ]);

      for (const { sectionName, kpis } of kpiSections) {
        rows.push([
          xc(sectionName.toUpperCase(), {
            font: { bold: true, sz: 9, color: { rgb: "E5E7EB" } },
            fill: F_SUB,
          }),
          ...Array.from({ length: years.length }, () => xc("", { fill: F_SUB })),
        ]);

        for (const { kpiName, byYear: kByYear } of kpis) {
          const hasPct = kpiName.includes("%");   // sólo '%' → azul + porcentaje
          const fmt: Fmt = hasPct ? "pct_plain" : "abs";

          rows.push([
            xc(kpiName, { font: { bold: true, sz: 10, color: { rgb: hasPct ? "1D4ED8" : "111827" } }, fill: hasPct ? F_DRV : F_WHITE, alignment: { horizontal: "left" } }),
            ...years.map(yr => {
              const v    = kByYear.get(yr) ?? null;
              const isEst = (byYear.get(yr)?.isEst) ?? false;
              const { text } = renderCell(v, fmt, false);
              return xc(text, {
                font:      { name: "Courier New", sz: 10, bold: true, color: { rgb: hasPct ? "1D4ED8" : "111827" } },
                fill:      hasPct ? F_DRV : isEst ? F_EST : F_WHITE,
                alignment: { horizontal: "center" },
                border:    bdr(),
              });
            }),
          ]);
        }
      }
    }

    // ── Write worksheet ────────────────────────────────────────────────────
    const ws: Record<string, unknown> = {};
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const cd = rows[r][c];
        if (cd !== null) ws[XLSX.utils.encode_cell({ r, c })] = cd;
      }
    }
    ws["!ref"]  = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: years.length } });
    ws["!cols"] = [{ wch: 30 }, ...years.map(() => ({ wch: 12 }))];
    ws["!views"] = [{ state: "frozen", xSplit: 1, ySplit: metaItems.length + 2 }];

    const wb = XLSX.utils.book_new();
    const sheetName = header.ticker.replace(/[\\/:*?[\]]/g, "").slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${sheetName}_${header.updateDate}.xlsx`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 6px" }}>

      {/* ── TOP PANEL: Info + actions (left half) · Estimate chart (right half) ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
        gap: 16, alignItems: "stretch",
        padding: "12px 16px",
        background: "#F8FAFC",
        border: `1px solid ${C.BDR}`,
        borderRadius: 10,
      }}>

        {/* ── Left half: model info table + actions ── */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 12, minWidth: 0 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {[
              { label: "Ticker Bloomberg", value: <span style={{ fontWeight: 700, color: C.TXT, ...MONO }}>{header.ticker}</span> },
              { label: "Recommendation",  value: <ReccBadge recc={header.recc} /> },
              { label: "Actual Price",    value: actualPrice !== null
                  ? <span style={{ fontWeight: 700, color: C.TXT, ...MONO }}>{fmtSmall(actualPrice)}</span>
                  : <span style={{ color: C.TXT2 }}>—</span> },
              { label: "TP",              value: header.tp !== null
                  ? <span style={{ fontWeight: 800, color: C.TXT, ...MONO }}>{fmtSmall(header.tp)}</span>
                  : <span style={{ color: C.TXT2 }}>—</span> },
              { label: "Upside",          value: upside !== null
                  ? <span style={{
                      padding: "1px 10px", borderRadius: 4, fontWeight: 800,
                      background: upside > 0 ? "rgba(21,128,61,0.12)" : "rgba(220,38,38,0.12)",
                      color: upside > 0 ? C.GREEN : C.RED,
                    }}>{fmtPct(upside)}</span>
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
                        background: C.BLUE, color: C.WHITE,
                        fontWeight: 700, fontSize: 11, letterSpacing: "0.02em",
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
        </div>

        {/* ── Right half: estimate evolution chart ── */}
        <div style={{ minWidth: 0, borderLeft: `1px solid ${C.BDR}`, paddingLeft: 16, height: 250 }}>
          <ModelEstimateChart
            metrics={ESTIMATE_METRICS}
            rowsByMetric={estimate.rowsByMetric}
            years={estimate.years}
            defaultMetric="NI"
          />
        </div>
      </div>

      {/* ── Actions: export + version (top-right, between panel and table) ── */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, flexWrap: "wrap" }}>

        {!isLatest && (
          <button
            onClick={() => setSelectedDate(snapshots[0].header.updateDate)}
            style={{
              padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer",
              background: C.BLUE, color: C.WHITE, border: "none", borderRadius: 5, outline: "none",
            }}
          >
            ← Latest
          </button>
        )}

        {/* Excel export button */}
        <button
          onClick={exportToExcel}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "5px 12px", borderRadius: 5, cursor: "pointer",
            background: "#16A34A", color: C.WHITE,
            fontWeight: 700, fontSize: 11, letterSpacing: "0.02em",
            border: "none", outline: "none",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M4 7l3 3 3-3M7 4v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Export Excel
        </button>

        {/* Version selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, border: `2px solid ${C.TXT}`, borderRadius: 6, overflow: "hidden" }}>
          <span style={{
            padding: "5px 14px", background: C.HDR, color: C.WHITE,
            fontWeight: 800, fontSize: 12, letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}>
            Update
          </span>
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{
              border: "none", padding: "5px 10px",
              fontSize: 13, ...MONO, background: C.WHITE, color: C.TXT,
              fontWeight: 700, cursor: "pointer", outline: "none",
              minWidth: 110,
            }}
          >
            {snapshots.map(s => (
              <option key={s.header.updateDate} value={s.header.updateDate}>
                {fmtDate(s.header.updateDate)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── TABLE ─────────────────────────────────────────────────────────── */}
      <div style={{ overflow: "clip", borderRadius: 10 }}>
      <div style={{
        background: C.WHITE,
        overflowX: "auto",
        padding: "0 12px 12px",
      }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed", width: "100%" }}>

          {/* Year header */}
          <thead>
            <tr>
              <th style={{
                ...labelSticky, position: "sticky", left: 0, top: 0, zIndex: 3,
                padding: "7px 10px", background: C.HDR, color: C.WHITE,
                fontWeight: 700, fontSize: 10, letterSpacing: "0.06em",
                textTransform: "uppercase", textAlign: "left",
              }}>
                Reported CCY{header.currency ? ` : ${header.currency}` : ""}
              </th>
              {years.map(yr => {
                const isEst = yr >= now;
                return (
                  <th key={yr} style={{
                    ...yearColW, position: "sticky", top: 0, zIndex: 2,
                    padding: "7px 7px", textAlign: "center",
                    background: C.HDR,
                    color: isEst ? "#FDE68A" : C.WHITE,
                    fontWeight: 700, fontSize: 11,
                    borderLeft: `1px solid rgba(255,255,255,0.10)`,
                    ...MONO,
                  }}>
                    {yr}{isEst ? <span style={{ fontSize: 8, opacity: 0.8, marginLeft: 1 }}>E</span> : ""}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {/* ── Standard sections ───────────────────────────────────────── */}
            {SECTIONS.map(section => (
              <React.Fragment key={section.key}>
                <tr>
                  <td colSpan={years.length + 1} style={{
                    ...labelSticky, position: "sticky", left: 0,
                    padding: "4px 10px", background: C.HDR, color: C.WHITE,
                    fontWeight: 700, fontSize: 10, letterSpacing: "0.10em",
                    textTransform: "uppercase", maxWidth: "none",
                    borderTop: "2px solid rgba(255,255,255,0.05)",
                  }}>
                    {section.title}
                  </td>
                </tr>

                {section.rows.map(row => {
                  const isDerived    = row.kind === "derived";
                  const isConsensus  = row.kind === "consensus";
                  const isVsCons     = row.kind === "vs_consensus";
                  const rowBg        = isDerived ? C.DRV_BG : C.WHITE;
                  const paddingLeft  = 10 + (row.indent ?? 0) * 14;

                  return (
                    <tr
                      key={row.key}
                      style={{ borderBottom: `1px solid ${C.BDR}` }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(29,78,216,0.04)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
                    >
                      {/* Label */}
                      <td style={{
                        ...labelSticky,
                        padding: CELL_PAD,
                        paddingLeft,
                        background: rowBg,
                        color:      isDerived || isVsCons ? C.TXT2 : isConsensus ? "#374151" : C.TXT,
                        fontWeight: isDerived || isVsCons ? 400 : 500,
                        fontStyle:  isDerived ? "italic" : "normal",
                        fontSize:   isDerived || isVsCons ? 10.5 : 11,
                      }}>
                        {row.label}
                      </td>

                      {/* Value cells */}
                      {years.map(yr => {
                        const d    = byYear.get(yr)!;
                        const prev = byYear.get(yr - 1) ?? null;
                        const isEst = d.isEst;

                        // Compute value
                        let value: number | null = null;
                        let vsConsValue: number | null = null;

                        if (isVsCons && row.bbgKeys && row.modelFn) {
                          const bbgVal   = getConsensus(row.bbgKeys, yr);
                          const modelVal = row.modelFn(d);
                          if (bbgVal !== null && modelVal !== null && bbgVal !== 0) {
                            vsConsValue = (modelVal - bbgVal) / Math.abs(bbgVal);
                          }
                          value = vsConsValue;
                        } else if (isConsensus && row.bbgKeys) {
                          value = getConsensus(row.bbgKeys, yr);
                        } else if (row.fn) {
                          value = row.fn(d, prev);
                        }

                        // Cell background
                        const cellBg = isDerived
                          ? C.DRV_BG
                          : (isConsensus || (!isDerived && !isVsCons)) && isEst
                          ? C.EST_BG
                          : C.WHITE;

                        if (isVsCons) {
                          const vstyle = vsConStyle(value);
                          return (
                            <td key={yr} style={{
                              ...yearColW, padding: CELL_PAD, textAlign: "center",
                              borderLeft: `1px solid ${C.BDR}`, ...MONO,
                              fontSize: 10.5, background: cellBg,
                              ...vstyle,
                            }}>
                              {value === null ? "—" : fmtPct(value, false)}
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
              </React.Fragment>
            ))}

            {/* ── KPI sections ────────────────────────────────────────────── */}
            {kpiSections.length > 0 && (
              <>
                {/* KPI master header */}
                <tr>
                  <td colSpan={years.length + 1} style={{
                    ...labelSticky, position: "sticky", left: 0,
                    padding: "4px 10px", background: C.HDR, color: C.WHITE,
                    fontWeight: 700, fontSize: 10, letterSpacing: "0.10em",
                    textTransform: "uppercase", maxWidth: "none",
                    borderTop: "2px solid rgba(255,255,255,0.05)",
                  }}>
                    KPI
                  </td>
                </tr>

                {kpiSections.map(({ sectionName, kpis }) => (
                  <React.Fragment key={`kpisec-${sectionName}`}>
                    {/* Sub-section header */}
                    <tr>
                      <td colSpan={years.length + 1} style={{
                        ...labelSticky, position: "sticky", left: 0,
                        padding: "3px 16px", background: C.SEC_SUB, color: "#E5E7EB",
                        fontWeight: 700, fontSize: 10, letterSpacing: "0.08em",
                        textTransform: "uppercase", maxWidth: "none",
                        borderTop: `1px solid rgba(255,255,255,0.07)`,
                      }}>
                        {sectionName}
                      </td>
                    </tr>

                    {kpis.map(({ kpiName, byYear: kByYear }) => {
                      const hasPct = kpiName.includes("%");   // sólo '%' → azul + porcentaje
                      const fmt: Fmt = hasPct ? "pct_plain" : "abs";

                      return (
                        <tr
                          key={`kpi-${sectionName}-${kpiName}`}
                          style={{ borderBottom: `1px solid ${C.BDR}` }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(29,78,216,0.04)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
                        >
                          <td style={{
                            ...labelSticky, padding: CELL_PAD, paddingLeft: 22,
                            background: hasPct ? C.DRV_BG : C.WHITE, color: hasPct ? C.BLUE : C.TXT, fontWeight: 500, fontSize: 11,
                          }}>
                            {kpiName}
                          </td>
                          {years.map(yr => {
                            const v    = kByYear.get(yr) ?? null;
                            const isEst = (byYear.get(yr)?.isEst) ?? false;
                            const { text, color } = renderCell(v, fmt, false);
                            return (
                              <td key={yr} style={{
                                ...yearColW, padding: CELL_PAD, textAlign: "center",
                                background: hasPct ? C.DRV_BG : isEst ? C.EST_BG : C.WHITE,
                                color: hasPct ? C.BLUE : color, fontWeight: 600, fontSize: 11,
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
