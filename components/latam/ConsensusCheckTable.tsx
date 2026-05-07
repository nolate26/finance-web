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
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000)     return (v / 1_000).toFixed(1) + "K";
  return v.toFixed(1);
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

function varPct(moneda: number | null, consensus: number | null): number | null {
  if (moneda == null || consensus == null || consensus === 0) return null;
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
      textAlign:  "right",
      padding:    "5px 10px",
      fontSize:   12,
      fontFamily: "JetBrains Mono, monospace",
      color:      v == null ? C.NIL_TXT : "#0F172A",
      borderRight: `1px solid ${C.BDR}`,
      whiteSpace: "nowrap",
    }}>
      {fmtNum(v)}
    </td>
  );
}

function VarCell({ moneda, consensus }: { moneda: number | null; consensus: number | null }) {
  const v = varPct(moneda, consensus);
  const bg  = v == null ? "transparent" : v > 0 ? C.POS_BG  : v < 0 ? C.NEG_BG  : "transparent";
  const col = v == null ? C.NIL_TXT    : v > 0 ? C.POS_TXT : v < 0 ? C.NEG_TXT : "#475569";
  return (
    <td style={{
      textAlign:  "center",
      padding:    "5px 8px",
      fontSize:   11,
      fontFamily: "JetBrains Mono, monospace",
      fontWeight: v != null ? 700 : 400,
      color:      col,
      background: bg,
      borderRight: `1px solid ${C.BDR}`,
      whiteSpace: "nowrap",
    }}>
      {fmtPct(v)}
    </td>
  );
}

// ── Header helpers ─────────────────────────────────────────────────────────────
function Th({
  children, rowSpan, colSpan, level, sticky, stickyLeft,
}: {
  children: React.ReactNode;
  rowSpan?: number;
  colSpan?: number;
  level:    0 | 1 | 2;
  sticky?:  boolean;
  stickyLeft?: number;
}) {
  const styles: React.CSSProperties = {
    padding:     level === 0 ? "8px 10px" : level === 1 ? "5px 10px" : "4px 8px",
    fontWeight:  level < 2 ? 700 : 600,
    fontSize:    level === 0 ? 11 : 10,
    letterSpacing: level === 0 ? "0.06em" : level === 1 ? "0.04em" : 0,
    textTransform: (level < 2 ? "uppercase" : "none") as React.CSSProperties["textTransform"],
    textAlign:   "center",
    whiteSpace:  "nowrap",
    borderRight: `1px solid ${level === 0 ? "rgba(255,255,255,0.20)" : C.BDR}`,
    borderBottom: `1px solid ${C.BDR}`,
    background:  level === 0 ? C.HDR_BG : level === 1 ? C.SUB_BG : "#F1F5F9",
    color:       level === 0 ? C.HDR_TXT : level === 1 ? C.SUB_TXT : "#374151",
    position:    sticky ? "sticky" : undefined,
    left:        stickyLeft != null ? stickyLeft : undefined,
    zIndex:      sticky ? (level === 0 ? 30 : 20) : undefined,
  };
  return (
    <th rowSpan={rowSpan} colSpan={colSpan} style={styles}>
      {children}
    </th>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ConsensusCheckTable() {
  const router = useRouter();
  const [data,    setData]    = useState<ConsensusCheckPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

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

  const sections: { label: string; bg: string; key: "moneda" | "consensus" | "var" }[] = [
    { label: "Moneda",    bg: C.HDR_BG,  key: "moneda"    },
    { label: "Consensus", bg: "#1D4ED8", key: "consensus" },
    { label: "Var %",     bg: "#4338CA", key: "var"       },
  ];

  function handleTickerClick(ticker: string) {
    router.push(`/companies?ticker=${encodeURIComponent(ticker)}&tab=model`);
  }

  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.BDR}`, boxShadow: "0 1px 6px rgba(15,23,42,0.07)" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1080, tableLayout: "auto" }}>
        <thead>
          {/* ── Row 1: section headers ── */}
          <tr>
            <Th level={0} rowSpan={3} sticky stickyLeft={0} colSpan={1}>
              Company
            </Th>
            <Th level={0} rowSpan={3}>Update</Th>
            <Th level={0} rowSpan={3}>Analyst</Th>

            {sections.map((s) => (
              <th
                key={s.key}
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
          </tr>

          {/* ── Row 2: metric labels ── */}
          <tr>
            {(["moneda", "consensus", "var"] as const).map((k) =>
              (["Revenue", "EBITDA", "NI"] as const).map((m) => (
                <th
                  key={`${k}_${m}`}
                  colSpan={2}
                  style={{
                    background:  C.SUB_BG,
                    color:       C.SUB_TXT,
                    textAlign:   "center",
                    padding:     "5px 8px",
                    fontWeight:  700,
                    fontSize:    10,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    borderRight: `1px solid ${C.BDR}`,
                    borderBottom: `1px solid ${C.BDR}`,
                    whiteSpace:  "nowrap",
                  }}
                >
                  {m}
                </th>
              ))
            )}
          </tr>

          {/* ── Row 3: year labels ── */}
          <tr>
            {Array.from({ length: 18 }).map((_, i) => (
              <th
                key={i}
                style={{
                  background:  "#F1F5F9",
                  color:       "#374151",
                  textAlign:   "center",
                  padding:     "4px 8px",
                  fontWeight:  600,
                  fontSize:    10,
                  borderRight: `1px solid ${C.BDR}`,
                  borderBottom: `1px solid ${C.BDR}`,
                  whiteSpace:  "nowrap",
                  fontFamily:  "JetBrains Mono, monospace",
                }}
              >
                {i % 2 === 0 ? y1 : y2}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row: ConsensusCheckRow, idx: number) => (
            <tr
              key={row.ticker}
              style={{ background: idx % 2 === 0 ? "#FFFFFF" : C.ROW_ALT }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = C.ROW_HOV; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? "#FFFFFF" : C.ROW_ALT; }}
            >
              {/* Company ticker — clickable */}
              <td style={{
                padding:    "6px 12px",
                fontSize:   12,
                fontWeight: 700,
                color:      "#1D4ED8",
                fontFamily: "JetBrains Mono, monospace",
                borderRight: `1px solid ${C.BDR}`,
                whiteSpace: "nowrap",
                position:   "sticky",
                left:       0,
                background: "inherit",
                zIndex:     10,
              }}>
                <span
                  onClick={() => handleTickerClick(row.ticker)}
                  style={{
                    cursor:          "pointer",
                    textDecoration:  "underline",
                    textUnderlineOffset: 3,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#1E40AF"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = ""; }}
                >
                  {shortTicker(row.ticker)}
                </span>
              </td>

              {/* Update date */}
              <td style={{
                padding:    "6px 10px",
                fontSize:   11,
                color:      "#64748B",
                fontFamily: "JetBrains Mono, monospace",
                borderRight: `1px solid ${C.BDR}`,
                whiteSpace: "nowrap",
              }}>
                {fmtDate(row.updateDate)}
              </td>

              {/* Analyst */}
              <td style={{
                padding:    "6px 10px",
                fontSize:   11,
                color:      "#475569",
                fontFamily: "Inter, sans-serif",
                borderRight: `1px solid ${C.BDR}`,
                whiteSpace: "nowrap",
                maxWidth:   100,
                overflow:   "hidden",
                textOverflow: "ellipsis",
              }}>
                {row.analyst ?? "—"}
              </td>

              {/* Moneda */}
              <NumCell v={row.moneda.rev1FY}    />
              <NumCell v={row.moneda.rev2FY}    />
              <NumCell v={row.moneda.ebitda1FY} />
              <NumCell v={row.moneda.ebitda2FY} />
              <NumCell v={row.moneda.ni1FY}     />
              <NumCell v={row.moneda.ni2FY}     />

              {/* Consensus */}
              <NumCell v={row.consensus.rev1FY}    />
              <NumCell v={row.consensus.rev2FY}    />
              <NumCell v={row.consensus.ebitda1FY} />
              <NumCell v={row.consensus.ebitda2FY} />
              <NumCell v={row.consensus.ni1FY}     />
              <NumCell v={row.consensus.ni2FY}     />

              {/* Var % */}
              <VarCell moneda={row.moneda.rev1FY}    consensus={row.consensus.rev1FY}    />
              <VarCell moneda={row.moneda.rev2FY}    consensus={row.consensus.rev2FY}    />
              <VarCell moneda={row.moneda.ebitda1FY} consensus={row.consensus.ebitda1FY} />
              <VarCell moneda={row.moneda.ebitda2FY} consensus={row.consensus.ebitda2FY} />
              <VarCell moneda={row.moneda.ni1FY}     consensus={row.consensus.ni1FY}     />
              <VarCell moneda={row.moneda.ni2FY}     consensus={row.consensus.ni2FY}     />
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan={21} style={{ textAlign: "center", padding: 32, color: "#94A3B8", fontSize: 13 }}>
                No model data available.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
