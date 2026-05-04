"use client";

import { useState, useEffect, useMemo } from "react";
import type { ModelPayload, ModelFinancialRow } from "@/app/api/companies/[ticker]/model/route";

// ── Design tokens ─────────────────────────────────────────────────────────────
const BLUE   = "#1D4ED8";
const NEG    = "#B91C1C";
const BORDER = "rgba(15,23,42,0.08)";
const TEXT1  = "#0F172A";
const TEXT2  = "#64748B";

// ── Safe math helpers ─────────────────────────────────────────────────────────
function div(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}
function sub(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return a - b;
}
function add(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return a + b;
}
function growth(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null || prev === 0) return null;
  return curr / prev - 1;
}
function nopat(ebit: number | null, taxRate: number | null): number | null {
  if (ebit === null || taxRate === null) return null;
  return ebit * (1 - taxRate);
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtAbs(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function fmtPct(v: number | null): string {
  if (v === null) return "—";
  const pct = v * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
}
function fmtPctPlain(v: number | null): string {
  if (v === null) return "—";
  return (v * 100).toFixed(1) + "%";
}
function fmtMult(v: number | null): string {
  if (v === null) return "—";
  return v.toFixed(1) + "x";
}
function fmtSmall(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Row types ─────────────────────────────────────────────────────────────────
type Format = "abs" | "pct" | "pct_plain" | "mult" | "small";

interface RowSpec {
  key:       string;
  label:     string;
  isSection?: true;
  isDerived?: true;
  format:    Format;
  colorize?: true;
  fn?:       (d: ModelFinancialRow, prev: ModelFinancialRow | null) => number | null;
}

interface TableRow {
  key:       string;
  label:     string;
  isSection: boolean;
  isDerived: boolean;
  format:    Format;
  colorize:  boolean;
  values:    (number | null)[];
}

// ── Row specification (sections + rows in display order) ─────────────────────
const ROW_SPEC: RowSpec[] = [
  // ── INCOME STATEMENT ──────────────────────────────────────────────────────
  { key: "s_is",       label: "Income Statement",    isSection: true,  format: "abs" },
  { key: "revenue",    label: "Revenue",             format: "abs",      fn: (d)    => d.revenue },
  { key: "rev_var",    label: "Var % Revenue",       isDerived: true, format: "pct",       colorize: true, fn: (d,p) => growth(d.revenue, p?.revenue ?? null) },
  { key: "ebit",       label: "EBIT",                format: "abs",      fn: (d)    => d.ebit },
  { key: "ebit_mg",    label: "EBIT Margin",         isDerived: true, format: "pct_plain", fn: (d)   => div(d.ebit, d.revenue) },
  { key: "da",         label: "D&A",                 format: "abs",      fn: (d)    => d.da },
  { key: "ebitda",     label: "EBITDA",              format: "abs",      fn: (d)    => d.ebitda },
  { key: "ebitda_var", label: "Var % EBITDA",        isDerived: true, format: "pct",       colorize: true, fn: (d,p) => growth(d.ebitda, p?.ebitda ?? null) },
  { key: "ebitda_mg",  label: "EBITDA Margin",       isDerived: true, format: "pct_plain", fn: (d)   => div(d.ebitda, d.revenue) },
  { key: "nfe",        label: "Net Fin. Expenses",   format: "abs",      fn: (d)    => d.netFinExp },
  { key: "ni",         label: "Net Income",          format: "abs",      fn: (d)    => d.netIncome },
  { key: "ni_var",     label: "Var % Net Income",    isDerived: true, format: "pct",       colorize: true, fn: (d,p) => growth(d.netIncome, p?.netIncome ?? null) },
  { key: "eps",        label: "EPS",                 format: "small",    fn: (d)    => d.eps },
  { key: "shares",     label: "Shares Outstanding",  format: "abs",      fn: (d)    => d.sharesOut },
  { key: "tax",        label: "Tax Rate",            format: "pct_plain",fn: (d)    => d.taxRate },

  // ── BALANCE SHEET ─────────────────────────────────────────────────────────
  { key: "s_bs",     label: "Balance Sheet",        isSection: true,  format: "abs" },
  { key: "wk",       label: "Working Capital",      format: "abs",      fn: (d)   => d.workingCapital },
  { key: "wk_var",   label: "WK Variation",         isDerived: true, format: "abs",       fn: (d,p) => sub(d.workingCapital, p?.workingCapital ?? null) },
  { key: "ppe",      label: "PP&E",                 format: "abs",      fn: (d)   => d.ppe },
  { key: "nd",       label: "Net Debt",             format: "abs",      fn: (d)   => d.netDebt },
  { key: "nd_ebitda",label: "Net Debt / EBITDA",    isDerived: true, format: "mult",      fn: (d)   => div(d.netDebt, d.ebitda) },
  { key: "min",      label: "Minorities",           format: "abs",      fn: (d)   => d.minorities },
  { key: "ctrl_eq",  label: "Controlling Equity",   format: "abs",      fn: (d)   => d.controllingEq },
  { key: "tan_eq",   label: "Tangible Equity",      format: "abs",      fn: (d)   => d.tangibleEq },

  // ── CASH FLOW ─────────────────────────────────────────────────────────────
  { key: "s_cf",       label: "Cash Flow",           isSection: true,  format: "abs" },
  { key: "fcf",        label: "FCF",                 format: "abs",      fn: (d)    => d.fcf },
  { key: "fcf_yield",  label: "FCF Yield",           isDerived: true, format: "pct",       colorize: true, fn: (d)   => div(d.fcf, d.marketCap) },
  { key: "capex",      label: "Capex",               format: "abs",      fn: (d)    => d.capex },
  { key: "capex_rev",  label: "Capex % Rev",         isDerived: true, format: "pct_plain", fn: (d)   => d.capex !== null ? div(Math.abs(d.capex), d.revenue) : null },
  { key: "asset_sales",label: "Asset Sales",         format: "abs",      fn: (d)    => d.assetSales },
  { key: "fcfe",       label: "FCFE",                format: "abs",      fn: (d)    => d.fcfe },
  { key: "fcfe_yield", label: "FCFE Yield",          isDerived: true, format: "pct",       colorize: true, fn: (d)   => div(d.fcfe, d.marketCap) },
  { key: "div",        label: "Dividend",            format: "abs",      fn: (d)    => d.dividend },
  { key: "buybacks",   label: "Buybacks",            format: "abs",      fn: (d)    => d.buybacks },
  {
    key: "div_bb", label: "Div + Buyback Total", isDerived: true, format: "abs",
    fn: (d) => add(d.dividend, d.buybacks),
  },
  {
    key: "total_yield", label: "Total Yield", isDerived: true, format: "pct", colorize: true,
    fn: (d) => {
      const tot = add(d.dividend, d.buybacks);
      if (tot === null || d.marketCap === null || d.marketCap === 0) return null;
      return Math.abs(tot) / d.marketCap;
    },
  },
  {
    key: "payout_r", label: "Payout Ratio", isDerived: true, format: "pct_plain",
    fn: (d, p) => {
      if (d.dividend === null || !p || !p.netIncome || p.netIncome === 0) return null;
      return Math.abs(d.dividend) / p.netIncome;
    },
  },
  {
    key: "div_yield", label: "Dividend Yield", isDerived: true, format: "pct", colorize: true,
    fn: (d) => d.dividend !== null ? div(Math.abs(d.dividend), d.marketCap) : null,
  },
  {
    key: "bb_yield", label: "Buyback Yield", isDerived: true, format: "pct", colorize: true,
    fn: (d) => d.buybacks !== null ? div(Math.abs(d.buybacks), d.marketCap) : null,
  },
  { key: "dps", label: "DPS", format: "small", fn: (d) => d.dps },

  // ── MARKET MULTIPLES ─────────────────────────────────────────────────────
  { key: "s_mm",    label: "Market Multiples",       isSection: true,  format: "abs" },
  { key: "price",   label: "Share Price",            format: "small",    fn: (d)   => d.sharePrice },
  { key: "mkt_cap", label: "Market Cap",             format: "abs",      fn: (d)   => d.marketCap },
  {
    key: "ev", label: "EV", isDerived: true, format: "abs",
    fn: (d) => {
      if (d.marketCap === null || d.netDebt === null || d.minorities === null) return null;
      return d.marketCap + d.netDebt + d.minorities;
    },
  },
  {
    key: "ev_ebitda", label: "EV / EBITDA", isDerived: true, format: "mult",
    fn: (d) => {
      const ev = d.marketCap !== null && d.netDebt !== null && d.minorities !== null
        ? d.marketCap + d.netDebt + d.minorities : null;
      return div(ev, d.ebitda);
    },
  },
  { key: "pe",  label: "P / E",  isDerived: true, format: "mult", fn: (d) => div(d.marketCap, d.netIncome) },
  { key: "pbv", label: "P / BV", isDerived: true, format: "mult", fn: (d) => div(d.marketCap, d.controllingEq) },
  {
    key: "roe",     label: "ROE",           isDerived: true, format: "pct", colorize: true,
    fn: (d, p) => div(d.netIncome, p?.controllingEq ?? null),
  },
  {
    key: "roe_tan", label: "ROE (Tangible)", isDerived: true, format: "pct", colorize: true,
    fn: (d, p) => div(d.netIncome, p?.tangibleEq ?? null),
  },
  {
    key: "roic", label: "ROIC (Standard)", isDerived: true, format: "pct", colorize: true,
    fn: (d, p) => {
      if (!p) return null;
      const np = nopat(d.ebit, d.taxRate);
      const invested = p.netDebt !== null && p.minorities !== null && p.controllingEq !== null
        ? p.netDebt + p.minorities + p.controllingEq : null;
      return div(np, invested);
    },
  },
  {
    key: "roic_tan", label: "ROIC (Tangible)", isDerived: true, format: "pct", colorize: true,
    fn: (d, p) => {
      if (!p) return null;
      const np = nopat(d.ebit, d.taxRate);
      const invested = p.netDebt !== null && p.minorities !== null && p.tangibleEq !== null
        ? p.netDebt + p.minorities + p.tangibleEq : null;
      return div(np, invested);
    },
  },
  {
    key: "roic_op", label: "ROIC (Op. Assets)", isDerived: true, format: "pct", colorize: true,
    fn: (d, p) => {
      if (!p) return null;
      const np = nopat(d.ebit, d.taxRate);
      const invested = p.workingCapital !== null && p.ppe !== null
        ? p.workingCapital + p.ppe : null;
      return div(np, invested);
    },
  },
];

// ── Core pivot engine ─────────────────────────────────────────────────────────
function buildTableRows(financials: ModelFinancialRow[]): { years: number[]; rows: TableRow[] } {
  const years = financials.map((f) => f.year);
  const byYear = new Map<number, ModelFinancialRow>();
  for (const f of financials) byYear.set(f.year, f);

  const rows: TableRow[] = ROW_SPEC.map((spec) => {
    if (spec.isSection) {
      return { key: spec.key, label: spec.label, isSection: true, isDerived: false, format: spec.format, colorize: false, values: [] };
    }
    const values = years.map((year) => {
      const d = byYear.get(year)!;
      const prev = byYear.get(year - 1) ?? null;
      return spec.fn!(d, prev);
    });
    return {
      key:       spec.key,
      label:     spec.label,
      isSection: false,
      isDerived: !!spec.isDerived,
      format:    spec.format,
      colorize:  !!spec.colorize,
      values,
    };
  });

  return { years, rows };
}

// ── Cell value renderer ───────────────────────────────────────────────────────
function renderValue(value: number | null, format: Format, colorize: boolean): { text: string; color: string } {
  if (value === null) return { text: "—", color: "#CBD5E1" };

  let text: string;
  let color = TEXT1;

  switch (format) {
    case "abs":
      text = fmtAbs(value);
      break;
    case "pct":
      text = fmtPct(value);
      if (colorize) color = value > 0.0005 ? BLUE : value < -0.0005 ? NEG : TEXT2;
      break;
    case "pct_plain":
      text = fmtPctPlain(value);
      break;
    case "mult":
      text = fmtMult(value);
      break;
    case "small":
      text = fmtSmall(value);
      break;
  }

  return { text, color };
}

// ── Recommendation badge ──────────────────────────────────────────────────────
function ReccBadge({ recc }: { recc: string | null }) {
  if (!recc) return null;
  const upper = recc.toUpperCase();
  const isBuy  = upper.includes("BUY")  || upper === "OW";
  const isSell = upper.includes("SELL") || upper === "UW";
  const bg     = isBuy ? "rgba(29,78,216,0.10)" : isSell ? "rgba(185,28,28,0.10)" : "rgba(100,116,139,0.10)";
  const color  = isBuy ? BLUE : isSell ? NEG : TEXT2;
  const border = isBuy ? "rgba(29,78,216,0.25)" : isSell ? "rgba(185,28,28,0.25)" : "rgba(100,116,139,0.22)";
  return (
    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", padding: "3px 9px", borderRadius: 5, background: bg, color, border: `1px solid ${border}` }}>
      {upper}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ModelTable({ ticker }: { ticker: string }) {
  const [payload,  setPayload]  = useState<ModelPayload | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setPayload(null);

    fetch(`/api/companies/${encodeURIComponent(ticker)}/model`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: ModelPayload) => setPayload(d))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [ticker]);

  const { years, rows } = useMemo(
    () => (payload?.financials.length ? buildTableRows(payload.financials) : { years: [], rows: [] }),
    [payload],
  );

  // ── Shared cell styles ───────────────────────────────────────────────────
  const labelColStyle: React.CSSProperties = {
    position:   "sticky",
    left:       0,
    zIndex:     1,
    whiteSpace: "nowrap",
    minWidth:   190,
  };
  const yearCellStyle: React.CSSProperties = {
    padding:    "0 2px",
    minWidth:   96,
    textAlign:  "right",
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 10 }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid rgba(29,78,216,0.18)", borderTopColor: BLUE, animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 12, color: TEXT2, fontFamily: "JetBrains Mono, monospace" }}>Loading model…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: NEG, fontSize: 13 }}>
        Failed to load model: {error}
      </div>
    );
  }

  if (!payload?.header) {
    return (
      <div style={{ textAlign: "center", padding: "80px 0", color: TEXT2, fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>📊</div>
        No analyst model available for this ticker.
      </div>
    );
  }

  const { header } = payload;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Model meta-info bar ───────────────────────────────────────────── */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          16,
        flexWrap:     "wrap",
        padding:      "12px 16px",
        background:   "#F8FAFC",
        border:       `1px solid ${BORDER}`,
        borderRadius: 10,
      }}>
        <ReccBadge recc={header.recc} />

        {header.tp !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: TEXT2, textTransform: "uppercase" }}>Target Price</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: TEXT1, fontFamily: "JetBrains Mono, monospace" }}>
              {header.tp.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {header.analyst && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: TEXT2, textTransform: "uppercase" }}>Analyst</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: TEXT1 }}>{header.analyst}</span>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: TEXT2, textTransform: "uppercase" }}>Updated</span>
          <span style={{ fontSize: 11, color: TEXT2, fontFamily: "JetBrains Mono, monospace" }}>{header.updateDate}</span>
        </div>

        {header.link && (
          <a
            href={header.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              marginLeft:   "auto",
              display:      "inline-flex",
              alignItems:   "center",
              gap:          5,
              fontSize:     11,
              fontWeight:   600,
              color:        BLUE,
              background:   "rgba(29,78,216,0.07)",
              border:       "1px solid rgba(29,78,216,0.18)",
              borderRadius: 6,
              padding:      "4px 12px",
              textDecoration: "none",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
              <path d="M2 10h8M6 2v6M3 5l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            View Model
          </a>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div style={{
        background:   "#FFFFFF",
        border:       `1px solid ${BORDER}`,
        borderRadius: 12,
        boxShadow:    "0 1px 4px rgba(15,23,42,0.06)",
        overflowX:    "auto",
      }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
          <thead>
            <tr>
              {/* Corner cell */}
              <th style={{
                ...labelColStyle,
                position:    "sticky",
                left:        0,
                top:         0,
                zIndex:      3,
                padding:     "10px 16px",
                textAlign:   "left",
                background:  "#1e3a8a",
                color:       "white",
                fontWeight:  700,
                fontSize:    11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                borderBottom:  "1px solid rgba(255,255,255,0.12)",
              }}>
                Reported CCY
              </th>
              {years.map((yr) => (
                <th key={yr} style={{
                  ...yearCellStyle,
                  position:    "sticky",
                  top:         0,
                  zIndex:      2,
                  padding:     "10px 14px",
                  background:  "#1e3a8a",
                  color:       "white",
                  fontWeight:  700,
                  fontSize:    12,
                  letterSpacing: "0.04em",
                  borderBottom:  "1px solid rgba(255,255,255,0.12)",
                  fontFamily:  "JetBrains Mono, monospace",
                }}>
                  {yr}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIdx) => {
              if (row.isSection) {
                return (
                  <tr key={row.key}>
                    <td
                      colSpan={years.length + 1}
                      style={{
                        ...labelColStyle,
                        position:      "sticky",
                        left:          0,
                        padding:       "8px 16px",
                        background:    "#334155",
                        color:         "white",
                        fontWeight:    700,
                        fontSize:      10,
                        letterSpacing: "0.10em",
                        textTransform: "uppercase",
                        borderTop:     rowIdx > 0 ? "2px solid rgba(255,255,255,0.05)" : "none",
                      }}
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }

              const isEven = rowIdx % 2 === 0;
              const rowBg  = row.isDerived
                ? "rgba(248,250,252,1)"
                : isEven ? "#FFFFFF" : "rgba(15,23,42,0.015)";

              return (
                <tr
                  key={row.key}
                  style={{ borderBottom: `1px solid ${BORDER}` }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(29,78,216,0.03)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {/* Label cell */}
                  <td style={{
                    ...labelColStyle,
                    padding:    "7px 16px",
                    background: rowBg,
                    color:      row.isDerived ? TEXT2 : TEXT1,
                    fontWeight: row.isDerived ? 400 : 500,
                    fontSize:   row.isDerived ? 11 : 12,
                    fontStyle:  row.isDerived ? "italic" : "normal",
                    paddingLeft: row.isDerived ? 24 : 16,
                  }}>
                    {row.label}
                  </td>

                  {/* Value cells */}
                  {row.values.map((val, colIdx) => {
                    const { text, color } = renderValue(val, row.format, row.colorize);
                    return (
                      <td key={years[colIdx]} style={{
                        ...yearCellStyle,
                        padding:    "7px 14px",
                        color,
                        fontWeight: row.isDerived ? 500 : 600,
                        fontSize:   row.isDerived ? 11 : 12,
                        fontFamily: "JetBrains Mono, monospace",
                        borderLeft: `1px solid ${BORDER}`,
                      }}>
                        {text}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
