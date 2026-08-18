"use client";

import type { EarningsSurpriseRow } from "@/app/api/companies/[ticker]/earnings-surprises/route";
import { PATRIA, FONT_SECONDARY } from "@/lib/patriaTheme";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPct(v: number | null, dec = 1): React.ReactNode {
  if (v === null) return <span style={{ color: "rgba(13,13,56,0.28)", fontSize: 10, fontStyle: "italic" }}>NR</span>;
  const pct = v * 100;
  const color = pct > 0 ? "#001EAF" : pct < 0 ? "#F8485E" : "rgba(13,13,56,0.62)";
  return (
    <span style={{ color, fontWeight: 700 }}>
      {pct > 0 ? "+" : ""}{pct.toFixed(dec)}%
    </span>
  );
}

function fmtBeatMiss(v: number | null): React.ReactNode {
  if (v === null) return <span style={{ color: "rgba(13,13,56,0.28)", fontSize: 10, fontStyle: "italic" }}>NR</span>;
  const pct = v * 100;
  const pos = pct > 0;
  const zero = pct === 0;
  const color  = zero ? "rgba(13,13,56,0.62)" : pos ? "#001EAF" : "#F8485E";
  const bg     = zero ? "transparent" : pos ? "rgba(0,30,175,0.09)" : "rgba(248,72,94,0.09)";
  const border = zero ? "transparent" : pos ? "rgba(0,30,175,0.25)" : "rgba(248,72,94,0.25)";
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
        color: PATRIA.white,
        fontFamily: FONT_SECONDARY,
        background: PATRIA.kingBlue,
        borderBottom: `3px solid ${accent}`,
        borderRight: "1px solid rgba(13,13,56,0.08)",
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
      fontWeight: 700,
      letterSpacing: "0.07em",
      textTransform: "uppercase",
      color: PATRIA.kingBlue,
      fontFamily: FONT_SECONDARY,
      background: "#F5F7FD",
      borderBottom: "1px solid rgba(13,13,56,0.08)",
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
        justifyContent: "center", gap: 10, padding: "60px 0", color: "rgba(13,13,56,0.45)",
      }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="17" stroke="rgba(13,13,56,0.10)" strokeWidth="2" />
          <path d="M13 20h14M20 13v14" stroke="rgba(13,13,56,0.28)" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(13,13,56,0.62)" }}>No earnings data for {ticker}</div>
        <div style={{ fontSize: 11, color: "rgba(13,13,56,0.28)" }}>Data will appear once Bloomberg records are uploaded</div>
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
                background: "#F5F7FD",
                borderBottom: "1px solid rgba(13,13,56,0.08)",
                borderRight: "1px solid rgba(13,13,56,0.08)",
              }}
            />
            <GroupHeader label="Revenue"    accent={PATRIA.skyBlue}       span={3} />
            <GroupHeader label="EBITDA"     accent={PATRIA.turquoise}     span={3} />
            <GroupHeader label="Net Income" accent={PATRIA.lightOrange}   span={3} />
          </tr>

          {/* ── Sub-header row ── */}
          <tr>
            <th style={{ padding: "5px 14px", textAlign: "left", fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: PATRIA.kingBlue, fontFamily: FONT_SECONDARY, background: "#F5F7FD", borderBottom: "1px solid rgba(13,13,56,0.08)", whiteSpace: "nowrap" }}>
              Quarter
            </th>
            <th style={{ padding: "5px 14px", textAlign: "left", fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: PATRIA.kingBlue, fontFamily: FONT_SECONDARY, background: "#F5F7FD", borderBottom: "1px solid rgba(13,13,56,0.08)", borderRight: "1px solid rgba(13,13,56,0.08)", whiteSpace: "nowrap" }}>
              Report Date
            </th>
            <ColHead>Beat/Miss</ColHead>
            <ColHead>YoY</ColHead>
            <th style={{ padding: "5px 10px", textAlign: "center", fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: PATRIA.kingBlue, fontFamily: FONT_SECONDARY, background: "#F5F7FD", borderBottom: "1px solid rgba(13,13,56,0.08)", borderRight: "1px solid rgba(13,13,56,0.08)", whiteSpace: "nowrap" }}>QoQ</th>
            <ColHead>Beat/Miss</ColHead>
            <ColHead>YoY</ColHead>
            <th style={{ padding: "5px 10px", textAlign: "center", fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: PATRIA.kingBlue, fontFamily: FONT_SECONDARY, background: "#F5F7FD", borderBottom: "1px solid rgba(13,13,56,0.08)", borderRight: "1px solid rgba(13,13,56,0.08)", whiteSpace: "nowrap" }}>QoQ</th>
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
                background: i % 2 === 0 ? "#FFFFFF" : "rgba(13,13,56,0.018)",
                borderBottom: "1px solid rgba(13,13,56,0.05)",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.04)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "#FFFFFF" : "rgba(13,13,56,0.018)"; }}
            >
              {/* Quarter */}
              <td style={{ padding: "9px 14px", whiteSpace: "nowrap" }}>
                <span style={{
                  fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
                  fontSize: 12,
                  fontWeight: 700,
                  color: PATRIA.kingBlue,
                  background: "rgba(32,68,220,0.08)",
                  borderRadius: 5,
                  padding: "2px 8px",
                  letterSpacing: "0.04em",
                }}>
                  {row.quarter}
                </span>
              </td>

              {/* Report Date */}
              <td style={{ padding: "9px 14px", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", fontSize: 11, color: "rgba(13,13,56,0.62)", whiteSpace: "nowrap", borderRight: "1px solid rgba(13,13,56,0.06)" }}>
                {row.reportDate}
              </td>

              {/* Revenue */}
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                {fmtBeatMiss(row.revBeatMiss)}
              </td>
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                {fmtPct(row.revYoy)}
              </td>
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", borderRight: "1px solid rgba(13,13,56,0.06)" }}>
                {fmtPct(row.revQoq)}
              </td>

              {/* EBITDA */}
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                {fmtBeatMiss(row.ebitdaBeatMiss)}
              </td>
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                {fmtPct(row.ebitdaYoy)}
              </td>
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", borderRight: "1px solid rgba(13,13,56,0.06)" }}>
                {fmtPct(row.ebitdaQoq)}
              </td>

              {/* Net Income */}
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                {fmtBeatMiss(row.niBeatMiss)}
              </td>
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                {fmtPct(row.niYoy)}
              </td>
              <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                {fmtPct(row.niQoq)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderTop: "1px solid rgba(13,13,56,0.06)" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <LegendItem color="#001EAF" label="Beat / Positive" />
          <LegendItem color="#F8485E" label="Miss / Negative" />
          <span style={{ fontSize: 10, color: "rgba(13,13,56,0.28)", fontStyle: "italic" }}>NR = Not Reported</span>
        </div>
        <span style={{ fontSize: 10, color: "rgba(13,13,56,0.28)" }}>Fuente: Bloomberg</span>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, opacity: 0.8, flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: "rgba(13,13,56,0.45)" }}>{label}</span>
    </div>
  );
}
