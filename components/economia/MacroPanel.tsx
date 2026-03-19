"use client";

import { useState } from "react";

const FLAGS: Record<string, string> = {
  Brazil: "🇧🇷",
  Chile: "🇨🇱",
  Colombia: "🇨🇴",
  Mexico: "🇲🇽",
  Peru: "🇵🇪",
  Argentina: "🇦🇷",
};

const METRICS = ["GDP Growth", "Inflation", "Policy Rate", "10Y Rate"] as const;
type Metric = (typeof METRICS)[number];

const YEARS = ["2025", "2026", "2027", "2028"] as const;

// Color scale for each metric
function metricColor(metric: Metric, value: number | null): string {
  if (value === null) return "#2D3E6E";
  if (metric === "GDP Growth") {
    if (value >= 3) return "#10B981";
    if (value >= 2) return "#34D399";
    if (value >= 1) return "#94A3B8";
    return "#EF4444";
  }
  if (metric === "Inflation") {
    if (value <= 3) return "#10B981";
    if (value <= 5) return "#F59E0B";
    if (value <= 15) return "#F97316";
    return "#EF4444";
  }
  // Policy Rate / 10Y Rate — neutral scale
  if (value <= 4) return "#5080FF";
  if (value <= 7) return "#2B5CE0";
  if (value <= 12) return "#8B5CF6";
  return "#EF4444";
}

function fmtVal(v: number | null, metric: Metric): string {
  if (v === null) return "—";
  return v.toFixed(1) + "%";
}

interface AnnualRow {
  country: string;
  metric: string;
  [year: string]: number | null | string;
}

interface Props {
  annual: AnnualRow[];
}

export default function MacroPanel({ annual }: Props) {
  const [selectedMetric, setSelectedMetric] = useState<Metric>("GDP Growth");

  const countries = [...new Set(annual.map((r) => r.country))].filter(Boolean);

  // Get value for a country/metric/year
  function getVal(country: string, metric: string, year: string): number | null {
    const row = annual.find((r) => r.country === country && r.metric === metric);
    if (!row) return null;
    const v = row[year];
    return typeof v === "number" ? v : null;
  }

  // Country card: show 2025 and 2026 for the selected metric
  const cardRows = countries.map((c) => ({
    country: c,
    v2025: getVal(c, selectedMetric, "2025"),
    v2026: getVal(c, selectedMetric, "2026"),
    gdp: getVal(c, "GDP Growth", "2026"),
    infl: getVal(c, "Inflation", "2026"),
    rate: getVal(c, "Policy Rate", "2025"),
  }));

  return (
    <div>
      {/* Metric selector */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className="text-xs font-medium mr-1" style={{ color: "#2D3E6E" }}>
          Metric:
        </span>
        {METRICS.map((m) => (
          <button
            key={m}
            onClick={() => setSelectedMetric(m)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background:
                selectedMetric === m
                  ? "rgba(43,92,224,0.18)"
                  : "rgba(255,255,255,0.04)",
              color: selectedMetric === m ? "#6699FF" : "#64748B",
              border: `1px solid ${
                selectedMetric === m
                  ? "rgba(43,92,224,0.4)"
                  : "rgba(255,255,255,0.07)"
              }`,
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Country cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 10,
          marginBottom: 20,
        }}
      >
        {cardRows.map(({ country, v2025, v2026 }) => {
          const color26 = metricColor(selectedMetric, v2026);
          return (
            <div
              key={country}
              className="card"
              style={{ padding: "14px 16px" }}
            >
              <div
                style={{
                  fontSize: 18,
                  marginBottom: 6,
                  lineHeight: 1,
                }}
              >
                {FLAGS[country] ?? "🌎"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#94A3B8",
                  marginBottom: 8,
                  letterSpacing: "0.05em",
                }}
              >
                {country.toUpperCase()}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#475569",
                  marginBottom: 2,
                }}
              >
                2025
              </div>
              <div
                className="font-mono"
                style={{ fontSize: 16, fontWeight: 700, color: "#EEF2FF", marginBottom: 6 }}
              >
                {fmtVal(v2025, selectedMetric)}
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 2 }}>
                2026e
              </div>
              <div
                className="font-mono"
                style={{ fontSize: 16, fontWeight: 700, color: color26 }}
              >
                {fmtVal(v2026, selectedMetric)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Projection table */}
      <div
        className="card"
        style={{ overflow: "hidden", padding: 0 }}
      >
        {/* Table header */}
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid rgba(43,92,224,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{ fontSize: 11, fontWeight: 600, color: "#64748B", letterSpacing: "0.08em" }}
          >
            {selectedMetric.toUpperCase()} PROJECTIONS
          </span>
          <span style={{ fontSize: 10, color: "#2D3E6E" }}>All figures in %</span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(13,24,82,0.6)" }}>
                <th
                  style={{
                    padding: "8px 16px",
                    textAlign: "left",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#475569",
                    letterSpacing: "0.08em",
                    width: 160,
                  }}
                >
                  COUNTRY
                </th>
                {YEARS.map((y) => (
                  <th
                    key={y}
                    style={{
                      padding: "8px 16px",
                      textAlign: "right",
                      fontSize: 10,
                      fontWeight: 600,
                      color: y === "2025" ? "#94A3B8" : "#475569",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {y === "2025" ? y : y + "e"}
                  </th>
                ))}
                {/* change col */}
                <th
                  style={{
                    padding: "8px 16px",
                    textAlign: "right",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#2D3E6E",
                    letterSpacing: "0.08em",
                  }}
                >
                  Δ 25→26
                </th>
              </tr>
            </thead>
            <tbody>
              {countries.map((country, i) => {
                const vals = YEARS.map((y) => getVal(country, selectedMetric, y));
                const delta =
                  vals[0] !== null && vals[1] !== null ? vals[1] - vals[0] : null;

                return (
                  <tr
                    key={country}
                    style={{
                      background:
                        i % 2 === 0
                          ? "transparent"
                          : "rgba(255,255,255,0.015)",
                      borderBottom: "1px solid rgba(43,92,224,0.06)",
                    }}
                  >
                    <td style={{ padding: "10px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{FLAGS[country] ?? "🌎"}</span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#C5D4FF",
                          }}
                        >
                          {country}
                        </span>
                      </div>
                    </td>
                    {vals.map((v, vi) => (
                      <td
                        key={YEARS[vi]}
                        style={{
                          padding: "10px 16px",
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontSize: 13,
                          fontWeight: 600,
                          color: metricColor(selectedMetric, v),
                        }}
                      >
                        {fmtVal(v, selectedMetric)}
                      </td>
                    ))}
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      {delta !== null ? (
                        <span
                          className="font-mono"
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color:
                              selectedMetric === "Inflation" || selectedMetric === "Policy Rate"
                                ? delta < 0
                                  ? "#10B981"
                                  : "#EF4444"
                                : delta > 0
                                ? "#10B981"
                                : "#EF4444",
                          }}
                        >
                          {delta > 0 ? "+" : ""}
                          {delta.toFixed(1)}pp
                        </span>
                      ) : (
                        <span style={{ color: "#2D3E6E" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
