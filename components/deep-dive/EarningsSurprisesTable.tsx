"use client";

import type { EarningsSurpriseRow } from "@/app/api/companies/[ticker]/earnings-surprises/route";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPct(v: number | null, dec = 1): React.ReactNode {
  if (v === null) return <span style={{ color: "#CBD5E1", fontSize: 10, fontStyle: "italic" }}>NR</span>;
  const pct = v * 100;
  const color = pct > 0 ? "#059669" : pct < 0 ? "#DC2626" : "#64748B";
  return (
    <span style={{ color, fontWeight: 700 }}>
      {pct > 0 ? "+" : ""}{pct.toFixed(dec)}%
    </span>
  );
}

function fmtBeatMiss(v: number | null): React.ReactNode {
  if (v === null) return <span style={{ color: "#CBD5E1", fontSize: 10, fontStyle: "italic" }}>NR</span>;
  const pct = v * 100;
  const pos = pct > 0;
  const zero = pct === 0;
  const color  = zero ? "#64748B" : pos ? "#059669" : "#DC2626";
  const bg     = zero ? "transparent" : pos ? "rgba(5,150,105,0.09)" : "rgba(220,38,38,0.09)";
  const border = zero ? "transparent" : pos ? "rgba(5,150,105,0.25)" : "rgba(220,38,38,0.25)";
  return (
    <span style={{
      color,
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 4,
      padding: "2px 6px",
      fontWeight: 800,
      fontSize: 11,
      whiteSpace: "nowrap",
    }}>
      {pos ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

// ── Column header helpers ─────────────────────────────────────────────────────

interface GroupHeaderProps {
  label: string;
  accent: string;
  span: number;
}

function GroupHeader({ label, accent, span }: GroupHeaderProps) {
  return (
    <th
      colSpan={span}
      style={{
        padding: "6px 10px",
        textAlign: "center",
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        color: accent,
        background: `${accent}10`,
        borderBottom: `2px solid ${accent}30`,
        borderRight: "1px solid rgba(15,23,42,0.08)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </th>
  );
}

function ColHead({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      padding: "5px 10px",
      textAlign: "center",
      fontSize: 9,
      fontWeight: 600,
      letterSpacing: "0.07em",
      textTransform: "uppercase",
      color: "#94A3B8",
      background: "#F8FAFC",
      borderBottom: "1px solid rgba(15,23,42,0.08)",
      whiteSpace: "nowrap",
    }}>
      {children}
    </th>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  data: EarningsSurpriseRow[];
  ticker: string;
}

export default function EarningsSurprisesTable({ data, ticker }: Props) {
  if (data.length === 0) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 10, padding: "60px 0", color: "#94A3B8",
      }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="17" stroke="#E2E8F0" strokeWidth="2" />
          <path d="M13 20h14M20 13v14" stroke="#CBD5E1" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#64748B" }}>No earnings data for {ticker}</div>
        <div style={{ fontSize: 11, color: "#CBD5E1" }}>Data will appear once Bloomberg records are uploaded</div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          {/* ── Group row ── */}
          <tr>
            <th
              colSpan={2}
              style={{
                padding: "6px 14px",
                background: "#F0F4FA",
                borderBottom: "1px solid rgba(15,23,42,0.08)",
                borderRight: "1px solid rgba(15,23,42,0.08)",
              }}
            />
            <GroupHeader label="Revenue" accent="#2B5CE0" span={3} />
            <GroupHeader label="EBITDA"  accent="#7C3AED" span={3} />
            <GroupHeader label="Net Income" accent="#D97706" span={3} />
          </tr>

          {/* ── Sub-header row ── */}
          <tr>
            <th style={{ padding: "5px 14px", textAlign: "left", fontSize: 9, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94A3B8", background: "#F8FAFC", borderBottom: "1px solid rgba(15,23,42,0.08)", whiteSpace: "nowrap" }}>
              Quarter
            </th>
            <th style={{ padding: "5px 14px", textAlign: "left", fontSize: 9, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94A3B8", background: "#F8FAFC", borderBottom: "1px solid rgba(15,23,42,0.08)", borderRight: "1px solid rgba(15,23,42,0.08)", whiteSpace: "nowrap" }}>
              Report Date
            </th>
            <ColHead>Beat/Miss</ColHead>
            <ColHead>YoY</ColHead>
            <th style={{ padding: "5px 10px", textAlign: "center", fontSize: 9, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94A3B8", background: "#F8FAFC", borderBottom: "1px solid rgba(15,23,42,0.08)", borderRight: "1px solid rgba(15,23,42,0.08)", whiteSpace: "nowrap" }}>QoQ</th>
            <ColHead>Beat/Miss</ColHead>
            <ColHead>YoY</ColHead>
            <th style={{ padding: "5px 10px", textAlign: "center", fontSize: 9, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94A3B8", background: "#F8FAFC", borderBottom: "1px solid rgba(15,23,42,0.08)", borderRight: "1px solid rgba(15,23,42,0.08)", whiteSpace: "nowrap" }}>QoQ</th>
            <ColHead>Beat/Miss</ColHead>
            <ColHead>YoY</ColHead>
            <ColHead>QoQ</ColHead>
          </tr>
        </thead>

        <tbody>
          {data.map((row, i) => (
            <tr
              key={row.quarter}
              style={{
                background: i % 2 === 0 ? "#FFFFFF" : "rgba(15,23,42,0.018)",
                borderBottom: "1px solid rgba(15,23,42,0.05)",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.04)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "#FFFFFF" : "rgba(15,23,42,0.018)"; }}
            >
              {/* Quarter */}
              <td style={{ padding: "9px 14px", whiteSpace: "nowrap" }}>
                <span style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#0F172A",
                  background: "rgba(15,23,42,0.05)",
                  borderRadius: 5,
                  padding: "2px 8px",
                  letterSpacing: "0.04em",
                }}>
                  {row.quarter}
                </span>
              </td>

              {/* Report Date */}
              <td style={{ padding: "9px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#64748B", whiteSpace: "nowrap", borderRight: "1px solid rgba(15,23,42,0.06)" }}>
                {row.reportDate}
              </td>

              {/* Revenue */}
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: "JetBrains Mono, monospace" }}>
                {fmtBeatMiss(row.revBeatMiss)}
              </td>
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: "JetBrains Mono, monospace" }}>
                {fmtPct(row.revYoy)}
              </td>
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: "JetBrains Mono, monospace", borderRight: "1px solid rgba(15,23,42,0.06)" }}>
                {fmtPct(row.revQoq)}
              </td>

              {/* EBITDA */}
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: "JetBrains Mono, monospace" }}>
                {fmtBeatMiss(row.ebitdaBeatMiss)}
              </td>
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: "JetBrains Mono, monospace" }}>
                {fmtPct(row.ebitdaYoy)}
              </td>
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: "JetBrains Mono, monospace", borderRight: "1px solid rgba(15,23,42,0.06)" }}>
                {fmtPct(row.ebitdaQoq)}
              </td>

              {/* Net Income */}
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: "JetBrains Mono, monospace" }}>
                {fmtBeatMiss(row.niBeatMiss)}
              </td>
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: "JetBrains Mono, monospace" }}>
                {fmtPct(row.niYoy)}
              </td>
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: "JetBrains Mono, monospace" }}>
                {fmtPct(row.niQoq)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderTop: "1px solid rgba(15,23,42,0.06)" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <LegendItem color="#059669" label="Beat / Positive" />
          <LegendItem color="#DC2626" label="Miss / Negative" />
          <span style={{ fontSize: 10, color: "#CBD5E1", fontStyle: "italic" }}>NR = Not Reported</span>
        </div>
        <span style={{ fontSize: 10, color: "#CBD5E1" }}>Fuente: Bloomberg</span>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, opacity: 0.8, flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: "#94A3B8" }}>{label}</span>
    </div>
  );
}
