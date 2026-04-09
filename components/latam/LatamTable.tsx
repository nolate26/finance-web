"use client";

import React, { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LatamCompany {
  company:        string;
  ticker:         string;
  sector:         string | null;
  priceUsdTri:    number | null;
  ret1W:          number | null;
  ret1M:          number | null;
  retYtd:         number | null;
  ret1Y:          number | null;
  ret5Y:          number | null;
  priceUsd:       number | null;
  mktCapUsd:      number | null;
  netDebtUsd:     number | null;
  evUsd:          number | null;
  peCurYr:        number | null;
  peNxtYr:        number | null;
  evEbitdaCurYr:  number | null;
  evEbitdaNxtYr:  number | null;
  evSalesCurYr:   number | null;
  evSalesNxtYr:   number | null;
  pBv:            number | null;
  leverage:       number | null;
  roeEst:         number | null;
  divYield:       number | null;
  priceLocal:     number | null;
  targetPrice:    number | null;
  tpUpside:       number | null;
  niRealQ1:       number | null;
  niRealQ2:       number | null;
  niRealQ3:       number | null;
  niRealQ4:       number | null;
  niEstQ1:        number | null;
  niEstQ2:        number | null;
  niEstQ3:        number | null;
  niEstQ4:        number | null;
  niYoyQ1:        number | null;
  niYoyQ2:        number | null;
  niYoyQ3:        number | null;
  niYoyQ4:        number | null;
  epsEst:         number | null;
  epsRev1W:       number | null;
  epsRev4W:       number | null;
  epsRev3M:       number | null;
}

export interface LatamTableProps {
  companies:    LatamCompany[];
  sortBy:       string;
  setSortBy:    (key: string) => void;
  sortOrder:    "asc" | "desc";
  setSortOrder: (order: "asc" | "desc") => void;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatPct(val: number | null): { text: string; color: string; bold: boolean } {
  if (val === null || val === undefined) {
    return { text: "—", color: "#94A3B8", bold: false };
  }
  const pct  = val * 100;
  const sign = pct >= 0 ? "+" : "";
  return {
    text:  `${sign}${pct.toFixed(1)}%`,
    color: pct > 0 ? "#16a34a" : pct < 0 ? "#dc2626" : "#64748B",
    bold:  Math.abs(pct) >= 5,
  };
}

function formatMult(val: number | null): string {
  if (val === null || val === undefined) return "—";
  return `${val.toFixed(1)}x`;
}

function formatNum(val: number | null, decimals = 0): string {
  if (val === null || val === undefined) return "—";
  return val.toLocaleString("en-US", {
    minimumFractionDigits:  decimals,
    maximumFractionDigits:  decimals,
  });
}

function formatPrice(val: number | null): string {
  if (val === null || val === undefined) return "—";
  return val.toLocaleString("en-US", {
    minimumFractionDigits:  2,
    maximumFractionDigits:  2,
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PctCell({ val }: { val: number | null }) {
  const { text, color, bold } = formatPct(val);
  return <span style={{ color, fontWeight: bold ? 600 : 400 }}>{text}</span>;
}

function NumCell({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#0F172A" }}>{children}</span>;
}

// ── Column definitions ────────────────────────────────────────────────────────

type ColDef = {
  key:    string;
  label:  string;
  minW:   number;
  align:  "left" | "center";
  render: (c: LatamCompany) => React.ReactNode;
};

type ColGroup = {
  label:  string;
  accent: boolean;
  cols:   ColDef[];
};

const COL_GROUPS: ColGroup[] = [
  // ── Returns (TRI USD) ───────────────────────────────────────────────────────
  {
    label:  "Returns (TRI USD)",
    accent: true,
    cols: [
      {
        key: "priceUsdTri", label: "Price (USD)", minW: 94, align: "center",
        render: (c) => <NumCell>{formatPrice(c.priceUsdTri)}</NumCell>,
      },
      {
        key: "ret1W",  label: "1W",  minW: 70, align: "center",
        render: (c) => <PctCell val={c.ret1W} />,
      },
      {
        key: "ret1M",  label: "1M",  minW: 70, align: "center",
        render: (c) => <PctCell val={c.ret1M} />,
      },
      {
        key: "retYtd", label: "YTD", minW: 78, align: "center",
        render: (c) => <PctCell val={c.retYtd} />,
      },
      {
        key: "ret1Y",  label: "1Y",  minW: 70, align: "center",
        render: (c) => <PctCell val={c.ret1Y} />,
      },
      {
        key: "ret5Y",  label: "5Y",  minW: 70, align: "center",
        render: (c) => <PctCell val={c.ret5Y} />,
      },
    ],
  },

  // ── Price & Balance (USD) ───────────────────────────────────────────────────
  {
    label:  "Price & Balance (USD)",
    accent: false,
    cols: [
      {
        key: "priceUsd",   label: "Price USD",       minW: 90,  align: "center",
        render: (c) => <NumCell>{formatPrice(c.priceUsd)}</NumCell>,
      },
      {
        key: "mktCapUsd",  label: "Mkt Cap (MM USD)", minW: 124, align: "center",
        render: (c) => <NumCell>{formatNum(c.mktCapUsd, 0)}</NumCell>,
      },
      {
        key: "netDebtUsd", label: "Net Debt (MM)",    minW: 112, align: "center",
        render: (c) => <NumCell>{formatNum(c.netDebtUsd, 0)}</NumCell>,
      },
      {
        key: "evUsd",      label: "EV (MM)",           minW: 100, align: "center",
        render: (c) => <NumCell>{formatNum(c.evUsd, 0)}</NumCell>,
      },
    ],
  },

  // ── Multiples & Ratios ──────────────────────────────────────────────────────
  {
    label:  "Multiples & Ratios",
    accent: true,
    cols: [
      {
        key: "peCurYr",       label: "PE 2026e",           minW: 82,  align: "center",
        render: (c) => <NumCell>{formatMult(c.peCurYr)}</NumCell>,
      },
      {
        key: "peNxtYr",       label: "PE 2027e",           minW: 82,  align: "center",
        render: (c) => <NumCell>{formatMult(c.peNxtYr)}</NumCell>,
      },
      {
        key: "evEbitdaCurYr", label: "EV/EBITDA 2026e",    minW: 128, align: "center",
        render: (c) => <NumCell>{formatMult(c.evEbitdaCurYr)}</NumCell>,
      },
      {
        key: "evEbitdaNxtYr", label: "EV/EBITDA 2027e",    minW: 128, align: "center",
        render: (c) => <NumCell>{formatMult(c.evEbitdaNxtYr)}</NumCell>,
      },
      {
        key: "evSalesCurYr",  label: "EV/Sales 2026e",     minW: 112, align: "center",
        render: (c) => <NumCell>{formatMult(c.evSalesCurYr)}</NumCell>,
      },
      {
        key: "evSalesNxtYr",  label: "EV/Sales 2027e",     minW: 112, align: "center",
        render: (c) => <NumCell>{formatMult(c.evSalesNxtYr)}</NumCell>,
      },
      {
        key: "pBv",           label: "P/BV",               minW: 70,  align: "center",
        render: (c) => <NumCell>{formatMult(c.pBv)}</NumCell>,
      },
      {
        key: "leverage",      label: "Leverage (ND/EBITDA)", minW: 144, align: "center",
        render: (c) => <NumCell>{formatMult(c.leverage)}</NumCell>,
      },
      {
        key: "roeEst",        label: "ROE 2026e (%)",      minW: 106, align: "center",
        render: (c) => <PctCell val={c.roeEst} />,
      },
      {
        key: "divYield",      label: "Div Yield Est (%)",  minW: 116, align: "center",
        render: (c) => <PctCell val={c.divYield} />,
      },
    ],
  },

  // ── Price Target ────────────────────────────────────────────────────────────
  {
    label:  "Price Target",
    accent: false,
    cols: [
      {
        key: "priceLocal",  label: "Price Local",       minW: 100, align: "center",
        render: (c) => <NumCell>{formatPrice(c.priceLocal)}</NumCell>,
      },
      {
        key: "targetPrice", label: "Target Price Local", minW: 130, align: "center",
        render: (c) => <NumCell>{formatPrice(c.targetPrice)}</NumCell>,
      },
      {
        key: "tpUpside",    label: "TP Upside (%)",     minW: 100, align: "center",
        render: (c) => <PctCell val={c.tpUpside} />,
      },
    ],
  },

  // ── NI Quarters Real ────────────────────────────────────────────────────────
  {
    label:  "NI Quarters — Real (Prior Yr)",
    accent: true,
    cols: [
      { key: "niRealQ1", label: "NI Real Q1", minW: 100, align: "center", render: (c) => <NumCell>{formatNum(c.niRealQ1, 1)}</NumCell> },
      { key: "niRealQ2", label: "NI Real Q2", minW: 100, align: "center", render: (c) => <NumCell>{formatNum(c.niRealQ2, 1)}</NumCell> },
      { key: "niRealQ3", label: "NI Real Q3", minW: 100, align: "center", render: (c) => <NumCell>{formatNum(c.niRealQ3, 1)}</NumCell> },
      { key: "niRealQ4", label: "NI Real Q4", minW: 100, align: "center", render: (c) => <NumCell>{formatNum(c.niRealQ4, 1)}</NumCell> },
    ],
  },

  // ── NI Quarters Est ─────────────────────────────────────────────────────────
  {
    label:  "NI Quarters — Est (Current Yr)",
    accent: false,
    cols: [
      { key: "niEstQ1", label: "NI Est Q1", minW: 96, align: "center", render: (c) => <NumCell>{formatNum(c.niEstQ1, 1)}</NumCell> },
      { key: "niEstQ2", label: "NI Est Q2", minW: 96, align: "center", render: (c) => <NumCell>{formatNum(c.niEstQ2, 1)}</NumCell> },
      { key: "niEstQ3", label: "NI Est Q3", minW: 96, align: "center", render: (c) => <NumCell>{formatNum(c.niEstQ3, 1)}</NumCell> },
      { key: "niEstQ4", label: "NI Est Q4", minW: 96, align: "center", render: (c) => <NumCell>{formatNum(c.niEstQ4, 1)}</NumCell> },
    ],
  },

  // ── NI YoY % ────────────────────────────────────────────────────────────────
  {
    label:  "NI YoY %",
    accent: true,
    cols: [
      { key: "niYoyQ1", label: "YoY Q1", minW: 80, align: "center", render: (c) => <PctCell val={c.niYoyQ1} /> },
      { key: "niYoyQ2", label: "YoY Q2", minW: 80, align: "center", render: (c) => <PctCell val={c.niYoyQ2} /> },
      { key: "niYoyQ3", label: "YoY Q3", minW: 80, align: "center", render: (c) => <PctCell val={c.niYoyQ3} /> },
      { key: "niYoyQ4", label: "YoY Q4", minW: 80, align: "center", render: (c) => <PctCell val={c.niYoyQ4} /> },
    ],
  },

  // ── EPS Consensus ───────────────────────────────────────────────────────────
  {
    label:  "EPS Consensus",
    accent: false,
    cols: [
      {
        key: "epsEst",   label: "EPS Est", minW: 80, align: "center",
        render: (c) => <NumCell>{formatPrice(c.epsEst)}</NumCell>,
      },
      { key: "epsRev1W", label: "Rev 1W", minW: 76, align: "center", render: (c) => <PctCell val={c.epsRev1W} /> },
      { key: "epsRev4W", label: "Rev 4W", minW: 76, align: "center", render: (c) => <PctCell val={c.epsRev4W} /> },
      { key: "epsRev3M", label: "Rev 3M", minW: 76, align: "center", render: (c) => <PctCell val={c.epsRev3M} /> },
    ],
  },
];

// Flat column list (all non-sticky columns)
const ALL_COLS: ColDef[] = COL_GROUPS.flatMap((g) => g.cols);

// column key → group accent for body cell shading
const COL_TO_ACCENT = new Map<string, boolean>(
  COL_GROUPS.flatMap((g) => g.cols.map((c) => [c.key, g.accent] as [string, boolean]))
);

// ── Sticky geometry ───────────────────────────────────────────────────────────

const W_COMPANY = 200; // only Company is sticky

// ── Design tokens ─────────────────────────────────────────────────────────────

const BG_HEADER     = "#F1F5F9";
const BG_HEADER_ACC = "#E8EEF9";
const BG_BODY_ODD   = "#FFFFFF";
const BG_BODY_EVEN  = "#F8FAFF";
const BG_BODY_ACC   = "rgba(43,92,224,0.025)";
const BORDER        = "rgba(15,23,42,0.07)";
const STICKY_SHADOW = "3px 0 8px rgba(15,23,42,0.07)";

const TH_BASE: React.CSSProperties = {
  padding:      "6px 10px",
  fontSize:     11,
  fontWeight:   600,
  fontFamily:   "JetBrains Mono, monospace",
  whiteSpace:   "nowrap",
  borderBottom: `1px solid ${BORDER}`,
  borderRight:  `1px solid ${BORDER}`,
  color:        "#475569",
  background:   BG_HEADER,
  cursor:       "pointer",
  userSelect:   "none",
};

const TD_BASE: React.CSSProperties = {
  padding:      "5px 10px",
  fontSize:     12,
  fontFamily:   "JetBrains Mono, monospace",
  whiteSpace:   "nowrap",
  borderBottom: `1px solid ${BORDER}`,
  borderRight:  `1px solid ${BORDER}`,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function LatamTable({
  companies,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
}: LatamTableProps) {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  function handleHeaderClick(key: string) {
    if (sortBy === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
  }

  function SortIndicator({ colKey }: { colKey: string }) {
    if (sortBy !== colKey) return null;
    return (
      <span style={{ fontSize: 9, color: "#2B5CE0", marginLeft: 2 }}>
        {sortOrder === "asc" ? "▲" : "▼"}
      </span>
    );
  }

  return (
    <div
      style={{
        overflowX:    "auto",
        overflowY:    "auto",
        borderRadius: 10,
        border:       `1px solid ${BORDER}`,
        boxShadow:    "0 2px 12px rgba(15,23,42,0.07)",
        background:   BG_BODY_ODD,
        maxHeight:    "calc(100vh - 320px)",
      }}
    >
      <table
        style={{
          borderCollapse: "collapse",
          tableLayout:    "auto",
          minWidth:       "max-content",
        }}
      >
        {/* ── THEAD ─────────────────────────────────────────────────────────── */}
        {/*
          NOTE: position:sticky on <thead> is unreliable across browsers.
          Each <th> must carry its own sticky positioning.
          Row 1 sticks at top:0; Row 2 sticks at top:ROW1_H so it slides under row 1.
        */}
        <thead>

          {/* Row 1 — group labels */}
          <tr>
            {/* Company — sticky both axes (rowSpan=2 covers both header rows) */}
            <th
              rowSpan={2}
              onClick={() => handleHeaderClick("company")}
              style={{
                ...TH_BASE,
                position:      "sticky",
                top:           0,
                left:          0,
                zIndex:        52,
                minWidth:      W_COMPANY,
                maxWidth:      W_COMPANY,
                textAlign:     "left",
                background:    BG_HEADER,
                borderRight:   `2px solid rgba(43,92,224,0.22)`,
                boxShadow:     STICKY_SHADOW,
                verticalAlign: "bottom",
                paddingBottom: 8,
              }}
            >
              Company <SortIndicator colKey="company" />
            </th>

            {/* Group headers — sticky top row */}
            {COL_GROUPS.map((g) => (
              <th
                key={g.label}
                colSpan={g.cols.length}
                style={{
                  ...TH_BASE,
                  position:      "sticky",
                  top:           0,
                  zIndex:        41,
                  textAlign:     "center",
                  background:    g.accent ? BG_HEADER_ACC : BG_HEADER,
                  color:         g.accent ? "#1E40AF" : "#64748B",
                  fontSize:      10,
                  fontWeight:    700,
                  letterSpacing: "0.05em",
                  cursor:        "default",
                  paddingTop:    5,
                  paddingBottom: 5,
                  borderBottom:  `1px solid rgba(43,92,224,0.15)`,
                }}
              >
                {g.label.toUpperCase()}
              </th>
            ))}
          </tr>

          {/* Row 2 — column labels (sticks below row 1) */}
          <tr>
            {ALL_COLS.map((col) => {
              const isActive = sortBy === col.key;
              const accent   = COL_TO_ACCENT.get(col.key) ?? false;
              return (
                <th
                  key={col.key}
                  onClick={() => handleHeaderClick(col.key)}
                  style={{
                    ...TH_BASE,
                    position:  "sticky",
                    top:       28,   // height of row 1 (~28px)
                    zIndex:    41,
                    textAlign: col.align,
                    minWidth:  col.minW,
                    background: isActive
                      ? "rgba(43,92,224,0.12)"
                      : accent
                      ? BG_HEADER_ACC
                      : BG_HEADER,
                    color: isActive ? "#1E3A8A" : "#475569",
                  }}
                >
                  <span
                    style={{
                      display:        "flex",
                      alignItems:     "center",
                      justifyContent: col.align === "left" ? "flex-start" : "center",
                      gap:            2,
                    }}
                  >
                    {col.label}
                    <SortIndicator colKey={col.key} />
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>

        {/* ── TBODY ─────────────────────────────────────────────────────────── */}
        <tbody>
          {companies.length === 0 && (
            <tr>
              <td
                colSpan={1 + ALL_COLS.length}
                style={{
                  ...TD_BASE,
                  textAlign: "center",
                  color:     "#94A3B8",
                  padding:   "36px 16px",
                  fontSize:  13,
                }}
              >
                No companies match your filters
              </td>
            </tr>
          )}

          {companies.map((company, idx) => {
            const isHovered = hoveredRow === idx;
            const baseRowBg = idx % 2 === 0 ? BG_BODY_ODD : BG_BODY_EVEN;
            const rowBg     = isHovered ? "rgba(43,92,224,0.05)" : baseRowBg;
            const stickyBg  = isHovered ? "rgba(43,92,224,0.05)" : baseRowBg;

            return (
              <tr
                key={`${company.ticker}-${idx}`}
                onMouseEnter={() => setHoveredRow(idx)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{ background: rowBg, transition: "background 0.1s" }}
              >
                {/* ── Sticky: Company only ── */}
                <td
                  style={{
                    ...TD_BASE,
                    position:     "sticky",
                    left:         0,
                    zIndex:       20,
                    background:   stickyBg,
                    textAlign:    "left",
                    minWidth:     W_COMPANY,
                    maxWidth:     W_COMPANY,
                    fontWeight:   500,
                    color:        "#0F172A",
                    fontSize:     12,
                    borderRight:  `2px solid rgba(43,92,224,0.15)`,
                    boxShadow:    isHovered ? "3px 0 8px rgba(43,92,224,0.10)" : STICKY_SHADOW,
                    overflow:     "hidden",
                    textOverflow: "ellipsis",
                    transition:   "background 0.1s",
                  }}
                  title={company.company}
                >
                  {company.company}
                </td>

                {/* ── All other columns (scrollable) ── */}
                {ALL_COLS.map((col) => {
                  const isActiveCol = sortBy === col.key;
                  const accent      = COL_TO_ACCENT.get(col.key) ?? false;
                  let cellBg: string | undefined;
                  if (!isHovered && isActiveCol) cellBg = "rgba(43,92,224,0.04)";
                  else if (!isHovered && accent)  cellBg = BG_BODY_ACC;

                  return (
                    <td
                      key={col.key}
                      style={{
                        ...TD_BASE,
                        textAlign:  col.align,
                        background: cellBg,
                      }}
                    >
                      {col.render(company)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
