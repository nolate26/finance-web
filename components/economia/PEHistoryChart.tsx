"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

interface HistoryRow {
  date: string;
  [key: string]: number | string;
}

interface Props {
  allHistory: HistoryRow[];
  selectedIndex: string;
  availableIndices?: string[];
  onIndexChange?: (idx: string) => void;
  accentColor?: string;
}

type Period = "1Y" | "3Y" | "5Y" | "10Y";

const PERIODS: { label: string; value: Period; rows: number }[] = [
  { label: "1A",  value: "1Y",  rows: 252 },
  { label: "3A",  value: "3Y",  rows: 756 },
  { label: "5A",  value: "5Y",  rows: 1260 },
  { label: "10A", value: "10Y", rows: 99999 },
];

function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeStdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDateLabel(d: string): string {
  const parts = d.slice(0, 10).split("-");
  const m = parseInt(parts[1], 10) - 1;
  return `${MONTHS_SHORT[m]} ${parts[0]}`;
}

function forwardFill(rows: HistoryRow[], key: string): (number | null)[] {
  let last: number | null = null;
  return rows.map((row) => {
    const v = row[key];
    if (typeof v === "number" && !isNaN(v)) last = v;
    return last;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(15,23,42,0.12)",
        boxShadow: "0 4px 16px rgba(15,23,42,0.12)",
      }}
    >
      <div className="font-mono mb-1" style={{ color: "#64748B" }}>{label}</div>
      <div className="font-semibold" style={{ color: "#2B5CE0" }}>
        P/E: {typeof val === "number" ? val.toFixed(2) : "—"}x
      </div>
    </div>
  );
};

export default function PEHistoryChart({
  allHistory,
  selectedIndex,
  availableIndices,
  onIndexChange,
  accentColor = "#2B5CE0",
}: Props) {
  const [period, setPeriod] = useState<Period>("1Y");

  const periodRows = PERIODS.find((p) => p.value === period)?.rows ?? 252;
  const slice = allHistory.slice(-periodRows);

  const filled = forwardFill(slice, selectedIndex);
  const chartData = slice
    .map((row, i) => ({
      date: fmtDateLabel(row.date as string),
      value: filled[i],
    }))
    .filter((d): d is { date: string; value: number } => d.value !== null);

  // Downsample for performance (max 300 points)
  const step = Math.max(1, Math.floor(chartData.length / 300));
  const sampled = chartData.filter((_, i) => i % step === 0 || i === chartData.length - 1);

  // Median and ±1σ of visible period (computed on non-null, non-zero values)
  const visibleValues = chartData.map((d) => d.value).filter((v) => v > 0);
  const median = computeMedian(visibleValues);
  const stdDev = computeStdDev(visibleValues);
  const plus2sigma  = median !== null && stdDev !== null ? median + 2 * stdDev : null;
  const minus2sigma = median !== null && stdDev !== null ? median - 2 * stdDev : null;
  const currentPE = chartData.length > 0 ? chartData[chartData.length - 1].value : null;

  // Dynamic Y-axis: domain = exact ±2σ so reference lines land at the chart borders;
  // ticks use 2-unit steps snapped *inside* that range.
  let yDomain: [number, number] | ["auto", "auto"] = ["auto", "auto"];
  let yTicks: number[] | undefined = undefined;
  if (minus2sigma !== null && plus2sigma !== null) {
    yDomain = [minus2sigma, plus2sigma];
    const tickLo = Math.ceil(minus2sigma / 2) * 2;
    const tickHi = Math.floor(plus2sigma / 2) * 2;
    const ticks: number[] = [];
    for (let t = tickLo; t <= tickHi; t += 2) ticks.push(Math.round(t * 100) / 100);
    yTicks = ticks;
  }

  const hasDropdown = !!(availableIndices && onIndexChange);

  return (
    <div className="card flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 border-b flex items-start justify-between gap-3"
        style={{ borderColor: "rgba(15,23,42,0.07)" }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {hasDropdown ? (
            <select
              value={selectedIndex}
              onChange={(e) => onIndexChange!(e.target.value)}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: accentColor,
                background: "#F8FAFC",
                border: "1px solid #CBD5E1",
                borderRadius: 6,
                padding: "4px 14px 4px 10px",
                cursor: "pointer",
                fontFamily: "inherit",
                outline: "none",
                boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
              }}
            >
              {availableIndices!.map((idx) => (
                <option key={idx} value={idx}>{idx}</option>
              ))}
            </select>
          ) : (
            <span className="text-sm font-semibold truncate" style={{ color: accentColor }}>
              {selectedIndex}
            </span>
          )}
        </div>

        <div className="flex gap-3 text-xs shrink-0">
          <div className="text-right">
            <div style={{ color: "#94A3B8", fontSize: 10 }}>Actual</div>
            <div className="font-mono font-bold text-sm" style={{ color: "#0F172A" }}>
              {currentPE?.toFixed(1) ?? "—"}x
            </div>
          </div>
          <div className="text-right">
            <div style={{ color: "#94A3B8", fontSize: 10 }}>Mediana {period}</div>
            <div className="font-mono" style={{ color: "#475569", fontSize: 12 }}>
              {median?.toFixed(1) ?? "—"}x
            </div>
          </div>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex gap-1 px-4 pt-2.5">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className="px-2.5 py-1 text-xs font-mono rounded transition-all"
            style={{
              background: period === p.value ? "rgba(43,92,224,0.10)" : "transparent",
              color: period === p.value ? "#2B5CE0" : "#64748B",
              border: `1px solid ${period === p.value ? "rgba(43,92,224,0.30)" : "transparent"}`,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="px-2 pb-3 pt-2" style={{ height: 185 }}>
        {sampled.length === 0 ? (
          <div className="flex items-center justify-center h-full" style={{ color: "#64748B", fontSize: 12 }}>
            No hay datos para {selectedIndex}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sampled} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" />
              <XAxis
                dataKey="date"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                tick={{ fill: "#64748B", fontSize: 10, dy: 8 } as any}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={70}
                tickFormatter={(v: unknown) => (typeof v === "string" && v.length > 0 ? v : "")}
              />
              <YAxis
                domain={yDomain}
                ticks={yTicks}
                tick={{ fill: "#475569", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v as number).toFixed(0)}x`}
                width={38}
              />
              <Tooltip content={<CustomTooltip />} />

              {median !== null && (
                <ReferenceLine
                  y={median}
                  stroke="#64748B"
                  strokeOpacity={0.7}
                  strokeDasharray="5 3"
                  label={{ value: `Md ${median.toFixed(1)}x`, position: "insideTopRight", fontSize: 9, fill: "#94A3B8" }}
                />
              )}
              {plus2sigma !== null && (
                <ReferenceLine
                  y={plus2sigma}
                  stroke={accentColor}
                  strokeOpacity={0.30}
                  strokeDasharray="3 3"
                />
              )}
              {minus2sigma !== null && (
                <ReferenceLine
                  y={minus2sigma}
                  stroke={accentColor}
                  strokeOpacity={0.30}
                  strokeDasharray="3 3"
                />
              )}

              <Line
                type="monotone"
                dataKey="value"
                stroke={accentColor}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4, fill: accentColor, stroke: "#FFFFFF", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      <div className="px-4 pb-3 flex items-center gap-3 text-[10px]" style={{ color: "#94A3B8" }}>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3" style={{ borderTop: "1px dashed rgba(100,116,139,0.6)" }} />
          Mediana
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3" style={{ borderTop: "1px dashed rgba(100,116,139,0.35)" }} />
          ±2σ
        </span>
        <span className="ml-auto" style={{ color: "#CBD5E1" }}>Fuente: Bloomberg</span>
      </div>
    </div>
  );
}
