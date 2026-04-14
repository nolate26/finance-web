"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { PriceEarningsPoint } from "@/app/api/companies/[ticker]/route";

// ── Types ─────────────────────────────────────────────────────────────────────

type TimeRange = "1Y" | "2Y";
const RANGES: TimeRange[] = ["1Y", "2Y"];

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(1);
}

function fmtPrice(v: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Filter by time range ──────────────────────────────────────────────────────
// Anchors backward from the last data point.

function filterByRange(
  data: { date: string; price: number; ni1bf: number | null }[],
  range: TimeRange
) {
  if (data.length === 0) return data;
  const last   = new Date(data[data.length - 1].date + "-01");
  const cutoff = new Date(last);
  cutoff.setFullYear(cutoff.getFullYear() - (range === "1Y" ? 1 : 2));
  return data.filter((d) => new Date(d.date + "-01") >= cutoff);
}

// ── Tight domain with padding ─────────────────────────────────────────────────
// Returns [min * (1 - pad), max * (1 + pad)] for positive series,
// handling the sign correctly so negative values still get padded inward.

function tightDomain(vals: number[], pad = 0.05): [number, number] {
  if (vals.length === 0) return [0, 1];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || Math.abs(hi) * 0.1 || 1;
  return [lo - span * pad, hi + span * pad];
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TPayload { dataKey: string; value: number }

function DualTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: TPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const price = payload.find((p) => p.dataKey === "price");
  const ni    = payload.find((p) => p.dataKey === "ni1bf");

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
      <div style={{ color: "#94A3B8", marginBottom: 6, fontSize: 10, borderBottom: "1px solid rgba(15,23,42,0.06)", paddingBottom: 5 }}>
        {label}
      </div>
      {price && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
          <span style={{ color: "#64748B" }}>Price</span>
          <span style={{ color: "#2B5CE0", fontWeight: 700 }}>{fmtPrice(price.value)}</span>
        </div>
      )}
      {ni && ni.value != null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: "#64748B" }}>NI Blended Fwd</span>
          <span style={{ color: "#7C3AED", fontWeight: 700 }}>{fmtCompact(ni.value)}</span>
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  data: PriceEarningsPoint[];
}

export default function PriceEarningsChart({ data }: Props) {
  const [range, setRange] = useState<TimeRange>("1Y");

  // 1. Clean raw data
  const cleaned = useMemo(
    () =>
      data
        .filter((r) => r.pxLast != null && isFinite(r.pxLast))
        .map((r) => ({
          date:  r.date.slice(0, 7),
          price: r.pxLast,
          ni1bf: r.ni1bf != null && isFinite(r.ni1bf) ? r.ni1bf : null,
        })),
    [data]
  );

  // 2. Slice to selected range
  const chartData = useMemo(() => filterByRange(cleaned, range), [cleaned, range]);

  const hasData  = chartData.length > 0;
  const hasNI1BF = chartData.some((d) => d.ni1bf !== null);

  // 3. Tight domains — recalculated whenever chartData changes
  const { leftDomain, rightDomain } = useMemo<{
    leftDomain:  [number, number];
    rightDomain: [number, number];
  }>(() => {
    const priceVals = chartData.map((d) => d.price);
    const niVals    = chartData.filter((d) => d.ni1bf != null).map((d) => d.ni1bf as number);
    return {
      leftDomain:  tightDomain(priceVals),
      rightDomain: tightDomain(niVals),
    };
  }, [chartData]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        {/* Legend */}
        <div style={{ display: "flex", gap: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#94A3B8", fontFamily: "JetBrains Mono, monospace" }}>
            <span style={{ display: "inline-block", width: 16, height: 2, background: "#2B5CE0", borderRadius: 1 }} />
            Price
          </span>
          {hasNI1BF && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#94A3B8", fontFamily: "JetBrains Mono, monospace" }}>
              <span style={{ display: "inline-block", width: 16, height: 8, background: "rgba(124,58,237,0.12)", border: "1px dashed #7C3AED", borderRadius: 2 }} />
              NI 1BF
            </span>
          )}
        </div>

        {/* Time range pills */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4, background: "rgba(15,23,42,0.04)", border: "1px solid rgba(15,23,42,0.07)", borderRadius: 7, padding: 3 }}>
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                fontSize: 9,
                fontWeight: 700,
                fontFamily: "JetBrains Mono, monospace",
                letterSpacing: "0.04em",
                padding: "3px 8px",
                borderRadius: 5,
                border: "none",
                cursor: "pointer",
                transition: "all 0.15s",
                background: range === r ? "#fff" : "transparent",
                color:      range === r ? "#0F172A" : "#94A3B8",
                boxShadow:  range === r ? "0 1px 3px rgba(15,23,42,0.12)" : "none",
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart ───────────────────────────────────────────────────────────── */}
      {!hasData ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#CBD5E1", fontSize: 12 }}>
          No price data available
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 6, right: 48, bottom: 0, left: 0 }}>

              <defs>
                <linearGradient id="niGradientPE" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#7C3AED" stopOpacity={0.18} />
                  <stop offset="90%" stopColor="#7C3AED" stopOpacity={0.01} />
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

              {/* Left axis — Price, tight to filtered data */}
              <YAxis
                yAxisId="left"
                orientation="left"
                domain={leftDomain}
                tick={{ fill: "#2B5CE0", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
                axisLine={false}
                tickLine={false}
                width={50}
                tickFormatter={fmtPrice}
              />

              {/* Right axis — NI1BF, tight to filtered data */}
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={rightDomain}
                tick={{ fill: "#7C3AED", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
                axisLine={false}
                tickLine={false}
                width={46}
                tickFormatter={fmtCompact}
              />

              <Tooltip content={<DualTooltip />} />

              {/* NI Blended Forward — area on right axis */}
              {hasNI1BF && (
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="ni1bf"
                  name="NI 1BF"
                  stroke="#7C3AED"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  fill="url(#niGradientPE)"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}

              {/* Price — solid line on left axis */}
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="price"
                name="Price"
                stroke="#2B5CE0"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: "#2B5CE0", strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
