"use client";

import { PATRIA } from "@/lib/patriaTheme";

import { useState } from "react";

interface CarteraRow {
  company: string;
  portfolioPct: number;
  benchmarkPct: number;
  overweight: number;
  sector: string;
  delta1W: number | null;
  delta1M: number | null;
}

interface Props {
  cartera: CarteraRow[];
  benchmark: string;
  fundName?: string;
}

type SortCol = "company" | "portfolioPct" | "benchmarkPct" | "overweight" | "delta1W" | "delta1M";
type SortDir = "asc" | "desc";

function fmtDelta(v: number | null): { text: string; color: string; bg: string } {
  if (v === null) return { text: "—", color: "rgba(13,13,56,0.28)", bg: "transparent" };
  const pct = v * 100;
  if (Math.abs(pct) < 0.005) return { text: "0.00%", color: "rgba(13,13,56,0.45)", bg: "transparent" };
  const text = (pct > 0 ? "+" : "") + pct.toFixed(2) + "%";
  const color = pct > 0 ? "#001EAF" : "#F8485E";
  const bg = pct > 0 ? "rgba(0,30,175,0.08)" : "rgba(248,72,94,0.08)";
  return { text, color, bg };
}

function sortRows(rows: CarteraRow[], col: SortCol, dir: SortDir): CarteraRow[] {
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (col === "company") {
      cmp = a.company.localeCompare(b.company);
    } else if (col === "delta1W" || col === "delta1M") {
      const av = a[col] ?? -Infinity;
      const bv = b[col] ?? -Infinity;
      cmp = av - bv;
    } else {
      cmp = a[col] - b[col];
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function defaultSort(fundName: string | undefined): { col: SortCol; dir: SortDir } {
  if (fundName?.toLowerCase() === "pionero") {
    return { col: "portfolioPct", dir: "desc" };
  }
  return { col: "overweight", dir: "desc" };
}

const SORT_ICON = {
  asc:  "↑",
  desc: "↓",
  none: "↕",
} as const;

export default function CarteraTable({ cartera, benchmark, fundName }: Props) {
  const def = defaultSort(fundName);
  const [sortCol, setSortCol] = useState<SortCol>(def.col);
  const [sortDir, setSortDir] = useState<SortDir>(def.dir);

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  const sorted = sortRows(cartera, sortCol, sortDir);
  const hasDelta1W = cartera.some((r) => r.delta1W !== null);
  const hasDelta1M = cartera.some((r) => r.delta1M !== null);

  function thBtn(col: SortCol, label: string, align: "left" | "right" = "right") {
    const active = sortCol === col;
    return (
      <th
        className={`px-3 py-2.5 font-bold font-secondary cursor-pointer select-none ${align === "left" ? "text-left" : "text-right"}`}
        style={{ color: active ? PATRIA.darkBlue : PATRIA.kingBlue, borderBottom: "1px solid rgba(13,13,56,0.07)" }}
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
    <div className="card overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 flex items-center justify-between"
        style={{ background: PATRIA.darkBlue }}
      >
        <div>
          <h2 className="text-sm font-bold font-primary uppercase tracking-wide" style={{ color: PATRIA.white }}>Detalle Cartera</h2>
          <p className="text-xs mt-0.5 font-secondary" style={{ color: "rgba(255,255,255,0.72)" }}>
            Click en cabecera para ordenar
          </p>
        </div>
        <span className="text-xs font-secondary tabular-nums px-2 py-0.5 rounded"
          style={{ background: "rgba(255,255,255,0.12)", color: PATRIA.white }}
        >
          {cartera.length} posiciones
        </span>
      </div>
      <div className="overflow-y-auto flex-1 min-h-0 max-h-[500px] md:max-h-none">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10" style={{ background: "#F5F7FD" }}>
            <tr>
              <th className="px-3 py-2.5 text-left font-bold w-8 font-secondary"
                style={{ color: PATRIA.kingBlue, borderBottom: "1px solid rgba(13,13,56,0.07)" }}>#</th>
              {thBtn("company", "Empresa", "left")}
              {thBtn("portfolioPct", "% Port.")}
              {thBtn("benchmarkPct", `% ${benchmark}`)}
              {thBtn("overweight", "Overweight")}
              {hasDelta1W && thBtn("delta1W", "Δ 1W")}
              {hasDelta1M && thBtn("delta1M", "Δ 1M")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const over = row.overweight * 100;
              const overColor = over > 0 ? "#001EAF" : over < 0 ? "#F8485E" : "rgba(13,13,56,0.62)";
              const d1w = fmtDelta(row.delta1W);
              const d1m = fmtDelta(row.delta1M);

              return (
                <tr
                  key={i}
                  className="border-t transition-colors"
                  style={{ borderColor: "rgba(13,13,56,0.05)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.03)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <td className="px-3 py-2 font-secondary tabular-nums" style={{ color: "rgba(13,13,56,0.45)" }}>{i + 1}</td>

                  <td className="px-3 py-2 font-medium" style={{ color: "#0D0D38" }}>
                    {row.company}
                  </td>

                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-12 h-1.5 rounded-full" style={{ background: "rgba(32,68,220,0.10)" }}>
                        <div className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, row.portfolioPct * 500)}%`,
                            background: "linear-gradient(90deg, #2044DC, #2044DC)",
                          }}
                        />
                      </div>
                      <span className="font-secondary tabular-nums font-semibold" style={{ color: "#0D0D38" }}>
                        {(row.portfolioPct * 100).toFixed(2)}%
                      </span>
                    </div>
                  </td>

                  <td className="px-3 py-2 font-secondary tabular-nums text-right" style={{ color: "rgba(13,13,56,0.62)" }}>
                    {(row.benchmarkPct * 100).toFixed(2)}%
                  </td>

                  <td className="px-3 py-2 text-right">
                    <span className="font-secondary tabular-nums font-bold text-[11px] px-2 py-0.5 rounded-full"
                      style={{ color: overColor, background: `${overColor}12`, border: `1px solid ${overColor}28` }}
                    >
                      {over > 0 ? "+" : ""}{over.toFixed(2)}%
                    </span>
                  </td>

                  {hasDelta1W && (
                    <td className="px-3 py-2 text-right">
                      <span className="font-secondary tabular-nums font-semibold text-[11px] px-1.5 py-0.5 rounded"
                        style={{ color: d1w.color, background: d1w.bg }}
                      >
                        {d1w.text}
                      </span>
                    </td>
                  )}

                  {hasDelta1M && (
                    <td className="px-3 py-2 text-right">
                      <span className="font-secondary tabular-nums font-semibold text-[11px] px-1.5 py-0.5 rounded"
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
