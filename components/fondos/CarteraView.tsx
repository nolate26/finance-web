"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────
interface SectorSummary {
  sector: string;
  fundWeight: number;
  benchWeight: number;
  activeWeight: number;
  count: number;
}

interface CarteraRow {
  company: string;
  portfolioPct: number;
  benchmarkPct: number;
  overweight: number;
  sector: string;
  macroSector: string;
  delta1W: number | null;
  delta1M: number | null;
}

interface Props {
  sectorSummary: SectorSummary[];
  cartera: CarteraRow[];
  benchmark: string;
  fundName?: string;
}

type SortCol = "company" | "sector" | "portfolioPct" | "benchmarkPct" | "overweight" | "sectorWeight" | "delta1W" | "delta1M";
type SortDir = "asc" | "desc";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtPct(v: number, signed = false): string {
  const p = v * 100;
  return (signed && p > 0 ? "+" : "") + p.toFixed(2) + "%";
}

function activeColor(v: number): string {
  return v > 0 ? "#059669" : v < 0 ? "#DC2626" : "#94A3B8";
}

function activeBg(v: number): string {
  return v > 0 ? "rgba(5,150,105,0.10)" : v < 0 ? "rgba(220,38,38,0.10)" : "transparent";
}

function fmtDelta(v: number | null): { text: string; color: string; bg: string } {
  if (v === null) return { text: "—", color: "#CBD5E1", bg: "transparent" };
  const p = v * 100;
  if (Math.abs(p) < 0.005) return { text: "0.00%", color: "#94A3B8", bg: "transparent" };
  return {
    text: (p > 0 ? "+" : "") + p.toFixed(2) + "%",
    color: p > 0 ? "#059669" : "#DC2626",
    bg: p > 0 ? "rgba(5,150,105,0.08)" : "rgba(220,38,38,0.08)",
  };
}

const SORT_ICON = { asc: "↑", desc: "↓", none: "↕" } as const;

// ── BarChart tooltip ──────────────────────────────────────────────────────────
function SectorTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: SectorSummary }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (!d) return null;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E2E8F0",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        minWidth: 180,
      }}
    >
      <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>{d.sector}</div>
      <div style={{ display: "grid", gap: 3 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: "#64748B" }}>Fund</span>
          <span style={{ fontWeight: 600, color: "#0F172A" }}>{fmtPct(d.fundWeight)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: "#64748B" }}>Benchmark</span>
          <span style={{ fontWeight: 600, color: "#64748B" }}>{fmtPct(d.benchWeight)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: "#64748B" }}>Active</span>
          <span style={{ fontWeight: 700, color: activeColor(d.activeWeight) }}>
            {fmtPct(d.activeWeight, true)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Holdings flat table ───────────────────────────────────────────────────────
interface HoldingsTableProps {
  holdings: CarteraRow[];
  allCount: number;
  benchmark: string;
  selectedSector: string | null;
  totalSectorFundWeight: number;
  onClear: () => void;
}

function HoldingsTable({
  holdings,
  allCount,
  benchmark,
  selectedSector,
  totalSectorFundWeight,
  onClear,
}: HoldingsTableProps) {
  const [sortCol, setSortCol] = useState<SortCol>("portfolioPct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(col: SortCol) {
    if (col === sortCol) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  }

  const sorted = useMemo(
    () =>
      [...holdings].sort((a, b) => {
        if (sortCol === "company") {
          const cmp = a.company.localeCompare(b.company);
          return sortDir === "asc" ? cmp : -cmp;
        }
        if (sortCol === "sector") {
          const cmp = (a.macroSector || "").localeCompare(b.macroSector || "");
          return sortDir === "asc" ? cmp : -cmp;
        }
        // Numeric columns — nulls always last
        let av: number | null = null;
        let bv: number | null = null;
        if (sortCol === "portfolioPct") { av = a.portfolioPct; bv = b.portfolioPct; }
        else if (sortCol === "benchmarkPct") { av = a.benchmarkPct; bv = b.benchmarkPct; }
        else if (sortCol === "overweight") { av = a.overweight; bv = b.overweight; }
        else if (sortCol === "sectorWeight") {
          av = totalSectorFundWeight > 0 ? a.portfolioPct / totalSectorFundWeight : a.portfolioPct;
          bv = totalSectorFundWeight > 0 ? b.portfolioPct / totalSectorFundWeight : b.portfolioPct;
        }
        else if (sortCol === "delta1W") { av = a.delta1W; bv = b.delta1W; }
        else if (sortCol === "delta1M") { av = a.delta1M; bv = b.delta1M; }
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return sortDir === "asc" ? av - bv : bv - av;
      }),
    [holdings, sortCol, sortDir, totalSectorFundWeight]
  );

  const hasSectorWeight = selectedSector !== null;
  const hasDelta1W = holdings.some((r) => r.delta1W !== null);
  const hasDelta1M = holdings.some((r) => r.delta1M !== null);

  const thStyle = {
    color: "#64748B",
    borderBottom: "1px solid rgba(15,23,42,0.07)",
  } as const;

  function thBtn(col: SortCol, label: string, align: "left" | "right" = "right") {
    const active = sortCol === col;
    return (
      <th
        className={`px-3 py-2.5 font-medium cursor-pointer select-none ${
          align === "left" ? "text-left" : "text-right"
        }`}
        style={{ ...thStyle, color: active ? "#2B5CE0" : "#64748B" }}
        onClick={() => handleSort(col)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className="text-[10px] opacity-60">
            {active ? SORT_ICON[sortDir] : SORT_ICON.none}
          </span>
        </span>
      </th>
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap"
        style={{ borderColor: "rgba(15,23,42,0.07)" }}
      >
        <div className="flex items-center gap-3">
          {selectedSector ? (
            <>
              <button
                onClick={onClear}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                style={{
                  background: "rgba(15,23,42,0.06)",
                  color: "#475569",
                  border: "1px solid rgba(15,23,42,0.10)",
                }}
                onMouseEnter={(e) => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.color = "#2B5CE0";
                  b.style.borderColor = "rgba(43,92,224,0.3)";
                }}
                onMouseLeave={(e) => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.color = "#475569";
                  b.style.borderColor = "rgba(15,23,42,0.10)";
                }}
              >
                ← All
              </button>
              <span className="text-sm font-bold" style={{ color: "#0F172A" }}>
                {selectedSector}
              </span>
              <span
                className="text-xs font-mono px-2 py-0.5 rounded"
                style={{ background: "rgba(43,92,224,0.08)", color: "#2B5CE0" }}
              >
                {fmtPct(totalSectorFundWeight)} of portfolio
              </span>
            </>
          ) : (
            <>
              <h2 className="text-sm font-semibold" style={{ color: "#0F172A" }}>
                Portfolio Holdings
              </h2>
              <p className="text-xs" style={{ color: "#64748B" }}>
                Click a sector block to filter · Click again to clear
              </p>
            </>
          )}
        </div>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded"
          style={{ background: "rgba(43,92,224,0.08)", color: "#2B5CE0" }}
        >
          {sorted.length}{selectedSector ? ` / ${allCount}` : ""} positions
        </span>
      </div>

      {/* Holdings table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10" style={{ background: "#F0F4FA" }}>
            <tr>
              <th
                className="px-3 py-2.5 text-left font-medium w-7"
                style={thStyle}
              >
                #
              </th>
              {thBtn("company", "Company", "left")}
              {thBtn("sector", "Sector", "left")}
              {thBtn("portfolioPct", "Fund %")}
              {thBtn("benchmarkPct", `% ${benchmark}`)}
              {thBtn("overweight", "Active Weight")}
              {hasSectorWeight && (
                <th
                  className="px-3 py-2.5 text-right font-medium cursor-pointer select-none"
                  style={{
                    ...thStyle,
                    color: sortCol === "sectorWeight" ? "#2B5CE0" : "#2B5CE0",
                    background: "rgba(43,92,224,0.04)",
                  }}
                  onClick={() => handleSort("sectorWeight")}
                >
                  <span className="inline-flex items-center gap-1 justify-end">
                    Sector Wt.
                    <span className="text-[10px] opacity-60">
                      {sortCol === "sectorWeight" ? SORT_ICON[sortDir] : SORT_ICON.none}
                    </span>
                  </span>
                </th>
              )}
              {hasDelta1W && thBtn("delta1W", "Δ 1W")}
              {hasDelta1M && thBtn("delta1M", "Δ 1M")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const sectorWt =
                hasSectorWeight && totalSectorFundWeight > 0
                  ? row.portfolioPct / totalSectorFundWeight
                  : null;
              const overColor = activeColor(row.overweight);
              const d1w = fmtDelta(row.delta1W);
              const d1m = fmtDelta(row.delta1M);
              const displaySector = row.macroSector || row.sector || "Unclassified";

              return (
                <tr
                  key={row.company}
                  className="border-t transition-colors"
                  style={{ borderColor: "rgba(15,23,42,0.05)" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      "rgba(43,92,224,0.03)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "transparent")
                  }
                >
                  {/* # */}
                  <td className="px-3 py-2 font-mono" style={{ color: "#94A3B8" }}>
                    {i + 1}
                  </td>

                  {/* Company */}
                  <td className="px-3 py-2 font-medium" style={{ color: "#0F172A" }}>
                    {row.company}
                  </td>

                  {/* Sector (new column) */}
                  <td className="px-3 py-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{
                        background: "rgba(15,23,42,0.055)",
                        color: "#475569",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {displaySector}
                    </span>
                  </td>

                  {/* Fund % */}
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div
                        className="w-10 h-1.5 rounded-full"
                        style={{ background: "rgba(43,92,224,0.10)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, row.portfolioPct * 500)}%`,
                            background: "linear-gradient(90deg,#2B5CE0,#3D6FE8)",
                          }}
                        />
                      </div>
                      <span
                        className="font-mono font-semibold"
                        style={{ color: "#0F172A" }}
                      >
                        {fmtPct(row.portfolioPct)}
                      </span>
                    </div>
                  </td>

                  {/* Benchmark % */}
                  <td
                    className="px-3 py-2 font-mono text-right"
                    style={{ color: "#64748B" }}
                  >
                    {fmtPct(row.benchmarkPct)}
                  </td>

                  {/* Active Weight */}
                  <td className="px-3 py-2 text-right">
                    <span
                      className="font-mono font-bold text-[11px] px-2 py-0.5 rounded-full"
                      style={{
                        color: overColor,
                        background: activeBg(row.overweight),
                        border: `1px solid ${overColor}28`,
                      }}
                    >
                      {fmtPct(row.overweight, true)}
                    </span>
                  </td>

                  {/* Sector Weight (100%) — only when sector is selected */}
                  {hasSectorWeight && (
                    <td
                      className="px-3 py-2 text-right"
                      style={{ background: "rgba(43,92,224,0.025)" }}
                    >
                      {sectorWt !== null ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <div
                            className="w-10 h-1.5 rounded-full"
                            style={{ background: "rgba(43,92,224,0.12)" }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, sectorWt * 100)}%`,
                                background:
                                  "linear-gradient(90deg,#2B5CE0,#6D9EEB)",
                              }}
                            />
                          </div>
                          <span
                            className="font-mono font-bold"
                            style={{ color: "#2B5CE0" }}
                          >
                            {fmtPct(sectorWt)}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: "#94A3B8" }}>—</span>
                      )}
                    </td>
                  )}

                  {/* Δ 1W */}
                  {hasDelta1W && (
                    <td className="px-3 py-2 text-right">
                      <span
                        className="font-mono font-semibold text-[11px] px-1.5 py-0.5 rounded"
                        style={{ color: d1w.color, background: d1w.bg }}
                      >
                        {d1w.text}
                      </span>
                    </td>
                  )}

                  {/* Δ 1M */}
                  {hasDelta1M && (
                    <td className="px-3 py-2 text-right">
                      <span
                        className="font-mono font-semibold text-[11px] px-1.5 py-0.5 rounded"
                        style={{ color: d1m.color, background: d1m.bg }}
                      >
                        {d1m.text}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────
export default function CarteraView({
  sectorSummary,
  cartera,
  benchmark,
}: Props) {
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  // Toggle: click selected sector again → deselect
  function handleSelect(s: string) {
    setSelectedSector((prev) => (prev === s ? null : s));
  }

  const tableHoldings = useMemo(
    () =>
      selectedSector
        ? cartera.filter((r) => r.macroSector === selectedSector)
        : cartera,
    [cartera, selectedSector]
  );

  const totalSectorFundWeight = useMemo(
    () => tableHoldings.reduce((acc, r) => acc + r.portfolioPct, 0),
    [tableHoldings]
  );

  // BarChart data: sorted by activeWeight descending
  const barData = useMemo(
    () => [...sectorSummary].sort((a, b) => b.activeWeight - a.activeWeight),
    [sectorSummary]
  );

  if (sectorSummary.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 card">
        <p style={{ color: "#64748B" }}>No sector data available</p>
      </div>
    );
  }

  const chartHeight = Math.max(220, barData.length * 38);

  return (
    <div className="space-y-5">
      {/* ── Sector Active Weight BarChart ── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <p className="text-sm font-semibold" style={{ color: "#0F172A" }}>
              Sector Allocation — Active Weight
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
              <span style={{ color: "#059669", fontWeight: 600 }}>Green</span> = overweight &nbsp;·&nbsp;{" "}
              <span style={{ color: "#DC2626", fontWeight: 600 }}>Red</span> = underweight &nbsp;·&nbsp; Click to filter
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedSector && (
              <button
                onClick={() => setSelectedSector(null)}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
                style={{
                  background: "rgba(43,92,224,0.08)",
                  color: "#2B5CE0",
                  border: "1px solid rgba(43,92,224,0.22)",
                }}
              >
                × {selectedSector}
              </button>
            )}
            <span
              className="text-xs font-mono px-2 py-0.5 rounded"
              style={{ background: "rgba(43,92,224,0.08)", color: "#2B5CE0" }}
            >
              {sectorSummary.length} sectors
            </span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            layout="vertical"
            data={barData}
            margin={{ top: 4, right: 60, bottom: 4, left: 8 }}
            onClick={(e) => {
              if (e?.activePayload?.[0]?.payload?.sector) {
                handleSelect(e.activePayload[0].payload.sector as string);
              }
            }}
            style={{ cursor: "pointer" }}
          >
            <XAxis
              type="number"
              dataKey="activeWeight"
              tickFormatter={(v) => fmtPct(v as number, true)}
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="sector"
              width={160}
              tick={{ fontSize: 11, fill: "#334155" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<SectorTooltip />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
            <ReferenceLine x={0} stroke="#CBD5E1" strokeWidth={1} />
            <Bar dataKey="activeWeight" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {barData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    selectedSector === entry.sector
                      ? entry.activeWeight >= 0
                        ? "#059669"
                        : "#DC2626"
                      : entry.activeWeight >= 0
                      ? "rgba(5,150,105,0.75)"
                      : "rgba(220,38,38,0.75)"
                  }
                  stroke={selectedSector === entry.sector ? (entry.activeWeight >= 0 ? "#059669" : "#DC2626") : "none"}
                  strokeWidth={selectedSector === entry.sector ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Full holdings table (always visible, filtered when sector selected) ── */}
      <HoldingsTable
        holdings={tableHoldings}
        allCount={cartera.length}
        benchmark={benchmark}
        selectedSector={selectedSector}
        totalSectorFundWeight={selectedSector ? totalSectorFundWeight : 0}
        onClear={() => setSelectedSector(null)}
      />
    </div>
  );
}
