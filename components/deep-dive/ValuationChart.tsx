"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { computeBands } from "@/lib/stats";
import type { ValuationPoint } from "@/app/api/companies/[ticker]/route";

type MetricKey  = "peFwd" | "evEbitdaFwd" | "pbv_vs_roe";
type TimeRange  = "1yr" | "3yr" | "5yr" | "10yr";

const TABS: { key: MetricKey; label: string; color: string }[] = [
  { key: "peFwd",       label: "P/E Fwd",     color: "#2B5CE0" },
  { key: "evEbitdaFwd", label: "EV/EBITDA Fwd", color: "#7C3AED" },
  { key: "pbv_vs_roe",  label: "P/BV vs ROE", color: "#059669" },
];
const TIME_RANGES: TimeRange[] = ["1yr", "3yr", "5yr", "10yr"];

const PBV_COLOR = "#059669";
const ROE_COLOR = "#D97706";

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtX          = (v: number) => v.toFixed(2) + "x";
const fmtPct        = (v: number) => (v * 100).toFixed(1) + "%";
const fmtAxis       = (iso: string) => iso.slice(0, 4);
const fmtTooltipDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });

// ── Time filter ───────────────────────────────────────────────────────────────
function filterByRange(data: ValuationPoint[], range: TimeRange): ValuationPoint[] {
  if (range === "10yr") return data;
  const lastDate = data.at(-1)?.date;
  if (!lastDate) return data;
  const cutoff = new Date(lastDate + "T12:00:00");
  const years = range === "1yr" ? 1 : range === "3yr" ? 3 : 5;
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return data.filter((d) => new Date(d.date + "T12:00:00") >= cutoff);
}

// ── Tooltips ──────────────────────────────────────────────────────────────────
const TT_STYLE: React.CSSProperties = {
  background: "#fff", border: "1px solid rgba(15,23,42,0.10)", borderRadius: 6,
  padding: "8px 13px", fontSize: 11, fontFamily: "JetBrains Mono, monospace",
  boxShadow: "0 4px 16px rgba(15,23,42,0.12)", minWidth: 130,
};
const TT_DATE: React.CSSProperties = {
  color: "#94A3B8", fontSize: 10, marginBottom: 3, paddingBottom: 4,
  borderBottom: "1px solid rgba(15,23,42,0.06)",
};

function SingleTooltip({ active, payload, label, color, fmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={TT_STYLE}>
      <div style={TT_DATE}>{fmtTooltipDate(label)}</div>
      <div style={{ color, fontWeight: 700, fontSize: 13 }}>{fmt(payload[0].value)}</div>
    </div>
  );
}

function DualTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const pbv = payload.find((p: any) => p.dataKey === "pbv");
  const roe = payload.find((p: any) => p.dataKey === "roeFwd");
  return (
    <div style={TT_STYLE}>
      <div style={{ ...TT_DATE, marginBottom: 6 }}>{fmtTooltipDate(label)}</div>
      {pbv?.value != null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 3 }}>
          <span style={{ color: "#64748B", fontSize: 11 }}>P/BV</span>
          <span style={{ color: PBV_COLOR, fontWeight: 700, fontSize: 12 }}>{fmtX(pbv.value)}</span>
        </div>
      )}
      {roe?.value != null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "#64748B", fontSize: 11 }}>ROE Fwd</span>
          <span style={{ color: ROE_COLOR, fontWeight: 700, fontSize: 12 }}>{fmtPct(roe.value)}</span>
        </div>
      )}
    </div>
  );
}

// ── Legend item ───────────────────────────────────────────────────────────────
function LegendItem({ color, label, dashed = false, swatch = "line" }: any) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {swatch === "band" ? (
        <span style={{ display: "inline-block", width: 12, height: 10, background: `${color}18`, border: `1px solid ${color}35`, borderRadius: 2 }} />
      ) : dashed ? (
        <span style={{ display: "inline-block", width: 18, borderTop: `2px dashed ${color}` }} />
      ) : (
        <span style={{ display: "inline-block", width: 18, height: 2, background: color, borderRadius: 1 }} />
      )}
      {label}
    </span>
  );
}

// ── Custom dot — renders label only at the last data point ────────────────────
function makeEndDot(color: string, fmt: (v: number) => string, dataLen: number) {
  return function EndDot(props: any) {
    const { cx, cy, index, value } = props;
    if (index !== dataLen - 1 || value == null) return <g key={props.key} />;
    return (
      <g key={props.key}>
        <circle cx={cx} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth={1.5} />
        <text
          x={cx + 7} y={cy + 4}
          fontSize={11} fontWeight={700}
          fontFamily="JetBrains Mono, monospace"
          fill={color}
        >
          {fmt(value)}
        </text>
      </g>
    );
  };
}

// ── Discount / Premium badge ──────────────────────────────────────────────────
function DiscountBadge({ current, med, timeRange }: { current: number | null; med: number; timeRange: TimeRange }) {
  if (current == null || !isFinite(med) || med === 0) return null;
  const pct = ((current / med) - 1) * 100;
  const isDiscount = pct < 0;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 2,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          padding: "3px 8px",
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "JetBrains Mono, monospace",
          background: isDiscount ? "rgba(5,150,105,0.10)" : "rgba(220,38,38,0.10)",
          color: isDiscount ? "#059669" : "#DC2626",
          border: `1px solid ${isDiscount ? "rgba(5,150,105,0.20)" : "rgba(220,38,38,0.20)"}`,
        }}
      >
        {isDiscount ? "Discount" : "Premium"}: {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
      </div>
      <div style={{ fontSize: 11, color: "#94A3B8", fontFamily: "JetBrains Mono, monospace" }}>
        vs. {timeRange} median
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ValuationChart({ data }: { data: ValuationPoint[] }) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>("peFwd");
  const [timeRange,    setTimeRange]    = useState<TimeRange>("10yr");

  const tab    = TABS.find((t) => t.key === activeMetric)!;
  const isDual = activeMetric === "pbv_vs_roe";

  // ── Filter data by time range ─────────────────────────────────────────────
  const filteredData = useMemo(() => filterByRange(data, timeRange), [data, timeRange]);

  // ── Single-metric chart data + bands ──────────────────────────────────────
  const single = useMemo(() => {
    if (isDual) return { chartData: [], bands: { avg: NaN, median: NaN, upper: NaN, lower: NaN } };
    const field = activeMetric as "peFwd" | "evEbitdaFwd";
    const raw   = filteredData.map((r) => r[field]).filter((v): v is number => v != null && isFinite(v));
    const b     = computeBands(raw);
    const cd    = filteredData.filter((r) => r[field] != null).map((r) => ({ date: r.date, value: r[field] as number }));
    return { chartData: cd, bands: b };
  }, [filteredData, activeMetric, isDual]);

  // ── Dual-axis chart data + bands ──────────────────────────────────────────
  const dual = useMemo(() => {
    if (!isDual) return { chartData: [], pbvBands: { avg: NaN, median: NaN, upper: NaN, lower: NaN } };
    const pbvVals = filteredData.map((r) => r.pbv).filter((v): v is number => v != null && isFinite(v));
    const pbvBands = computeBands(pbvVals);
    const cd = filteredData
      .filter((r) => r.pbv != null || r.roeFwd != null)
      .map((r) => ({ date: r.date, pbv: r.pbv ?? null, roeFwd: r.roeFwd ?? null }));
    return { chartData: cd, pbvBands };
  }, [filteredData, isDual]);

  // ── Year ticks ────────────────────────────────────────────────────────────
  const yearTicks = useMemo(() => {
    const src = isDual ? dual.chartData : single.chartData;
    const seen = new Set<string>();
    return src
      .filter((p) => {
        const y = new Date(p.date).getFullYear().toString();
        if (seen.has(y)) return false;
        seen.add(y);
        return true;
      })
      .map((p) => p.date);
  }, [single.chartData, dual.chartData, isDual]);

  const hasBands    = !isDual && isFinite(single.bands.median) && single.chartData.length > 1;
  const hasPbvBands = isDual  && isFinite(dual.pbvBands.median) && dual.chartData.length > 1;
  const noData      = (!isDual && !single.chartData.length) || (isDual && !dual.chartData.length);

  // Last value for end-label and discount badge
  const currentVal = !isDual ? (single.chartData.at(-1)?.value ?? null) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Controls row: metric tabs + time range ─────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {/* Metric tabs */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveMetric(t.key)}
              style={{
                padding: "5px 13px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                border: t.key === activeMetric ? `1.5px solid ${t.color}` : "1.5px solid rgba(15,23,42,0.10)",
                background: t.key === activeMetric ? `${t.color}12` : "#F8FAFF",
                color: t.key === activeMetric ? t.color : "#64748B",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Time range selector */}
        <div
          style={{
            display: "flex",
            gap: 2,
            background: "rgba(15,23,42,0.04)",
            borderRadius: 7,
            padding: 3,
          }}
        >
          {TIME_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              style={{
                padding: "3px 10px",
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "JetBrains Mono, monospace",
                cursor: "pointer",
                border: "none",
                background: r === timeRange ? "#fff" : "transparent",
                color: r === timeRange ? "#0F172A" : "#94A3B8",
                boxShadow: r === timeRange ? "0 1px 3px rgba(15,23,42,0.10)" : "none",
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap", fontSize: 11, color: "#94A3B8", fontFamily: "JetBrains Mono, monospace" }}>
        {!isDual && hasBands && (
          <>
            <LegendItem color={tab.color} label={tab.label} />
            <LegendItem color="#94A3B8" label={`Median ${fmtX(single.bands.median)}`} dashed />
            <LegendItem color={tab.color} label="±1 SD" swatch="band" />
          </>
        )}
        {isDual && (
          <>
            <LegendItem color={PBV_COLOR} label="P/BV (left)" />
            {hasPbvBands && (
              <>
                <LegendItem color="#94A3B8" label={`Median ${fmtX(dual.pbvBands.median)}`} dashed />
                <LegendItem color={PBV_COLOR} label="±1 SD" swatch="band" />
              </>
            )}
            <LegendItem color={ROE_COLOR} label="ROE Fwd (right)" dashed />
          </>
        )}
      </div>

      {noData ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#CBD5E1", fontSize: 11 }}>
          No data for {tab.label}
        </div>
      ) : (
        /* Relative container for the discount badge overlay */
        <div style={{ flex: 1, minHeight: 200, position: "relative" }}>

          {/* Discount / Premium badge — top-right overlay */}
          {!isDual && hasBands && (
            <DiscountBadge
              current={currentVal}
              med={single.bands.median}
              timeRange={timeRange}
            />
          )}

          <ResponsiveContainer width="100%" height="100%">
            {!isDual ? (
              <ComposedChart data={single.chartData} margin={{ top: 6, right: 52, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.05)" vertical={false} />
                <XAxis
                  dataKey="date" ticks={yearTicks} tickFormatter={fmtAxis}
                  tick={{ fill: "#94A3B8", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "#94A3B8", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false} tickLine={false} tickFormatter={(v) => fmtX(v)} width={46}
                />
                <Tooltip content={<SingleTooltip color={tab.color} fmt={(v: number) => fmtX(v)} />} />

                {/* ±1 SD band */}
                {hasBands && (
                  <ReferenceArea
                    y1={single.bands.lower} y2={single.bands.upper}
                    fill={`${tab.color}12`} stroke={`${tab.color}30`} strokeDasharray="4 4"
                  />
                )}

                {/* Median reference line with end label */}
                {hasBands && (
                  <ReferenceLine
                    y={single.bands.median}
                    stroke="#94A3B8"
                    strokeDasharray="5 3"
                    label={{
                      value: `Md ${fmtX(single.bands.median)}`,
                      position: "insideTopRight",
                      fontSize: 11,
                      fill: "#94A3B8",
                      fontFamily: "JetBrains Mono, monospace",
                      fontWeight: 600,
                    }}
                  />
                )}

                {/* Main line — end-point label via custom dot */}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={tab.color}
                  strokeWidth={2.5}
                  dot={makeEndDot(tab.color, fmtX, single.chartData.length)}
                  activeDot={{ r: 4, fill: tab.color }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            ) : (
              <ComposedChart data={dual.chartData} margin={{ top: 6, right: 48, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.05)" vertical={false} />
                <XAxis
                  dataKey="date" ticks={yearTicks} tickFormatter={fmtAxis}
                  tick={{ fill: "#94A3B8", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false} tickLine={false}
                />
                <YAxis yAxisId="left" orientation="left" domain={["auto", "auto"]}
                  tick={{ fill: PBV_COLOR, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false} tickLine={false} tickFormatter={fmtX} width={40}
                />
                <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]}
                  tick={{ fill: ROE_COLOR, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false} tickLine={false} tickFormatter={fmtPct} width={42}
                />
                <Tooltip content={<DualTooltip />} />
                {hasPbvBands && (
                  <ReferenceArea yAxisId="left" y1={dual.pbvBands.lower} y2={dual.pbvBands.upper}
                    fill={`${PBV_COLOR}12`} stroke={`${PBV_COLOR}30`} strokeDasharray="4 4"
                  />
                )}
                {hasPbvBands && (
                  <ReferenceLine
                    yAxisId="left" y={dual.pbvBands.median}
                    stroke="#94A3B8" strokeDasharray="5 3"
                    label={{
                      value: `Md ${fmtX(dual.pbvBands.median)}`,
                      position: "insideTopRight",
                      fontSize: 11,
                      fill: "#94A3B8",
                      fontFamily: "JetBrains Mono, monospace",
                      fontWeight: 600,
                    }}
                  />
                )}
                <Line yAxisId="left" type="monotone" dataKey="pbv" stroke={PBV_COLOR} strokeWidth={2.5}
                  dot={makeEndDot(PBV_COLOR, fmtX, dual.chartData.length)}
                  activeDot={{ r: 4, fill: PBV_COLOR }} connectNulls={false} isAnimationActive={false}
                />
                <Line yAxisId="right" type="monotone" dataKey="roeFwd" stroke={ROE_COLOR} strokeWidth={2}
                  strokeDasharray="5 4" dot={false}
                  activeDot={{ r: 4, fill: ROE_COLOR }} connectNulls={false} isAnimationActive={false}
                />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
