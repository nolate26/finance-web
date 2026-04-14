"use client";

import { useState } from "react";
import type { MetricBlock, DeltaBlock, DeltaSet, ProjectionRowAPI } from "@/app/api/projections/route";

export type { ProjectionRowAPI as ProjectionRow };

const METRIC_HEADERS = ["Ingresos", "EBITDA", "EBIT", "Utilidad"] as const;
type MetricName = (typeof METRIC_HEADERS)[number];

// Column indices 0, 1, 2 — always represent globalBaseYear, +1, +2
const COL_INDICES = [0, 1, 2] as const;

const BORDER_METRIC = "1px solid rgba(43,92,224,0.12)";
const BORDER_LIGHT  = "1px solid rgba(15,23,42,0.05)";

interface Props {
  rows:      ProjectionRowAPI[];
  base_year: number;   // globalBaseYear — anchored to the most-recent snapshot
  prevAt:    string | null;
}

// ── Calendar-year resolver ────────────────────────────────────────────────────
//
// Works on both MetricBlock and DeltaBlock (same shape: y0 | y1 | y2 as number|null).
// Given a block produced from a row with `rowBaseYear`, returns the value whose
// calendar year matches `targetCalendarYear`.
// Returns null when the target is outside the row's window (e.g. a stale row
// doesn't have data for a future year it never projected).

type YBlock = { y0: number | null; y1: number | null; y2: number | null };

function atCalendarYear(
  block: YBlock | null,
  rowBaseYear: number,
  targetCalendarYear: number,
): number | null {
  if (!block) return null;
  const offset = targetCalendarYear - rowBaseYear;
  if (offset === 0) return block.y0;
  if (offset === 1) return block.y1;
  if (offset === 2) return block.y2;
  return null; // year is outside this row's window
}

// ── Date formatting ───────────────────────────────────────────────────────────

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtLegendDate(s: string): string {
  const [datePart, timePart] = s.split(" ");
  const [y, m, d] = datePart.split("-");
  const mon  = MONTHS_SHORT[parseInt(m, 10) - 1];
  const day  = parseInt(d, 10);
  const hhmm = timePart?.slice(0, 5) ?? "";
  return `${mon} ${day}, ${y}${hhmm ? ` · ${hhmm}` : ""}`;
}

// ── Number formatters ─────────────────────────────────────────────────────────

function fmtVal(v: number): string {
  return Math.round(v).toLocaleString("en-US");
}

function fmtDelta(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

// ── Delta badge ───────────────────────────────────────────────────────────────

type DeltaState = "positive" | "negative" | "neutral";

function classifyDelta(pct: number): DeltaState {
  if (Math.abs(pct) < 0.05) return "neutral";
  return pct > 0 ? "positive" : "negative";
}

const DELTA_STYLE: Record<DeltaState, { bg: string; color: string; icon: string }> = {
  positive: { bg: "rgba(22,163,74,0.10)",  color: "#16A34A", icon: "▲" },
  negative: { bg: "rgba(220,38,38,0.10)", color: "#DC2626", icon: "▼" },
  neutral:  { bg: "rgba(100,116,139,0.10)", color: "#64748B", icon: "—" },
};

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const state = classifyDelta(pct);
  const { bg, color, icon } = DELTA_STYLE[state];
  const label = state === "neutral" ? `— ${Math.abs(pct).toFixed(1)}%` : fmtDelta(pct);
  return (
    <span
      style={{
        display: "block",
        marginTop: 2,
        padding: "0px 4px",
        borderRadius: 3,
        fontSize: 9,
        fontWeight: 700,
        fontFamily: "JetBrains Mono, monospace",
        lineHeight: "14px",
        background: bg,
        color,
        whiteSpace: "nowrap",
        width: "fit-content",
      }}
    >
      {state === "neutral" ? label : `${icon} ${label}`}
    </span>
  );
}

// ── Metric cell — receives pre-resolved calendar values, not raw blocks ───────

function MetricCell({ value, pct }: { value: number | null; pct: number | null }) {
  if (value === null) {
    return (
      <td
        className="px-3 py-2 text-center font-mono text-xs"
        style={{ color: "#CBD5E1", verticalAlign: "top" }}
      >
        —
      </td>
    );
  }
  return (
    <td
      className="px-3 py-2 font-mono text-xs"
      style={{ verticalAlign: "top", textAlign: "right" }}
    >
      <span style={{ color: value < 0 ? "#DC2626" : "#0F172A", display: "block" }}>
        {fmtVal(value)}
      </span>
      <DeltaBadge pct={pct} />
    </td>
  );
}

// ── Sort helpers ──────────────────────────────────────────────────────────────
//
// Sort keys encode column POSITION (y0=col0, y1=col1, y2=col2), not raw block
// keys. getVal resolves via atCalendarYear so a stale row sorts correctly too.

type SortKey =
  | "empresa" | "sector"
  | "ingresos_y0" | "ingresos_y1" | "ingresos_y2"
  | "ebitda_y0"   | "ebitda_y1"   | "ebitda_y2"
  | "ebit_y0"     | "ebit_y1"     | "ebit_y2"
  | "utilidad_y0" | "utilidad_y1" | "utilidad_y2";

interface SortState { key: SortKey; dir: "asc" | "desc" }

// Defined inside the component to capture globalBaseYear
function makeGetVal(globalBaseYear: number) {
  return function getVal(row: ProjectionRowAPI, key: SortKey): number | string | null {
    if (key === "empresa") return row.empresa;
    if (key === "sector")  return row.sector;
    const lastUnder = key.lastIndexOf("_");
    const metric  = key.slice(0, lastUnder) as keyof Pick<ProjectionRowAPI, "ingresos" | "ebitda" | "ebit" | "utilidad">;
    const colIdx  = parseInt(key.slice(lastUnder + 2)); // "y0"→0, "y1"→1, "y2"→2
    const calYear = globalBaseYear + colIdx;
    return atCalendarYear(row[metric], row.base_year, calYear);
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProjectionsTable({ rows, base_year: globalBaseYear, prevAt }: Props) {
  const [sort, setSort] = useState<SortState>({ key: "empresa", dir: "asc" });

  const getVal = makeGetVal(globalBaseYear);

  // Column headers are strictly anchored to the global (most-recent) base year
  const yearLabels = COL_INDICES.map((i) => `${globalBaseYear + i}E`);

  const hasDeltaData = rows.some((r) => r.delta !== null);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "empresa" || key === "sector" ? "asc" : "desc" }
    );
  }

  function SortIcon({ colKey }: { colKey: SortKey }) {
    if (sort.key !== colKey)
      return <span style={{ opacity: 0.25, marginLeft: 2, fontSize: 8 }}>⇅</span>;
    return (
      <span style={{ color: "#2B5CE0", marginLeft: 2, fontSize: 8 }}>
        {sort.dir === "asc" ? "↑" : "↓"}
      </span>
    );
  }

  const sorted = [...rows].sort((a, b) => {
    const av = getVal(a, sort.key);
    const bv = getVal(b, sort.key);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp =
      typeof av === "string" && typeof bv === "string"
        ? av.localeCompare(bv)
        : (av as number) - (bv as number);
    return sort.dir === "asc" ? cmp : -cmp;
  });

  function thStyle(active: boolean): React.CSSProperties {
    return {
      cursor: "pointer",
      userSelect: "none",
      color: active ? "#2B5CE0" : "#64748B",
      background: active ? "rgba(43,92,224,0.06)" : undefined,
    };
  }

  // For a given row × metric × column index, resolve value and delta
  // by calendar year so stale rows are automatically "shifted" visually.
  function resolveCell(
    row: ProjectionRowAPI,
    metric: keyof Pick<ProjectionRowAPI, "ingresos" | "ebitda" | "ebit" | "utilidad">,
    colIdx: number,
  ): { value: number | null; pct: number | null } {
    const calYear    = globalBaseYear + colIdx;
    const value      = atCalendarYear(row[metric],              row.base_year, calYear);
    const deltaBlock = row.delta ? (row.delta[metric as keyof DeltaSet] as DeltaBlock | null) : null;
    const pct        = atCalendarYear(deltaBlock,               row.base_year, calYear);
    return { value, pct };
  }

  return (
    <div className="card overflow-hidden">

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      {hasDeltaData && prevAt && (
        <div
          style={{
            padding: "7px 16px 6px",
            borderBottom: BORDER_LIGHT,
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 10,
            color: "#94A3B8",
            fontFamily: "JetBrains Mono, monospace",
            background: "rgba(248,250,252,0.7)",
          }}
        >
          <span style={{ fontWeight: 600, color: "#64748B" }}>
            Δ vs. reporte del {fmtLegendDate(prevAt)}
          </span>
          <span style={{ color: "#CBD5E1" }}>·</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ background: "rgba(22,163,74,0.10)", color: "#16A34A", fontWeight: 700, padding: "0 4px", borderRadius: 3 }}>
              ▲ +%
            </span>
            upward revision
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ background: "rgba(220,38,38,0.10)", color: "#DC2626", fontWeight: 700, padding: "0 4px", borderRadius: 3 }}>
              ▼ −%
            </span>
            downward revision
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ background: "rgba(100,116,139,0.10)", color: "#64748B", fontWeight: 700, padding: "0 4px", borderRadius: 3 }}>
              — 0%
            </span>
            no change
          </span>
          <span style={{ color: "#CBD5E1" }}>·</span>
          <span style={{ color: "#CBD5E1" }}>years aligned by calendar · stale rows shifted right</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table
          className="w-full text-xs whitespace-nowrap"
          style={{ borderCollapse: "collapse" }}
        >
          <thead>
            {/* Row 1 — metric group headers */}
            <tr style={{ background: "#EEF2FA" }}>
              <th
                colSpan={3}
                className="px-4 py-2 text-left text-[10px] font-bold tracking-widest uppercase"
                style={{ color: "#64748B", borderBottom: BORDER_METRIC, borderRight: BORDER_METRIC }}
              >
                Company Info
              </th>
              {METRIC_HEADERS.map((m) => (
                <th
                  key={m}
                  colSpan={3}
                  className="px-4 py-2 text-center text-[10px] font-bold tracking-widest uppercase"
                  style={{ color: "#2B5CE0", borderBottom: BORDER_METRIC, borderRight: BORDER_METRIC }}
                >
                  {m}
                </th>
              ))}
            </tr>
            {/* Row 2 — year column headers (strictly globalBaseYear anchored) */}
            <tr style={{ background: "#F0F4FA" }}>
              <th
                className="px-4 py-2 text-left font-medium"
                style={{ ...thStyle(sort.key === "empresa"), borderBottom: BORDER_LIGHT }}
                onClick={() => toggleSort("empresa")}
              >
                Empresa <SortIcon colKey="empresa" />
              </th>
              <th
                className="px-3 py-2 text-left font-medium"
                style={{ ...thStyle(sort.key === "sector"), borderBottom: BORDER_LIGHT }}
                onClick={() => toggleSort("sector")}
              >
                Sector <SortIcon colKey="sector" />
              </th>
              <th
                className="px-3 py-2 text-left font-medium"
                style={{ color: "#64748B", borderBottom: BORDER_LIGHT, borderRight: BORDER_METRIC }}
              >
                Mon.
              </th>
              {METRIC_HEADERS.map((m) =>
                COL_INDICES.map((ci) => {
                  const sortKey = `${m.toLowerCase()}_y${ci}` as SortKey;
                  return (
                    <th
                      key={`${m}-${ci}`}
                      className="px-3 py-2 text-right font-medium"
                      style={{
                        ...thStyle(sort.key === sortKey),
                        borderBottom: BORDER_LIGHT,
                        borderRight: ci === 2 ? BORDER_METRIC : undefined,
                      }}
                      onClick={() => toggleSort(sortKey)}
                    >
                      {yearLabels[ci]} <SortIcon colKey={sortKey} />
                    </th>
                  );
                })
              )}
            </tr>
          </thead>

          <tbody>
            {sorted.map((row, i) => {
              // Badge to signal that this row's data was shifted (stale base_year)
              const isStale = row.base_year < globalBaseYear;

              return (
                <tr
                  key={i}
                  className="transition-colors"
                  style={{ borderBottom: BORDER_LIGHT }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.03)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "transparent")
                  }
                >
                  {/* Company name */}
                  <td className="px-4 py-2 font-medium" style={{ color: "#0F172A", verticalAlign: "top" }}>
                    {row.empresa}
                    {isStale && (
                      <span
                        title={`Data anchored to base year ${row.base_year}; shifted to align with ${globalBaseYear}E columns`}
                        style={{
                          marginLeft: 6,
                          padding: "1px 5px",
                          borderRadius: 4,
                          fontSize: 9,
                          fontWeight: 600,
                          background: "rgba(234,179,8,0.12)",
                          color: "#A16207",
                          fontFamily: "JetBrains Mono, monospace",
                          cursor: "default",
                        }}
                      >
                        base {row.base_year}
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-2" style={{ color: "#64748B", verticalAlign: "top" }}>
                    {row.sector || "—"}
                  </td>
                  <td
                    className="px-3 py-2 font-mono"
                    style={{ color: "#94A3B8", borderRight: BORDER_METRIC, verticalAlign: "top" }}
                  >
                    {row.moneda}
                  </td>

                  {/* Ingresos */}
                  {COL_INDICES.map((ci) => {
                    const { value, pct } = resolveCell(row, "ingresos", ci);
                    return (
                      <td
                        key={`ing-${ci}`}
                        style={{
                          borderLeft: ci === 0 ? "2px solid #E2E8F0" : undefined,
                          borderRight: ci === 2 ? BORDER_METRIC : undefined,
                          padding: 0,
                        }}
                      >
                        <MetricCell value={value} pct={pct} />
                      </td>
                    );
                  })}

                  {/* EBITDA */}
                  {COL_INDICES.map((ci) => {
                    const { value, pct } = resolveCell(row, "ebitda", ci);
                    return (
                      <td
                        key={`ebd-${ci}`}
                        style={{
                          borderLeft: ci === 0 ? "2px solid #E2E8F0" : undefined,
                          borderRight: ci === 2 ? BORDER_METRIC : undefined,
                          background: "rgba(248,250,252,0.8)",
                          padding: 0,
                        }}
                      >
                        <MetricCell value={value} pct={pct} />
                      </td>
                    );
                  })}

                  {/* EBIT */}
                  {COL_INDICES.map((ci) => {
                    const { value, pct } = resolveCell(row, "ebit", ci);
                    return (
                      <td
                        key={`ebt-${ci}`}
                        style={{
                          borderLeft: ci === 0 ? "2px solid #E2E8F0" : undefined,
                          borderRight: ci === 2 ? BORDER_METRIC : undefined,
                          padding: 0,
                        }}
                      >
                        <MetricCell value={value} pct={pct} />
                      </td>
                    );
                  })}

                  {/* Utilidad */}
                  {COL_INDICES.map((ci) => {
                    const { value, pct } = resolveCell(row, "utilidad", ci);
                    return (
                      <td
                        key={`utl-${ci}`}
                        style={{
                          borderLeft: ci === 0 ? "2px solid #E2E8F0" : undefined,
                          borderRight: ci === 2 ? BORDER_METRIC : undefined,
                          background: "rgba(248,250,252,0.8)",
                          padding: 0,
                        }}
                      >
                        <MetricCell value={value} pct={pct} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
