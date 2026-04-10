"use client";

import { useMemo } from "react";
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

// ── Number formatters ─────────────────────────────────────────────────────────

function fmtCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(2);
}

function fmtPrice(v: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TPayload {
  dataKey: string;
  value: number;
  color: string;
  name: string;
}

function DualTooltip({
  active,
  payload,
  label,
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
  // Clean data: drop rows where pxLast is missing/NaN; keep ni1bf even if null
  const chartData = useMemo(
    () =>
      data
        .filter((r) => r.pxLast != null && isFinite(r.pxLast))
        .map((r) => ({
          date:  r.date.slice(0, 7),
          price: r.pxLast,
          // Leave null as null — Recharts renders a gap instead of zero
          ni1bf: r.ni1bf != null && isFinite(r.ni1bf) ? r.ni1bf : null,
        })),
    [data]
  );

  const hasData   = chartData.length > 0;
  const hasNI1BF  = chartData.some((d) => d.ni1bf !== null);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#64748B", letterSpacing: "0.07em", textTransform: "uppercase" }}>
          Price vs Blended Forward NI
        </span>
        {/* Mini legend */}
        <div style={{ display: "flex", gap: 12, marginLeft: "auto" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#94A3B8", fontFamily: "JetBrains Mono, monospace" }}>
            <span style={{ display: "inline-block", width: 16, height: 2, background: "#2B5CE0", borderRadius: 1 }} />
            Price
          </span>
          {hasNI1BF && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#94A3B8", fontFamily: "JetBrains Mono, monospace" }}>
              <span style={{ display: "inline-block", width: 16, height: 8, background: "rgba(124,58,237,0.15)", border: "1px dashed #7C3AED", borderRadius: 2 }} />
              NI 1BF
            </span>
          )}
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

              {/* Gradient for NI area */}
              <defs>
                <linearGradient id="niGradient" x1="0" y1="0" x2="0" y2="1">
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

              {/* Left axis — Price */}
              <YAxis
                yAxisId="left"
                orientation="left"
                domain={["auto", "auto"]}
                tick={{ fill: "#2B5CE0", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
                axisLine={false}
                tickLine={false}
                width={50}
                tickFormatter={(v: number) => fmtPrice(v)}
              />

              {/* Right axis — NI1BF */}
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={["auto", "auto"]}
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
                  fill="url(#niGradient)"
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
