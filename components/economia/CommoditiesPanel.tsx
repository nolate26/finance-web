"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const HIST_YEARS = ["2021", "2022", "2023", "2024", "2025"] as const;
const FORE_YEARS = ["2026e", "2027e", "2028e"] as const;

interface CommodityRow {
  commodity: string;
  name: string;
  unit: string;
  [year: string]: number | null | string;
}

interface Props {
  commodities: CommodityRow[];
}

function fmtNum(v: number | null, decimals = 0): string {
  if (v === null) return "—";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pctChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

function ChangeTag({ pct }: { pct: number | null }) {
  if (pct === null)
    return <span style={{ color: "#2D3E6E", fontSize: 11 }}>—</span>;

  const color = pct > 0 ? "#10B981" : pct < 0 ? "#EF4444" : "#64748B";
  const bg = pct > 0 ? "rgba(16,185,129,0.1)" : pct < 0 ? "rgba(239,68,68,0.1)" : "transparent";
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;

  return (
    <span
      className="font-mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 11,
        fontWeight: 600,
        color,
        background: bg,
        padding: "1px 6px",
        borderRadius: 4,
      }}
    >
      <Icon size={10} />
      {pct > 0 ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

// Smart decimal places based on magnitude
function smartDecimals(v: number | null): number {
  if (v === null) return 0;
  if (v < 20) return 1;
  return 0;
}

export default function CommoditiesPanel({ commodities }: Props) {
  return (
    <div>
      <div
        className="card"
        style={{ overflow: "hidden", padding: 0 }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid rgba(43,92,224,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#64748B",
              letterSpacing: "0.08em",
            }}
          >
            COMMODITIES — PRICES &amp; FORECASTS
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 24,
                  height: 2,
                  background: "#2D3E6E",
                  borderRadius: 1,
                }}
              />
              <span style={{ fontSize: 10, color: "#2D3E6E" }}>Historical</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 24,
                  height: 2,
                  background: "#5080FF",
                  borderRadius: 1,
                  borderTop: "2px dashed #5080FF",
                }}
              />
              <span style={{ fontSize: 10, color: "#5080FF" }}>Forecast</span>
            </div>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(13,24,82,0.6)" }}>
                <th
                  style={{
                    padding: "10px 20px",
                    textAlign: "left",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#475569",
                    letterSpacing: "0.08em",
                    position: "sticky",
                    left: 0,
                    background: "rgba(9,16,58,0.98)",
                    minWidth: 200,
                  }}
                >
                  COMMODITY
                </th>
                <th
                  style={{
                    padding: "10px 12px",
                    textAlign: "right",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#2D3E6E",
                    letterSpacing: "0.06em",
                    minWidth: 80,
                  }}
                >
                  UNIT
                </th>
                {HIST_YEARS.map((y) => (
                  <th
                    key={y}
                    style={{
                      padding: "10px 14px",
                      textAlign: "right",
                      fontSize: 10,
                      fontWeight: 600,
                      color: y === "2025" ? "#94A3B8" : "#475569",
                      letterSpacing: "0.06em",
                      minWidth: 72,
                    }}
                  >
                    {y}
                  </th>
                ))}
                {/* Separator */}
                <th
                  style={{
                    padding: 0,
                    width: 1,
                    background: "rgba(80,128,255,0.2)",
                  }}
                />
                {FORE_YEARS.map((y) => (
                  <th
                    key={y}
                    style={{
                      padding: "10px 14px",
                      textAlign: "right",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#5080FF",
                      letterSpacing: "0.06em",
                      background: "rgba(80,128,255,0.05)",
                      minWidth: 72,
                    }}
                  >
                    {y.toUpperCase()}
                  </th>
                ))}
                <th
                  style={{
                    padding: "10px 14px",
                    textAlign: "right",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#2D3E6E",
                    letterSpacing: "0.06em",
                    minWidth: 80,
                  }}
                >
                  Δ 25→26e
                </th>
              </tr>
            </thead>
            <tbody>
              {commodities.map((row, i) => {
                const dec = smartDecimals(row["2025"] as number | null);
                const chg = pctChange(
                  row["2025"] as number | null,
                  row["2026e"] as number | null
                );

                return (
                  <tr
                    key={row.commodity}
                    style={{
                      background:
                        i % 2 === 0
                          ? "transparent"
                          : "rgba(255,255,255,0.015)",
                      borderBottom: "1px solid rgba(43,92,224,0.06)",
                    }}
                  >
                    {/* Name */}
                    <td
                      style={{
                        padding: "12px 20px",
                        position: "sticky",
                        left: 0,
                        background:
                          i % 2 === 0
                            ? "rgba(6,10,40,0.98)"
                            : "rgba(9,16,58,0.98)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#C5D4FF",
                        }}
                      >
                        {row.name}
                      </span>
                    </td>
                    {/* Unit */}
                    <td
                      style={{
                        padding: "12px 12px",
                        textAlign: "right",
                        fontSize: 10,
                        color: "#2D3E6E",
                        fontFamily: "monospace",
                      }}
                    >
                      {row.unit}
                    </td>
                    {/* Historical */}
                    {HIST_YEARS.map((y) => (
                      <td
                        key={y}
                        style={{
                          padding: "12px 14px",
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontSize: 13,
                          fontWeight: y === "2025" ? 700 : 400,
                          color: y === "2025" ? "#EEF2FF" : "#64748B",
                        }}
                      >
                        {fmtNum(row[y] as number | null, dec)}
                      </td>
                    ))}
                    {/* Separator */}
                    <td
                      style={{
                        padding: 0,
                        width: 1,
                        background: "rgba(80,128,255,0.2)",
                      }}
                    />
                    {/* Forecast */}
                    {FORE_YEARS.map((y) => (
                      <td
                        key={y}
                        style={{
                          padding: "12px 14px",
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#8AAFFF",
                          background: "rgba(80,128,255,0.05)",
                        }}
                      >
                        {fmtNum(row[y] as number | null, dec)}
                      </td>
                    ))}
                    {/* Δ change */}
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>
                      <ChangeTag pct={chg} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer note */}
        <div
          style={{
            padding: "8px 20px",
            borderTop: "1px solid rgba(43,92,224,0.08)",
            fontSize: 10,
            color: "#2D3E6E",
          }}
        >
          Source: internal projections. &nbsp;e = estimate.
          &nbsp;Δ = % change 2025 → 2026e.
        </div>
      </div>
    </div>
  );
}
