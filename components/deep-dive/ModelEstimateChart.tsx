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
import { PATRIA, FONT_SECONDARY } from "@/lib/patriaTheme";
import { PatriaTitle } from "@/components/patria/PatriaTitle";

// ── Public types ─────────────────────────────────────────────────────────────
export interface EstimateMetric {
  key:    string;
  label:  string;
  colors: string[];   // one color per year slot (index 0 = solid, 1 = dashed…)
  gradId: string;
  /**
   * "years" (default): una serie por año proyectado, la forma clásica del panel.
   * "recommendation": una sola serie con el target price a lo largo de las
   * revisiones, y cada punto pintado según la recomendación vigente ese día.
   */
  kind?:  "years" | "recommendation";
}

export type EstimateRow = { date: string } & Record<string, number | string | null>;

/**
 * Colores de recomendación. El manual PATRIA no incluye verde ni rojo, así que se
 * usa la misma dupla que el resto de la plataforma (ver ReccBadge): azul profundo
 * para comprar, rosado corporativo para vender, y el gris-azulado semántico para
 * el neutral.
 */
export const RECC_COLORS = {
  buy:     PATRIA.blue,
  sell:    PATRIA.pink,
  hold:    "rgba(13,13,56,0.45)",
} as const;

export type ReccKind = keyof typeof RECC_COLORS;

/** Clasifica el texto libre del analista. Mismo criterio que ReccBadge. */
export function reccKind(recc: string | null | undefined): ReccKind {
  const u = (recc ?? "").toUpperCase();
  if (u.includes("BUY")  || u === "OW") return "buy";
  if (u.includes("SELL") || u === "UW") return "sell";
  return "hold";
}

/**
 * Serie de target price por revisión, con la recomendación de cada fecha.
 * A diferencia de buildEstimateRows esto NO pivotea por año: el TP es un único
 * valor por snapshot, y lo que aporta información es cómo se movió y con qué
 * recomendación lo acompañó el analista.
 */
export function buildRecommendationRows(
  snapshots: { header: { updateDate: string; tp: number | null; recc: string | null } }[],
): EstimateRow[] {
  return [...snapshots]
    .sort((a, b) => a.header.updateDate.localeCompare(b.header.updateDate))
    .map((s) => ({
      date: s.header.updateDate,
      tp:   s.header.tp ?? null,
      recc: s.header.recc ?? null,
    }));
}

/**
 * Pivots the analyst's historical model snapshots into one row per snapshot
 * date, keyed by forecast year. Each row therefore shows what the analyst was
 * projecting for those years *at the time that revision was published*.
 *
 * Snapshots arrive newest-first from the API; we sort ascending so the line
 * runs left→right from the earliest recommendation to the latest.
 */
export function buildEstimateRows<T extends { year: number }>(
  snapshots: { header: { updateDate: string }; financials: T[] }[],
  years:     number[],
  extractor: (row: T) => number | null,
): EstimateRow[] {
  const sorted = [...snapshots].sort((a, b) =>
    a.header.updateDate.localeCompare(b.header.updateDate),
  );
  return sorted.map((snap) => {
    const byYear = new Map<number, T>();
    for (const f of snap.financials) byYear.set(f.year, f);
    const row: EstimateRow = { date: snap.header.updateDate };
    for (const y of years) {
      const f = byYear.get(y);
      row[String(y)] = f ? extractor(f) : null;
    }
    return row;
  });
}

// ── Formatters ───────────────────────────────────────────────────────────────
function fmtCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (v / 1e3).toFixed(1) + "K";
  if (abs < 10)   return v.toFixed(2);
  return v.toFixed(1);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtAxisDate(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MONTHS[Number(m) - 1]} '${y.slice(2)}`;
}
function fmtFullDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

// Stroke dash per year index: 0 = solid area, 1 = dashed, 2 = dotted
const DASH_STYLES = ["", "5 4", "2 3"];

// ── Tooltip ──────────────────────────────────────────────────────────────────
interface TPayload { dataKey: string; value: number | null }

function EvoTooltip({
  active, payload, label, cfg, years,
}: {
  active?:  boolean;
  payload?: TPayload[];
  label?:   string;
  cfg:      EstimateMetric;
  years:    string[];
}) {
  if (!active || !payload?.length) return null;

  return (
    <div style={{
      background: "#fff",
      border: "1px solid rgba(13,13,56,0.10)",
      borderRadius: 6,
      padding: "8px 13px",
      fontSize: 11,
      fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
      boxShadow: "0 4px 16px rgba(13,13,56,0.12)",
      minWidth: 160,
    }}>
      <div style={{
        color: "rgba(13,13,56,0.45)", fontSize: 10,
        marginBottom: 6, paddingBottom: 5,
        borderBottom: "1px solid rgba(13,13,56,0.06)",
      }}>
        {label ? fmtFullDate(label) : ""}
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
              <span style={{ color: "rgba(13,13,56,0.62)" }}>{year}E</span>
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

// ── Legend ───────────────────────────────────────────────────────────────────
function EvoLegend({ cfg, years }: { cfg: EstimateMetric; years: string[] }) {
  return (
    <div style={{
      display: "flex", gap: 14, justifyContent: "flex-end",
      fontSize: 10, color: "rgba(13,13,56,0.45)",
      fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
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
            {year}E
          </span>
        );
      })}
    </div>
  );
}

// ── Recommendation: tooltip, leyenda y punto coloreado ───────────────────────
const RECC_LABEL: Record<ReccKind, string> = { buy: "Buy", hold: "Hold", sell: "Sell" };

function ReccTooltip({
  active, payload, label,
}: {
  active?:  boolean;
  payload?: { payload?: EstimateRow }[];
  label?:   string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const tp   = typeof row.tp === "number" ? row.tp : null;
  const recc = typeof row.recc === "string" ? row.recc : null;
  const kind = reccKind(recc);

  return (
    <div style={{
      background: "#fff",
      border: "1px solid rgba(13,13,56,0.10)",
      borderRadius: 6,
      padding: "8px 13px",
      fontSize: 11,
      fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
      boxShadow: "0 4px 16px rgba(13,13,56,0.12)",
      minWidth: 160,
    }}>
      <div style={{
        color: "rgba(13,13,56,0.45)", fontSize: 10,
        marginBottom: 6, paddingBottom: 5,
        borderBottom: "1px solid rgba(13,13,56,0.06)",
      }}>
        {label ? fmtFullDate(label) : ""}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 4 }}>
        <span style={{ color: "rgba(13,13,56,0.62)" }}>Target price</span>
        <span style={{ color: PATRIA.darkBlue, fontWeight: 700 }}>
          {tp != null ? fmtCompact(tp) : "—"}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center" }}>
        <span style={{ color: "rgba(13,13,56,0.62)" }}>Recommendation</span>
        <span style={{
          color: RECC_COLORS[kind], fontWeight: 800, letterSpacing: "0.05em",
          fontSize: 10.5, textTransform: "uppercase",
        }}>
          {recc ?? "—"}
        </span>
      </div>
    </div>
  );
}

function ReccLegend() {
  return (
    <div style={{
      display: "flex", gap: 14, justifyContent: "flex-end",
      fontSize: 10, color: "rgba(13,13,56,0.45)",
      fontFamily: FONT_SECONDARY,
      marginBottom: 6,
    }}>
      {(Object.keys(RECC_COLORS) as ReccKind[]).map((k) => (
        <span key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{
            display: "inline-block", width: 8, height: 8, borderRadius: "50%",
            background: RECC_COLORS[k],
          }} />
          {RECC_LABEL[k]}
        </span>
      ))}
    </div>
  );
}

/** Punto del TP pintado según la recomendación de esa revisión. */
function ReccDot(props: { cx?: number; cy?: number; payload?: EstimateRow; r?: number }) {
  const { cx, cy, payload, r = 4 } = props;
  if (cx == null || cy == null || payload?.tp == null) return null;
  const color = RECC_COLORS[reccKind(typeof payload.recc === "string" ? payload.recc : null)];
  return (
    <circle cx={cx} cy={cy} r={r} fill={color} stroke="#fff" strokeWidth={1.5} />
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  metrics:        EstimateMetric[];
  rowsByMetric:   Record<string, EstimateRow[]>;
  years:          string[];          // forecast years to plot, e.g. ["2026", "2027"]
  defaultMetric?: string;
  title?:         string;
}

export default function ModelEstimateChart({
  metrics, rowsByMetric, years, defaultMetric, title = "Estimate Evolution",
}: Props) {
  const [activeKey, setActiveKey] = useState<string>(defaultMetric ?? metrics[0]?.key ?? "");
  const cfg = useMemo(
    () => metrics.find((m) => m.key === activeKey) ?? metrics[0],
    [metrics, activeKey],
  );

  const chartData = rowsByMetric[cfg?.key ?? ""] ?? [];
  const isRecc  = cfg?.kind === "recommendation";
  const hasData = isRecc
    ? chartData.some((row) => row.tp != null)
    : chartData.some((row) => years.some((y) => row[y] != null));

  if (!cfg) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Header + metric selector ────────────────────────────────────────── */}
      <PatriaTitle
        style={{ marginBottom: 4, borderRadius: 6, flexWrap: "wrap", rowGap: 6 }}
        right={
        <div style={{
          display: "flex", gap: 3, padding: 3,
          borderRadius: 7, background: "rgba(255,255,255,0.10)",
          border: "1px solid rgba(255,255,255,0.16)",
        }}>
          {metrics.map((m) => {
            const active = m.key === cfg.key;
            return (
              <button
                key={m.key}
                onClick={() => setActiveKey(m.key)}
                style={{
                  padding: "3px 10px",
                  borderRadius: 5,
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                  outline: "none",
                  fontFamily: FONT_SECONDARY,
                  background: active ? PATRIA.white : "transparent",
                  color: active ? PATRIA.darkBlue : "rgba(255,255,255,0.72)",
                  boxShadow: active ? "0 1px 3px rgba(13,13,56,0.30)" : "none",
                  transition: "all 0.12s",
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        }
      >
        {title}
      </PatriaTitle>

      {/* ── Legend ──────────────────────────────────────────────────────────── */}
      {isRecc
        ? <ReccLegend />
        : years.length > 0 && <EvoLegend cfg={cfg} years={years} />}

      {/* ── Chart ───────────────────────────────────────────────────────────── */}
      {!hasData ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(13,13,56,0.28)", fontSize: 12 }}>
          {isRecc ? "No recommendation history" : `No ${cfg.label} estimate history`}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 130 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>

              <defs>
                <linearGradient id={cfg.gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={cfg.colors[0]} stopOpacity={0.16} />
                  <stop offset="90%" stopColor={cfg.colors[0]} stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(13,13,56,0.05)" vertical={false} />

              <XAxis
                dataKey="date"
                tickFormatter={fmtAxisDate}
                tick={{ fill: "rgba(13,13,56,0.45)", fontSize: 9, fontFamily: FONT_SECONDARY }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fill: "rgba(13,13,56,0.45)", fontSize: 9, fontFamily: FONT_SECONDARY }}
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtCompact}
                width={46}
              />

              <Tooltip
                content={isRecc ? <ReccTooltip /> : <EvoTooltip cfg={cfg} years={years} />}
                cursor={{ stroke: "rgba(13,13,56,0.08)", strokeWidth: 1 }}
              />

              <Legend content={() => null} />

              {/* Recommendation: una sola línea de TP; el color lo aporta cada punto. */}
              {isRecc && (
                <Line
                  type="monotone"
                  dataKey="tp"
                  stroke="rgba(13,13,56,0.28)"
                  strokeWidth={1.5}
                  dot={<ReccDot />}
                  activeDot={<ReccDot r={6} />}
                  isAnimationActive={false}
                  connectNulls
                />
              )}

              {!isRecc && years.map((year, i) => {
                const color = cfg.colors[i] ?? cfg.colors[cfg.colors.length - 1];
                const dash  = DASH_STYLES[i] ?? DASH_STYLES[DASH_STYLES.length - 1];
                const hasValues = chartData.some((r) => r[year] != null);
                if (!hasValues) return null;

                // First year gets a filled Area; subsequent years get Lines.
                if (i === 0) {
                  return (
                    <Area
                      key={year}
                      type="monotone"
                      dataKey={year}
                      stroke={color}
                      strokeWidth={2}
                      fill={`url(#${cfg.gradId})`}
                      dot={{ r: 2.5, fill: color, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
                      isAnimationActive={false}
                      connectNulls
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
                    dot={{ r: 2.5, fill: color, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
                    isAnimationActive={false}
                    connectNulls
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
