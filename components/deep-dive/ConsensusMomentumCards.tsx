"use client";

import { useMemo } from "react";
import type { ConsensusPoint } from "@/app/api/companies/[ticker]/route";

// ── Card config ───────────────────────────────────────────────────────────────

const CARDS = [
  { label: "Revenue",    aliases: ["REVENUE", "SALES"], color: "#059669", bg: "rgba(5,150,105,0.04)",   border: "rgba(5,150,105,0.13)"   },
  { label: "EBITDA",     aliases: ["EBITDA"],            color: "#2B5CE0", bg: "rgba(43,92,224,0.04)",  border: "rgba(43,92,224,0.13)"   },
  { label: "Net Income", aliases: ["NET_INCOME"],        color: "#7C3AED", bg: "rgba(124,58,237,0.04)", border: "rgba(124,58,237,0.13)"  },
] as const;

// Delta columns: label shown in header + months to look back
const DELTAS = [
  { label: "1M",  months:  1 },
  { label: "3M",  months:  3 },
  { label: "1Y",  months: 12 },
  { label: "2Y",  months: 24 },
] as const;

type DeltaKey = typeof DELTAS[number]["label"];

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(2);
}

function fmtChg(chgPct: number | null): { text: string; color: string } {
  if (chgPct === null) return { text: "—", color: "#CBD5E1" };
  if (chgPct >  0.05)  return { text: `+${chgPct.toFixed(0)}%`, color: "#059669" };
  if (chgPct < -0.05)  return { text: `${chgPct.toFixed(0)}%`,  color: "#DC2626" };
  return { text: `${chgPct.toFixed(1)}%`, color: "#94A3B8" };
}

// ── Data helpers ──────────────────────────────────────────────────────────────

/**
 * Finds the value closest to `targetDate` within a tolerance window.
 * Larger tolerance for longer lookback periods to account for sparse data.
 */
function findValueNear(
  points: ConsensusPoint[],
  targetDate: Date,
  skipDate: string,
  toleranceDays = 45
): number | null {
  const toleranceMs = toleranceDays * 24 * 60 * 60 * 1000;
  let best: { value: number; diff: number } | null = null;

  for (const p of points) {
    if (p.date === skipDate) continue;
    const diff = Math.abs(new Date(p.date).getTime() - targetDate.getTime());
    if (diff <= toleranceMs && (!best || diff < best.diff)) {
      best = { value: p.value, diff };
    }
  }

  return best ? best.value : null;
}

/** `((current / past) - 1) * 100` — returns null when past is 0 or missing. */
function pctChange(current: number, past: number | null): number | null {
  if (past === null || past === 0) return null;
  return ((current / past) - 1) * 100;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface YearMomentum {
  current: number | null;
  deltas: Record<DeltaKey, number | null>;
}

type TrendDir = "up" | "down" | "mixed" | "insufficient";

interface TrendResult {
  direction: TrendDir;
  label:     string;   // colored word
  sentence:  string;   // full sentence text after the label
}

// ── Trend analysis ────────────────────────────────────────────────────────────

/**
 * Evaluates the month-over-month direction for the last 3 consecutive data
 * points of a given (metric, year) series.
 *
 * Returns:
 *   "up"           — all 3 MoM changes are positive
 *   "down"         — all 3 MoM changes are negative
 *   "mixed"        — direction flipped at least once
 *   "insufficient" — fewer than 4 data points (need 4 to get 3 MoM changes)
 */
function computeTrend(
  data: ConsensusPoint[],
  aliases: readonly string[],
  year: string
): TrendResult {
  const points = data
    .filter((r) => {
      const up = r.metric.toUpperCase();
      return aliases.includes(up) && String(r.period).trim() === year;
    })
    .sort((a, b) => a.date.localeCompare(b.date)); // asc

  if (points.length < 4) {
    return { direction: "insufficient", label: "stable", sentence: "over the last 3 months." };
  }

  // Take the 4 most recent points → 3 consecutive MoM changes
  const tail = points.slice(-4);
  const changes = [
    tail[1].value - tail[0].value,
    tail[2].value - tail[1].value,
    tail[3].value - tail[2].value,
  ];

  const allUp   = changes.every((c) => c > 0);
  const allDown = changes.every((c) => c < 0);

  if (allUp)   return { direction: "up",   label: "upward",  sentence: "over the last 3 months." };
  if (allDown) return { direction: "down", label: "downward", sentence: "over the last 3 months." };
  return        { direction: "mixed", label: "mixed",    sentence: "with no clear direction over the last 3 months." };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  data: ConsensusPoint[];
}

export default function ConsensusMomentumCards({ data }: Props) {

  // Extract available calendar years from the data (e.g. "2026", "2027")
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const row of data) {
      const y = String(row.period).trim();
      if (y && !isNaN(Number(y))) years.add(y);
    }
    return Array.from(years).sort();
  }, [data]);

  const cardData = useMemo(() => {
    const result: Record<string, Record<string, YearMomentum>> = {};

    for (const card of CARDS) {
      const yearMap: Record<string, YearMomentum> = {};

      for (const year of availableYears) {
        // All points for this (card, year) combo, sorted newest→oldest
        const points = data
          .filter((r) => {
            const up = r.metric.toUpperCase();
            return (
              card.aliases.includes(up as never) &&
              String(r.period).trim() === year
            );
          })
          .sort((a, b) => b.date.localeCompare(a.date));

        if (points.length === 0) {
          yearMap[year] = { current: null, deltas: { "1M": null, "3M": null, "1Y": null, "2Y": null } };
          continue;
        }

        const latest     = points[0];
        const latestDate = new Date(latest.date);
        const currentVal = latest.value;

        // Compute each delta with a tolerance that scales with lookback distance
        const deltas = {} as Record<DeltaKey, number | null>;
        for (const { label, months } of DELTAS) {
          const target = new Date(latestDate);
          target.setMonth(target.getMonth() - months);
          // Allow ±(months * 15) days tolerance — wider window for older lookbacks
          const tolerance = Math.max(45, months * 15);
          const past = findValueNear(points, target, latest.date, tolerance);
          deltas[label] = pctChange(currentVal, past);
        }

        yearMap[year] = { current: currentVal, deltas };
      }

      result[card.label] = yearMap;
    }

    return result;
  }, [data, availableYears]);

  const hasAnyData = CARDS.some((c) =>
    availableYears.some((y) => cardData[c.label]?.[y]?.current !== null)
  );

  if (!hasAnyData) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-300">
        No consensus data available
      </div>
    );
  }

  // ── Trend summary — first available year across all 3 metrics ──────────────
  const trendYear = availableYears[0] ?? null;

  const trends = useMemo(() => {
    if (!trendYear) return null;
    return CARDS.map((card) => ({
      card,
      trend: computeTrend(data, card.aliases, trendYear),
    }));
  }, [data, trendYear]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full gap-3">

      {/* 3 cards — horizontal scroll if they don't fit */}
      <div className="flex overflow-x-auto gap-3 pb-1 w-full">
        {CARDS.map((card) => {
          const cData = cardData[card.label] ?? {};

          return (
            <div
              key={card.label}
              style={{ background: card.bg, border: `1px solid ${card.border}` }}
              className="rounded-xl p-3 flex flex-col shrink-0 min-w-[260px] flex-1"
            >
              {/* Card title */}
              <div
                className="text-[10px] font-bold tracking-widest uppercase pb-2 mb-2"
                style={{ color: card.color, borderBottom: `1px solid ${card.border}` }}
              >
                {card.label}
              </div>

              {/* Table */}
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-[8px] font-semibold uppercase text-slate-400 text-left pb-1.5 pr-2 w-9">
                      Year
                    </th>
                    <th className="text-[8px] font-semibold uppercase text-slate-400 text-right pb-1.5 pr-2">
                      Now
                    </th>
                    {DELTAS.map(({ label }) => (
                      <th key={label} className="text-[8px] font-semibold uppercase text-slate-400 text-right pb-1.5 pr-1">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {availableYears.map((year, i) => {
                    const m = cData[year];
                    return (
                      <tr
                        key={year}
                        className={i < availableYears.length - 1 ? "border-b border-slate-100" : ""}
                      >
                        {/* Year */}
                        <td className="text-[11px] font-mono font-semibold text-slate-500 py-2 pr-2">
                          {year}
                        </td>

                        {/* Current value */}
                        <td
                          className="text-[10px] font-mono font-bold text-right py-2 pr-2"
                          style={{ color: m?.current != null ? card.color : "#CBD5E1" }}
                        >
                          {m?.current != null ? fmtCompact(m.current) : "—"}
                        </td>

                        {/* Delta columns */}
                        {DELTAS.map(({ label }) => {
                          const { text, color } = fmtChg(m?.deltas[label] ?? null);
                          return (
                            <td
                              key={label}
                              className="text-[10px] font-mono font-bold text-right py-2 pr-1"
                              style={{ color }}
                            >
                              {text}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {availableYears.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-[10px] text-slate-300 text-center py-2">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {/* ── 3-Month Trend Analysis panel ──────────────────────────────────── */}
      {trends && trendYear && (
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-[10px] font-bold tracking-widest uppercase"
              style={{ color: "#64748B" }}
            >
              3-Month Trend Analysis
            </span>
            <span
              className="text-[10px] font-mono"
              style={{
                color: "#64748B",
                background: "rgba(15,23,42,0.04)",
                border: "1px solid rgba(15,23,42,0.07)",
                borderRadius: 3,
                padding: "0px 5px",
              }}
            >
              {trendYear}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {trends.map(({ card, trend }) => {
              const dirColor =
                trend.direction === "up"   ? "#059669" :
                trend.direction === "down" ? "#DC2626" : "#94A3B8";

              const dirBg =
                trend.direction === "up"   ? "rgba(5,150,105,0.07)"  :
                trend.direction === "down" ? "rgba(220,38,38,0.07)"  :
                                             "rgba(15,23,42,0.04)";

              const arrow =
                trend.direction === "up"   ? "↑" :
                trend.direction === "down" ? "↓" : "→";

              return (
                <div key={card.label} className="flex flex-col gap-1.5">
                  {/* Metric name + color dot */}
                  <div className="flex items-center gap-1.5">
                    <span
                      style={{ width: 6, height: 6, borderRadius: "50%", background: card.color, flexShrink: 0 }}
                      className="inline-block"
                    />
                    <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: card.color }}>
                      {card.label}
                    </span>
                  </div>

                  {/* Trend badge */}
                  <div
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 self-start"
                    style={{ background: dirBg, border: `1px solid ${dirColor}22` }}
                  >
                    <span className="text-[11px] font-bold leading-none" style={{ color: dirColor }}>
                      {arrow}
                    </span>
                    <span className="text-[9px] font-bold font-mono capitalize" style={{ color: dirColor }}>
                      {trend.label}
                    </span>
                  </div>

                  {/* Sentence */}
                  <span className="text-[9px] text-slate-400 leading-tight">
                    Estimates trended{" "}
                    <span style={{ color: dirColor, fontWeight: 700 }}>{trend.label}</span>{" "}
                    {trend.sentence}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
