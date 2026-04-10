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
  color1FY: string; // Area fill + stroke
  color2FY: string; // Line stroke (darker / complementary shade)
  gradId: string;
}

const METRICS: MetricCfg[] = [
  { key: "REVENUE",    label: "Revenue",    color1FY: "#059669", color2FY: "#0D9488", gradId: "cg_rev"  },
  { key: "EBITDA",     label: "EBITDA",     color1FY: "#2B5CE0", color2FY: "#1D4ED8", gradId: "cg_ebd"  },
  { key: "NET_INCOME", label: "Net Income", color1FY: "#7C3AED", color2FY: "#9333EA", gradId: "cg_ni"   },
];

// DB alias normalisation ("SALES" → "REVENUE")
const ALIASES: Record<string, MetricKey> = {
  SALES:      "REVENUE",
  REVENUE:    "REVENUE",
  EBITDA:     "EBITDA",
  NET_INCOME: "NET_INCOME",
};

// ── Pivot helper ──────────────────────────────────────────────────────────────

interface PivotRow {
  date: string;
  "1FY": number | null;
  "2FY": number | null;
}

/**
 * Transforms the flat consensus array into one object per date with
 * both periods as sibling keys, sorted chronologically.
 *
 * Input:  [{ date, metric, period, value }, ...]
 * Output: [{ date: "2024-01", "1FY": 100, "2FY": 120 }, ...]
 */
function pivotByDate(
  data: ConsensusPoint[],
  metric: MetricKey
): PivotRow[] {
  const map = new Map<string, PivotRow>();

  for (const row of data) {
    const normalised = ALIASES[row.metric.toUpperCase()] ?? null;
    if (normalised !== metric) continue;
    if (row.period !== "1FY" && row.period !== "2FY") continue;

    const date = row.date.slice(0, 7); // "YYYY-MM"
    if (!map.has(date)) {
      map.set(date, { date, "1FY": null, "2FY": null });
    }
    const entry = map.get(date)!;
    entry[row.period as "1FY" | "2FY"] = row.value;
  }

  // Sort chronologically (ISO strings compare correctly lexicographically)
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ── Continuous-tail filter ────────────────────────────────────────────────────

/**
 * Scans each key from the MOST RECENT row backwards.
 * The first null encountered marks a gap; every row before that gap
 * is forced to null for that key — removing isolated floating points
 * that are disconnected from the current continuous series.
 *
 * Example (→ = time, * = value, . = null):
 *   Input:  [*, ., *, *, *, .]   2FY has orphan at index 0 and a gap at index 5
 *   Output: [., ., *, *, *, .]   only the rightmost continuous block survives
 */
function keepOnlyContinuousTail(
  data: PivotRow[],
  keys: Array<"1FY" | "2FY">
): PivotRow[] {
  // Shallow-copy each row so we never mutate the pivot cache
  const result = data.map((row) => ({ ...row }));

  for (const key of keys) {
    let tailBroken = false;
    for (let i = result.length - 1; i >= 0; i--) {
      if (tailBroken) {
        // We already found a gap further right — erase everything to the left
        result[i][key] = null;
      } else if (result[i][key] == null) {
        // First null from the right: gap found, activate erasure for the rest
        tailBroken = true;
        // result[i][key] is already null — nothing to assign
      }
      // Non-null and no gap yet → belongs to the continuous tail, keep as-is
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

interface TPayload {
  dataKey: string;
  value:   number | null;
  color:   string;
}

function ConsTooltip({
  active, payload, label, cfg,
}: {
  active?:  boolean;
  payload?: TPayload[];
  label?:   string;
  cfg:      MetricCfg;
}) {
  if (!active || !payload?.length) return null;

  const fy1 = payload.find((p) => p.dataKey === "1FY");
  const fy2 = payload.find((p) => p.dataKey === "2FY");

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
      {/* Date header */}
      <div style={{
        color: "#94A3B8", fontSize: 10,
        marginBottom: 6, paddingBottom: 5,
        borderBottom: "1px solid rgba(15,23,42,0.06)",
      }}>
        {label}
      </div>

      {/* 1FY row */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 4 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: cfg.color1FY }} />
          <span style={{ color: "#64748B" }}>1FY</span>
        </span>
        <span style={{ color: cfg.color1FY, fontWeight: 700 }}>
          {fy1?.value != null ? fmtCompact(fy1.value) : "—"}
        </span>
      </div>

      {/* 2FY row */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {/* Dashed swatch for 2FY */}
          <span style={{
            display: "inline-block", width: 10, height: 2,
            borderTop: `2px dashed ${cfg.color2FY}`,
            marginTop: 4,
          }} />
          <span style={{ color: "#64748B" }}>2FY</span>
        </span>
        <span style={{ color: cfg.color2FY, fontWeight: 700 }}>
          {fy2?.value != null ? fmtCompact(fy2.value) : "—"}
        </span>
      </div>
    </div>
  );
}

// ── Custom Legend ─────────────────────────────────────────────────────────────

function ConsLegend({ cfg }: { cfg: MetricCfg }) {
  return (
    <div style={{
      display: "flex", gap: 14, justifyContent: "flex-end",
      fontSize: 10, color: "#94A3B8",
      fontFamily: "JetBrains Mono, monospace",
      marginBottom: 6,
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{
          display: "inline-block", width: 14, height: 8,
          background: `${cfg.color1FY}20`,
          border: `1.5px solid ${cfg.color1FY}`,
          borderRadius: 2,
        }} />
        1FY
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ display: "inline-block", width: 14, borderTop: `2px dashed ${cfg.color2FY}` }} />
        2FY
      </span>
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

  // Pivot → remove isolated floating points → feed to Recharts
  const chartData = useMemo(() => {
    const pivoted = pivotByDate(data, activeMetric);
    return keepOnlyContinuousTail(pivoted, ["1FY", "2FY"]);
  }, [data, activeMetric]);

  // Most recent date across ALL data (not just the active metric)
  const lastDate = useMemo(() => {
    if (data.length === 0) return null;
    return data
      .reduce((max, r) => (r.date > max ? r.date : max), data[0].date)
      .slice(0, 7); // "YYYY-MM"
  }, [data]);

  // Only show 2FY line/legend if there is at least one non-null 2FY value
  const has1FY = chartData.some((d) => d["1FY"] !== null);
  const has2FY = chartData.some((d) => d["2FY"] !== null);
  const hasData = has1FY || has2FY;

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

        {/* Right side: pill selector + last update */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {lastDate && (
            <span style={{
              fontSize: 9,
              color: "#94A3B8",
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
                    color: active ? m.color1FY : "#94A3B8",
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
      <ConsLegend cfg={cfg} />

      {/* ── Chart ───────────────────────────────────────────────────────────── */}
      {!hasData ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#CBD5E1", fontSize: 12 }}>
          No {cfg.label} consensus data
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 130 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>

              {/* Gradient for 1FY area fill */}
              <defs>
                <linearGradient id={cfg.gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={cfg.color1FY} stopOpacity={0.16} />
                  <stop offset="90%" stopColor={cfg.color1FY} stopOpacity={0.01} />
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
                content={<ConsTooltip cfg={cfg} />}
                cursor={{ stroke: "rgba(15,23,42,0.08)", strokeWidth: 1 }}
              />

              {/* Hide the default Recharts legend — we render our own above */}
              <Legend content={() => null} />

              {/* 1FY — Area (shaded). Gaps are intentional: no connectNulls. */}
              {has1FY && (
                <Area
                  type="monotone"
                  dataKey="1FY"
                  stroke={cfg.color1FY}
                  strokeWidth={2}
                  fill={`url(#${cfg.gradId})`}
                  dot={false}
                  activeDot={{ r: 5, fill: cfg.color1FY, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              )}

              {/* 2FY — dashed Line only (no fill). Gaps are intentional. */}
              {has2FY && (
                <Line
                  type="monotone"
                  dataKey="2FY"
                  stroke={cfg.color2FY}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  activeDot={{ r: 5, fill: cfg.color2FY, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
