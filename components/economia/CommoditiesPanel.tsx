"use client";

import { PATRIA, FONT_SECONDARY, TEXT, TEXT_ON_DARK, BORDER, SURFACE } from "@/lib/patriaTheme";

import React, { useState } from "react";
import { Search, X } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────

interface HistMeta {
  name: string;
  ticker?: string | null;
  group?: string;
  spot: number | null;
  ytdPct: number | null;
  avg2026: number | null;
  avg2025: number | null;
  avg2024: number | null;
}

interface SeriesRow {
  date: string;
  [commodity: string]: string | number | null;
}

interface Quarter {
  quarter: string;
  fwd: number | null;
  analyst: number | null;
}

interface ProjEntry {
  name: string;
  ticker?: string | null;
  spotCurrent: number | null;
  quarters: Quarter[];
}

interface Props {
  historical: { meta: HistMeta[]; series: SeriesRow[] };
  projections: ProjEntry[];
}

type Tab = "historical" | "projections";
type Range = "1W" | "1M" | "6M" | "1Y" | "3Y" | "5Y";

const RANGE_DAYS: Record<Range, number> = {
  "1W": 7,
  "1M": 30,
  "6M": 182,
  "1Y": 365,
  "3Y": 1095,
  "5Y": 1825,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDateTick(v: unknown): string {
  if (typeof v !== "string" || v.length < 7) return "";
  const parts = v.split("-");
  const month = parseInt(parts[1], 10) - 1;
  if (isNaN(month) || month < 0 || month > 11) return "";
  return `${MONTHS_SHORT[month]} ${parts[0]}`;
}

function fmtNum(v: number | null, dec = 0): string {
  if (v === null) return "—";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function smartDec(v: number | null): number {
  if (v === null) return 0;
  if (v < 20) return 2;
  if (v < 100) return 1;
  return 0;
}


// ── Custom Tooltips ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HistTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  const dec = smartDec(typeof val === "number" ? val : null);
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(13,13,56,0.12)",
        boxShadow: "0 4px 16px rgba(13,13,56,0.12)",
        minWidth: 140,
      }}
    >
      <div className="font-secondary tabular-nums mb-1" style={{ color: "rgba(13,13,56,0.62)" }}>{label}</div>
      <div className="font-semibold font-secondary tabular-nums" style={{ color: "#2044DC" }}>
        {typeof val === "number" ? fmtNum(val, dec) : "—"}
      </div>
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ProjTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(13,13,56,0.12)",
        boxShadow: "0 4px 16px rgba(13,13,56,0.12)",
        minWidth: 160,
      }}
    >
      <div className="font-secondary tabular-nums mb-2" style={{ color: "rgba(13,13,56,0.62)" }}>{label}</div>
      {payload.map((p: { name: string; value: number | null; color: string }) => (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-0.5">
          <span style={{ color: p.color }}>{p.name === "fwd" ? "Fwd Curve" : "Analyst"}</span>
          <span className="font-secondary tabular-nums font-semibold" style={{ color: "#0D0D38" }}>
            {typeof p.value === "number" ? p.value.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── Historical sub-panel ──────────────────────────────────────────────────────

function fmtYtd(v: number | null): React.ReactNode {
  if (v === null) return <span style={{ color: "rgba(13,13,56,0.28)" }}>—</span>;
  const color = v > 0 ? "#001EAF" : v < 0 ? "#F8485E" : "rgba(13,13,56,0.62)";
  return (
    <span style={{ fontFamily: FONT_SECONDARY, fontSize: 11, fontWeight: 700, color }}>
      {v > 0 ? "+" : ""}{v.toFixed(1)}%
    </span>
  );
}

function HistoricalPanel({
  meta,
  series,
}: {
  meta: HistMeta[];
  series: SeriesRow[];
}) {
  const [selected, setSelected] = useState<string>(meta[0]?.name ?? "");
  const [query, setQuery] = useState<string>("");
  const [range, setRange] = useState<Range>("5Y");

  const allChartData = series.map((row) => ({
    date: row.date as string,
    value: row[selected] as number | null,
  }));

  const chartData = (() => {
    if (allChartData.length === 0) return [];
    const lastDateStr = allChartData[allChartData.length - 1].date;
    const lastDate = new Date(lastDateStr);
    const cutoff = new Date(lastDate);
    cutoff.setDate(cutoff.getDate() - RANGE_DAYS[range]);
    return allChartData.filter((r) => new Date(r.date) >= cutoff);
  })();

  const selectedMeta = meta.find((m) => m.name === selected);
  const dec = smartDec(selectedMeta?.spot ?? null);

  // Search filter
  const q = query.toLowerCase().trim();
  const filteredMeta = q ? meta.filter((r) => r.name.toLowerCase().includes(q)) : meta;

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 2fr" }}>
      {/* Left — table */}
      <div className="card" style={{ overflow: "hidden", padding: 0, alignSelf: "start" }}>
        {/* Search bar */}
        <div style={{ padding: "9px 14px", borderBottom: BORDER.base, background: SURFACE.zebra }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search
              size={13}
              style={{ position: "absolute", left: 9, color: TEXT.muted, pointerEvents: "none" }}
            />
            <input
              type="text"
              placeholder="Buscar commodity…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="placeholder:text-[rgba(13,13,56,0.45)]"
              style={{
                width: "100%",
                fontSize: 12,
                fontFamily: FONT_SECONDARY,
                padding: "6px 26px 6px 27px",
                borderRadius: 6,
                border: `1px solid ${BORDER.strong}`,
                background: SURFACE.card,
                color: TEXT.body,
                outline: "none",
                transition: "border-color 0.12s, box-shadow 0.12s",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = PATRIA.kingBlue;
                e.currentTarget.style.boxShadow = "0 0 0 2px rgba(32,68,220,0.14)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = BORDER.strong;
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                title="Limpiar búsqueda"
                style={{
                  position: "absolute",
                  right: 7,
                  display: "flex",
                  alignItems: "center",
                  color: TEXT.muted,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        <div style={{ maxHeight: 600, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F5F7FD", position: "sticky", top: 0, zIndex: 1 }}>
              <th style={{ padding: "7px 14px", textAlign: "left",  fontSize: 9, fontWeight: 700, fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue, letterSpacing: "0.08em" }}>COMMODITY</th>
              <th style={{ padding: "7px 10px", textAlign: "center", fontSize: 9, fontWeight: 700, fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue, letterSpacing: "0.08em" }}>SPOT</th>
              <th style={{ padding: "7px 10px", textAlign: "center", fontSize: 9, fontWeight: 700, fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue, letterSpacing: "0.08em" }}>YTD</th>
              <th style={{ padding: "7px 10px", textAlign: "center", fontSize: 9, fontWeight: 700, fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue, letterSpacing: "0.08em" }}>AVG 26</th>
              <th style={{ padding: "7px 10px", textAlign: "center", fontSize: 9, fontWeight: 700, fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue, letterSpacing: "0.08em" }}>AVG 25</th>
              <th style={{ padding: "7px 10px", textAlign: "center", fontSize: 9, fontWeight: 700, fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue, letterSpacing: "0.08em" }}>AVG 24</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              // Group-aware rendering with search: only show group header if group has matches
              const groups = Array.from(new Set(filteredMeta.map((r) => r.group ?? "Other")));
              if (q && filteredMeta.length === 0) {
                return (
                  <tr>
                    <td colSpan={6} style={{ padding: "20px 14px", textAlign: "center", fontSize: 12, color: "rgba(13,13,56,0.45)" }}>
                      No commodities match &quot;{query}&quot;
                    </td>
                  </tr>
                );
              }
              return groups.map((grp) => {
                const groupRows = filteredMeta.filter((r) => (r.group ?? "Other") === grp);
                return (
                  <React.Fragment key={grp}>
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          padding: "6px 14px",
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: "0.10em",
                          textTransform: "uppercase",
                          color: "#0D0D38",
                          background: "rgba(13,13,56,0.10)",
                          borderBottom: "1px solid rgba(13,13,56,0.12)",
                        }}
                      >
                        {grp}
                      </td>
                    </tr>
                    {groupRows.map((row, i) => {
                      const isActive = row.name === selected;
                      return (
                        <tr
                          key={row.name}
                          onClick={() => setSelected(row.name)}
                          style={{
                            cursor: "pointer",
                            background: isActive ? "rgba(32,68,220,0.06)" : i % 2 === 0 ? "transparent" : "rgba(13,13,56,0.02)",
                            borderBottom: "1px solid rgba(13,13,56,0.05)",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.03)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "transparent" : "rgba(13,13,56,0.02)";
                          }}
                        >
                          <td style={{ padding: "8px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              {isActive && (
                                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#2044DC", flexShrink: 0 }} />
                              )}
                              <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? "#001EAF" : "#0D0D38" }}>
                                {row.name}
                              </span>
                              {row.ticker && (
                                <span style={{
                                  fontSize: 9,
                                  fontFamily: FONT_SECONDARY,
                                  color: "rgba(13,13,56,0.45)",
                                  background: "#F5F7FD",
                                  border: "1px solid rgba(13,13,56,0.10)",
                                  borderRadius: 4,
                                  padding: "1px 5px",
                                  letterSpacing: "0.04em",
                                  flexShrink: 0,
                                }}>
                                  {row.ticker}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: FONT_SECONDARY, fontSize: 13, fontWeight: 800, color: "#0D0D38" }}>
                            {fmtNum(row.spot, smartDec(row.spot))}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "center" }}>
                            {fmtYtd(row.ytdPct)}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: FONT_SECONDARY, fontSize: 11, fontWeight: 600, color: "#2044DC" }}>
                            {fmtNum(row.avg2026, smartDec(row.avg2026))}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: FONT_SECONDARY, fontSize: 11, color: "rgba(13,13,56,0.62)" }}>
                            {fmtNum(row.avg2025, smartDec(row.avg2025))}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: FONT_SECONDARY, fontSize: 11, color: "rgba(13,13,56,0.45)" }}>
                            {fmtNum(row.avg2024, smartDec(row.avg2024))}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              });
            })()}
          </tbody>
        </table>
        </div>
        <div className="flex justify-end px-4 py-2">
          <span className="text-xs" style={{ color: "rgba(13,13,56,0.28)" }}>Fuente: Bloomberg</span>
        </div>
      </div>

      {/* Right — chart */}
      <div className="card flex flex-col overflow-hidden" style={{ minHeight: 340 }}>
        <div
          className="px-5 py-3 flex items-center justify-between"
        style={{ background: PATRIA.darkBlue }}
        >
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold font-primary uppercase tracking-wide" style={{ color: PATRIA.white }}>{selected}</h3>
              {selectedMeta?.ticker && (
                <span style={{
                  fontSize: 10,
                  fontFamily: FONT_SECONDARY,
                  color: "rgba(255,255,255,0.72)",
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 4,
                  padding: "1px 6px",
                  letterSpacing: "0.04em",
                }}>
                  {selectedMeta.ticker}
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5 font-secondary" style={{ color: "rgba(255,255,255,0.72)" }}>
              Daily history · Spot: <span className="font-secondary tabular-nums font-semibold" style={{ color: PATRIA.turquoise }}>{fmtNum(selectedMeta?.spot ?? null, dec)}</span>
            </p>
          </div>
          {/* Selector de rango — vive sobre fondo dark-blue, así que usa los tonos onDark */}
          <div
            className="flex items-center gap-0.5 p-0.5 rounded-lg"
            style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${BORDER.onDark}` }}
          >
            {(["1W","1M","6M","1Y","3Y","5Y"] as Range[]).map((r) => {
              const active = range === r;
              return (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: FONT_SECONDARY,
                    letterSpacing: "0.02em",
                    padding: "3px 8px",
                    borderRadius: 5,
                    border: "1px solid transparent",
                    background: active ? PATRIA.turquoise : "transparent",
                    color: active ? PATRIA.darkBlue : TEXT_ON_DARK.label,
                    cursor: "pointer",
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.14)";
                      e.currentTarget.style.color = PATRIA.white;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = TEXT_ON_DARK.label;
                    }
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>
        <div className="px-2 py-4 flex-1" style={{ minHeight: 280 }}>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full" style={{ color: "rgba(13,13,56,0.62)", fontSize: 13 }}>
              No data for {selected}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(13,13,56,0.06)" />
                <XAxis
                  dataKey="date"
                  scale="point"
                  padding={{ left: 0, right: 0 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  tick={{ fill: "rgba(13,13,56,0.62)", fontSize: 11, fontFamily: FONT_SECONDARY, dy: 10 } as any}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={60}
                  tickFormatter={fmtDateTick}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "rgba(13,13,56,0.45)", fontSize: 9, fontFamily: FONT_SECONDARY }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => v >= 1000
                    ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
                    : v.toFixed(dec)
                  }
                  width={52}
                />
                <Tooltip content={<HistTooltip />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={PATRIA.darkBlue}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 4, fill: PATRIA.darkBlue, stroke: "#FFFFFF", strokeWidth: 2 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="flex justify-end px-5 pb-3">
          <span className="text-xs" style={{ color: "rgba(13,13,56,0.28)" }}>Fuente: Bloomberg</span>
        </div>
      </div>
    </div>
  );
}

// ── Projections sub-panel ─────────────────────────────────────────────────────

function ProjectionsPanel({ projections }: { projections: ProjEntry[] }) {
  const [selected, setSelected] = useState<string>(projections[0]?.name ?? "");

  const entry = projections.find((p) => p.name === selected) ?? projections[0];
  const chartData = entry?.quarters.map((q) => ({
    quarter: q.quarter,
    fwd: q.fwd,
    analyst: q.analyst,
  })) ?? [];

  const spotVal = entry?.spotCurrent ?? null;
  const spotDec = smartDec(spotVal);

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 2fr" }}>
      {/* Left — table */}
      <div className="card" style={{ overflow: "hidden", padding: 0, alignSelf: "start" }}>
        <div
          style={{
            padding: "8px 14px",
            borderBottom: "1px solid rgba(13,13,56,0.07)",
            fontSize: 10,
            fontWeight: 600,
            color: "rgba(13,13,56,0.62)",
            letterSpacing: "0.08em",
          }}
        >
          COMMODITY — SELECT TO CHART
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F5F7FD" }}>
              <th style={{ padding: "7px 14px", textAlign: "left",  fontSize: 9, fontWeight: 700, fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue, letterSpacing: "0.08em" }}>COMMODITY</th>
              <th style={{ padding: "7px 10px", textAlign: "right", fontSize: 9, fontWeight: 700, fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue, letterSpacing: "0.08em" }}>SPOT</th>
            </tr>
          </thead>
          <tbody>
            {projections.map((row, i) => {
              const isActive = row.name === selected;
              return (
                <tr
                  key={row.name}
                  onClick={() => setSelected(row.name)}
                  style={{
                    cursor: "pointer",
                    background: isActive ? "rgba(32,68,220,0.06)" : i % 2 === 0 ? "transparent" : "rgba(13,13,56,0.02)",
                    borderBottom: "1px solid rgba(13,13,56,0.05)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "transparent" : "rgba(13,13,56,0.02)";
                  }}
                >
                  <td style={{ padding: "9px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {isActive && (
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#2044DC", flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? "#001EAF" : "#0D0D38" }}>
                        {row.name}
                      </span>
                      {row.ticker && (
                        <span style={{
                          fontSize: 9,
                          fontFamily: FONT_SECONDARY,
                          color: "rgba(13,13,56,0.45)",
                          background: "#F5F7FD",
                          border: "1px solid rgba(13,13,56,0.10)",
                          borderRadius: 4,
                          padding: "1px 5px",
                          letterSpacing: "0.04em",
                          flexShrink: 0,
                        }}>
                          {row.ticker}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", fontSize: 12, fontWeight: 700, color: "#0D0D38" }}>
                    {fmtNum(row.spotCurrent, smartDec(row.spotCurrent))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex justify-end px-4 py-2">
          <span className="text-xs" style={{ color: "rgba(13,13,56,0.28)" }}>Fuente: Bloomberg</span>
        </div>
      </div>

      {/* Right — ComposedChart */}
      <div className="card flex flex-col overflow-hidden" style={{ minHeight: 340 }}>
        <div
          className="px-5 py-3 flex items-center justify-between"
        style={{ background: PATRIA.darkBlue }}
        >
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold font-primary uppercase tracking-wide" style={{ color: PATRIA.white }}>{selected}</h3>
              {entry?.ticker && (
                <span style={{
                  fontSize: 10,
                  fontFamily: FONT_SECONDARY,
                  color: "rgba(255,255,255,0.72)",
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 4,
                  padding: "1px 6px",
                  letterSpacing: "0.04em",
                }}>
                  {entry.ticker}
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5 font-secondary" style={{ color: "rgba(255,255,255,0.72)" }}>
              Quarterly projections · Spot: <span className="font-secondary tabular-nums font-semibold" style={{ color: PATRIA.turquoise }}>{fmtNum(spotVal, spotDec)}</span>
            </p>
          </div>
        </div>
        <div className="px-2 py-4 flex-1" style={{ minHeight: 280 }}>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full" style={{ color: "rgba(13,13,56,0.62)", fontSize: 13 }}>
              No projections for {selected}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(13,13,56,0.06)" />
                <XAxis
                  dataKey="quarter"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  tick={{ fill: "rgba(13,13,56,0.62)", fontSize: 11, fontFamily: FONT_SECONDARY, dy: 10 } as any}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  minTickGap={20}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "rgba(13,13,56,0.45)", fontSize: 9, fontFamily: FONT_SECONDARY }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => v >= 1000
                    ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
                    : v.toFixed(spotDec)
                  }
                  width={52}
                />
                <Tooltip content={<ProjTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 10, color: "rgba(13,13,56,0.62)", paddingTop: 4 }}
                  formatter={(value) => value === "fwd" ? "Fwd Curve" : "Analyst Forecast"}
                />

                {spotVal !== null && (
                  <ReferenceLine
                    y={spotVal}
                    stroke="rgba(13,13,56,0.5)"
                    strokeDasharray="4 4"
                    label={{
                      value: `Spot ${fmtNum(spotVal, spotDec)}`,
                      position: "insideTopRight",
                      fontSize: 9,
                      fill: "rgba(13,13,56,0.45)",
                    }}
                  />
                )}

                <Line
                  type="monotone"
                  dataKey="fwd"
                  name="fwd"
                  stroke={PATRIA.darkBlue}
                  strokeWidth={2}
                  dot={{ fill: PATRIA.darkBlue, r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: PATRIA.darkBlue, stroke: "#FFFFFF", strokeWidth: 2 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="analyst"
                  name="analyst"
                  stroke={PATRIA.orange}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: PATRIA.orange, r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: PATRIA.orange, stroke: "#FFFFFF", strokeWidth: 2 }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="flex justify-end px-5 pb-3">
          <span className="text-xs" style={{ color: "rgba(13,13,56,0.28)" }}>Fuente: Bloomberg</span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CommoditiesPanel({ historical, projections }: Props) {
  const [tab, setTab] = useState<Tab>("historical");

  return (
    <div>
      {/* Tab selector */}
      <div
        className="flex items-center gap-1 mb-5 p-1 rounded-lg"
        style={{
          background: "rgba(13,13,56,0.04)",
          border: "1px solid rgba(13,13,56,0.08)",
          width: "fit-content",
        }}
      >
        {(["historical", "projections"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-5 py-1.5 rounded-md text-sm font-semibold transition-all capitalize"
            style={{
              background: tab === t ? "rgba(32,68,220,0.10)" : "transparent",
              color: tab === t ? "#001EAF" : "rgba(13,13,56,0.62)",
              border: tab === t ? "1px solid rgba(32,68,220,0.25)" : "1px solid transparent",
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "historical" && (
        <HistoricalPanel meta={historical.meta} series={historical.series} />
      )}
      {tab === "projections" && (
        <ProjectionsPanel projections={projections} />
      )}
    </div>
  );
}
