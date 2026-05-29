"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import type { ConsensusCheckPayload, ConsensusCheckRow } from "@/app/api/latam/consensus-check/route";
import { downloadExcel } from "@/lib/exportExcel";

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  HDR_BG:  "#1E3A8A",
  HDR_TXT: "#FFFFFF",
  SUB_BG:  "#DBEAFE",
  SUB_TXT: "#1E3A8A",
  BDR:     "#D1D5DB",
  ROW_ALT: "#F8FAFF",
  ROW_HOV: "#EFF6FF",
  POS_BG:  "rgba(22,163,74,0.12)",
  POS_TXT: "#15803D",
  NEG_BG:  "rgba(220,38,38,0.10)",
  NEG_TXT: "#B91C1C",
  NIL_TXT: "#94A3B8",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtNum(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtConNum(v: number | null): string {
  if (v == null) return "—";
  return (v / 1_000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

function fmtUpside(v: number | null): { text: string; color: string } {
  if (v == null) return { text: "—", color: C.NIL_TXT };
  const pct = v * 100;
  return {
    text:  (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%",
    color: pct > 0.1 ? C.POS_TXT : pct < -0.1 ? C.NEG_TXT : "#64748B",
  };
}

function varPct(moneda: number | null, consensusRaw: number | null): number | null {
  if (moneda == null || consensusRaw == null || consensusRaw === 0) return null;
  const consensus = consensusRaw / 1_000;
  return ((moneda - consensus) / Math.abs(consensus)) * 100;
}

function shortTicker(ticker: string): string {
  return ticker.replace(/ Equity$/i, "").trim();
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

// ── Recommendation badge ───────────────────────────────────────────────────────
function ReccBadge({ recc }: { recc: string | null }) {
  if (!recc) return <span style={{ color: C.NIL_TXT, fontSize: 11 }}>—</span>;
  const u     = recc.toUpperCase();
  const isBuy  = u.includes("BUY") || u === "OW";
  const isSell = u.includes("SELL") || u === "UW";
  const color  = isBuy ? "#1D4ED8" : isSell ? "#B91C1C" : "#64748B";
  const bg     = isBuy ? "rgba(29,78,216,0.10)" : isSell ? "rgba(185,28,28,0.10)" : "rgba(100,116,139,0.10)";
  const border = isBuy ? "rgba(29,78,216,0.25)" : isSell ? "rgba(185,28,28,0.25)" : "rgba(100,116,139,0.22)";
  return (
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", padding: "2px 7px", borderRadius: 4, background: bg, color, border: `1px solid ${border}` }}>
      {u}
    </span>
  );
}

// ── Cell components ────────────────────────────────────────────────────────────
function NumCell({ v }: { v: number | null }) {
  return (
    <td style={{
      textAlign:   "right",
      padding:     "5px 10px",
      fontSize:    12,
      fontFamily:  "JetBrains Mono, monospace",
      color:       v == null ? C.NIL_TXT : "#0F172A",
      borderRight: `1px solid ${C.BDR}`,
      whiteSpace:  "nowrap",
    }}>
      {fmtNum(v)}
    </td>
  );
}

function ConNumCell({ v }: { v: number | null }) {
  return (
    <td style={{
      textAlign:   "right",
      padding:     "5px 10px",
      fontSize:    12,
      fontFamily:  "JetBrains Mono, monospace",
      color:       v == null ? C.NIL_TXT : "#0F172A",
      borderRight: `1px solid ${C.BDR}`,
      whiteSpace:  "nowrap",
    }}>
      {fmtConNum(v)}
    </td>
  );
}

function VarCell({ moneda, consensus }: { moneda: number | null; consensus: number | null }) {
  const v   = varPct(moneda, consensus);
  const bg  = v == null ? "transparent" : v > 0 ? C.POS_BG  : v < 0 ? C.NEG_BG  : "transparent";
  const col = v == null ? C.NIL_TXT    : v > 0 ? C.POS_TXT : v < 0 ? C.NEG_TXT : "#475569";
  return (
    <td style={{
      textAlign:   "center",
      padding:     "5px 8px",
      fontSize:    11,
      fontFamily:  "JetBrains Mono, monospace",
      fontWeight:  v != null ? 700 : 400,
      color:       col,
      background:  bg,
      borderRight: `1px solid ${C.BDR}`,
      whiteSpace:  "nowrap",
    }}>
      {fmtPct(v)}
    </td>
  );
}

// ── Th helper ─────────────────────────────────────────────────────────────────
function Th({
  children, rowSpan, colSpan, level, sticky, stickyLeft, sortKey, sortBy, sortDir, onSort,
}: {
  children:    React.ReactNode;
  rowSpan?:    number;
  colSpan?:    number;
  level:       0 | 1 | 2;
  sticky?:     boolean;
  stickyLeft?: number;
  sortKey?:    string;
  sortBy?:     string;
  sortDir?:    "asc" | "desc";
  onSort?:     (key: string) => void;
}) {
  const isSorted  = sortKey != null && sortBy === sortKey;
  const clickable = sortKey != null && onSort != null;
  return (
    <th
      rowSpan={rowSpan}
      colSpan={colSpan}
      onClick={clickable ? () => onSort!(sortKey!) : undefined}
      style={{
        padding:       level === 0 ? "8px 10px" : level === 1 ? "5px 10px" : "4px 8px",
        fontWeight:    level < 2 ? 700 : 600,
        fontSize:      level === 0 ? 11 : 10,
        letterSpacing: level === 0 ? "0.06em" : level === 1 ? "0.04em" : 0,
        textTransform: (level < 2 ? "uppercase" : "none") as React.CSSProperties["textTransform"],
        textAlign:     "center",
        whiteSpace:    "nowrap",
        borderRight:   `1px solid ${level === 0 ? "rgba(255,255,255,0.20)" : C.BDR}`,
        borderBottom:  `1px solid ${C.BDR}`,
        background:    level === 0 ? C.HDR_BG : level === 1 ? C.SUB_BG : "#F1F5F9",
        color:         level === 0 ? C.HDR_TXT : level === 1 ? C.SUB_TXT : "#374151",
        position:      sticky ? "sticky" : undefined,
        left:          stickyLeft != null ? stickyLeft : undefined,
        zIndex:        sticky ? (level === 0 ? 30 : 20) : undefined,
        cursor:        clickable ? "pointer" : undefined,
        userSelect:    clickable ? "none" : undefined,
      }}
    >
      {children}
      {clickable && (
        <span style={{ marginLeft: 4, fontSize: 9, opacity: isSorted ? 1 : 0.35 }}>
          {isSorted ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      )}
    </th>
  );
}

// ── Sorting ────────────────────────────────────────────────────────────────────
// Removed Revenue sort keys — only EBITDA and NI remain
type SortKey =
  | "ticker" | "updateDate" | "upside"
  | "varEbitda1" | "varEbitda2" | "varNi1" | "varNi2";

// 12 data columns: Moneda(4) + Consensus(4) + Var%(4)
// Indices 0-3: Moneda EBITDA1/2, NI1/2  → not sortable
// Indices 4-7: Consensus EBITDA1/2, NI1/2 → not sortable
// Indices 8-11: Var EBITDA1/2, NI1/2 → sortable
const VAR_YEAR_SORT: (SortKey | null)[] = [
  null, null, null, null,          // Moneda (0-3)
  null, null, null, null,          // Consensus (4-7)
  "varEbitda1", "varEbitda2",      // Var EBITDA (8-9)
  "varNi1",     "varNi2",          // Var NI (10-11)
];

const VAR_SORT_KEYS = new Set<SortKey>(["varEbitda1","varEbitda2","varNi1","varNi2"]);

function getVarValue(row: ConsensusCheckRow, key: SortKey): number | null {
  switch (key) {
    case "varEbitda1": return varPct(row.moneda.ebitda1FY, row.consensus.ebitda1FY);
    case "varEbitda2": return varPct(row.moneda.ebitda2FY, row.consensus.ebitda2FY);
    case "varNi1":     return varPct(row.moneda.ni1FY,     row.consensus.ni1FY);
    case "varNi2":     return varPct(row.moneda.ni2FY,     row.consensus.ni2FY);
    default:           return null;
  }
}

function sortRows(rows: ConsensusCheckRow[], by: SortKey, dir: "asc" | "desc"): ConsensusCheckRow[] {
  return [...rows].sort((a, b) => {
    let av: string | number | null;
    let bv: string | number | null;
    if (VAR_SORT_KEYS.has(by)) {
      const va = getVarValue(a, by);
      const vb = getVarValue(b, by);
      av = va != null ? Math.abs(va) : null;
      bv = vb != null ? Math.abs(vb) : null;
    } else {
      switch (by) {
        case "ticker":     av = a.ticker;     bv = b.ticker;     break;
        case "updateDate": av = a.updateDate; bv = b.updateDate; break;
        case "upside":     av = a.upside;     bv = b.upside;     break;
        default:           av = null;         bv = null;
      }
    }
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
    return dir === "asc" ? cmp : -cmp;
  });
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ConsensusCheckTable() {
  const router = useRouter();
  const [data,          setData]          = useState<ConsensusCheckPayload | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(false);
  const [sortBy,        setSortBy]        = useState<SortKey>("ticker");
  const [sortDir,       setSortDir]       = useState<"asc" | "desc">("asc");
  const [analystFilter, setAnalystFilter] = useState("");
  const [validTickers,  setValidTickers]  = useState<Set<string>>(new Set());
  const [notFoundMsg,   setNotFoundMsg]   = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/latam/consensus-check").then((r) => r.json()),
      fetch("/api/companies/list").then((r) => r.json()),
    ]).then(([consensus, companies]: [ConsensusCheckPayload & { error?: string }, { companies?: { ticker: string }[] }]) => {
      if (consensus.error) { setError(true); } else { setData(consensus); }
      setValidTickers(new Set((companies.companies ?? []).map((c) => c.ticker)));
      setLoading(false);
    }).catch(() => { setError(true); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          border: "2px solid rgba(43,92,224,0.15)", borderTopColor: "#2B5CE0",
          animation: "spin 0.8s linear infinite",
        }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#94A3B8", fontSize: 13 }}>
        Failed to load consensus data.
      </div>
    );
  }

  const { rows, year1FY, year2FY } = data;
  const y1 = String(year1FY).slice(2) + "e";
  const y2 = String(year2FY).slice(2) + "e";

  const analysts = Array.from(new Set(rows.map((r) => r.analyst).filter(Boolean) as string[])).sort();

  const sorted   = sortRows(rows, sortBy, sortDir);
  const filtered = analystFilter ? sorted.filter((r) => r.analyst === analystFilter) : sorted;

  function handleSort(key: string) {
    const k = key as SortKey;
    if (sortBy === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(k); setSortDir(VAR_SORT_KEYS.has(k) ? "desc" : "asc"); }
  }

  function handleTickerClick(ticker: string) {
    if (!validTickers.has(ticker)) {
      setNotFoundMsg(ticker);
      return;
    }
    setNotFoundMsg(null);
    router.push(`/companies?ticker=${encodeURIComponent(ticker)}&tab=model`);
  }

  const thProps = { sortBy, sortDir, onSort: handleSort };

  // 3 sections × colSpan 4 (EBITDA + NI only)
  const sections: { label: string; bg: string }[] = [
    { label: "Moneda",    bg: C.HDR_BG  },
    { label: "Consensus", bg: "#1D4ED8" },
    { label: "Var %",     bg: "#4338CA" },
  ];

  return (
    <>
      {/* ── Ticker not found warning ── */}
      {notFoundMsg && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, marginBottom: 10, padding: "9px 14px", borderRadius: 8,
          background: "rgba(217,119,6,0.07)", border: "1px solid rgba(217,119,6,0.28)",
        }}>
          <span style={{ fontSize: 12, color: "#78350F" }}>
            Ticker <strong style={{ fontFamily: "JetBrains Mono, monospace" }}>{notFoundMsg}</strong> was not found in Company Profiles — no deep dive data available.
          </span>
          <button
            onClick={() => setNotFoundMsg(null)}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#92400E", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
          >
            ×
          </button>
        </div>
      )}

      {/* ── Toolbar: analyst filter + download ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <select
          value={analystFilter}
          onChange={(e) => setAnalystFilter(e.target.value)}
          style={{
            padding:     "6px 12px",
            borderRadius: 7,
            border:      "1px solid rgba(15,23,42,0.12)",
            background:  "#F8FAFF",
            color:       analystFilter ? "#0F172A" : "#64748B",
            fontSize:    12,
            fontFamily:  "Inter, sans-serif",
            cursor:      "pointer",
            outline:     "none",
            minWidth:    160,
          }}
        >
          <option value="">All Analysts</option>
          {analysts.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {analystFilter && (
          <span style={{ marginLeft: 10, fontSize: 11, color: "#64748B", fontFamily: "JetBrains Mono, monospace" }}>
            {filtered.length} of {sorted.length}
          </span>
        )}

        {/* Download */}
        <button
          onClick={() => {
            const headers = [
              "Ticker", "Update Date", "Analyst", "Rec", "Upside",
              `Moneda EBITDA ${y1}`, `Moneda EBITDA ${y2}`, `Moneda NI ${y1}`, `Moneda NI ${y2}`,
              `BBG EBITDA ${y1}`,    `BBG EBITDA ${y2}`,    `BBG NI ${y1}`,    `BBG NI ${y2}`,
              `Var EBITDA ${y1}`,    `Var EBITDA ${y2}`,    `Var NI ${y1}`,    `Var NI ${y2}`,
            ];
            const rows = filtered.map((r) => [
              shortTicker(r.ticker), r.updateDate, r.analyst ?? "", r.recc ?? "", r.upside != null ? +(r.upside * 100).toFixed(2) : null,
              r.moneda.ebitda1FY, r.moneda.ebitda2FY, r.moneda.ni1FY, r.moneda.ni2FY,
              r.consensus.ebitda1FY != null ? +(r.consensus.ebitda1FY / 1000).toFixed(1) : null,
              r.consensus.ebitda2FY != null ? +(r.consensus.ebitda2FY / 1000).toFixed(1) : null,
              r.consensus.ni1FY    != null ? +(r.consensus.ni1FY     / 1000).toFixed(1) : null,
              r.consensus.ni2FY    != null ? +(r.consensus.ni2FY     / 1000).toFixed(1) : null,
              varPct(r.moneda.ebitda1FY, r.consensus.ebitda1FY) != null ? +varPct(r.moneda.ebitda1FY, r.consensus.ebitda1FY)!.toFixed(1) : null,
              varPct(r.moneda.ebitda2FY, r.consensus.ebitda2FY) != null ? +varPct(r.moneda.ebitda2FY, r.consensus.ebitda2FY)!.toFixed(1) : null,
              varPct(r.moneda.ni1FY,     r.consensus.ni1FY)     != null ? +varPct(r.moneda.ni1FY,     r.consensus.ni1FY)!.toFixed(1)     : null,
              varPct(r.moneda.ni2FY,     r.consensus.ni2FY)     != null ? +varPct(r.moneda.ni2FY,     r.consensus.ni2FY)!.toFixed(1)     : null,
            ]);
            downloadExcel([{ name: "Estimates vs Consensus", headers, rows }], "latam_estimates_consensus");
          }}
          style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "#059669", background: "rgba(5,150,105,0.07)", border: "1px solid rgba(5,150,105,0.22)", borderRadius: 7, padding: "5px 14px", cursor: "pointer", transition: "all 0.12s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(5,150,105,0.13)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(5,150,105,0.07)"; }}
        >
          <Download size={12} /> Download Excel ({filtered.length})
        </button>
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.BDR}`, boxShadow: "0 1px 6px rgba(15,23,42,0.07)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900, tableLayout: "auto" }}>
          <thead>
            {/* ── Row 1: section headers ── */}
            <tr>
              <Th level={0} rowSpan={3} sticky stickyLeft={0} sortKey="ticker" {...thProps}>
                Company
              </Th>
              <Th level={0} rowSpan={3} sortKey="updateDate" {...thProps}>Update As Of</Th>
              <Th level={0} rowSpan={3}>Analyst</Th>
              <Th level={0} rowSpan={3}>Rec</Th>
              <Th level={0} rowSpan={3} sortKey="upside" {...thProps}>Upside</Th>

              {sections.map((s) => (
                <th
                  key={s.label}
                  colSpan={4}
                  style={{
                    background:    s.bg,
                    color:         "#FFFFFF",
                    textAlign:     "center",
                    padding:       "8px 10px",
                    fontWeight:    700,
                    fontSize:      11,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    borderRight:   "2px solid rgba(255,255,255,0.30)",
                    borderBottom:  `1px solid ${C.BDR}`,
                  }}
                >
                  {s.label}
                </th>
              ))}
            </tr>

            {/* ── Row 2: EBITDA / NI per section ── */}
            <tr>
              {(["moneda", "consensus", "var"] as const).map((k) =>
                (["EBITDA", "NI"] as const).map((m) => (
                  <th
                    key={`${k}_${m}`}
                    colSpan={2}
                    style={{
                      background:    C.SUB_BG,
                      color:         C.SUB_TXT,
                      textAlign:     "center",
                      padding:       "5px 8px",
                      fontWeight:    700,
                      fontSize:      10,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      borderRight:   `1px solid ${C.BDR}`,
                      borderBottom:  `1px solid ${C.BDR}`,
                      whiteSpace:    "nowrap",
                    }}
                  >
                    {m}
                  </th>
                ))
              )}
            </tr>

            {/* ── Row 3: year labels (Var% cols 8-11 are sortable) ── */}
            <tr>
              {Array.from({ length: 12 }).map((_, i) => {
                const varKey  = VAR_YEAR_SORT[i];
                const isSorted = varKey != null && sortBy === varKey;
                return (
                  <th
                    key={i}
                    onClick={varKey ? () => handleSort(varKey) : undefined}
                    style={{
                      background:   "#F1F5F9",
                      color:        isSorted ? "#4338CA" : "#374151",
                      textAlign:    "center",
                      padding:      "4px 8px",
                      fontWeight:   isSorted ? 700 : 600,
                      fontSize:     10,
                      borderRight:  `1px solid ${C.BDR}`,
                      borderBottom: `1px solid ${C.BDR}`,
                      whiteSpace:   "nowrap",
                      fontFamily:   "JetBrains Mono, monospace",
                      cursor:       varKey ? "pointer" : undefined,
                      userSelect:   varKey ? "none" : undefined,
                    }}
                  >
                    {i % 2 === 0 ? y1 : y2}
                    {varKey && (
                      <span style={{ marginLeft: 3, fontSize: 8, opacity: isSorted ? 1 : 0.35 }}>
                        {isSorted ? (sortDir === "desc" ? "▼" : "▲") : "↕"}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {filtered.map((row: ConsensusCheckRow, idx: number) => {
              const upside = fmtUpside(row.upside);
              const rowBg  = idx % 2 === 0 ? "#FFFFFF" : C.ROW_ALT;
              return (
                <tr
                  key={row.ticker}
                  style={{ background: rowBg }}
                  onMouseEnter={(e) => {
                    const tr = e.currentTarget as HTMLTableRowElement;
                    tr.style.background = C.ROW_HOV;
                    (tr.cells[0] as HTMLElement).style.background = C.ROW_HOV;
                  }}
                  onMouseLeave={(e) => {
                    const tr = e.currentTarget as HTMLTableRowElement;
                    tr.style.background = rowBg;
                    (tr.cells[0] as HTMLElement).style.background = rowBg;
                  }}
                >
                  {/* Company */}
                  <td style={{
                    padding:     "6px 12px",
                    fontSize:    12,
                    fontWeight:  700,
                    color:       "#1D4ED8",
                    fontFamily:  "JetBrains Mono, monospace",
                    borderRight: `1px solid ${C.BDR}`,
                    whiteSpace:  "nowrap",
                    position:    "sticky",
                    left:        0,
                    background:  rowBg,
                    zIndex:      10,
                  }}>
                    <span
                      onClick={() => handleTickerClick(row.ticker)}
                      style={{ cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#1E40AF"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = ""; }}
                    >
                      {shortTicker(row.ticker)}
                    </span>
                  </td>

                  {/* Update As Of */}
                  <td style={{
                    padding:     "6px 10px",
                    fontSize:    11,
                    color:       "#64748B",
                    fontFamily:  "JetBrains Mono, monospace",
                    borderRight: `1px solid ${C.BDR}`,
                    whiteSpace:  "nowrap",
                  }}>
                    {fmtDate(row.updateDate)}
                  </td>

                  {/* Analyst */}
                  <td style={{
                    padding:      "6px 10px",
                    fontSize:     11,
                    color:        "#475569",
                    fontFamily:   "Inter, sans-serif",
                    borderRight:  `1px solid ${C.BDR}`,
                    whiteSpace:   "nowrap",
                    maxWidth:     100,
                    overflow:     "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    {row.analyst ?? "—"}
                  </td>

                  {/* Rec */}
                  <td style={{
                    padding:     "6px 10px",
                    textAlign:   "center",
                    borderRight: `1px solid ${C.BDR}`,
                    whiteSpace:  "nowrap",
                  }}>
                    <ReccBadge recc={row.recc} />
                  </td>

                  {/* Upside */}
                  <td style={{
                    padding:     "6px 10px",
                    fontSize:    12,
                    fontFamily:  "JetBrains Mono, monospace",
                    textAlign:   "center",
                    fontWeight:  row.upside != null ? 700 : 400,
                    color:       upside.color,
                    borderRight: `1px solid ${C.BDR}`,
                    whiteSpace:  "nowrap",
                  }}>
                    {upside.text}
                  </td>

                  {/* Moneda: EBITDA, NI */}
                  <NumCell v={row.moneda.ebitda1FY} />
                  <NumCell v={row.moneda.ebitda2FY} />
                  <NumCell v={row.moneda.ni1FY}     />
                  <NumCell v={row.moneda.ni2FY}     />

                  {/* Consensus: EBITDA, NI */}
                  <ConNumCell v={row.consensus.ebitda1FY} />
                  <ConNumCell v={row.consensus.ebitda2FY} />
                  <ConNumCell v={row.consensus.ni1FY}     />
                  <ConNumCell v={row.consensus.ni2FY}     />

                  {/* Var % */}
                  <VarCell moneda={row.moneda.ebitda1FY} consensus={row.consensus.ebitda1FY} />
                  <VarCell moneda={row.moneda.ebitda2FY} consensus={row.consensus.ebitda2FY} />
                  <VarCell moneda={row.moneda.ni1FY}     consensus={row.consensus.ni1FY}     />
                  <VarCell moneda={row.moneda.ni2FY}     consensus={row.consensus.ni2FY}     />
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={17} style={{ textAlign: "center", padding: 32, color: "#94A3B8", fontSize: 13 }}>
                  No model data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
