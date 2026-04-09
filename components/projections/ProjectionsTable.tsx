"use client";

import { useState } from "react";

interface MetricBlock {
  y2025: number;
  y2026: number;
  y2027: number;
}

export interface ProjectionRow {
  empresa: string;
  moneda: string;
  sector: string;
  ingresos: MetricBlock | null;
  ebitda: MetricBlock | null;
  ebit: MetricBlock | null;
  utilidad: MetricBlock | null;
}

interface Props {
  rows: ProjectionRow[];
}

/** Format as thousands-separated integer with no suffix — e.g. 1234567 → "1,234,567" */
function fmtVal(v: number): string {
  return Math.round(v).toLocaleString("en-US");
}

function MetricCell({ block, year }: { block: MetricBlock | null; year: keyof MetricBlock }) {
  if (block === null) {
    return (
      <td className="px-3 py-2.5 text-center font-mono text-xs" style={{ color: "#CBD5E1" }}>
        —
      </td>
    );
  }
  const v = block[year];
  const color = v < 0 ? "#DC2626" : "#0F172A";
  return (
    <td className="px-3 py-2.5 text-right font-mono text-xs" style={{ color }}>
      {fmtVal(v)}
    </td>
  );
}

// Only show forward-looking years (2025 is past)
const METRIC_HEADERS = ["Ingresos", "EBITDA", "EBIT", "Utilidad"] as const;
const YEARS = ["'26", "'27"] as const;
const YEAR_KEYS: (keyof MetricBlock)[] = ["y2026", "y2027"];

const BORDER_METRIC = "1px solid rgba(43,92,224,0.12)";
const BORDER_LIGHT  = "1px solid rgba(15,23,42,0.05)";

type SortKey =
  | "empresa"
  | "sector"
  | "ingresos_2026" | "ingresos_2027"
  | "ebitda_2026"   | "ebitda_2027"
  | "ebit_2026"     | "ebit_2027"
  | "utilidad_2026" | "utilidad_2027";

interface SortState { key: SortKey; dir: "asc" | "desc" }

function getVal(row: ProjectionRow, key: SortKey): number | string | null {
  if (key === "empresa") return row.empresa;
  if (key === "sector")  return row.sector;
  const [metric, yearStr] = key.split("_");
  const block = row[metric as keyof Pick<ProjectionRow, "ingresos" | "ebitda" | "ebit" | "utilidad">];
  if (!block) return null;
  return (block as MetricBlock)[`y${yearStr}` as keyof MetricBlock] ?? null;
}

export default function ProjectionsTable({ rows }: Props) {
  const [sort, setSort] = useState<SortState>({ key: "empresa", dir: "asc" });

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "empresa" || key === "sector" ? "asc" : "desc" }
    );
  }

  function SortIcon({ colKey }: { colKey: SortKey }) {
    if (sort.key !== colKey) return <span style={{ opacity: 0.25, marginLeft: 2, fontSize: 8 }}>⇅</span>;
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

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap" style={{ borderCollapse: "collapse" }}>
          <thead>
            {/* Row 1 — group headers */}
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
                  colSpan={2}
                  className="px-4 py-2 text-center text-[10px] font-bold tracking-widest uppercase"
                  style={{ color: "#2B5CE0", borderBottom: BORDER_METRIC, borderRight: BORDER_METRIC }}
                >
                  {m}
                </th>
              ))}
            </tr>
            {/* Row 2 — column headers */}
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
              <th className="px-3 py-2 text-left font-medium" style={{ color: "#64748B", borderBottom: BORDER_LIGHT, borderRight: BORDER_METRIC }}>
                Mon.
              </th>
              {METRIC_HEADERS.map((m) =>
                YEARS.map((y, yi) => {
                  const sortKey = `${m.toLowerCase()}_20${y.slice(1)}` as SortKey;
                  return (
                    <th
                      key={`${m}-${y}`}
                      className="px-3 py-2 text-right font-medium"
                      style={{
                        ...thStyle(sort.key === sortKey),
                        borderBottom: BORDER_LIGHT,
                        borderRight: yi === 1 ? BORDER_METRIC : undefined,
                      }}
                      onClick={() => toggleSort(sortKey)}
                    >
                      {y} <SortIcon colKey={sortKey} />
                    </th>
                  );
                })
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={i}
                className="transition-colors"
                style={{ borderBottom: BORDER_LIGHT }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.03)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
              >
                <td className="px-4 py-2.5 font-medium" style={{ color: "#0F172A" }}>{row.empresa}</td>
                <td className="px-3 py-2.5" style={{ color: "#64748B" }}>{row.sector || "—"}</td>
                <td className="px-3 py-2.5 font-mono" style={{ color: "#94A3B8", borderRight: BORDER_METRIC }}>{row.moneda}</td>

                {/* Ingresos */}
                {YEAR_KEYS.map((k, ki) => (
                  <td key={`ing-${k}`} style={{ borderLeft: ki === 0 ? "2px solid #E2E8F0" : undefined, borderRight: ki === 1 ? BORDER_METRIC : undefined }}>
                    <MetricCell block={row.ingresos} year={k} />
                  </td>
                ))}

                {/* EBITDA — light tint */}
                {YEAR_KEYS.map((k, ki) => (
                  <td key={`ebd-${k}`} style={{ borderLeft: ki === 0 ? "2px solid #E2E8F0" : undefined, borderRight: ki === 1 ? BORDER_METRIC : undefined, background: "rgba(248,250,252,0.8)" }}>
                    <MetricCell block={row.ebitda} year={k} />
                  </td>
                ))}

                {/* EBIT */}
                {YEAR_KEYS.map((k, ki) => (
                  <td key={`ebt-${k}`} style={{ borderLeft: ki === 0 ? "2px solid #E2E8F0" : undefined, borderRight: ki === 1 ? BORDER_METRIC : undefined }}>
                    <MetricCell block={row.ebit} year={k} />
                  </td>
                ))}

                {/* Utilidad — light tint */}
                {YEAR_KEYS.map((k, ki) => (
                  <td key={`utl-${k}`} style={{ borderLeft: ki === 0 ? "2px solid #E2E8F0" : undefined, background: "rgba(248,250,252,0.8)" }}>
                    <MetricCell block={row.utilidad} year={k} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
