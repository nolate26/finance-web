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

// Cortos (peso negativo, sólo en fondos que pueden vender en corto como Patria
// Long Biased): rosado PATRIA en vez del azul de las posiciones largas.
const SHORT = "#F8485E";
const SHORT_BG = "rgba(248,72,94,0.05)";

// Barra por sector en fondos sin benchmark: largos y cortos por separado, para
// que un corto no quede escondido dentro del neto de su sector.
interface LongShortDatum {
  sector: string;
  long: number;
  short: number; // ≤ 0
  net: number;
  count: number;
}

function LongShortTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: LongShortDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (!d) return null;
  const line = (label: string, value: string, color: string, bold = false) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span style={{ color: "rgba(13,13,56,0.62)" }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 600, color }}>{value}</span>
    </div>
  );
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
        {line("Long", fmtPct(d.long), "#001EAF")}
        {d.short < 0 && line("Short", fmtPct(d.short), SHORT)}
        {line("Net", fmtPct(d.net), "#0D0D38", true)}
        {line("Positions", String(d.count), "rgba(13,13,56,0.62)")}
      </div>
    </div>
  );
}

// Eje de sectores en una sola línea: recharts parte los nombres GICS largos
// ("Real Estate Management & Development") en dos y, con el gráfico angosto al
// lado de la tabla, los cortaba por la izquierda. Se recortan con "…" y el nombre
// completo queda en el <title> (hover) y en el tooltip de la barra.
const AXIS_WIDTH = 150;
const AXIS_MAX_CHARS = 24; // ~5.8px por carácter a 10.5px en 150px

function SectorTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const full = payload?.value ?? "";
  const label = full.length > AXIS_MAX_CHARS ? full.slice(0, AXIS_MAX_CHARS - 1).trimEnd() + "…" : full;
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <title>{full}</title>
      <text x={-6} y={0} dy={4} textAnchor="end" fontSize={10.5} fill="#0D0D38">
        {label}
      </text>
    </g>
  );
}

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
        className={`px-3 py-2 font-medium cursor-pointer select-none ${
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

      {/* Holdings table — desde 1280px va al lado del gráfico con scroll propio
          (encabezado fijo) en vez de alargar la página; en tablet/teléfono
          sigue apilada y scrollea la página. */}
      <div className="overflow-x-auto xl:overflow-y-auto xl:max-h-[calc(100dvh-var(--nav-h)-150px)]">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10" style={{ background: "#F5F7FD" }}>
            <tr>
              <th
                className="hide-phone px-3 py-2 text-left font-medium w-7"
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
                  className="px-3 py-2 text-right font-medium cursor-pointer select-none"
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
              const isShort = row.portfolioPct < 0;
              const rowBg = isShort ? SHORT_BG : "transparent";

              return (
                <tr
                  key={row.ticker ?? row.company}
                  className="border-t transition-colors"
                  style={{ borderColor: "rgba(13,13,56,0.05)", background: rowBg }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      isShort ? "rgba(248,72,94,0.09)" : "rgba(32,68,220,0.03)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = rowBg)
                  }
                >
                  {/* # */}
                  <td className="hide-phone px-3 py-1.5 font-secondary tabular-nums" style={{ color: "rgba(13,13,56,0.45)" }}>
                    {i + 1}
                  </td>

                  {/* Company */}
                  <td className="px-3 py-1.5 font-medium wrap-phone" style={{ color: "#0D0D38" }}>
                    {/* Tope de ancho: "GRUPO AEROPORTUARIO DEL PACIFICO" empujaba
                        Active Weight y las Δ fuera de la tarjeta en la vista lado a lado. */}
                    <div title={row.company} style={{ maxWidth: 210, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {row.company}
                    {isShort && (
                      <span
                        className="font-secondary"
                        style={{
                          marginLeft: 6, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
                          color: SHORT, border: `1px solid ${SHORT}55`, borderRadius: 4, padding: "0 4px",
                          verticalAlign: "middle",
                        }}
                      >
                        SHORT
                      </span>
                    )}
                    </div>
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
                  <td className="hide-phone px-3 py-1.5">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                      title={displaySector}
                      style={{
                        background: "rgba(13,13,56,0.055)",
                        color: "rgba(13,13,56,0.62)",
                        whiteSpace: "nowrap",
                        display: "inline-block",
                        maxWidth: 150,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        verticalAlign: "middle",
                      }}
                    >
                      {displaySector}
                    </span>
                  </td>

                  {/* Fund % */}
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div
                        className="hide-phone w-10 h-1.5 rounded-full"
                        style={{ background: isShort ? "rgba(248,72,94,0.12)" : "rgba(32,68,220,0.10)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.abs(row.portfolioPct) * 500)}%`,
                            background: isShort ? SHORT : "#2044DC",
                          }}
                        />
                      </div>
                      <span
                        className="font-secondary tabular-nums font-semibold"
                        style={{ color: isShort ? SHORT : "#0D0D38" }}
                      >
                        {fmtPct(row.portfolioPct)}
                      </span>
                    </div>
                  </td>

                  {/* Benchmark % */}
                  {hasBenchmark && (
                    <td
                      className="px-3 py-1.5 font-secondary tabular-nums text-right"
                      style={{ color: "rgba(13,13,56,0.62)" }}
                    >
                      {fmtPct(row.benchmarkPct)}
                    </td>
                  )}

                  {/* Active Weight */}
                  {hasBenchmark && (
                    <td className="px-3 py-1.5 text-right">
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
                      className="px-3 py-1.5 text-right"
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
                    <td className="hide-phone px-3 py-1.5 text-right">
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
                    <td className="hide-phone px-3 py-1.5 text-right">
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

  // Con benchmark: active weight por sector, ordenado de más a menos.
  const barData = useMemo(
    () => [...sectorSummary].sort((a, b) => b.activeWeight - a.activeWeight),
    [sectorSummary]
  );

  // Sin benchmark (Brasil): largos y cortos de cada sector por separado. El
  // "activo" contra cero sería el neto, y ahí un corto de VBBR quedaba restado
  // dentro de la barra azul de Oil & Gas sin que se viera. Misma llave de
  // sector que sectorSummary para que el click filtre la tabla igual.
  const longShortData = useMemo<LongShortDatum[]>(() => {
    const groups = new Map<string, LongShortDatum>();
    for (const r of cartera) {
      const s = r.macroSector || "Unclassified";
      const g = groups.get(s) ?? { sector: s, long: 0, short: 0, net: 0, count: 0 };
      if (r.portfolioPct >= 0) g.long += r.portfolioPct;
      else g.short += r.portfolioPct;
      g.net += r.portfolioPct;
      g.count += 1;
      groups.set(s, g);
    }
    return [...groups.values()].sort((a, b) => b.net - a.net);
  }, [cartera]);

  // Exposición larga / corta / neta / bruta: la referencia de un fondo sin benchmark.
  const exposure = useMemo(() => {
    let long = 0, short = 0;
    for (const r of cartera) {
      if (r.portfolioPct >= 0) long += r.portfolioPct;
      else short += r.portfolioPct;
    }
    return { long, short, net: long + short, gross: long - short };
  }, [cartera]);

  if (sectorSummary.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 card">
        <p style={{ color: "rgba(13,13,56,0.62)" }}>No sector data available</p>
      </div>
    );
  }

  // Filas de 26px (antes 38): con 18 sectores el gráfico medía 700px y había
  // que bajar media página para llegar a la tabla.
  const sectorCount = hasBenchmark ? barData.length : longShortData.length;
  const chartHeight = Math.max(180, sectorCount * 26 + 30);

  const pill = (label: string, value: number, color = "#0D0D38", bg = "rgba(13,13,56,0.05)") => (
    <span className="text-xs font-secondary tabular-nums px-2 py-0.5 rounded" style={{ background: bg, color }}>
      {label} {fmtPct(value)}
    </span>
  );

  // Opacidad por barra: la del sector filtrado va plena, el resto atenuado.
  const fade = (sector: string) => (selectedSector === null || selectedSector === sector ? 1 : 0.35);

  return (
    // Desde 1280px gráfico y tabla van lado a lado (4 + 8 columnas: la tabla
    // necesita el espacio para sus 8 columnas) para no tener que bajar; en
    // tablet y teléfono siguen apilados.
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
      {/* ── Sector BarChart ── */}
      <div className="card p-4 xl:col-span-4 min-w-0">
        <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
          <div>
            <p className="text-sm font-semibold" style={{ color: "#0D0D38" }}>
              {hasBenchmark ? "Sector Allocation — Active Weight" : "Sector Allocation — Long / Short"}
            </p>
            {/* Va sobre la tarjeta blanca: antes estaba en blanco 72% y no se leía. */}
            <p className="text-xs mt-0.5 font-secondary" style={{ color: "rgba(13,13,56,0.45)" }}>
              {hasBenchmark ? (
                <>
                  <span style={{ color: "#001EAF", fontWeight: 600 }}>Blue</span> = overweight &nbsp;·&nbsp;{" "}
                  <span style={{ color: SHORT, fontWeight: 600 }}>Red</span> = underweight &nbsp;·&nbsp; Click to filter
                </>
              ) : (
                <>
                  <span style={{ color: "#001EAF", fontWeight: 600 }}>Blue</span> = long &nbsp;·&nbsp;{" "}
                  <span style={{ color: SHORT, fontWeight: 600 }}>Pink</span> = short &nbsp;·&nbsp; Click to filter
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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
              {sectorCount} sectors
            </span>
          </div>
        </div>

        {/* Exposición del fondo sin benchmark: el corto en su color */}
        {!hasBenchmark && (
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {pill("Long", exposure.long, "#001EAF", "rgba(0,30,175,0.08)")}
            {exposure.short < 0 && pill("Short", exposure.short, SHORT, "rgba(248,72,94,0.08)")}
            {pill("Net", exposure.net)}
            {pill("Gross", exposure.gross)}
          </div>
        )}

        <ResponsiveContainer width="100%" height={chartHeight}>
          {hasBenchmark ? (
            <BarChart
              layout="vertical"
              data={barData}
              margin={{ top: 4, right: 24, bottom: 4, left: 4 }}
              barCategoryGap="22%"
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
                tick={{ fontSize: 10, fill: "rgba(13,13,56,0.45)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="sector"
                width={AXIS_WIDTH}
                tick={<SectorTick />}
                interval={0}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<SectorTooltip />} cursor={{ fill: "rgba(13,13,56,0.04)" }} />
              <ReferenceLine x={0} stroke="rgba(13,13,56,0.28)" strokeWidth={1} />
              <Bar dataKey="activeWeight" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                {barData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.activeWeight >= 0 ? "#001EAF" : SHORT}
                    fillOpacity={fade(entry.sector)}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            // stackOffset="sign": los largos se apilan hacia la derecha del cero y
            // los cortos hacia la izquierda, cada uno desde el eje.
            <BarChart
              layout="vertical"
              data={longShortData}
              stackOffset="sign"
              margin={{ top: 4, right: 24, bottom: 4, left: 4 }}
              barCategoryGap="22%"
              onClick={(e) => {
                if (e?.activePayload?.[0]?.payload?.sector) {
                  handleSelect(e.activePayload[0].payload.sector as string);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              <XAxis
                type="number"
                tickFormatter={(v) => fmtPct(v as number)}
                tick={{ fontSize: 10, fill: "rgba(13,13,56,0.45)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="sector"
                width={AXIS_WIDTH}
                tick={<SectorTick />}
                interval={0}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<LongShortTooltip />} cursor={{ fill: "rgba(13,13,56,0.04)" }} />
              <ReferenceLine x={0} stroke="rgba(13,13,56,0.28)" strokeWidth={1} />
              <Bar dataKey="long" stackId="ls" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                {longShortData.map((entry, index) => (
                  <Cell key={`long-${index}`} fill="#001EAF" fillOpacity={fade(entry.sector)} />
                ))}
              </Bar>
              <Bar dataKey="short" stackId="ls" radius={[3, 0, 0, 3]} isAnimationActive={false}>
                {longShortData.map((entry, index) => (
                  <Cell key={`short-${index}`} fill={SHORT} fillOpacity={fade(entry.sector)} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* ── Full holdings table (always visible, filtered when sector selected) ── */}
      <div className="xl:col-span-8 min-w-0">
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
    </div>
  );
}
