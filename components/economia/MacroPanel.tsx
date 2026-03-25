"use client";

import { useState } from "react";
import TenYearChart from "./TenYearChart";

const FLAGS: Record<string, string> = {
  Argentina: "🇦🇷",
  Bolivia: "🇧🇴",
  Brazil: "🇧🇷",
  Chile: "🇨🇱",
  Colombia: "🇨🇴",
  Ecuador: "🇪🇨",
  Mexico: "🇲🇽",
  Panama: "🇵🇦",
  Paraguay: "🇵🇾",
  Peru: "🇵🇪",
  China: "🇨🇳",
  "United States": "🇺🇸",
  "European Union": "🇪🇺",
  LATAM: "🌎",
  World: "🌐",
};

// Countries available in historia_10y_fx_maestro.csv
const TENY_COUNTRIES = ["Chile", "Brazil", "Colombia", "Peru", "Mexico", "United States", "China", "European Union"];
const TENY_GROUP_LAST = "United States"; // separator before China / EU

// Geographic order for GDP / Inflation tables
const COUNTRY_GROUPS = [
  { countries: ["Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Ecuador", "Mexico", "Panama", "Paraguay", "Peru"] },
  { countries: ["United States", "China"] },
  { countries: ["European Union", "LATAM", "World"] },
];
const ORDERED_COUNTRIES = COUNTRY_GROUPS.flatMap((g) => g.countries);
const GROUP_LAST = new Set(COUNTRY_GROUPS.map((g) => g.countries[g.countries.length - 1]));

// Policy Rate removed
const METRICS = ["GDP Growth", "Inflation", "10Y Rate"] as const;
type Metric = (typeof METRICS)[number];

function metricColor(metric: Metric, value: number | null): string {
  if (value === null) return "#94A3B8";
  if (metric === "GDP Growth") {
    if (value >= 3) return "#059669";
    if (value >= 2) return "#10B981";
    if (value >= 1) return "#64748B";
    return "#DC2626";
  }
  if (metric === "Inflation") {
    if (value <= 3) return "#059669";
    if (value <= 5) return "#D97706";
    if (value <= 15) return "#EA580C";
    return "#DC2626";
  }
  // 10Y Rate — neutral blue scale
  if (value <= 4) return "#2B5CE0";
  if (value <= 7) return "#1E4ED8";
  if (value <= 12) return "#7C3AED";
  return "#DC2626";
}

function deltaColor(metric: Metric, delta: number | null): string {
  if (delta === null || delta === 0) return "#94A3B8";
  if (metric === "GDP Growth") return delta > 0 ? "#059669" : "#DC2626";
  // Inflation and 10Y Rate: up = bad
  return delta > 0 ? "#DC2626" : "#059669";
}

function fmtVal(v: number | null): string {
  if (v === null) return "—";
  return v.toFixed(1) + "%";
}

interface RevisionRow {
  country: string;
  indicator: string;
  ago2026: number | null;
  current2026: number | null;
  current2027: number | null;
  current2028: number | null;
}

interface TenYearRow {
  Date: string;
  [key: string]: string | number | null;
}

interface Props {
  annual?: unknown[];
  revisions?: RevisionRow[];
  tenYearHistory?: TenYearRow[];
}

export default function MacroPanel({ revisions = [], tenYearHistory = [] }: Props) {
  const [selectedMetric, setSelectedMetric] = useState<Metric>("GDP Growth");
  const [selectedCountry, setSelectedCountry] = useState<string>("Chile");

  const is10Y = selectedMetric === "10Y Rate";

  // ── Full-width revisions table (GDP / Inflation) ─────────────────────────
  const metricRows = revisions.filter(
    (r) =>
      r.indicator === selectedMetric &&
      (r.ago2026 !== null ||
        r.current2026 !== null ||
        r.current2027 !== null ||
        r.current2028 !== null)
  );

  const sortedRows = ORDERED_COUNTRIES.map((c) => metricRows.find((r) => r.country === c)).filter(
    (r): r is RevisionRow => r !== undefined
  );

  // ── 10Y Rate — simplified table rows ─────────────────────────────────────
  const tenYRows = TENY_COUNTRIES.map((country) => {
    const rev = revisions.find(
      (r) => r.country === country && r.indicator === "10Y Rate"
    );
    return {
      country,
      ago2026: rev?.ago2026 ?? null,
      current2026: rev?.current2026 ?? null,
    };
  });

  return (
    <div>
      {/* Metric selector */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className="text-xs font-medium mr-1" style={{ color: "#94A3B8" }}>
          Metric:
        </span>
        {METRICS.map((m) => (
          <button
            key={m}
            onClick={() => setSelectedMetric(m)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: selectedMetric === m ? "rgba(43,92,224,0.10)" : "rgba(15,23,42,0.04)",
              color: selectedMetric === m ? "#2B5CE0" : "#64748B",
              border: `1px solid ${
                selectedMetric === m ? "rgba(43,92,224,0.30)" : "rgba(15,23,42,0.08)"
              }`,
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {/* ── GDP Growth / Inflation — full-width revisions table ────────────── */}
      {!is10Y && (
        <>
          <div className="card" style={{ overflow: "hidden", padding: 0 }}>
            <div
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid rgba(15,23,42,0.07)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{ fontSize: 11, fontWeight: 600, color: "#64748B", letterSpacing: "0.08em" }}
              >
                {selectedMetric.toUpperCase()} — FORECAST REVISIONS
              </span>
              <span style={{ fontSize: 10, color: "#94A3B8" }}>
                Current vs 3 months ago · All figures in %
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F0F4FA" }}>
                    <th style={{ padding: "8px 16px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "#64748B", letterSpacing: "0.08em", width: 190 }}>
                      COUNTRY / REGION
                    </th>
                    <th style={{ padding: "8px 16px", textAlign: "center", fontSize: 10, fontWeight: 600, color: "#94A3B8", letterSpacing: "0.08em" }}>
                      3M AGO (2026)
                    </th>
                    <th style={{ padding: "8px 16px", textAlign: "center", fontSize: 10, fontWeight: 600, color: "#475569", letterSpacing: "0.08em" }}>
                      CURRENT (2026)
                    </th>
                    <th style={{ padding: "8px 16px", textAlign: "center", fontSize: 10, fontWeight: 600, color: "#2B5CE0", letterSpacing: "0.08em" }}>
                      REVISION Δ
                    </th>
                    <th style={{ padding: "8px 16px", textAlign: "center", fontSize: 10, fontWeight: 600, color: "#64748B", letterSpacing: "0.08em" }}>
                      2027e
                    </th>
                    <th style={{ padding: "8px 16px", textAlign: "center", fontSize: 10, fontWeight: 600, color: "#64748B", letterSpacing: "0.08em" }}>
                      2028e
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, i) => {
                    const delta =
                      row.ago2026 !== null && row.current2026 !== null
                        ? row.current2026 - row.ago2026
                        : null;
                    const dColor = deltaColor(selectedMetric, delta);
                    const isGroupLast = GROUP_LAST.has(row.country);
                    const isLastRow = i === sortedRows.length - 1;

                    return (
                      <tr
                        key={row.country}
                        style={{
                          background: i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.02)",
                          borderBottom:
                            isGroupLast && !isLastRow
                              ? "2px solid rgba(15,23,42,0.12)"
                              : "1px solid rgba(15,23,42,0.05)",
                        }}
                      >
                        <td style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 16 }}>{FLAGS[row.country] ?? "🌎"}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>
                              {row.country}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "center", fontFamily: "monospace", fontSize: 13, color: "#94A3B8" }}>
                          {fmtVal(row.ago2026)}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "center", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: metricColor(selectedMetric, row.current2026) }}>
                          {fmtVal(row.current2026)}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "center" }}>
                          {delta !== null ? (
                            <span
                              className="font-mono"
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: dColor,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background:
                                  dColor === "#059669"
                                    ? "rgba(5,150,105,0.08)"
                                    : dColor === "#DC2626"
                                    ? "rgba(220,38,38,0.08)"
                                    : "rgba(148,163,184,0.08)",
                              }}
                            >
                              {delta > 0 ? "+" : ""}{delta.toFixed(2)}pp
                            </span>
                          ) : (
                            <span style={{ color: "#CBD5E1" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "center", fontFamily: "monospace", fontSize: 13, color: metricColor(selectedMetric, row.current2027) }}>
                          {fmtVal(row.current2027)}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "center", fontFamily: "monospace", fontSize: 13, color: metricColor(selectedMetric, row.current2028) }}>
                          {fmtVal(row.current2028)}
                        </td>
                      </tr>
                    );
                  })}
                  {sortedRows.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: "#94A3B8" }}>
                        No data available for {selectedMetric}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end mt-2">
            <span className="text-xs" style={{ color: "#CBD5E1" }}>Fuente: Bloomberg</span>
          </div>
        </>
      )}

      {/* ── 10Y Rate — split layout: simplified table + twin-axis chart ─────── */}
      {is10Y && (
        <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 2fr" }}>
          {/* Left: simplified table */}
          <div className="card" style={{ overflow: "hidden", padding: 0, alignSelf: "start" }}>
            <div
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid rgba(15,23,42,0.07)",
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B", letterSpacing: "0.08em" }}>
                10Y RATE — REVISIONS
              </span>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F0F4FA" }}>
                  <th style={{ padding: "8px 16px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "#64748B", letterSpacing: "0.08em" }}>
                    COUNTRY
                  </th>
                  <th style={{ padding: "8px 16px", textAlign: "center", fontSize: 10, fontWeight: 600, color: "#94A3B8", letterSpacing: "0.08em" }}>
                    3M AGO
                  </th>
                  <th style={{ padding: "8px 16px", textAlign: "center", fontSize: 10, fontWeight: 600, color: "#475569", letterSpacing: "0.08em" }}>
                    CURRENT
                  </th>
                </tr>
              </thead>
              <tbody>
                {tenYRows.map((row, i) => {
                  const isActive = selectedCountry === row.country;
                  const isGroupSep = row.country === TENY_GROUP_LAST;
                  const isLast = i === tenYRows.length - 1;

                  return (
                    <tr
                      key={row.country}
                      onClick={() => setSelectedCountry(row.country)}
                      style={{
                        cursor: "pointer",
                        background: isActive ? "rgba(43,92,224,0.06)" : "transparent",
                        borderBottom:
                          isGroupSep && !isLast
                            ? "2px solid rgba(15,23,42,0.12)"
                            : "1px solid rgba(15,23,42,0.05)",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive)
                          (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.03)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive)
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <td style={{ padding: "10px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {isActive && (
                            <span
                              style={{
                                width: 6, height: 6, borderRadius: "50%",
                                background: "#2B5CE0", flexShrink: 0,
                              }}
                            />
                          )}
                          <span style={{ fontSize: 16 }}>{FLAGS[row.country] ?? "🌎"}</span>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: isActive ? "#1E3A8A" : "#334155",
                            }}
                          >
                            {row.country}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "center", fontFamily: "monospace", fontSize: 13, color: "#94A3B8" }}>
                        {fmtVal(row.ago2026)}
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "center", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: metricColor("10Y Rate", row.current2026) }}>
                        {fmtVal(row.current2026)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="flex justify-end px-4 py-2">
              <span className="text-xs" style={{ color: "#CBD5E1" }}>Fuente: Bloomberg</span>
            </div>
          </div>

          {/* Right: twin-axis chart */}
          <TenYearChart history={tenYearHistory} country={selectedCountry} />
        </div>
      )}
    </div>
  );
}
