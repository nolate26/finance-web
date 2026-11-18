"use client";

import { PATRIA } from "@/lib/patriaTheme";

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
  ticker?: string;
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
  // false = fondo sin benchmark (Brasil): pesos absolutos, sin columnas de
  // benchmark ni active weight, y el gráfico de sectores en peso del fondo.
  hasBenchmark?: boolean;
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
  return v > 0 ? "#001EAF" : v < 0 ? "#F8485E" : "rgba(13,13,56,0.45)";
}

function activeBg(v: number): string {
  return v > 0 ? "rgba(0,30,175,0.10)" : v < 0 ? "rgba(248,72,94,0.10)" : "transparent";
}

function fmtDelta(v: number | null): { text: string; color: string; bg: string } {
  if (v === null) return { text: "—", color: "rgba(13,13,56,0.28)", bg: "transparent" };
  const p = v * 100;
  if (Math.abs(p) < 0.005) return { text: "0.00%", color: "rgba(13,13,56,0.45)", bg: "transparent" };
  return {
    text: (p > 0 ? "+" : "") + p.toFixed(2) + "%",
    color: p > 0 ? "#001EAF" : "#F8485E",
    bg: p > 0 ? "rgba(0,30,175,0.08)" : "rgba(248,72,94,0.08)",
  };
}

const SORT_ICON = { asc: "↑", desc: "↓", none: "↕" } as const;

// ── BarChart tooltip ──────────────────────────────────────────────────────────
function SectorTooltip({
  active,
  payload,
  hasBenchmark = true,
}: {
  active?: boolean;
  payload?: Array<{ payload?: SectorSummary }>;
  hasBenchmark?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (!d) return null;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(13,13,56,0.10)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        minWidth: 180,
      }}
    >
      <div style={{ fontWeight: 700, color: "#0D0D38", marginBottom: 6 }}>{d.sector}</div>
      <div style={{ display: "grid", gap: 3 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: "rgba(13,13,56,0.62)" }}>Fund</span>
          <span style={{ fontWeight: 600, color: "#0D0D38" }}>{fmtPct(d.fundWeight)}</span>
        </div>
        {hasBenchmark ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span style={{ color: "rgba(13,13,56,0.62)" }}>Benchmark</span>
              <span style={{ fontWeight: 600, color: "rgba(13,13,56,0.62)" }}>{fmtPct(d.benchWeight)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span style={{ color: "rgba(13,13,56,0.62)" }}>Active</span>
              <span style={{ fontWeight: 700, color: activeColor(d.activeWeight) }}>
                {fmtPct(d.activeWeight, true)}
              </span>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "rgba(13,13,56,0.62)" }}>Positions</span>
            <span style={{ fontWeight: 600, color: "rgba(13,13,56,0.62)" }}>{d.count}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Holdings flat table ───────────────────────────────────────────────────────
interface HoldingsTableProps {
  holdings: CarteraRow[];
  allCount: number;
  benchmark: string;
  hasBenchmark: boolean;
  selectedSector: string | null;
  totalSectorFundWeight: number;
  onClear: () => void;
}

function HoldingsTable({
  holdings,
  allCount,
  benchmark,
  hasBenchmark,
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
    color: "rgba(13,13,56,0.62)",
    borderBottom: "1px solid rgba(13,13,56,0.07)",
  } as const;

  function thBtn(col: SortCol, label: string, align: "left" | "right" = "right", extra = "") {
    const active = sortCol === col;
    return (
      <th
        className={`px-3 py-2.5 font-medium cursor-pointer select-none ${
          align === "left" ? "text-left" : "text-right"
        } ${extra}`}
        style={{ ...thStyle, color: active ? "#2044DC" : "rgba(13,13,56,0.62)" }}
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
        // Sin sector elegido el título va en blanco: necesita la banda dark-blue
        // (sin ella el encabezado quedaba blanco sobre blanco, invisible).
        style={{ borderColor: "rgba(13,13,56,0.07)", background: selectedSector ? undefined : PATRIA.darkBlue }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          {selectedSector ? (
            <>
              <button
                onClick={onClear}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                style={{
                  background: "rgba(13,13,56,0.06)",
                  color: "rgba(13,13,56,0.62)",
                  border: "1px solid rgba(13,13,56,0.10)",
                }}
                onMouseEnter={(e) => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.color = "#2044DC";
                  b.style.borderColor = "rgba(32,68,220,0.3)";
                }}
                onMouseLeave={(e) => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.color = "rgba(13,13,56,0.62)";
                  b.style.borderColor = "rgba(13,13,56,0.10)";
                }}
              >
                ← All
              </button>
              <span className="text-sm font-bold" style={{ color: "#0D0D38" }}>
                {selectedSector}
              </span>
              <span
                className="text-xs font-secondary tabular-nums px-2 py-0.5 rounded"
                style={{ background: "rgba(32,68,220,0.08)", color: "#2044DC" }}
              >
                {fmtPct(totalSectorFundWeight)} of portfolio
              </span>
            </>
          ) : (
            <>
              <h2 className="text-sm font-bold font-primary uppercase tracking-wide" style={{ color: PATRIA.white }}>
                Portfolio Holdings
              </h2>
              <p className="hide-phone text-xs font-secondary" style={{ color: "rgba(255,255,255,0.72)" }}>
                Click a sector block to filter · Click again to clear
              </p>
            </>
          )}
        </div>
        <span
          className="text-xs font-secondary tabular-nums px-2 py-0.5 rounded"
          style={selectedSector ? { background: "rgba(32,68,220,0.08)", color: "#2044DC" } : { background: "rgba(255,255,255,0.12)", color: "#fff" }}
        >
          {sorted.length}{selectedSector ? ` / ${allCount}` : ""} positions
        </span>
      </div>

      {/* Holdings table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10" style={{ background: "#F5F7FD" }}>
            <tr>
              <th
                className="hide-phone px-3 py-2.5 text-left font-medium w-7"
                style={thStyle}
              >
                #
              </th>
              {thBtn("company", "Company", "left")}
              {thBtn("sector", "Sector", "left", "hide-phone")}
              {thBtn("portfolioPct", "Fund %")}
              {hasBenchmark && thBtn("benchmarkPct", `% ${benchmark}`)}
              {hasBenchmark && thBtn("overweight", "Active Weight")}
              {hasSectorWeight && (
                <th
                  className="px-3 py-2.5 text-right font-medium cursor-pointer select-none"
                  style={{
                    ...thStyle,
                    color: sortCol === "sectorWeight" ? "#2044DC" : "#2044DC",
                    background: "rgba(32,68,220,0.04)",
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
              {hasDelta1W && thBtn("delta1W", "Δ 1W", "right", "hide-phone")}
              {hasDelta1M && thBtn("delta1M", "Δ 1M", "right", "hide-phone")}
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
                  key={row.ticker ?? row.company}
                  className="border-t transition-colors"
                  style={{ borderColor: "rgba(13,13,56,0.05)" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      "rgba(32,68,220,0.03)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "transparent")
                  }
                >
                  {/* # */}
                  <td className="hide-phone px-3 py-2 font-secondary tabular-nums" style={{ color: "rgba(13,13,56,0.45)" }}>
                    {i + 1}
                  </td>

                  {/* Company */}
                  <td className="px-3 py-2 font-medium wrap-phone" style={{ color: "#0D0D38" }}>
                    {row.company}
                    {/* Brasil guarda el ticker BBG: va debajo del nombre que salió de la maestra */}
                    {row.ticker && row.ticker !== row.company && (
                      <div className="font-secondary tabular-nums" style={{ fontSize: 10, fontWeight: 400, color: "rgba(13,13,56,0.45)", marginTop: 1 }}>
                        {row.ticker}
                      </div>
                    )}
                    {/* Teléfono: el sector va debajo del nombre en vez de en su columna */}
                    <div className="phone-only" style={{ fontSize: 10, fontWeight: 400, color: "rgba(13,13,56,0.45)", marginTop: 1 }}>
                      {displaySector}
                    </div>
                  </td>

                  {/* Sector (new column) */}
                  <td className="hide-phone px-3 py-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{
                        background: "rgba(13,13,56,0.055)",
                        color: "rgba(13,13,56,0.62)",
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
                        className="hide-phone w-10 h-1.5 rounded-full"
                        style={{ background: "rgba(32,68,220,0.10)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, row.portfolioPct * 500)}%`,
                            background: "linear-gradient(90deg,#2044DC,#2044DC)",
                          }}
                        />
                      </div>
                      <span
                        className="font-secondary tabular-nums font-semibold"
                        style={{ color: "#0D0D38" }}
                      >
                        {fmtPct(row.portfolioPct)}
                      </span>
                    </div>
                  </td>

                  {/* Benchmark % */}
                  {hasBenchmark && (
                    <td
                      className="px-3 py-2 font-secondary tabular-nums text-right"
                      style={{ color: "rgba(13,13,56,0.62)" }}
                    >
                      {fmtPct(row.benchmarkPct)}
                    </td>
                  )}

                  {/* Active Weight */}
                  {hasBenchmark && (
                    <td className="px-3 py-2 text-right">
                      <span
                        className="font-secondary tabular-nums font-bold text-[11px] px-2 py-0.5 rounded-full"
                        style={{
                          color: overColor,
                          background: activeBg(row.overweight),
                          border: `1px solid ${overColor}28`,
                        }}
                      >
                        {fmtPct(row.overweight, true)}
                      </span>
                    </td>
                  )}

                  {/* Sector Weight (100%) — only when sector is selected */}
                  {hasSectorWeight && (
                    <td
                      className="px-3 py-2 text-right"
                      style={{ background: "rgba(32,68,220,0.025)" }}
                    >
                      {sectorWt !== null ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <div
                            className="w-10 h-1.5 rounded-full"
                            style={{ background: "rgba(32,68,220,0.12)" }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, sectorWt * 100)}%`,
                                background:
                                  "linear-gradient(90deg,#2044DC,#88AAFF)",
                              }}
                            />
                          </div>
                          <span
                            className="font-secondary tabular-nums font-bold"
                            style={{ color: "#2044DC" }}
                          >
                            {fmtPct(sectorWt)}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: "rgba(13,13,56,0.45)" }}>—</span>
                      )}
                    </td>
                  )}

                  {/* Δ 1W */}
                  {hasDelta1W && (
                    <td className="hide-phone px-3 py-2 text-right">
                      <span
                        className="font-secondary tabular-nums font-semibold text-[11px] px-1.5 py-0.5 rounded"
                        style={{ color: d1w.color, background: d1w.bg }}
                      >
                        {d1w.text}
                      </span>
                    </td>
                  )}

                  {/* Δ 1M */}
                  {hasDelta1M && (
                    <td className="hide-phone px-3 py-2 text-right">
                      <span
                        className="font-secondary tabular-nums font-semibold text-[11px] px-1.5 py-0.5 rounded"
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
  hasBenchmark = true,
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

  // Sin benchmark el "activo" sería el peso mismo contra cero: se grafica el
  // peso del fondo y lo negativo es posición neta corta (Long Biased).
  const barKey = hasBenchmark ? "activeWeight" : "fundWeight";

  // BarChart data: sorted by the plotted value, descending
  const barData = useMemo(
    () => [...sectorSummary].sort((a, b) => b[barKey] - a[barKey]),
    [sectorSummary, barKey]
  );

  // Exposición neta / bruta: la referencia de un fondo sin benchmark.
  const netExposure   = useMemo(() => cartera.reduce((acc, r) => acc + r.portfolioPct, 0), [cartera]);
  const grossExposure = useMemo(() => cartera.reduce((acc, r) => acc + Math.abs(r.portfolioPct), 0), [cartera]);

  if (sectorSummary.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 card">
        <p style={{ color: "rgba(13,13,56,0.62)" }}>No sector data available</p>
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
            <p className="text-sm font-semibold" style={{ color: "#0D0D38" }}>
              {hasBenchmark ? "Sector Allocation — Active Weight" : "Sector Allocation — Fund Weight"}
            </p>
            {/* Va sobre la tarjeta blanca: antes estaba en blanco 72% y no se leía. */}
            <p className="text-xs mt-0.5 font-secondary" style={{ color: "rgba(13,13,56,0.45)" }}>
              {hasBenchmark ? (
                <>
                  <span style={{ color: "#001EAF", fontWeight: 600 }}>Blue</span> = overweight &nbsp;·&nbsp;{" "}
                  <span style={{ color: "#F8485E", fontWeight: 600 }}>Red</span> = underweight &nbsp;·&nbsp; Click to filter
                </>
              ) : (
                <>
                  No benchmark &nbsp;·&nbsp;{" "}
                  <span style={{ color: "#F8485E", fontWeight: 600 }}>Red</span> = net short &nbsp;·&nbsp; Click to filter
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!hasBenchmark && (
              <>
                <span
                  className="text-xs font-secondary tabular-nums px-2 py-0.5 rounded"
                  style={{ background: "rgba(13,13,56,0.05)", color: "#0D0D38" }}
                >
                  Net {fmtPct(netExposure)}
                </span>
                <span
                  className="text-xs font-secondary tabular-nums px-2 py-0.5 rounded"
                  style={{ background: "rgba(13,13,56,0.05)", color: "#0D0D38" }}
                >
                  Gross {fmtPct(grossExposure)}
                </span>
              </>
            )}
            {selectedSector && (
              <button
                onClick={() => setSelectedSector(null)}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
                style={{
                  background: "rgba(32,68,220,0.08)",
                  color: "#2044DC",
                  border: "1px solid rgba(32,68,220,0.22)",
                }}
              >
                × {selectedSector}
              </button>
            )}
            <span
              className="text-xs font-secondary tabular-nums px-2 py-0.5 rounded"
              style={{ background: "rgba(32,68,220,0.08)", color: "#2044DC" }}
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
              dataKey={barKey}
              tickFormatter={(v) => fmtPct(v as number, hasBenchmark)}
              tick={{ fontSize: 10, fill: "rgba(13,13,56,0.45)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="sector"
              width={160}
              tick={{ fontSize: 11, fill: "#0D0D38" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<SectorTooltip hasBenchmark={hasBenchmark} />} cursor={{ fill: "rgba(13,13,56,0.04)" }} />
            <ReferenceLine x={0} stroke="rgba(13,13,56,0.28)" strokeWidth={1} />
            <Bar dataKey={barKey} radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {barData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    selectedSector === entry.sector
                      ? entry[barKey] >= 0
                        ? "#001EAF"
                        : "#F8485E"
                      : entry[barKey] >= 0
                      ? "rgba(0,30,175,0.75)"
                      : "rgba(248,72,94,0.75)"
                  }
                  stroke={selectedSector === entry.sector ? (entry[barKey] >= 0 ? "#001EAF" : "#F8485E") : "none"}
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
        hasBenchmark={hasBenchmark}
        selectedSector={selectedSector}
        totalSectorFundWeight={selectedSector ? totalSectorFundWeight : 0}
        onClear={() => setSelectedSector(null)}
      />
    </div>
  );
}
