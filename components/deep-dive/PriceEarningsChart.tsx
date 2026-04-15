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
import type { PriceEarningsPoint, ConsensusPoint } from "@/app/api/companies/[ticker]/route";

// ── Types ─────────────────────────────────────────────────────────────────────

type TimeRange = "1Y" | "2Y";
const RANGES: TimeRange[] = ["1Y", "2Y"];

// Each row: date + price + ni1bf + any consensus year key ("2026", "2027"…)
type MergedPoint = {
  date:  string;
  price: number;
  ni1bf: number | null;
  [year: string]: number | null | string;
};

// ── Earnings metric config ────────────────────────────────────────────────────

interface EarningsMetricCfg {
  key:   string;
  label: string;
  color: string;
}

// Static list — year pills are only shown when that year exists in the data
const ALL_EARNINGS_METRICS: EarningsMetricCfg[] = [
  { key: "ni1bf", label: "Blended", color: "#7C3AED" },
  { key: "2025",  label: "2025",    color: "#0D9488" },
  { key: "2026",  label: "2026",    color: "#059669" },
  { key: "2027",  label: "2027",    color: "#2B5CE0" },
  { key: "2028",  label: "2028",    color: "#D97706" },
];

// DB alias normalisation (mirrors ConsensusChart)
const ALIASES: Record<string, string> = {
  SALES:      "REVENUE",
  REVENUE:    "REVENUE",
  EBITDA:     "EBITDA",
  NET_INCOME: "NET_INCOME",
};

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

function filterByRange(data: MergedPoint[], range: TimeRange): MergedPoint[] {
  if (data.length === 0) return data;
  const last   = new Date(data[data.length - 1].date + "-01");
  const cutoff = new Date(last);
  cutoff.setFullYear(cutoff.getFullYear() - (range === "1Y" ? 1 : 2));
  return data.filter((d) => new Date(d.date + "-01") >= cutoff);
}

// ── Valuation Signal ─────────────────────────────────────────────────────────

type ValuationSignal = "BUY" | "SELL" | "FAIR";

interface DivergenceResult {
  signal:            ValuationSignal;
  divergenceGap:     number;
  pctChangePrice:    number;
  pctChangeEarnings: number | null;
}

function calcDivergence(
  data:      MergedPoint[],
  metricKey: string
): DivergenceResult | null {
  if (data.length < 2) return null;

  const first = data[0];
  const last  = data[data.length - 1];
  if (!first.price || !last.price) return null;

  const pctChangePrice    = ((last.price / first.price) - 1) * 100;
  const firstVal          = first[metricKey] as number | null;
  const lastVal           = last[metricKey]  as number | null;
  const pctChangeEarnings = (firstVal != null && lastVal != null)
    ? ((lastVal / firstVal) - 1) * 100
    : null;

  if (pctChangeEarnings == null) {
    return { signal: "FAIR", divergenceGap: 0, pctChangePrice, pctChangeEarnings: null };
  }

  const divergenceGap = pctChangeEarnings - pctChangePrice;
  const signal: ValuationSignal =
    divergenceGap > 10  ? "BUY"  :
    divergenceGap < -10 ? "SELL" : "FAIR";

  return { signal, divergenceGap, pctChangePrice, pctChangeEarnings };
}

const SIGNAL_STYLES: Record<ValuationSignal, {
  bg: string; border: string; dot: string; label: string; labelColor: string; tag: string;
}> = {
  BUY: {
    bg: "rgba(22,163,74,0.07)", border: "rgba(22,163,74,0.22)", dot: "#16A34A",
    label: "Potentially Undervalued", labelColor: "#15803D", tag: "BUY",
  },
  SELL: {
    bg: "rgba(220,38,38,0.07)", border: "rgba(220,38,38,0.22)", dot: "#DC2626",
    label: "Potentially Overvalued", labelColor: "#B91C1C", tag: "SELL",
  },
  FAIR: {
    bg: "rgba(100,116,139,0.07)", border: "rgba(100,116,139,0.20)", dot: "#64748B",
    label: "Potentially Fairly Valued", labelColor: "#475569", tag: "FAIR",
  },
};

function SignalArrow({ signal }: { signal: ValuationSignal }) {
  if (signal === "BUY")  return <span style={{ fontSize: 11, lineHeight: 1 }}>↑</span>;
  if (signal === "SELL") return <span style={{ fontSize: 11, lineHeight: 1 }}>↓</span>;
  return <span style={{ fontSize: 11, lineHeight: 1 }}>→</span>;
}

function ValuationBadge({ result }: { result: DivergenceResult }) {
  const s          = SIGNAL_STYLES[result.signal];
  const fmt        = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
  const deltaColor = (n: number) => (n >= 0 ? "#2563EB" : "#DC2626");

  return (
    <div style={{
      display:       "inline-flex",
      flexDirection: "column",
      gap:           3,
      background:    s.bg,
      border:        `1px solid ${s.border}`,
      borderRadius:  7,
      padding:       "5px 10px",
      fontFamily:    "JetBrains Mono, monospace",
    }}>
      {/* Top row: dot + tag + arrow + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: s.dot, display: "inline-block", flexShrink: 0,
        }} />
        <span style={{ fontSize: 9, fontWeight: 800, color: s.labelColor, letterSpacing: "0.06em" }}>
          {s.tag}
        </span>
        <SignalArrow signal={result.signal} />
        <span style={{ fontSize: 9, color: s.labelColor, opacity: 0.8 }}>
          {s.label}
        </span>
      </div>

      {/* Sub-row: sign-colored deltas */}
      {result.pctChangeEarnings != null && (
        <div style={{ fontSize: 8.5, color: "#94A3B8", letterSpacing: "0.02em" }}>
          Earnings&nbsp;Δ&nbsp;
          <span style={{ color: deltaColor(result.pctChangeEarnings), fontWeight: 700 }}>
            {fmt(result.pctChangeEarnings)}
          </span>
          &nbsp;vs&nbsp;Price&nbsp;Δ&nbsp;
          <span style={{ color: deltaColor(result.pctChangePrice), fontWeight: 700 }}>
            {fmt(result.pctChangePrice)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Fallback tight domain ─────────────────────────────────────────────────────

function tightDomain(vals: number[], pad = 0.05): [number, number] {
  if (vals.length === 0) return [0, 1];
  const lo   = Math.min(...vals);
  const hi   = Math.max(...vals);
  const span = hi - lo || Math.abs(hi) * 0.1 || 1;
  return [lo - span * pad, hi + span * pad];
}

// ── Anchored proportional domains ────────────────────────────────────────────
// Computes a single ratio (earnings/price) at the first valid anchor point so
// both series start at the same pixel and diverge proportionally over time.

function anchoredDomains(
  data:      MergedPoint[],
  metricKey: string
): { leftDomain: [number, number]; rightDomain: [number, number] } | null {
  const anchor = data.find((d) => {
    const val = d[metricKey] as number | null;
    return d.price > 0 && val != null && val !== 0;
  });
  if (!anchor) return null;

  const ratio         = (anchor[metricKey] as number) / anchor.price;
  const equivEarnings = data
    .filter((d) => (d[metricKey] as number | null) != null)
    .map((d)    => (d[metricKey] as number) / ratio);

  const priceVals = data.map((d) => d.price);
  const allVals   = [...priceVals, ...equivEarnings];

  const globalMin = Math.min(...allVals);
  const globalMax = Math.max(...allVals);
  const paddedMin = globalMin * 0.95;
  const paddedMax = globalMax * 1.05;

  return {
    leftDomain:  [paddedMin,         paddedMax        ],
    rightDomain: [paddedMin * ratio, paddedMax * ratio],
  };
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TPayload { dataKey: string; value: number }

function DualTooltip({
  active, payload, label, metricKey, earningsLabel, earningsColor,
}: {
  active?:       boolean;
  payload?:      TPayload[];
  label?:        string;
  metricKey:     string;
  earningsLabel: string;
  earningsColor: string;
}) {
  if (!active || !payload?.length) return null;
  const price    = payload.find((p) => p.dataKey === "price");
  const earnings = payload.find((p) => p.dataKey === metricKey);

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
      {earnings && earnings.value != null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: "#64748B" }}>{earningsLabel}</span>
          <span style={{ color: earningsColor, fontWeight: 700 }}>{fmtCompact(earnings.value)}</span>
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  data:      PriceEarningsPoint[];
  consensus: ConsensusPoint[];
}

export default function PriceEarningsChart({ data, consensus }: Props) {
  const [range,          setRange]          = useState<TimeRange>("1Y");
  const [selectedMetric, setSelectedMetric] = useState<string>("ni1bf");

  // 1. Merge price data + NET_INCOME consensus years into one array keyed by date
  const merged = useMemo<MergedPoint[]>(() => {
    const map = new Map<string, MergedPoint>();

    for (const r of data) {
      if (r.pxLast == null || !isFinite(r.pxLast)) continue;
      const date = r.date.slice(0, 7);
      map.set(date, {
        date,
        price: r.pxLast,
        ni1bf: r.ni1bf != null && isFinite(r.ni1bf) ? r.ni1bf : null,
      });
    }

    for (const r of consensus) {
      const normalised = ALIASES[r.metric.toUpperCase()] ?? null;
      if (normalised !== "NET_INCOME") continue;
      const year = String(r.period).trim();
      if (!year || isNaN(Number(year))) continue;
      const date = r.date.slice(0, 7);
      if (!map.has(date)) continue;
      const entry = map.get(date)!;
      if (entry[year] == null) entry[year] = r.value;
    }

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data, consensus]);

  // 2. Year keys that actually have data in the consensus feed
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const r of consensus) {
      const normalised = ALIASES[r.metric.toUpperCase()] ?? null;
      if (normalised !== "NET_INCOME") continue;
      const year = String(r.period).trim();
      if (year && !isNaN(Number(year))) years.add(year);
    }
    return Array.from(years).sort();
  }, [consensus]);

  // 3. Selector pills = Blended + available years (only those in the static config)
  const earningsMetrics: EarningsMetricCfg[] = useMemo(
    () => ALL_EARNINGS_METRICS.filter(
      (m) => m.key === "ni1bf" || availableYears.includes(m.key)
    ),
    [availableYears]
  );

  // 4. Slice to selected time range
  const chartData = useMemo(() => filterByRange(merged, range), [merged, range]);

  const hasData     = chartData.length > 0;
  const metricCfg   = earningsMetrics.find((m) => m.key === selectedMetric) ?? earningsMetrics[0];
  const hasEarnings = chartData.some((d) => (d[selectedMetric] as number | null) != null);

  // 5. Valuation signal — updates when metric or range changes
  const valuationResult = useMemo(
    () => calcDivergence(chartData, selectedMetric),
    [chartData, selectedMetric]
  );

  // 6. Anchored proportional domains — updates when metric or range changes
  const { leftDomain, rightDomain } = useMemo<{
    leftDomain:  [number, number];
    rightDomain: [number, number];
  }>(() => {
    if (hasEarnings) {
      const anchored = anchoredDomains(chartData, selectedMetric);
      if (anchored) return anchored;
    }
    const priceVals   = chartData.map((d) => d.price);
    const earningVals = chartData
      .filter((d) => (d[selectedMetric] as number | null) != null)
      .map((d) => d[selectedMetric] as number);
    return {
      leftDomain:  tightDomain(priceVals),
      rightDomain: earningVals.length ? tightDomain(earningVals) : [0, 1],
    };
  }, [chartData, selectedMetric, hasEarnings]);

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
          {hasEarnings && metricCfg && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#94A3B8", fontFamily: "JetBrains Mono, monospace" }}>
              <span style={{
                display: "inline-block", width: 16, height: 8,
                background: `${metricCfg.color}1F`,
                border: `1px dashed ${metricCfg.color}`,
                borderRadius: 2,
              }} />
              {metricCfg.label}
            </span>
          )}
        </div>

        {/* Right-side controls: metric selector · badge · time range */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>

          {/* Earnings metric selector */}
          <div style={{
            display: "flex", gap: 3, padding: 3,
            borderRadius: 7,
            background: "rgba(15,23,42,0.04)",
            border: "1px solid rgba(15,23,42,0.07)",
          }}>
            {earningsMetrics.map((m) => (
              <button
                key={m.key}
                onClick={() => setSelectedMetric(m.key)}
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
                  background: selectedMetric === m.key ? "#fff"        : "transparent",
                  color:      selectedMetric === m.key ? m.color       : "#94A3B8",
                  boxShadow:  selectedMetric === m.key ? "0 1px 3px rgba(15,23,42,0.12)" : "none",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Valuation badge */}
          {valuationResult && <ValuationBadge result={valuationResult} />}

          {/* Time range pills */}
          <div style={{
            display: "flex", gap: 4, padding: 3,
            borderRadius: 7,
            background: "rgba(15,23,42,0.04)",
            border: "1px solid rgba(15,23,42,0.07)",
          }}>
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
                  background: range === r ? "#fff"    : "transparent",
                  color:      range === r ? "#0F172A" : "#94A3B8",
                  boxShadow:  range === r ? "0 1px 3px rgba(15,23,42,0.12)" : "none",
                }}
              >
                {r}
              </button>
            ))}
          </div>
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
                  <stop offset="5%"  stopColor={metricCfg?.color ?? "#7C3AED"} stopOpacity={0.18} />
                  <stop offset="90%" stopColor={metricCfg?.color ?? "#7C3AED"} stopOpacity={0.01} />
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
                domain={leftDomain}
                tick={{ fill: "#2B5CE0", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
                axisLine={false}
                tickLine={false}
                width={50}
                tickFormatter={fmtPrice}
              />

              {/* Right axis — Earnings (geometrically anchored to price scale) */}
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={rightDomain}
                tick={{ fill: metricCfg?.color ?? "#7C3AED", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
                axisLine={false}
                tickLine={false}
                width={46}
                tickFormatter={fmtCompact}
              />

              <Tooltip
                content={
                  <DualTooltip
                    metricKey={selectedMetric}
                    earningsLabel={metricCfg?.label ?? "Earnings"}
                    earningsColor={metricCfg?.color ?? "#7C3AED"}
                  />
                }
              />

              {/* Earnings series — reacts to selectedMetric */}
              {hasEarnings && (
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey={selectedMetric}
                  name={metricCfg?.label ?? "Earnings"}
                  stroke={metricCfg?.color ?? "#7C3AED"}
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  fill="url(#niGradientPE)"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}

              {/* Price — solid line, always on left axis */}
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
