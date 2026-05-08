"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConsensusCheckPayload, ConsensusCheckRow } from "@/app/api/latam/consensus-check/route";

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
type SortKey =
  | "ticker" | "updateDate" | "upside"
  | "varRev1" | "varRev2" | "varEbitda1" | "varEbitda2" | "varNi1" | "varNi2";

// Maps row-3 column index (0-17) to its SortKey for the Var% section (indices 12-17)
const VAR_YEAR_SORT: (SortKey | null)[] = [
  null, null, null, null, null, null,   // Moneda (0-5)
  null, null, null, null, null, null,   // Consensus (6-11)
  "varRev1", "varRev2",                 // Var Rev (12-13)
  "varEbitda1", "varEbitda2",           // Var EBITDA (14-15)
  "varNi1", "varNi2",                   // Var NI (16-17)
];

const VAR_SORT_KEYS = new Set<SortKey>(["varRev1","varRev2","varEbitda1","varEbitda2","varNi1","varNi2"]);

function getVarValue(row: ConsensusCheckRow, key: SortKey): number | null {
  switch (key) {
    case "varRev1":    return varPct(row.moneda.rev1FY,    row.consensus.rev1FY);
    case "varRev2":    return varPct(row.moneda.rev2FY,    row.consensus.rev2FY);
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
  const [data,           setData]           = useState<ConsensusCheckPayload | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(false);
  const [sortBy,         setSortBy]         = useState<SortKey>("ticker");
  const [sortDir,        setSortDir]        = useState<"asc" | "desc">("asc");
  const [analystFilter,  setAnalystFilter]  = useState("");

  useEffect(() => {
    fetch("/api/latam/consensus-check")
      .then((r) => r.json())
      .then((d: ConsensusCheckPayload & { error?: string }) => {
        if (d.error) { setError(true); } else { setData(d); }
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
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
    router.push(`/companies?ticker=${encodeURIComponent(ticker)}&tab=model`);
  }

  const thProps = { sortBy, sortDir, onSort: handleSort };

  const sections: { label: string; bg: string }[] = [
    { label: "Moneda",    bg: C.HDR_BG  },
    { label: "Consensus", bg: "#1D4ED8" },
    { label: "Var %",     bg: "#4338CA" },
  ];

  return (
    <>
      {/* ── Analyst filter ── */}
      <div style={{ marginBottom: 10 }}>
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
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.BDR}`, boxShadow: "0 1px 6px rgba(15,23,42,0.07)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1200, tableLayout: "auto" }}>
          <thead>
            {/* ── Row 1: section headers ── */}
            <tr>
              <Th level={0} rowSpan={3} sticky stickyLeft={0} sortKey="ticker" {...thProps}>
                Company
              </Th>
              <Th level={0} rowSpan={3} sortKey="updateDate" {...thProps}>Update</Th>
              <Th level={0} rowSpan={3}>Analyst</Th>
              <Th level={0} rowSpan={3} sortKey="upside" {...thProps}>Upside</Th>

              {sections.map((s) => (
                <th
                  key={s.label}
                  colSpan={6}
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

              <Th level={0} rowSpan={3}>Thesis</Th>
            </tr>

            {/* ── Row 2: metric labels ── */}
            <tr>
              {(["moneda", "consensus", "var"] as const).map((k) =>
                (["Revenue", "EBITDA", "NI"] as const).map((m) => (
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

            {/* ── Row 3: year labels (Var% cells 12-17 are sortable) ── */}
            <tr>
              {Array.from({ length: 18 }).map((_, i) => {
                const varKey = VAR_YEAR_SORT[i];
                const isSorted = varKey != null && sortBy === varKey;
                return (
                  <th
                    key={i}
                    onClick={varKey ? () => handleSort(varKey) : undefined}
                    style={{
                      background:  "#F1F5F9",
                      color:       isSorted ? "#4338CA" : "#374151",
                      textAlign:   "center",
                      padding:     "4px 8px",
                      fontWeight:  isSorted ? 700 : 600,
                      fontSize:    10,
                      borderRight: `1px solid ${C.BDR}`,
                      borderBottom: `1px solid ${C.BDR}`,
                      whiteSpace:  "nowrap",
                      fontFamily:  "JetBrains Mono, monospace",
                      cursor:      varKey ? "pointer" : undefined,
                      userSelect:  varKey ? "none" : undefined,
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

                  {/* Update */}
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

                  {/* Moneda */}
                  <NumCell v={row.moneda.rev1FY}    />
                  <NumCell v={row.moneda.rev2FY}    />
                  <NumCell v={row.moneda.ebitda1FY} />
                  <NumCell v={row.moneda.ebitda2FY} />
                  <NumCell v={row.moneda.ni1FY}     />
                  <NumCell v={row.moneda.ni2FY}     />

                  {/* Consensus */}
                  <ConNumCell v={row.consensus.rev1FY}    />
                  <ConNumCell v={row.consensus.rev2FY}    />
                  <ConNumCell v={row.consensus.ebitda1FY} />
                  <ConNumCell v={row.consensus.ebitda2FY} />
                  <ConNumCell v={row.consensus.ni1FY}     />
                  <ConNumCell v={row.consensus.ni2FY}     />

                  {/* Var % */}
                  <VarCell moneda={row.moneda.rev1FY}    consensus={row.consensus.rev1FY}    />
                  <VarCell moneda={row.moneda.rev2FY}    consensus={row.consensus.rev2FY}    />
                  <VarCell moneda={row.moneda.ebitda1FY} consensus={row.consensus.ebitda1FY} />
                  <VarCell moneda={row.moneda.ebitda2FY} consensus={row.consensus.ebitda2FY} />
                  <VarCell moneda={row.moneda.ni1FY}     consensus={row.consensus.ni1FY}     />
                  <VarCell moneda={row.moneda.ni2FY}     consensus={row.consensus.ni2FY}     />

                  {/* Thesis */}
                  <td style={{
                    padding:      "6px 10px",
                    fontSize:     11,
                    fontFamily:   "Inter, sans-serif",
                    color:        row.thesis ? "#374151" : C.NIL_TXT,
                    borderRight:  `1px solid ${C.BDR}`,
                    maxWidth:     220,
                    overflow:     "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace:   "nowrap",
                  }}
                    title={row.thesis ?? undefined}
                  >
                    {row.thesis ?? "—"}
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={23} style={{ textAlign: "center", padding: 32, color: "#94A3B8", fontSize: 13 }}>
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
