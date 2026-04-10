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

type MetricKey = "peFwd" | "evEbitdaFwd" | "pbv_vs_roe";

const TABS: { key: MetricKey; label: string; color: string }[] = [
  { key: "peFwd", label: "P/E Fwd", color: "#2B5CE0" },
  { key: "evEbitdaFwd", label: "EV/EBITDA Fwd", color: "#7C3AED" },
  { key: "pbv_vs_roe", label: "P/BV vs ROE", color: "#059669" },
];

const PBV_COLOR = "#059669";
const ROE_COLOR = "#D97706";

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtX = (v: number) => v.toFixed(2) + "x";
const fmtPct = (v: number) => (v * 100).toFixed(1) + "%";
const fmtAxis = (iso: string) => iso.slice(0, 4); // "2023"
const fmtTooltipDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
};
function fmtSingle(key: MetricKey, v: number) { return fmtX(v); }

// ── Tooltips ──────────────────────────────────────────────────────────────────
interface TPayload { value: number; dataKey?: string }

function SingleTooltip({ active, payload, label, color, fmt }: any) {
  if (!active ||!payload?.length) return null;
  return (
    <div style={TT_STYLE}>
      <div style={TT_DATE}>{fmtTooltipDate(label)}</div>
      <div style={{ color, fontWeight: 700, fontSize: 13 }}>{fmt(payload[0].value)}</div>
    </div>
  );
}

function DualTooltip({ active, payload, label }: any) {
  if (!active ||!payload?.length) return null;
  const pbv = payload.find((p: any) => p.dataKey === "pbv");
  const roe = payload.find((p: any) => p.dataKey === "roeFwd");
  return (
    <div style={TT_STYLE}>
      <div style={{...TT_DATE, marginBottom: 6 }}>{fmtTooltipDate(label)}</div>
      {pbv?.value!= null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 3 }}>
          <span style={{ color: "#64748B", fontSize: 11 }}>P/BV</span>
          <span style={{ color: PBV_COLOR, fontWeight: 700, fontSize: 12 }}>{fmtX(pbv.value)}</span>
        </div>
      )}
      {roe?.value!= null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "#64748B", fontSize: 11 }}>ROE Fwd</span>
          <span style={{ color: ROE_COLOR, fontWeight: 700, fontSize: 12 }}>{fmtPct(roe.value)}</span>
        </div>
      )}
    </div>
  );
}

const TT_STYLE: React.CSSProperties = {
  background: "#fff", border: "1px solid rgba(15,23,42,0.10)", borderRadius: 6,
  padding: "8px 13px", fontSize: 11, fontFamily: "JetBrains Mono, monospace",
  boxShadow: "0 4px 16px rgba(15,23,42,0.12)", minWidth: 130,
};
const TT_DATE: React.CSSProperties = {
  color: "#94A3B8", fontSize: 10, marginBottom: 3, paddingBottom: 4,
  borderBottom: "1px solid rgba(15,23,42,0.06)",
};

function LegendItem({ color, label, dashed = false, swatch = "line" }: any) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {swatch === "band"? (
        <span style={{ display: "inline-block", width: 12, height: 10, background: `${color}18`, border: `1px solid ${color}35`, borderRadius: 2 }} />
      ) : dashed? (
        <span style={{ display: "inline-block", width: 18, borderTop: `2px dashed ${color}` }} />
      ) : (
        <span style={{ display: "inline-block", width: 18, height: 2, background: color, borderRadius: 1 }} />
      )}
      {label}
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ValuationChart({ data }: { data: ValuationPoint[] }) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>("peFwd");
  const tab = TABS.find((t) => t.key === activeMetric)!;
  const isDual = activeMetric === "pbv_vs_roe";

  const single = useMemo(() => {
    if (isDual) return { chartData: [], bands: { avg: NaN, upper: NaN, lower: NaN } };
    const field = activeMetric as "peFwd" | "evEbitdaFwd";
    const raw = data.map(r => r[field]).filter((v): v is number => v!= null && isFinite(v));
    const b = computeBands(raw);
    const cd = data.filter(r => r[field]!= null).map(r => ({ date: r.date, value: r[field] as number }));
    return { chartData: cd, bands: b };
  }, [data, activeMetric, isDual]);

  const dual = useMemo(() => {
    if (!isDual) return { chartData: [], pbvBands: { avg: NaN, upper: NaN, lower: NaN } };
    const pbvVals = data.map(r => r.pbv).filter((v): v is number => v!= null && isFinite(v));
    const pbvBands = computeBands(pbvVals);
    const cd = data.filter(r => r.pbv!= null || r.roeFwd!= null).map(r => ({
      date: r.date, pbv: r.pbv?? null, roeFwd: r.roeFwd?? null,
    }));
    return { chartData: cd, pbvBands };
  }, [data, isDual]);

  // ── Ticks ANUALES ───────────────────────────────────────────────────────────
  const yearTicks = useMemo(() => {
    const src = isDual? dual.chartData : single.chartData;
    const seen = new Set<string>();
    return src.filter(p => {
      const y = new Date(p.date).getFullYear().toString();
      if (seen.has(y)) return false;
      seen.add(y);
      return true;
    }).map(p => p.date);
  }, [single.chartData, dual.chartData, isDual]);

  const hasBands =!isDual && isFinite(single.bands.avg) && single.chartData.length > 1;
  const hasPbvBands = isDual && isFinite(dual.pbvBands.avg) && dual.chartData.length > 1;
  const noData = (!isDual &&!single.chartData.length) || (isDual &&!dual.chartData.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveMetric(t.key)}
            style={{
              padding: "5px 13px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
              border: t.key === activeMetric? `1.5px solid ${t.color}` : "1.5px solid rgba(15,23,42,0.10)",
              background: t.key === activeMetric? `${t.color}12` : "#F8FAFF",
              color: t.key === activeMetric? t.color : "#64748B",
            }}>{t.label}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap", fontSize: 10, color: "#94A3B8", fontFamily: "JetBrains Mono, monospace" }}>
        {!isDual && hasBands && (
          <>
            <LegendItem color={tab.color} label={tab.label} />
            <LegendItem color="#94A3B8" label={`Avg ${fmtSingle(activeMetric, single.bands.avg)}`} dashed />
            <LegendItem color={tab.color} label={`±1 SD`} swatch="band" />
          </>
        )}
        {isDual && (
          <>
            <LegendItem color={PBV_COLOR} label="P/BV (left)" />
            {hasPbvBands && <><LegendItem color="#94A3B8" label={`Avg ${fmtX(dual.pbvBands.avg)}`} dashed /><LegendItem color={PBV_COLOR} label={`±1 SD`} swatch="band" /></>}
            <LegendItem color={ROE_COLOR} label="ROE Fwd (right)" dashed />
          </>
        )}
      </div>

      {noData? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#CBD5E1", fontSize: 12 }}>
          No data for {tab.label}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            {!isDual? (
              <ComposedChart data={single.chartData} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.05)" vertical={false} />
                <XAxis dataKey="date" ticks={yearTicks} tickFormatter={fmtAxis}
                  tick={{ fill: "#94A3B8", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false} tickLine={false} />
                <YAxis domain={["auto", "auto"]} tick={{ fill: "#94A3B8", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false} tickLine={false} tickFormatter={(v) => fmtSingle(activeMetric, v)} width={46} />
                <Tooltip content={<SingleTooltip color={tab.color} fmt={(v: number) => fmtSingle(activeMetric, v)} />} />
                {hasBands && <ReferenceArea y1={single.bands.lower} y2={single.bands.upper} fill={`${tab.color}12`} stroke={`${tab.color}30`} strokeDasharray="4 4" />}
                {hasBands && <ReferenceLine y={single.bands.avg} stroke="#94A3B8" strokeDasharray="5 3" />}
                <Line type="monotone" dataKey="value" stroke={tab.color} strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: tab.color }} isAnimationActive={false} />
              </ComposedChart>
            ) : (
              <ComposedChart data={dual.chartData} margin={{ top: 6, right: 48, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.05)" vertical={false} />
                <XAxis dataKey="date" ticks={yearTicks} tickFormatter={fmtAxis}
                  tick={{ fill: "#94A3B8", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" orientation="left" domain={["auto", "auto"]}
                  tick={{ fill: PBV_COLOR, fontSize: 9, fontFamily: "JetBrains Mono, monospace" }} axisLine={false} tickLine={false} tickFormatter={fmtX} width={40} />
                <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]}
                  tick={{ fill: ROE_COLOR, fontSize: 9, fontFamily: "JetBrains Mono, monospace" }} axisLine={false} tickLine={false} tickFormatter={fmtPct} width={42} />
                <Tooltip content={<DualTooltip />} />
                {hasPbvBands && <ReferenceArea yAxisId="left" y1={dual.pbvBands.lower} y2={dual.pbvBands.upper} fill={`${PBV_COLOR}12`} stroke={`${PBV_COLOR}30`} strokeDasharray="4 4" />}
                {hasPbvBands && <ReferenceLine yAxisId="left" y={dual.pbvBands.avg} stroke="#94A3B8" strokeDasharray="5 3" />}
                <Line yAxisId="left" type="monotone" dataKey="pbv" stroke={PBV_COLOR} strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: PBV_COLOR }} connectNulls={false} isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="roeFwd" stroke={ROE_COLOR} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, fill: ROE_COLOR }} connectNulls={false} isAnimationActive={false} />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}