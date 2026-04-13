"use client";

import { useMemo } from "react";
import type { ConsensusPoint } from "@/app/api/companies/[ticker]/route";

// ── Card config ───────────────────────────────────────────────────────────────

const CARDS = [
  { label: "Revenue",    aliases: ["REVENUE", "SALES"], color: "#059669", bg: "rgba(5,150,105,0.04)",   border: "rgba(5,150,105,0.13)"   },
  { label: "EBITDA",     aliases: ["EBITDA"],            color: "#2B5CE0", bg: "rgba(43,92,224,0.04)",  border: "rgba(43,92,224,0.13)"   },
  { label: "Net Income", aliases: ["NET_INCOME"],        color: "#7C3AED", bg: "rgba(124,58,237,0.04)", border: "rgba(124,58,237,0.13)"  },
] as const;

const PERIODS = ["1FY", "2FY"] as const;

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(2);
}

function fmtChg(chgPct: number | null): { text: string; cls: string } {
  if (chgPct === null) return { text: "—", cls: "text-gray-300" };
  // Threshold: ±0.05% considered flat (floating-point noise guard)
  if (chgPct >  0.05) return { text: `+${chgPct.toFixed(1)}%`, cls: "text-green-600" };
  if (chgPct < -0.05) return { text: `${chgPct.toFixed(1)}%`,  cls: "text-red-600"   };
  return { text: `${chgPct.toFixed(1)}%`, cls: "text-slate-400" };
}

// ── Data helpers ──────────────────────────────────────────────────────────────

/**
 * Given a sorted-descending array of data points for one (metric, period),
 * finds the value whose date is closest to `targetDate`, excluding `skipDate`.
 * Returns null if no point falls within ±45 days of the target.
 */
function findValueNear(
  points: ConsensusPoint[],
  targetDate: Date,
  skipDate: string
): number | null {
  const TOLERANCE_MS = 45 * 24 * 60 * 60 * 1000; // 45-day window
  let best: { value: number; diff: number } | null = null;

  for (const p of points) {
    if (p.date === skipDate) continue;
    const diff = Math.abs(new Date(p.date).getTime() - targetDate.getTime());
    if (diff <= TOLERANCE_MS && (!best || diff < best.diff)) {
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

interface PeriodMomentum {
  current: number | null;
  chg1M:   number | null; // pct
  chg3M:   number | null; // pct
}

type CardData = Record<"1FY" | "2FY", PeriodMomentum>;

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  data: ConsensusPoint[];
}

export default function ConsensusMomentumCards({ data }: Props) {
  const cardData = useMemo<Record<string, CardData>>(() => {
    const result: Record<string, CardData> = {};

    for (const card of CARDS) {
      const cardResult: CardData = {
        "1FY": { current: null, chg1M: null, chg3M: null },
        "2FY": { current: null, chg1M: null, chg3M: null },
      };

      for (const period of PERIODS) {
        // Collect all points for this (card, period) combo
        const points = data
          .filter((r) => {
            const up = r.metric.toUpperCase();
            return card.aliases.includes(up as never) && r.period === period;
          })
          .sort((a, b) => b.date.localeCompare(a.date)); // desc

        if (points.length === 0) continue;

        const latest      = points[0];
        const latestDate  = new Date(latest.date);
        const currentVal  = latest.value;

        // Build target dates for -1M and -3M
        const target1M = new Date(latestDate);
        target1M.setMonth(target1M.getMonth() - 1);

        const target3M = new Date(latestDate);
        target3M.setMonth(target3M.getMonth() - 3);

        const val1M = findValueNear(points, target1M, latest.date);
        const val3M = findValueNear(points, target3M, latest.date);

        cardResult[period] = {
          current: currentVal,
          chg1M:   pctChange(currentVal, val1M),
          chg3M:   pctChange(currentVal, val3M),
        };
      }

      result[card.label] = cardResult;
    }

    return result;
  }, [data]);

  const hasAnyData = CARDS.some((c) =>
    PERIODS.some((p) => cardData[c.label]?.[p]?.current !== null)
  );

  if (!hasAnyData) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-300">
        No consensus data available
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-3">
        <span className="text-[11px] font-bold tracking-widest uppercase text-slate-400">
          Estimate Momentum — Consensus Revisions
        </span>
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-3 gap-3 flex-1">
        {CARDS.map((card) => {
          const cData = cardData[card.label];

          return (
            <div
              key={card.label}
              style={{ background: card.bg, border: `1px solid ${card.border}` }}
              className="rounded-xl p-3 flex flex-col gap-2"
            >
              {/* Card title */}
              <div
                className="text-[9px] font-bold tracking-widest uppercase pb-2"
                style={{
                  color: card.color,
                  borderBottom: `1px solid ${card.border}`,
                }}
              >
                {card.label}
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-4 gap-1">
                <div className="text-[8px] font-semibold uppercase text-slate-400">Period</div>
                <div className="text-[8px] font-semibold uppercase text-slate-400 text-right">Now</div>
                <div className="text-[8px] font-semibold uppercase text-slate-400 text-right">1M Chg</div>
                <div className="text-[8px] font-semibold uppercase text-slate-400 text-right">3M Chg</div>
              </div>

              {/* Data rows */}
              {PERIODS.map((period, i) => {
                const m = cData?.[period];
                const chg1M = fmtChg(m?.chg1M ?? null);
                const chg3M = fmtChg(m?.chg3M ?? null);

                return (
                  <div
                    key={period}
                    className={`grid grid-cols-4 gap-1 pt-1.5 ${
                      i < PERIODS.length - 1 ? "border-b border-slate-100 pb-1.5" : ""
                    }`}
                  >
                    {/* Period label */}
                    <div className="text-[10px] font-mono font-semibold text-slate-500">
                      {period}
                    </div>

                    {/* Current value */}
                    <div
                      className="text-[10px] font-mono font-bold text-right"
                      style={{ color: m?.current != null ? card.color : "#CBD5E1" }}
                    >
                      {m?.current != null ? fmtCompact(m.current) : "—"}
                    </div>

                    {/* 1M change */}
                    <div className={`text-[10px] font-mono font-bold text-right ${chg1M.cls}`}>
                      {chg1M.text}
                    </div>

                    {/* 3M change */}
                    <div className={`text-[10px] font-mono font-bold text-right ${chg3M.cls}`}>
                      {chg3M.text}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
