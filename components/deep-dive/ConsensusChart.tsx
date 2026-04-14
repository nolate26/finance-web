"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { ConsensusPoint } from "@/app/api/companies/[ticker]/route";

// ── Metric config ─────────────────────────────────────────────────────────────

type MetricKey = "REVENUE" | "EBITDA" | "NET_INCOME";

interface MetricCfg {
  key:    MetricKey;
  label:  string;
  colors: string[];   // one color per year slot (index 0, 1, 2…)
  gradId: string;
}

const METRICS: MetricCfg[] = [
  {
    key: "REVENUE", label: "Revenue", gradId: "cg_rev",
    colors: ["#059669", "#0D9488", "#34D399"],
  },
  {
    key: "EBITDA", label: "EBITDA", gradId: "cg_ebd",
    colors: ["#2B5CE0", "#1D4ED8", "#60A5FA"],
  },
  {
    key: "NET_INCOME", label: "Net Income", gradId: "cg_ni",
    colors: ["#7C3AED", "#9333EA", "#A78BFA"],
  },
];

// Stroke dash per year index: 0 = solid area, 1 = dashed, 2 = dotted
const DASH_STYLES = ["", "5 4", "2 3"];

// DB alias normalisation
const ALIASES: Record<string, MetricKey> = {
  SALES:      "REVENUE",
  REVENUE:    "REVENUE",
  EBITDA:     "EBITDA",
  NET_INCOME: "NET_INCOME",
};

// ── Pivot helper ──────────────────────────────────────────────────────────────

type PivotRow = { date: string } & Record<string, number | null | string>;

/**
 * Transforms the flat consensus array into one object per date, keyed by
 * calendar-year period strings (e.g. "2026", "2027").
 *
 * Returns:
 *   rows         – array of { date, "2026": v, "2027": v, ... } sorted by date
 *   availableYears – sorted unique year strings found in the data
 */
function pivotByDate(
  data: ConsensusPoint[],
  metric: MetricKey
): { rows: PivotRow[]; availableYears: string[] } {
  const map  = new Map<string, PivotRow>();
  const years = new Set<string>();

  for (const row of data) {
    const normalised = ALIASES[row.metric.toUpperCase()] ?? null;
    if (normalised !== metric) continue;

    const year = String(row.period).trim();
    if (!year || isNaN(Number(year))) continue; // skip non-numeric periods

    years.add(year);

    const date = row.date.slice(0, 7); // "YYYY-MM"
    if (!map.has(date)) map.set(date, { date });

    const entry = map.get(date)!;
    entry[year] = row.value;
  }

  const availableYears = Array.from(years).sort();

  // Ensure every row has all year keys (null if absent)
  const rows = Array.from(map.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => {
      const filled: PivotRow = { date: row.date };
      for (const y of availableYears) {
        filled[y] = row[y] != null ? (row[y] as number) : null;
      }
      return filled;
    });

  return { rows, availableYears };
}

// ── Continuous-tail filter ────────────────────────────────────────────────────

/**
 * For each year key, scans from the most-recent row backwards.
 * Any value before the first null from the right is erased, removing
 * isolated older data points disconnected from the current series.
 */
function keepOnlyContinuousTail(rows: PivotRow[], years: string[]): PivotRow[] {
  const result = rows.map((r) => ({ ...r }));

  for (const year of years) {
    let tailBroken = false;
    for (let i = result.length - 1; i >= 0; i--) {
      if (tailBroken) {
        result[i][year] = null;
      } else if (result[i][year] == null) {
        tailBroken = true;
      }
    }
  }

  return result;
}

// ── Number formatter ──────────────────────────────────────────────────────────

function fmtCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(1);
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

interface TPayload { dataKey: string; value: number | null }

function ConsTooltip({
  active, payload, label, cfg, years,
}: {
  active?:  boolean;
  payload?: TPayload[];
  label?:   string;
  cfg:      MetricCfg;
  years:    string[];
}) {
  if (!active || !payload?.length) return null;

  return (
    <div style={{
      background: "#fff",
      border: "1px solid rgba(15,23,42,0.10)",
      borderRadius: 6,
      padding: "8px 13px",
      fontSize: 11,
      fontFamily: "JetBrains Mono, monospace",
      boxShadow: "0 4px 16px rgba(15,23,42,0.12)",
      minWidth: 160,
    }}>
      <div style={{
        color: "#94A3B8", fontSize: 10,
        marginBottom: 6, paddingBottom: 5,
        borderBottom: "1px solid rgba(15,23,42,0.06)",
      }}>
        {label}
      </div>

      {years.map((year, i) => {
        const color = cfg.colors[i] ?? cfg.colors[cfg.colors.length - 1];
        const entry = payload.find((p) => p.dataKey === year);
        return (
          <div
            key={year}
            style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: i < years.length - 1 ? 4 : 0 }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {i === 0 ? (
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: color }} />
              ) : (
                <span style={{ display: "inline-block", width: 12, height: 0, borderTop: `2px ${i === 1 ? "dashed" : "dotted"} ${color}`, marginTop: 2 }} />
              )}
              <span style={{ color: "#64748B" }}>{year}</span>
            </span>
            <span style={{ color, fontWeight: 700 }}>
              {entry?.value != null ? fmtCompact(entry.value) : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Custom Legend ─────────────────────────────────────────────────────────────

function ConsLegend({ cfg, years }: { cfg: MetricCfg; years: string[] }) {
  return (
    <div style={{
      display: "flex", gap: 14, justifyContent: "flex-end",
      fontSize: 10, color: "#94A3B8",
      fontFamily: "JetBrains Mono, monospace",
      marginBottom: 6,
    }}>
      {years.map((year, i) => {
        const color = cfg.colors[i] ?? cfg.colors[cfg.colors.length - 1];
        return (
          <span key={year} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {i === 0 ? (
              <span style={{
                display: "inline-block", width: 14, height: 8,
                background: `${color}20`,
                border: `1.5px solid ${color}`,
                borderRadius: 2,
              }} />
            ) : (
              <span style={{
                display: "inline-block", width: 14,
                borderTop: `2px ${i === 1 ? "dashed" : "dotted"} ${color}`,
              }} />
            )}
            {year}
          </span>
        );
      })}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  data: ConsensusPoint[];
}

export default function ConsensusChart({ data }: Props) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>("NET_INCOME");
  const cfg = METRICS.find((m) => m.key === activeMetric)!;

  const { chartData, availableYears } = useMemo(() => {
    const { rows, availableYears } = pivotByDate(data, activeMetric);
    const chartData = keepOnlyContinuousTail(rows, availableYears);
    return { chartData, availableYears };
  }, [data, activeMetric]);

  const lastDate = useMemo(() => {
    if (data.length === 0) return null;
    return data
      .reduce((max, r) => (r.date > max ? r.date : max), data[0].date)
      .slice(0, 7);
  }, [data]);

  const hasData = chartData.some((row) =>
    availableYears.some((y) => row[y] != null)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Header + metric selector ────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 4, flexWrap: "wrap", gap: 6,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: "#64748B",
          letterSpacing: "0.07em", textTransform: "uppercase",
        }}>
          Consensus Evolution
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {lastDate && (
            <span style={{
              fontSize: 9, color: "#94A3B8",
              fontFamily: "JetBrains Mono, monospace",
              letterSpacing: "0.04em",
            }}>
              Last Update: {lastDate}
            </span>
          )}
          <div style={{
            display: "flex", gap: 3, padding: 3,
            borderRadius: 7, background: "#F0F4FA",
            border: "1px solid rgba(15,23,42,0.07)",
          }}>
            {METRICS.map((m) => {
              const active = m.key === activeMetric;
              return (
                <button
                  key={m.key}
                  onClick={() => setActiveMetric(m.key)}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 5,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: "none",
                    outline: "none",
                    background: active ? "#fff" : "transparent",
                    color: active ? m.colors[0] : "#94A3B8",
                    boxShadow: active ? "0 1px 3px rgba(15,23,42,0.10)" : "none",
                    transition: "all 0.12s",
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────────── */}
      {availableYears.length > 0 && (
        <ConsLegend cfg={cfg} years={availableYears} />
      )}

      {/* ── Chart ───────────────────────────────────────────────────────────── */}
      {!hasData ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#CBD5E1", fontSize: 12 }}>
          No {cfg.label} consensus data
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 130 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>

              <defs>
                {/* Gradient only for the first (solid) year */}
                <linearGradient id={cfg.gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={cfg.colors[0]} stopOpacity={0.16} />
                  <stop offset="90%" stopColor={cfg.colors[0]} stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.05)" vertical={false} />

              <XAxis
                dataKey="date"
                tick={{ fill: "#94A3B8", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fill: "#94A3B8", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtCompact}
                width={46}
              />

              <Tooltip
                content={<ConsTooltip cfg={cfg} years={availableYears} />}
                cursor={{ stroke: "rgba(15,23,42,0.08)", strokeWidth: 1 }}
              />

              {/* Hide default Recharts legend */}
              <Legend content={() => null} />

              {/* Render one series per available year, dynamically */}
              {availableYears.map((year, i) => {
                const color = cfg.colors[i] ?? cfg.colors[cfg.colors.length - 1];
                const dash  = DASH_STYLES[i] ?? DASH_STYLES[DASH_STYLES.length - 1];
                const hasValues = chartData.some((r) => r[year] != null);
                if (!hasValues) return null;

                // First year gets an Area (filled); subsequent years get Lines
                if (i === 0) {
                  return (
                    <Area
                      key={year}
                      type="monotone"
                      dataKey={year}
                      stroke={color}
                      strokeWidth={2}
                      fill={`url(#${cfg.gradId})`}
                      dot={false}
                      activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  );
                }

                return (
                  <Line
                    key={year}
                    type="monotone"
                    dataKey={year}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray={dash}
                    dot={false}
                    activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
