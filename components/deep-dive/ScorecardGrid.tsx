"use client";

import { useMemo, useEffect, useState } from "react";
import type { DeepDivePayload, ValuationPoint, ConsensusPoint } from "@/app/api/companies/[ticker]/route";
import { computeBands } from "@/lib/stats";
import type { TickerHistoryPayload } from "@/app/api/quant/ticker-history/route";

// ─────────────────────────────────────────────────────────────────────────────
// SCORING FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function filterToYears(data: ValuationPoint[], years: number): ValuationPoint[] {
  if (!data.length) return data;
  const last = new Date(data[data.length - 1].date + "T12:00:00");
  const cutoff = new Date(last);
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return data.filter((d) => new Date(d.date + "T12:00:00") >= cutoff);
}

function medianForField(
  data: ValuationPoint[],
  field: "peFwd" | "evEbitdaFwd",
  years: number,
): number | null {
  const vals = filterToYears(data, years)
    .map((r) => r[field])
    .filter((v): v is number => v != null && isFinite(v));
  if (!vals.length) return null;
  const b = computeBands(vals);
  return isFinite(b.median) ? b.median : null;
}

interface ValuationResult {
  score: number | null;
  weightedDiscount: number | null;
  discount10y: number | null;
  discount5y: number | null;
  discount1y: number | null;
  currentVal: number | null;
  field: "peFwd" | "evEbitdaFwd";
}

function computeValuationScore(history: ValuationPoint[]): ValuationResult {
  const empty: ValuationResult = {
    score: null, weightedDiscount: null,
    discount10y: null, discount5y: null, discount1y: null,
    currentVal: null, field: "peFwd",
  };
  if (!history.length) return empty;

  const last = history[history.length - 1];
  const field: "peFwd" | "evEbitdaFwd" =
    last.peFwd != null ? "peFwd" : last.evEbitdaFwd != null ? "evEbitdaFwd" : "peFwd";

  const currentVal = last[field] ?? null;
  if (currentVal == null) return { ...empty, field };

  const disc = (med: number | null) =>
    med && med > 0 ? ((currentVal / med) - 1) * 100 : null;

  const discount10y = disc(medianForField(history, field, 100));
  const discount5y  = disc(medianForField(history, field, 5));
  const discount1y  = disc(medianForField(history, field, 1));

  let weighted = 0;
  let weight   = 0;
  if (discount10y != null) { weighted += discount10y * 0.40; weight += 0.40; }
  if (discount5y  != null) { weighted += discount5y  * 0.30; weight += 0.30; }
  if (discount1y  != null) { weighted += discount1y  * 0.30; weight += 0.30; }

  if (weight === 0) return { ...empty, discount10y, discount5y, discount1y, currentVal, field };

  const weightedDiscount = weighted / weight;

  let score: number;
  if      (weightedDiscount < -15) score = 5;
  else if (weightedDiscount <  -5) score = 4;
  else if (weightedDiscount <=  5) score = 3;
  else if (weightedDiscount <= 15) score = 2;
  else                             score = 1;

  return { score, weightedDiscount, discount10y, discount5y, discount1y, currentVal, field };
}

function computeAnalystScore(
  analystRec: DeepDivePayload["analystRec"],
): { score: number | null; buyPct: number | null } {
  if (!analystRec || analystRec.totAnalysts === 0) return { score: null, buyPct: null };
  const buyPct = (analystRec.buy / analystRec.totAnalysts) * 100;
  let score: number;
  if      (buyPct > 80) score = 5;
  else if (buyPct > 60) score = 4;
  else if (buyPct > 40) score = 3;
  else if (buyPct > 20) score = 2;
  else                  score = 1;
  return { score, buyPct };
}

type TrendDir = "up" | "down" | "mixed" | "insufficient";

function trendDir(data: ConsensusPoint[], aliases: string[], year: string): TrendDir {
  const pts = data
    .filter((r) => aliases.includes(r.metric.toUpperCase()) && String(r.period).trim() === year)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 4) return "insufficient";
  const tail = pts.slice(-4);
  const chg = [tail[1].value - tail[0].value, tail[2].value - tail[1].value, tail[3].value - tail[2].value];
  if (chg.every((c) => c > 0)) return "up";
  if (chg.every((c) => c < 0)) return "down";
  return "mixed";
}

interface EstimateResult {
  score: number | null;
  revDir: TrendDir | null;
  ebitdaDir: TrendDir | null;
  niDir: TrendDir | null;
  year: string | null;
}

function computeEstimateScore(estimates: ConsensusPoint[]): EstimateResult {
  const years = [...new Set(
    estimates.map((r) => String(r.period).trim()).filter((y) => !isNaN(Number(y)))
  )].sort();
  const year = years[0] ?? null;
  if (!year) return { score: null, revDir: null, ebitdaDir: null, niDir: null, year: null };

  const revDir   = trendDir(estimates, ["REVENUE", "SALES"], year);
  const ebitdaDir = trendDir(estimates, ["EBITDA"], year);
  const niDir    = trendDir(estimates, ["NET_INCOME"], year);

  const dirs = [revDir, ebitdaDir, niDir];
  if (dirs.every((d) => d === "insufficient")) {
    return { score: null, revDir, ebitdaDir, niDir, year };
  }

  const ups   = dirs.filter((d) => d === "up").length;
  const downs = dirs.filter((d) => d === "down").length;

  let score: number;
  if      (ups   === 3) score = 5;
  else if (ups   === 2) score = 4;
  else if (downs === 3) score = 1;
  else if (downs === 2) score = 2;
  else                  score = 3;

  return { score, revDir, ebitdaDir, niDir, year };
}

function computeRangeScore(
  pr: DeepDivePayload["priceRange52w"],
): { score: number | null; pct: number | null } {
  if (!pr) return { score: null, pct: null };
  const span = pr.high52w - pr.low52w;
  const pct  = span > 0 ? ((pr.pxLast - pr.low52w) / span) * 100 : null;
  if (pct == null) return { score: null, pct: null };
  const clamped = Math.max(0, Math.min(100, pct));
  let score: number;
  if      (clamped < 20) score = 5;
  else if (clamped < 40) score = 4;
  else if (clamped < 60) score = 3;
  else if (clamped < 80) score = 2;
  else                   score = 1;
  return { score, pct: clamped };
}

function quantScore(side: string | null): number | null {
  if (!side) return null;
  if (side === "LONG")  return 5;
  if (side === "SHORT") return 1;
  return 3;
}

function masterScore(scores: (number | null)[]): number | null {
  const valid = scores.filter((s): s is number => s != null);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const T1 = "#0F172A";
const T2 = "#64748B";
const T3 = "#94A3B8";
const BORDER = "rgba(15,23,42,0.08)";
const GREEN  = "#059669";
const RED    = "#DC2626";
const AMBER  = "#D97706";

function scoreTheme(s: number | null): { text: string; bg: string; border: string } {
  if (s == null) return { text: T3, bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.22)" };
  if (s >= 4)    return { text: GREEN, bg: "rgba(5,150,105,0.10)",  border: "rgba(5,150,105,0.28)"  };
  if (s >= 2.5)  return { text: AMBER, bg: "rgba(217,119,6,0.10)",  border: "rgba(217,119,6,0.28)"  };
  return          { text: RED,   bg: "rgba(220,38,38,0.10)",  border: "rgba(220,38,38,0.28)"  };
}

function fmtPct(v: number | null, decimals = 1): string {
  if (v == null) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(decimals) + "%";
}


// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function ScoreLegend({
  items,
  current,
}: {
  items: { score: number; label: string }[];
  current: number | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {items.map(({ score, label }) => {
        const isActive = current === score;
        const theme    = scoreTheme(score);
        return (
          <div
            key={score}
            style={{
              display:    "flex",
              alignItems: "center",
              gap:        8,
              padding:    "3px 6px",
              borderRadius: 5,
              background: isActive ? theme.bg : "transparent",
              border:     isActive ? `1px solid ${theme.border}` : "1px solid transparent",
            }}
          >
            <span
              style={{
                fontSize:   12,
                fontWeight: isActive ? 800 : 500,
                fontFamily: "JetBrains Mono, monospace",
                color:      isActive ? theme.text : T3,
                minWidth:   12,
              }}
            >
              {score}
            </span>
            <span
              style={{
                fontSize:   12,
                fontWeight: isActive ? 700 : 400,
                color:      isActive ? theme.text : T3,
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface CardShellProps {
  title: string;
  score: number | null;
  children: React.ReactNode;
  legend: { score: number; label: string }[];
  accent?: string;
}

function CardShell({ title, score, children, legend, accent = "#2563EB" }: CardShellProps) {
  const theme = scoreTheme(score);
  return (
    <div
      style={{
        background:   "#fff",
        border:       `1px solid ${BORDER}`,
        borderRadius: 12,
        boxShadow:    "0 1px 4px rgba(15,23,42,0.06)",
        display:      "flex",
        flexDirection: "column",
        overflow:     "hidden",
      }}
    >
      {/* Accent bar */}
      <div style={{ height: 4, background: accent, borderRadius: "12px 12px 0 0" }} />

      {/* Body */}
      <div style={{ padding: "20px 22px", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span
            style={{
              fontSize:      13,
              fontWeight:    700,
              letterSpacing: "0.07em",
              color:         T2,
              textTransform: "uppercase",
            }}
          >
            {title}
          </span>
          {score != null && (
            <span
              style={{
                fontSize:     14,
                fontWeight:   800,
                fontFamily:   "JetBrains Mono, monospace",
                color:        theme.text,
                background:   theme.bg,
                border:       `1px solid ${theme.border}`,
                borderRadius: 6,
                padding:      "3px 11px",
              }}
            >
              {score}/5
            </span>
          )}
        </div>

        {/* Main content */}
        <div style={{ flex: 1 }}>{children}</div>
      </div>

      {/* Footer */}
      <div
        style={{
          background:    "#F8FAFC",
          borderTop:     `1px solid ${BORDER}`,
          padding:       "14px 22px",
        }}
      >
        <div
          style={{
            fontSize:      11,
            fontWeight:    700,
            letterSpacing: "0.08em",
            color:         T3,
            textTransform: "uppercase",
            marginBottom:  8,
          }}
        >
          Score scale
        </div>
        <ScoreLegend items={legend} current={score} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL CARDS
// ─────────────────────────────────────────────────────────────────────────────

function ValuationCard({ result }: { result: ValuationResult }) {
  const label = result.field === "peFwd" ? "P/E Fwd" : "EV/EBITDA Fwd";
  const isDiscount = (result.weightedDiscount ?? 0) < 0;

  return (
    <CardShell
      title="Historical Valuation"
      score={result.score}
      accent="#2563EB"
      legend={[
        { score: 5, label: "< −15% — Deep discount" },
        { score: 4, label: "−15% to −5% — Discount" },
        { score: 3, label: "−5% to +5% — Fair value" },
        { score: 2, label: "+5% to +15% — Premium" },
        { score: 1, label: "> +15% — Rich premium" },
      ]}
    >
      {result.weightedDiscount != null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Big number */}
          <div>
            <div
              style={{
                fontSize:   48,
                fontWeight: 800,
                fontFamily: "JetBrains Mono, monospace",
                color:      isDiscount ? GREEN : RED,
                letterSpacing: "-0.04em",
                lineHeight: 1,
              }}
            >
              {fmtPct(result.weightedDiscount)}
            </div>
            <div style={{ fontSize: 12, color: T3, marginTop: 4 }}>Weighted discount vs median ({label})</div>
          </div>

          {/* Breakdown */}
          <div
            style={{
              background:   "#F8FAFC",
              borderRadius: 8,
              border:       `1px solid ${BORDER}`,
              padding:      "10px 14px",
              display:      "flex",
              gap:          16,
            }}
          >
            {[
              { label: "10Y", v: result.discount10y },
              { label: "5Y",  v: result.discount5y  },
              { label: "1Y",  v: result.discount1y  },
            ].map(({ label: l, v }) => (
              <div key={l} style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 11, color: T3, marginBottom: 3 }}>{l}</div>
                <div
                  style={{
                    fontSize:   14,
                    fontWeight: 700,
                    fontFamily: "JetBrains Mono, monospace",
                    color:      v == null ? T3 : v < 0 ? GREEN : RED,
                  }}
                >
                  {v != null ? fmtPct(v, 1) : "—"}
                </div>
              </div>
            ))}
          </div>

          {/* Current multiple */}
          <div style={{ fontSize: 13, color: T2 }}>
            Current:{" "}
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: T1 }}>
              {result.currentVal?.toFixed(1)}x
            </span>
          </div>
        </div>
      ) : (
        <div style={{ color: T3, fontSize: 13, textAlign: "center", paddingTop: 20 }}>No data</div>
      )}
    </CardShell>
  );
}

function QuantCard({
  side,
  score,
  rank,
  entryReturn,
}: {
  side: string | null;
  score: number | null;
  rank: number | null;
  entryReturn: number | null;
}) {
  const sideColor =
    side === "LONG"  ? GREEN :
    side === "SHORT" ? RED   : T2;
  const sideBg =
    side === "LONG"  ? "rgba(5,150,105,0.10)"  :
    side === "SHORT" ? "rgba(220,38,38,0.10)"   :
    side === "NEUTRAL" ? "rgba(100,116,139,0.10)" : "rgba(148,163,184,0.08)";

  return (
    <CardShell
      title="Quant Momentum"
      score={score}
      accent="#2563EB"
      legend={[
        { score: 5, label: "LONG — positive signal" },
        { score: 3, label: "NEUTRAL — no signal" },
        { score: 1, label: "SHORT — negative signal" },
      ]}
    >
      {side ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Side badge */}
          <div>
            <div
              style={{
                display:      "inline-flex",
                alignItems:   "center",
                gap:          6,
                background:   sideBg,
                border:       `1.5px solid ${sideColor}40`,
                borderRadius: 10,
                padding:      "10px 22px",
              }}
            >
              <span
                style={{
                  fontSize:   42,
                  fontWeight: 900,
                  fontFamily: "JetBrains Mono, monospace",
                  color:      sideColor,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {side}
              </span>
            </div>
            <div style={{ fontSize: 12, color: T3, marginTop: 6 }}>Model signal</div>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 16 }}>
            {rank != null && (
              <div>
                <div style={{ fontSize: 12, color: T3, marginBottom: 3 }}>Rank</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: T1 }}>
                  #{rank}
                </div>
              </div>
            )}
            {entryReturn != null && (
              <div>
                <div style={{ fontSize: 12, color: T3, marginBottom: 3 }}>Since entry</div>
                <div
                  style={{
                    fontSize:   18,
                    fontWeight: 700,
                    fontFamily: "JetBrains Mono, monospace",
                    color:
                      side === "LONG"  ? (entryReturn >= 0 ? GREEN : RED) :
                      side === "SHORT" ? (entryReturn <= 0 ? GREEN : RED) : T2,
                  }}
                >
                  {entryReturn >= 0 ? "+" : ""}{entryReturn.toFixed(1)}%
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ color: T3, fontSize: 13, textAlign: "center", paddingTop: 20 }}>
          Not in model universe
        </div>
      )}
    </CardShell>
  );
}

function AnalystCard({
  analystRec,
  result,
  currentPrice,
}: {
  analystRec: DeepDivePayload["analystRec"];
  result: { score: number | null; buyPct: number | null };
  currentPrice: number | null;
}) {
  const upside =
    analystRec?.targetPrice != null && currentPrice != null && currentPrice > 0
      ? ((analystRec.targetPrice - currentPrice) / currentPrice) * 100
      : null;

  return (
    <CardShell
      title="Sell Side"
      score={result.score}
      accent="#2563EB"
      legend={[
        { score: 5, label: "> 80% Buy" },
        { score: 4, label: "60–80% Buy" },
        { score: 3, label: "40–60% Buy" },
        { score: 2, label: "20–40% Buy" },
        { score: 1, label: "< 20% Buy" },
      ]}
    >
      {analystRec ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Buy % big number */}
          <div>
            <div
              style={{
                fontSize:   48,
                fontWeight: 800,
                fontFamily: "JetBrains Mono, monospace",
                color:      result.buyPct != null && result.buyPct > 50 ? GREEN : RED,
                letterSpacing: "-0.04em",
                lineHeight: 1,
              }}
            >
              {result.buyPct != null ? result.buyPct.toFixed(0) + "%" : "—"}
            </div>
            <div style={{ fontSize: 12, color: T3, marginTop: 4 }}>
              Buy ({analystRec.buy} of {analystRec.totAnalysts} analysts)
            </div>
          </div>

          {/* Breakdown bar */}
          <div style={{ display: "flex", gap: 2, height: 7, borderRadius: 4, overflow: "hidden" }}>
            {analystRec.totAnalysts > 0 && (
              <>
                <div style={{ flex: analystRec.buy,  background: GREEN  }} />
                <div style={{ flex: analystRec.hold, background: AMBER  }} />
                <div style={{ flex: analystRec.sell, background: RED    }} />
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
            <span style={{ color: GREEN }}>{analystRec.buy} Buy</span>
            <span style={{ color: AMBER }}>{analystRec.hold} Hold</span>
            <span style={{ color: RED   }}>{analystRec.sell} Sell</span>
          </div>

          {/* Target / upside */}
          {analystRec.targetPrice != null && (
            <div style={{ fontSize: 13, color: T2 }}>
              Target:{" "}
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: T1 }}>
                {analystRec.targetPrice.toFixed(2)}
              </span>
              {upside != null && (
                <span
                  style={{
                    marginLeft: 8,
                    fontFamily: "JetBrains Mono, monospace",
                    fontWeight: 700,
                    color:      upside >= 0 ? GREEN : RED,
                  }}
                >
                  ({upside >= 0 ? "+" : ""}{upside.toFixed(1)}%)
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ color: T3, fontSize: 13, textAlign: "center", paddingTop: 20 }}>No data</div>
      )}
    </CardShell>
  );
}

const TREND_CONFIG: Record<
  TrendDir,
  { arrow: string; label: string; color: string; bg: string }
> = {
  up:          { arrow: "↑", label: "Upward",      color: GREEN,                      bg: "rgba(5,150,105,0.08)"    },
  down:        { arrow: "↓", label: "Downward",     color: RED,                        bg: "rgba(220,38,38,0.08)"    },
  mixed:       { arrow: "→", label: "Mixed",        color: T2,                         bg: "rgba(100,116,139,0.08)"  },
  insufficient:{ arrow: "?", label: "Insufficient", color: T3,                         bg: "rgba(148,163,184,0.08)"  },
};

function TrendBadge({ dir }: { dir: TrendDir | null }) {
  if (!dir) return <span style={{ color: T3, fontSize: 12 }}>—</span>;
  const cfg = TREND_CONFIG[dir];
  return (
    <span
      style={{
        display:      "inline-flex",
        alignItems:   "center",
        gap:          5,
        fontSize:     12,
        fontWeight:   700,
        fontFamily:   "JetBrains Mono, monospace",
        color:        cfg.color,
        background:   cfg.bg,
        border:       `1px solid ${cfg.color}25`,
        borderRadius: 5,
        padding:      "3px 10px",
      }}
    >
      <span style={{ fontSize: 14 }}>{cfg.arrow}</span>
      <span>{cfg.label}</span>
    </span>
  );
}

function EstimateCard({ result }: { result: EstimateResult }) {
  return (
    <CardShell
      title="Estimate Momentum"
      score={result.score}
      accent="#2563EB"
      legend={[
        { score: 5, label: "All 3 upward (3M trend)" },
        { score: 4, label: "2 of 3 upward" },
        { score: 3, label: "Mixed / neutral" },
        { score: 2, label: "2 of 3 downward" },
        { score: 1, label: "All 3 downward" },
      ]}
    >
      {result.year ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: T3 }}>
            3-month consensus trend — FY{result.year}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Revenue",    dir: result.revDir    },
              { label: "EBITDA",     dir: result.ebitdaDir },
              { label: "Net Income", dir: result.niDir     },
            ].map(({ label, dir }) => (
              <div
                key={label}
                style={{
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "space-between",
                  padding:        "8px 12px",
                  background:     "#F8FAFC",
                  borderRadius:   8,
                  border:         `1px solid ${BORDER}`,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: T2 }}>{label}</span>
                <TrendBadge dir={dir} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ color: T3, fontSize: 13, textAlign: "center", paddingTop: 20 }}>No data</div>
      )}
    </CardShell>
  );
}

function RangeCard({
  pr,
  result,
}: {
  pr: DeepDivePayload["priceRange52w"];
  result: { score: number | null; pct: number | null };
}) {
  const dotColor =
    result.pct == null ? T3 :
    result.pct < 20    ? GREEN :
    result.pct > 80    ? RED   : "#2563EB";

  return (
    <CardShell
      title="52-Week Range"
      score={result.score}
      accent="#2563EB"
      legend={[
        { score: 5, label: "< 20% of range (near low)" },
        { score: 4, label: "20–40% of range" },
        { score: 3, label: "40–60% of range" },
        { score: 2, label: "60–80% of range" },
        { score: 1, label: "> 80% of range (near high)" },
      ]}
    >
      {pr && result.pct != null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Big percentage */}
          <div>
            <div
              style={{
                fontSize:   48,
                fontWeight: 800,
                fontFamily: "JetBrains Mono, monospace",
                color:      dotColor,
                letterSpacing: "-0.04em",
                lineHeight: 1,
              }}
            >
              {result.pct.toFixed(0)}%
            </div>
            <div style={{ fontSize: 12, color: T3, marginTop: 4 }}>Position in 52-week range</div>
          </div>

          {/* Bar */}
          <div style={{ position: "relative", height: 8, borderRadius: 4, background: "rgba(15,23,42,0.08)" }}>
            <div
              style={{
                position:     "absolute",
                left:         `calc(${Math.min(100, result.pct)}% - 7px)`,
                top:          -4,
                width:        16,
                height:       16,
                borderRadius: "50%",
                background:   dotColor,
                border:       "2px solid #fff",
                boxShadow:    `0 1px 6px ${dotColor}60`,
              }}
            />
          </div>

          {/* Low / High */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: RED,   fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>
              {pr.low52w.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span style={{ color: T3 }}>52w range</span>
            <span style={{ color: GREEN, fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>
              {pr.high52w.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      ) : (
        <div style={{ color: T3, fontSize: 13, textAlign: "center", paddingTop: 20 }}>No data</div>
      )}
    </CardShell>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  deepDive: DeepDivePayload;
  latestPrice: number | null;
  onViewDetail: () => void;
}

export default function ScorecardGrid({ deepDive, latestPrice, onViewDetail }: Props) {
  // Fetch latest quant signal for this ticker
  const [quantData, setQuantData] = useState<TickerHistoryPayload | null>(null);

  useEffect(() => {
    if (!deepDive.ticker) return;
    fetch(`/api/quant/ticker-history?ticker=${encodeURIComponent(deepDive.ticker)}`)
      .then((r) => r.json())
      .then((d: TickerHistoryPayload) => {
        if (d.history?.length) setQuantData(d);
        else setQuantData(null);
      })
      .catch(() => setQuantData(null));
  }, [deepDive.ticker]);

  // ── Compute all scores ───────────────────────────────────────────────────
  const valResult  = useMemo(() => computeValuationScore(deepDive.valuationHistory),    [deepDive]);
  const analResult = useMemo(() => computeAnalystScore(deepDive.analystRec),             [deepDive]);
  const estResult  = useMemo(() => computeEstimateScore(deepDive.consensusEstimates),    [deepDive]);
  const rangeResult = useMemo(() => computeRangeScore(deepDive.priceRange52w),           [deepDive]);

  const latestSignal = quantData?.history.at(-1) ?? null;
  const qSide       = latestSignal?.side ?? null;
  const qRank       = latestSignal?.rank ?? null;
  const qScore      = quantScore(qSide);

  // Entry return: compare latest price vs signal entry price
  const qEntryReturn =
    latestSignal?.pxSignal != null && latestPrice != null && latestSignal.pxSignal > 0
      ? ((latestPrice / latestSignal.pxSignal) - 1) * 100
      : null;

  const master = useMemo(
    () => masterScore([valResult.score, qScore, analResult.score, estResult.score, rangeResult.score]),
    [valResult.score, qScore, analResult.score, estResult.score, rangeResult.score],
  );

  const masterTheme = scoreTheme(master);

  const masterLabel =
    master == null ? "N/A" :
    master >= 4    ? "BULLISH" :
    master >= 2.5  ? "NEUTRAL" : "BEARISH";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Master Header ───────────────────────────────────────────────────── */}
      <div
        style={{
          background:   "#fff",
          border:       `1px solid ${BORDER}`,
          borderRadius: 14,
          padding:      "20px 24px",
          boxShadow:    "0 1px 4px rgba(15,23,42,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>

          {/* Big score circle */}
          <div
            style={{
              width:          96,
              height:         96,
              borderRadius:   "50%",
              background:     masterTheme.bg,
              border:         `3px solid ${masterTheme.border}`,
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
              justifyContent: "center",
              flexShrink:     0,
            }}
          >
            <span
              style={{
                fontSize:   30,
                fontWeight: 900,
                fontFamily: "JetBrains Mono, monospace",
                color:      masterTheme.text,
                lineHeight: 1,
              }}
            >
              {master != null ? master.toFixed(1) : "—"}
            </span>
            <span style={{ fontSize: 11, color: T3, marginTop: 3 }}>/ 5.0</span>
          </div>

          {/* Label + pills */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: T3, textTransform: "uppercase" }}>
              Investment Scorecard
            </div>
            <span
              style={{
                fontSize:      20,
                fontWeight:    800,
                color:         masterTheme.text,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontFamily:    "JetBrains Mono, monospace",
              }}
            >
              {masterLabel}
            </span>
            <span style={{ fontSize: 12, color: T3 }}>
              Based on {[valResult.score, qScore, analResult.score, estResult.score, rangeResult.score].filter((s) => s != null).length} of 5 factors
            </span>

            {/* Mini score pills */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
              {[
                { label: "Valuation",  score: valResult.score  },
                { label: "Quantitative",  score: qScore           },
                { label: "Sell Side",  score: analResult.score },
                { label: "Estimates",  score: estResult.score  },
                { label: "52 Week",  score: rangeResult.score },
              ].map(({ label, score: s }) => {
                const t = scoreTheme(s);
                return (
                  <span
                    key={label}
                    style={{
                      fontSize:     12,
                      fontWeight:   700,
                      fontFamily:   "JetBrains Mono, monospace",
                      color:        t.text,
                      background:   t.bg,
                      border:       `1px solid ${t.border}`,
                      borderRadius: 5,
                      padding:      "2px 9px",
                      whiteSpace:   "nowrap",
                    }}
                  >
                    {label} {s ?? "—"}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── 5-Column Card Grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 w-full">
        <ValuationCard result={valResult} />
        <QuantCard side={qSide} score={qScore} rank={qRank} entryReturn={qEntryReturn} />
        <AnalystCard analystRec={deepDive.analystRec} result={analResult} currentPrice={latestPrice} />
        <EstimateCard result={estResult} />
        <RangeCard pr={deepDive.priceRange52w} result={rangeResult} />
      </div>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button
          onClick={onViewDetail}
          style={{
            display:      "inline-flex",
            alignItems:   "center",
            gap:          8,
            background:   "linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)",
            color:        "#fff",
            border:       "none",
            borderRadius: 10,
            padding:      "11px 28px",
            fontSize:     13,
            fontWeight:   700,
            fontFamily:   "Inter, sans-serif",
            cursor:       "pointer",
            letterSpacing: "0.02em",
            boxShadow:    "0 2px 12px rgba(37,99,235,0.30)",
          }}
        >
          View Full Analysis
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
