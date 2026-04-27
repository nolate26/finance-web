"use client";

import React, { useState } from "react";
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
        border: "1px solid rgba(15,23,42,0.12)",
        boxShadow: "0 4px 16px rgba(15,23,42,0.12)",
        minWidth: 140,
      }}
    >
      <div className="font-mono mb-1" style={{ color: "#64748B" }}>{label}</div>
      <div className="font-semibold font-mono" style={{ color: "#2B5CE0" }}>
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
        border: "1px solid rgba(15,23,42,0.12)",
        boxShadow: "0 4px 16px rgba(15,23,42,0.12)",
        minWidth: 160,
      }}
    >
      <div className="font-mono mb-2" style={{ color: "#64748B" }}>{label}</div>
      {payload.map((p: { name: string; value: number | null; color: string }) => (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-0.5">
          <span style={{ color: p.color }}>{p.name === "fwd" ? "Fwd Curve" : "Analyst"}</span>
          <span className="font-mono font-semibold" style={{ color: "#0F172A" }}>
            {typeof p.value === "number" ? p.value.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── Historical sub-panel ──────────────────────────────────────────────────────

function fmtYtd(v: number | null): React.ReactNode {
  if (v === null) return <span style={{ color: "#CBD5E1" }}>—</span>;
  const color = v > 0 ? "#059669" : v < 0 ? "#DC2626" : "#64748B";
  return (
    <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color }}>
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
        <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(15,23,42,0.07)" }}>
          <input
            type="text"
            placeholder="Search commodities…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              fontSize: 11,
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid rgba(15,23,42,0.12)",
              background: "#F8FAFC",
              color: "#334155",
              outline: "none",
            }}
          />
        </div>
        <div style={{ maxHeight: 600, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F0F4FA", position: "sticky", top: 0, zIndex: 1 }}>
              <th style={{ padding: "7px 14px", textAlign: "left",  fontSize: 9, fontWeight: 600, color: "#64748B", letterSpacing: "0.08em" }}>COMMODITY</th>
              <th style={{ padding: "7px 10px", textAlign: "center", fontSize: 9, fontWeight: 600, color: "#0F172A", letterSpacing: "0.08em" }}>SPOT</th>
              <th style={{ padding: "7px 10px", textAlign: "center", fontSize: 9, fontWeight: 600, color: "#475569", letterSpacing: "0.08em" }}>YTD</th>
              <th style={{ padding: "7px 10px", textAlign: "center", fontSize: 9, fontWeight: 600, color: "#2B5CE0", letterSpacing: "0.08em" }}>AVG 26</th>
              <th style={{ padding: "7px 10px", textAlign: "center", fontSize: 9, fontWeight: 600, color: "#475569", letterSpacing: "0.08em" }}>AVG 25</th>
              <th style={{ padding: "7px 10px", textAlign: "center", fontSize: 9, fontWeight: 600, color: "#94A3B8", letterSpacing: "0.08em" }}>AVG 24</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              // Group-aware rendering with search: only show group header if group has matches
              const groups = Array.from(new Set(filteredMeta.map((r) => r.group ?? "Other")));
              if (q && filteredMeta.length === 0) {
                return (
                  <tr>
                    <td colSpan={6} style={{ padding: "20px 14px", textAlign: "center", fontSize: 12, color: "#94A3B8" }}>
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
                          color: "#1E293B",
                          background: "#E2E8F0",
                          borderBottom: "1px solid rgba(15,23,42,0.12)",
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
                            background: isActive ? "rgba(43,92,224,0.06)" : i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.02)",
                            borderBottom: "1px solid rgba(15,23,42,0.05)",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.03)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.02)";
                          }}
                        >
                          <td style={{ padding: "8px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              {isActive && (
                                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#2B5CE0", flexShrink: 0 }} />
                              )}
                              <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? "#1E3A8A" : "#334155" }}>
                                {row.name}
                              </span>
                              {row.ticker && (
                                <span style={{
                                  fontSize: 9,
                                  fontFamily: "monospace",
                                  color: "#94A3B8",
                                  background: "#F1F5F9",
                                  border: "1px solid #E2E8F0",
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
                          <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: "#0F172A" }}>
                            {fmtNum(row.spot, smartDec(row.spot))}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "center" }}>
                            {fmtYtd(row.ytdPct)}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "#2B5CE0" }}>
                            {fmtNum(row.avg2026, smartDec(row.avg2026))}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: "monospace", fontSize: 11, color: "#475569" }}>
                            {fmtNum(row.avg2025, smartDec(row.avg2025))}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: "monospace", fontSize: 11, color: "#94A3B8" }}>
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
          <span className="text-xs" style={{ color: "#CBD5E1" }}>Fuente: Bloomberg</span>
        </div>
      </div>

      {/* Right — chart */}
      <div className="card flex flex-col overflow-hidden" style={{ minHeight: 340 }}>
        <div
          className="px-5 py-3 border-b flex items-center justify-between"
          style={{ borderColor: "rgba(15,23,42,0.07)" }}
        >
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold" style={{ color: "#0F172A" }}>{selected}</h3>
              {selectedMeta?.ticker && (
                <span style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "#94A3B8",
                  background: "#F1F5F9",
                  border: "1px solid #E2E8F0",
                  borderRadius: 4,
                  padding: "1px 6px",
                  letterSpacing: "0.04em",
                }}>
                  {selectedMeta.ticker}
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
              Daily history · Spot: <span className="font-mono font-semibold" style={{ color: "#2B5CE0" }}>{fmtNum(selectedMeta?.spot ?? null, dec)}</span>
            </p>
          </div>
          <div className="flex items-center gap-0.5">
            {(["1W","1M","6M","1Y","3Y","5Y"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "3px 7px",
                  borderRadius: 5,
                  border: range === r ? "1px solid rgba(43,92,224,0.30)" : "1px solid transparent",
                  background: range === r ? "rgba(43,92,224,0.10)" : "transparent",
                  color: range === r ? "#1E3A8A" : "#94A3B8",
                  cursor: "pointer",
                  transition: "all 0.1s",
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="px-2 py-4 flex-1" style={{ minHeight: 280 }}>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full" style={{ color: "#64748B", fontSize: 13 }}>
              No data for {selected}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" />
                <XAxis
                  dataKey="date"
                  scale="point"
                  padding={{ left: 0, right: 0 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  tick={{ fill: "#64748B", fontSize: 11, fontFamily: "monospace", dy: 10 } as any}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={60}
                  tickFormatter={fmtDateTick}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "#94A3B8", fontSize: 9, fontFamily: "monospace" }}
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
                  stroke="#2B5CE0"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 4, fill: "#2B5CE0", stroke: "#FFFFFF", strokeWidth: 2 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="flex justify-end px-5 pb-3">
          <span className="text-xs" style={{ color: "#CBD5E1" }}>Fuente: Bloomberg</span>
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
            borderBottom: "1px solid rgba(15,23,42,0.07)",
            fontSize: 10,
            fontWeight: 600,
            color: "#64748B",
            letterSpacing: "0.08em",
          }}
        >
          COMMODITY — SELECT TO CHART
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F0F4FA" }}>
              <th style={{ padding: "7px 14px", textAlign: "left",  fontSize: 9, fontWeight: 600, color: "#64748B", letterSpacing: "0.08em" }}>COMMODITY</th>
              <th style={{ padding: "7px 10px", textAlign: "right", fontSize: 9, fontWeight: 600, color: "#475569", letterSpacing: "0.08em" }}>SPOT</th>
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
                    background: isActive ? "rgba(43,92,224,0.06)" : i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.02)",
                    borderBottom: "1px solid rgba(15,23,42,0.05)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.02)";
                  }}
                >
                  <td style={{ padding: "9px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {isActive && (
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#2B5CE0", flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? "#1E3A8A" : "#334155" }}>
                        {row.name}
                      </span>
                      {row.ticker && (
                        <span style={{
                          fontSize: 9,
                          fontFamily: "monospace",
                          color: "#94A3B8",
                          background: "#F1F5F9",
                          border: "1px solid #E2E8F0",
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
                  <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#0F172A" }}>
                    {fmtNum(row.spotCurrent, smartDec(row.spotCurrent))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex justify-end px-4 py-2">
          <span className="text-xs" style={{ color: "#CBD5E1" }}>Fuente: Bloomberg</span>
        </div>
      </div>

      {/* Right — ComposedChart */}
      <div className="card flex flex-col overflow-hidden" style={{ minHeight: 340 }}>
        <div
          className="px-5 py-3 border-b flex items-center justify-between"
          style={{ borderColor: "rgba(15,23,42,0.07)" }}
        >
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold" style={{ color: "#0F172A" }}>{selected}</h3>
              {entry?.ticker && (
                <span style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "#94A3B8",
                  background: "#F1F5F9",
                  border: "1px solid #E2E8F0",
                  borderRadius: 4,
                  padding: "1px 6px",
                  letterSpacing: "0.04em",
                }}>
                  {entry.ticker}
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
              Quarterly projections · Spot: <span className="font-mono font-semibold" style={{ color: "#2B5CE0" }}>{fmtNum(spotVal, spotDec)}</span>
            </p>
          </div>
        </div>
        <div className="px-2 py-4 flex-1" style={{ minHeight: 280 }}>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full" style={{ color: "#64748B", fontSize: 13 }}>
              No projections for {selected}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" />
                <XAxis
                  dataKey="quarter"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  tick={{ fill: "#64748B", fontSize: 11, fontFamily: "monospace", dy: 10 } as any}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  minTickGap={20}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "#94A3B8", fontSize: 9, fontFamily: "monospace" }}
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
                  wrapperStyle={{ fontSize: 10, color: "#64748B", paddingTop: 4 }}
                  formatter={(value) => value === "fwd" ? "Fwd Curve" : "Analyst Forecast"}
                />

                {spotVal !== null && (
                  <ReferenceLine
                    y={spotVal}
                    stroke="rgba(100,116,139,0.5)"
                    strokeDasharray="4 4"
                    label={{
                      value: `Spot ${fmtNum(spotVal, spotDec)}`,
                      position: "insideTopRight",
                      fontSize: 9,
                      fill: "#94A3B8",
                    }}
                  />
                )}

                <Line
                  type="monotone"
                  dataKey="fwd"
                  name="fwd"
                  stroke="#2B5CE0"
                  strokeWidth={2}
                  dot={{ fill: "#2B5CE0", r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#2B5CE0", stroke: "#FFFFFF", strokeWidth: 2 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="analyst"
                  name="analyst"
                  stroke="#D97706"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: "#D97706", r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#D97706", stroke: "#FFFFFF", strokeWidth: 2 }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="flex justify-end px-5 pb-3">
          <span className="text-xs" style={{ color: "#CBD5E1" }}>Fuente: Bloomberg</span>
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
          background: "rgba(15,23,42,0.04)",
          border: "1px solid rgba(15,23,42,0.08)",
          width: "fit-content",
        }}
      >
        {(["historical", "projections"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-5 py-1.5 rounded-md text-sm font-semibold transition-all capitalize"
            style={{
              background: tab === t ? "rgba(43,92,224,0.10)" : "transparent",
              color: tab === t ? "#1E3A8A" : "#64748B",
              border: tab === t ? "1px solid rgba(43,92,224,0.25)" : "1px solid transparent",
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
