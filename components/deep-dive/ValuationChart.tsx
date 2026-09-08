"use client";

import { useState, useMemo, useEffect } from "react";
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
import type { ValuationHistoryPayload } from "@/app/api/companies/[ticker]/valuation-history/route";
import type { UniverseItem } from "@/app/api/analysis/universe/route";
import { PATRIA, FONT_SECONDARY, seriesColor } from "@/lib/patriaTheme";
import ComparablePicker, { MAX_COMPARABLES, type Comparable } from "./ComparablePicker";

type MetricKey  = "peFwd" | "evEbitdaFwd" | "pbv_vs_roe";

// Una fila del gráfico de métrica simple: la fecha, el valor de la empresa base y
// una columna por comparable, indexada por su ticker. La firma de índice deja meter
// esas columnas dinámicas sin perder el tipo de `date` y `value`.
interface SingleRow {
  date:  string;
  value: number;
  [comparableTicker: string]: string | number | null;
}
type TimeRange  = "1yr" | "3yr" | "5yr" | "10yr";

// Fondo claro → prioridad dark-blue, blue, king-blue (seriesColor lo resuelve).
const TABS: { key: MetricKey; label: string; color: string }[] = [
  { key: "peFwd",       label: "P/E Fwd",       color: seriesColor(0) },
  { key: "evEbitdaFwd", label: "EV/EBITDA Fwd", color: seriesColor(1) },
  { key: "pbv_vs_roe",  label: "P/BV vs ROE",   color: seriesColor(2) },
];
const TIME_RANGES: TimeRange[] = ["1yr", "3yr", "5yr", "10yr"];

// P/BV y ROE conviven en el mismo gráfico de doble eje: azul principal vs naranja.
const PBV_COLOR = PATRIA.darkBlue;
const ROE_COLOR = PATRIA.orange;

// Colores de las comparables. La empresa base se pinta con el color de su métrica
// (dark-blue o blue), así que las comparables salen del otro extremo del manual —
// naranjo y rosado— para que las tres líneas se distingan de un vistazo. Turquesa
// quedó fuera: sobre fondo blanco no contrasta lo suficiente.
const COMPARABLE_COLORS = [PATRIA.orange, PATRIA.pink];

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
  background: "#fff", border: "1px solid rgba(13,13,56,0.10)", borderRadius: 6,
  padding: "8px 13px", fontSize: 11, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
  boxShadow: "0 4px 16px rgba(13,13,56,0.12)", minWidth: 130,
};
const TT_DATE: React.CSSProperties = {
  color: "rgba(13,13,56,0.45)", fontSize: 10, marginBottom: 3, paddingBottom: 4,
  borderBottom: "1px solid rgba(13,13,56,0.06)",
};

// Con comparables el tooltip deja de ser un solo número: lista una fila por serie
// presente en ese punto, cada una con su color y su nombre.
function SingleTooltip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p: any) => p.value != null);
  if (!rows.length) return null;
  return (
    <div style={TT_STYLE}>
      <div style={{ ...TT_DATE, marginBottom: rows.length > 1 ? 6 : 3 }}>{fmtTooltipDate(label)}</div>
      {rows.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          {rows.length > 1 && (
            <span style={{ display: "inline-block", width: 10, height: 2, background: p.stroke, borderRadius: 1, flexShrink: 0 }} />
          )}
          {rows.length > 1 && (
            <span style={{ color: "rgba(13,13,56,0.62)", fontSize: 11, flex: 1, whiteSpace: "nowrap" }}>{p.name}</span>
          )}
          <span style={{ color: p.stroke, fontWeight: 700, fontSize: rows.length > 1 ? 12 : 13 }}>{fmt(p.value)}</span>
        </div>
      ))}
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
          <span style={{ color: "rgba(13,13,56,0.62)", fontSize: 11 }}>P/BV</span>
          <span style={{ color: PBV_COLOR, fontWeight: 700, fontSize: 12 }}>{fmtX(pbv.value)}</span>
        </div>
      )}
      {roe?.value != null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "rgba(13,13,56,0.62)", fontSize: 11 }}>ROE Fwd</span>
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
          fontFamily={FONT_SECONDARY}
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
          fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
          background: isDiscount ? "rgba(0,30,175,0.10)" : "rgba(248,72,94,0.10)",
          color: isDiscount ? "#001EAF" : "#F8485E",
          border: `1px solid ${isDiscount ? "rgba(0,30,175,0.20)" : "rgba(248,72,94,0.20)"}`,
        }}
      >
        {isDiscount ? "Discount" : "Premium"}: {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
      </div>
      <div style={{ fontSize: 11, color: "rgba(13,13,56,0.45)", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
        vs. {timeRange} median
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ValuationChart({
  data,
  ticker,
  companyName,
}: {
  data:         ValuationPoint[];
  /** Empresa base. Sin esto no hay comparables: es lo que se excluye del buscador. */
  ticker?:      string;
  companyName?: string;
}) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>("peFwd");
  const [timeRange,    setTimeRange]    = useState<TimeRange>("10yr");

  // Comparables superpuestas. La serie cruda se guarda aparte del chip para que
  // cambiar de métrica o de período no obligue a volver a pedirla.
  const [comparables, setComparables] = useState<Comparable[]>([]);
  const [cmpSeries,   setCmpSeries]   = useState<Record<string, ValuationPoint[]>>({});

  const tab    = TABS.find((t) => t.key === activeMetric)!;
  const isDual = activeMetric === "pbv_vs_roe";

  // El buscador sólo aparece en las métricas de una serie. En "P/BV vs ROE" el
  // gráfico ya usa dos ejes y dos líneas para UNA empresa; sumarle comparables lo
  // volvería ilegible.
  const canCompare = !!ticker && !isDual;

  function addComparable(item: UniverseItem) {
    if (comparables.length >= MAX_COMPARABLES) return;
    const color = COMPARABLE_COLORS[comparables.length % COMPARABLE_COLORS.length];
    setComparables((prev) => [...prev, { ticker: item.ticker, name: item.name, color, loading: true }]);

    fetch(`/api/companies/${encodeURIComponent(item.ticker)}/valuation-history`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((d: ValuationHistoryPayload) => {
        setCmpSeries((prev) => ({ ...prev, [item.ticker]: d.points }));
        setComparables((prev) => prev.map((c) => (c.ticker === item.ticker ? { ...c, loading: false } : c)));
      })
      .catch(() => {
        setComparables((prev) => prev.map((c) => (c.ticker === item.ticker ? { ...c, loading: false } : c)));
      });
  }

  function removeComparable(t: string) {
    setComparables((prev) => prev.filter((c) => c.ticker !== t));
    setCmpSeries((prev) => {
      const next = { ...prev };
      delete next[t];
      return next;
    });
  }

  // Al pasar a P/BV vs ROE las comparables se sueltan: volver a la métrica anterior
  // con chips vivos pero sin líneas sería peor que empezar limpio.
  useEffect(() => {
    if (isDual && comparables.length) {
      setComparables([]);
      setCmpSeries({});
    }
  }, [isDual, comparables.length]);

  // ── Filter data by time range ─────────────────────────────────────────────
  const filteredData = useMemo(() => filterByRange(data, timeRange), [data, timeRange]);

  // ── Single-metric chart data + bands ──────────────────────────────────────
  // Las bandas ±1σ y la mediana se calculan SÓLO sobre la empresa base: son su
  // estadística propia, y dibujarlas para cada comparable saturaría el gráfico.
  const single = useMemo(() => {
    if (isDual) return { chartData: [], bands: { avg: NaN, median: NaN, upper: NaN, lower: NaN } };
    const field = activeMetric as "peFwd" | "evEbitdaFwd";
    const raw   = filteredData.map((r) => r[field]).filter((v): v is number => v != null && isFinite(v));
    const b     = computeBands(raw);

    // Las series se alinean por fecha. La base manda las filas: una comparable con
    // más historia no extiende el eje, y con menos deja huecos que Recharts corta.
    const rows = filteredData
      .filter((r) => r[field] != null)
      .map((r) => {
        const row: SingleRow = { date: r.date, value: r[field] as number };
        for (const c of comparables) {
          const pt = cmpSeries[c.ticker]?.find((p) => p.date === r.date);
          row[c.ticker] = pt ? (pt[field] ?? null) : null;
        }
        return row;
      });

    return { chartData: rows, bands: b };
  }, [filteredData, activeMetric, isDual, comparables, cmpSeries]);

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
                border: t.key === activeMetric ? `1.5px solid ${t.color}` : "1.5px solid rgba(13,13,56,0.10)",
                background: t.key === activeMetric ? `${t.color}12` : "#F5F7FD",
                color: t.key === activeMetric ? t.color : "rgba(13,13,56,0.62)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Comparables + time range */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {canCompare && (
          <ComparablePicker
            baseTicker={ticker!}
            selected={comparables}
            onAdd={addComparable}
            onRemove={removeComparable}
          />
        )}

        <div
          style={{
            display: "flex",
            gap: 2,
            background: "rgba(13,13,56,0.04)",
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
                fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
                cursor: "pointer",
                border: "none",
                background: r === timeRange ? "#fff" : "transparent",
                color: r === timeRange ? "#0D0D38" : "rgba(13,13,56,0.45)",
                boxShadow: r === timeRange ? "0 1px 3px rgba(13,13,56,0.10)" : "none",
              }}
            >
              {r}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap", fontSize: 11, color: "rgba(13,13,56,0.45)", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
        {!isDual && hasBands && (
          <>
            {/* Con comparables el nombre de la base deja de ser obvio: se rotula. */}
            <LegendItem color={tab.color} label={comparables.length ? (companyName || ticker || tab.label) : tab.label} />
            <LegendItem color="rgba(13,13,56,0.45)" label={`Median ${fmtX(single.bands.median)}`} dashed />
            <LegendItem color={tab.color} label="±1 SD" swatch="band" />
          </>
        )}
        {/* Las comparables sólo aportan su línea: sin mediana ni bandas propias. */}
        {!isDual && comparables.map((c) => (
          <LegendItem key={c.ticker} color={c.color} label={c.ticker} />
        ))}
        {isDual && (
          <>
            <LegendItem color={PBV_COLOR} label="P/BV (left)" />
            {hasPbvBands && (
              <>
                <LegendItem color="rgba(13,13,56,0.45)" label={`Median ${fmtX(dual.pbvBands.median)}`} dashed />
                <LegendItem color={PBV_COLOR} label="±1 SD" swatch="band" />
              </>
            )}
            <LegendItem color={ROE_COLOR} label="ROE Fwd (right)" dashed />
          </>
        )}
      </div>

      {noData ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(13,13,56,0.28)", fontSize: 11 }}>
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
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(13,13,56,0.05)" vertical={false} />
                <XAxis
                  dataKey="date" ticks={yearTicks} tickFormatter={fmtAxis}
                  tick={{ fill: "rgba(13,13,56,0.45)", fontSize: 11, fontFamily: FONT_SECONDARY }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "rgba(13,13,56,0.45)", fontSize: 10, fontFamily: FONT_SECONDARY }}
                  axisLine={false} tickLine={false} tickFormatter={(v) => fmtX(v)} width={46}
                />
                <Tooltip content={<SingleTooltip fmt={(v: number) => fmtX(v)} />} />

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
                    stroke="rgba(13,13,56,0.45)"
                    strokeDasharray="5 3"
                    label={{
                      value: `Md ${fmtX(single.bands.median)}`,
                      position: "insideTopRight",
                      fontSize: 11,
                      fill: "rgba(13,13,56,0.45)",
                      fontFamily: FONT_SECONDARY,
                      fontWeight: 600,
                    }}
                  />
                )}

                {/* Main line — end-point label via custom dot */}
                <Line
                  type="monotone"
                  dataKey="value"
                  name={companyName || ticker || tab.label}
                  stroke={tab.color}
                  strokeWidth={2.5}
                  dot={makeEndDot(tab.color, fmtX, single.chartData.length)}
                  activeDot={{ r: 4, fill: tab.color }}
                  isAnimationActive={false}
                />

                {/* Comparables: línea limpia, sin bandas ni mediana propias.
                    connectNulls une los huecos donde la comparable no reportó ese día. */}
                {comparables.map((c) => (
                  <Line
                    key={c.ticker}
                    type="monotone"
                    dataKey={c.ticker}
                    name={c.ticker}
                    stroke={c.color}
                    strokeWidth={1.75}
                    dot={false}
                    activeDot={{ r: 3.5, fill: c.color }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </ComposedChart>
            ) : (
              <ComposedChart data={dual.chartData} margin={{ top: 6, right: 48, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(13,13,56,0.05)" vertical={false} />
                <XAxis
                  dataKey="date" ticks={yearTicks} tickFormatter={fmtAxis}
                  tick={{ fill: "rgba(13,13,56,0.45)", fontSize: 10, fontFamily: FONT_SECONDARY }}
                  axisLine={false} tickLine={false}
                />
                <YAxis yAxisId="left" orientation="left" domain={["auto", "auto"]}
                  tick={{ fill: PBV_COLOR, fontSize: 11, fontFamily: FONT_SECONDARY }}
                  axisLine={false} tickLine={false} tickFormatter={fmtX} width={40}
                />
                <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]}
                  tick={{ fill: ROE_COLOR, fontSize: 11, fontFamily: FONT_SECONDARY }}
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
                    stroke="rgba(13,13,56,0.45)" strokeDasharray="5 3"
                    label={{
                      value: `Md ${fmtX(dual.pbvBands.median)}`,
                      position: "insideTopRight",
                      fontSize: 11,
                      fill: "rgba(13,13,56,0.45)",
                      fontFamily: FONT_SECONDARY,
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
