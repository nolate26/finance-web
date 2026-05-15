"use client";

import { useMemo, useEffect, useState } from "react";
import type { DeepDivePayload, ConsensusPoint } from "@/app/api/companies/[ticker]/route";
import type { TickerSignalPayload, TickerSignalData } from "@/app/api/quant/ticker-signal/route";

// ─────────────────────────────────────────────────────────────────────────────
// SCORING FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

// Normalize to 0–1 (handles both 0-1 and 0-100 storage)
function norm(v: number | null): number | null {
  if (v == null) return null;
  return v > 1 ? v / 100 : v;
}

// Convert any normalized factor (0–1) to a 1–5 score
function factorTo5(v: number | null): number | null {
  const n = norm(v);
  if (n == null) return null;
  if (n > 0.80) return 5;
  if (n > 0.60) return 4;
  if (n > 0.40) return 3;
  if (n > 0.20) return 2;
  return 1;
}

// If top20 is true, override to 5 for the overall Score card
function scoreCardRating(data: TickerSignalData | null): number | null {
  if (!data) return null;
  if (data.top20) return 5;
  return factorTo5(data.score);
}

type TrendDir = "up" | "down" | "mixed" | "insufficient";

function trendDir(data: ConsensusPoint[], aliases: string[], year: string): TrendDir {
  const pts = data
    .filter((r) => aliases.includes(r.metric.toUpperCase()) && String(r.period).trim() === year)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 4) return "insufficient";
  const tail = pts.slice(-4);
  const chg  = [tail[1].value - tail[0].value, tail[2].value - tail[1].value, tail[3].value - tail[2].value];
  if (chg.every((c) => c > 0)) return "up";
  if (chg.every((c) => c < 0)) return "down";
  return "mixed";
}

interface EstimateResult {
  score:     number | null;
  revDir:    TrendDir | null;
  ebitdaDir: TrendDir | null;
  niDir:     TrendDir | null;
  year:      string | null;
}

function computeEstimateScore(estimates: ConsensusPoint[]): EstimateResult {
  const years = [...new Set(
    estimates.map((r) => String(r.period).trim()).filter((y) => !isNaN(Number(y)))
  )].sort();
  const year = years[0] ?? null;
  if (!year) return { score: null, revDir: null, ebitdaDir: null, niDir: null, year: null };

  const revDir    = trendDir(estimates, ["REVENUE", "SALES"], year);
  const ebitdaDir = trendDir(estimates, ["EBITDA"],            year);
  const niDir     = trendDir(estimates, ["NET_INCOME"],        year);

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

function masterScore(scores: (number | null)[]): number | null {
  const valid = scores.filter((s): s is number => s != null);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const T1    = "#0F172A";
const T2    = "#64748B";
const T3    = "#94A3B8";
const BORDER = "rgba(15,23,42,0.08)";
const GREEN  = "#059669";
const RED    = "#DC2626";
const AMBER  = "#D97706";

function scoreTheme(s: number | null): { text: string; bg: string; border: string } {
  if (s == null) return { text: T3,   bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.22)" };
  if (s >= 4)    return { text: GREEN, bg: "rgba(5,150,105,0.10)",  border: "rgba(5,150,105,0.28)"   };
  if (s >= 2.5)  return { text: AMBER, bg: "rgba(217,119,6,0.10)",  border: "rgba(217,119,6,0.28)"   };
  return          { text: RED,   bg: "rgba(220,38,38,0.10)",  border: "rgba(220,38,38,0.28)"   };
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function ScoreLegend({ items, current }: { items: { score: number; label: string }[]; current: number | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {items.map(({ score, label }) => {
        const isActive = current === score;
        const theme    = scoreTheme(score);
        return (
          <div key={score} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "3px 6px",
            borderRadius: 5,
            background: isActive ? theme.bg    : "transparent",
            border:     isActive ? `1px solid ${theme.border}` : "1px solid transparent",
          }}>
            <span style={{ fontSize: 12, fontWeight: isActive ? 800 : 500, fontFamily: "JetBrains Mono, monospace", color: isActive ? theme.text : T3, minWidth: 12 }}>
              {score}
            </span>
            <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 400, color: isActive ? theme.text : T3 }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface CardShellProps {
  title:    string;
  score:    number | null;
  children: React.ReactNode;
  legend:   { score: number; label: string }[];
  accent?:  string;
}

function CardShell({ title, score, children, legend, accent = "#2563EB" }: CardShellProps) {
  const theme = scoreTheme(score);
  return (
    <div style={{
      background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12,
      boxShadow: "0 1px 4px rgba(15,23,42,0.06)", display: "flex",
      flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ height: 4, background: accent, borderRadius: "12px 12px 0 0" }} />
      <div style={{ padding: "20px 22px", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.07em", color: T2, textTransform: "uppercase" }}>
            {title}
          </span>
          {score != null && (
            <span style={{
              fontSize: 14, fontWeight: 800, fontFamily: "JetBrains Mono, monospace",
              color: theme.text, background: theme.bg, border: `1px solid ${theme.border}`,
              borderRadius: 6, padding: "3px 11px",
            }}>
              {score}/5
            </span>
          )}
        </div>
        <div style={{ flex: 1 }}>{children}</div>
      </div>
      <div style={{ background: "#F8FAFC", borderTop: `1px solid ${BORDER}`, padding: "14px 22px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: T3, textTransform: "uppercase", marginBottom: 8 }}>
          Score scale
        </div>
        <ScoreLegend items={legend} current={score} />
      </div>
    </div>
  );
}

const FACTOR_LEGEND = [
  { score: 5, label: "> 80th pct — Excellent" },
  { score: 4, label: "60–80th pct — Good"     },
  { score: 3, label: "40–60th pct — Average"  },
  { score: 2, label: "20–40th pct — Below avg"},
  { score: 1, label: "< 20th pct — Weak"      },
];

// ─────────────────────────────────────────────────────────────────────────────
// FACTOR BAR — shared visual
// ─────────────────────────────────────────────────────────────────────────────

function FactorGauge({ value }: { value: number | null }) {
  const n    = norm(value);
  const pct  = n != null ? Math.max(0, Math.min(100, n * 100)) : null;
  const col  = pct == null ? T3 : pct > 70 ? "#1E40AF" : pct > 40 ? "#3B82F6" : "#93C5FD";
  const disp = value != null ? (value > 1 ? value.toFixed(1) : (value * 100).toFixed(1)) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Big number */}
      <div style={{
        fontSize: 52, fontWeight: 900, fontFamily: "JetBrains Mono, monospace",
        color: col, letterSpacing: "-0.04em", lineHeight: 1,
      }}>
        {disp != null ? disp + "%" : "—"}
      </div>

      {/* Progress bar */}
      {pct != null && (
        <div style={{ height: 6, borderRadius: 3, background: "rgba(15,23,42,0.07)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 3, transition: "width 0.4s" }} />
        </div>
      )}

      {/* Universe label */}
      <div style={{ fontSize: 12, color: T3 }}>Percentile vs. LatAm universe</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL FACTOR CARDS
// ─────────────────────────────────────────────────────────────────────────────

function ScoreCard({ data }: { data: TickerSignalData | null }) {
  const score = scoreCardRating(data);
  return (
    <CardShell title="Quant Score" score={score} accent="#2B5CE0" legend={FACTOR_LEGEND}>
      {data ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <FactorGauge value={data.score} />

          {/* Portfolio badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 14px", borderRadius: 7,
            background: data.top20 ? "rgba(5,150,105,0.09)"   : "rgba(15,23,42,0.04)",
            border:     `1.5px solid ${data.top20 ? "rgba(5,150,105,0.28)" : BORDER}`,
            alignSelf:  "flex-start",
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%",
              background:  data.top20 ? GREEN : T3,
              boxShadow:   data.top20 ? `0 0 5px ${GREEN}` : "none",
            }} />
            <span style={{
              fontSize: 12, fontWeight: 800, fontFamily: "JetBrains Mono, monospace",
              color: data.top20 ? GREEN : T3, letterSpacing: "0.04em",
            }}>
              {data.top20 ? "IN PORTFOLIO" : "NOT SELECTED"}
            </span>
          </div>

          <div style={{ fontSize: 12, color: T3 }}>
            Total multifactor — average of Value &amp; Quality
          </div>
        </div>
      ) : (
        <div style={{ color: T3, fontSize: 13, textAlign: "center", paddingTop: 20 }}>Not in model universe</div>
      )}
    </CardShell>
  );
}

function ValueCard({ data }: { data: TickerSignalData | null }) {
  const score = factorTo5(data?.value ?? null);
  return (
    <CardShell title="Value Factor" score={score} accent="#0891B2" legend={FACTOR_LEGEND}>
      {data ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <FactorGauge value={data.value} />

          {/* PE + DY */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: T3, textTransform: "uppercase", marginBottom: 5 }}>
              Raw inputs
            </div>
            {[
              { label: "P/E",   val: data.pe != null  ? `${data.pe.toFixed(1)}x`  : "—" },
              { label: "DY",    val: data.dy != null  ? `${data.dy.toFixed(1)}%`  : "—" },
            ].map(({ label, val }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 11, color: T3 }}>{label}</span>
                <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: T1 }}>{val}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: T3 }}>
            How cheap is the stock vs. the universe
          </div>
        </div>
      ) : (
        <div style={{ color: T3, fontSize: 13, textAlign: "center", paddingTop: 20 }}>Not in model universe</div>
      )}
    </CardShell>
  );
}

function QualityCard({ data }: { data: TickerSignalData | null }) {
  const score = factorTo5(data?.quality ?? null);

  function fmtPctRaw(v: number | null): string {
    if (v == null) return "—";
    const pct = Math.abs(v) > 1 ? v : v * 100;
    return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
  }

  return (
    <CardShell title="Quality Factor" score={score} accent="#7C3AED" legend={FACTOR_LEGEND}>
      {data ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <FactorGauge value={data.quality} />

          {/* ROE + ΔROE */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: T3, textTransform: "uppercase", marginBottom: 5 }}>
              Raw inputs
            </div>
            {[
              { label: "ROE",   val: fmtPctRaw(data.roe),      colored: false },
              { label: "ΔROE",  val: fmtPctRaw(data.deltaRoe), colored: true, v: data.deltaRoe },
            ].map(({ label, val, colored, v }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 11, color: T3 }}>{label}</span>
                <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 600,
                  color: colored && v != null ? (v > 0 ? GREEN : v < 0 ? RED : T1) : T1 }}>
                  {val}
                </span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: T3 }}>
            Business efficiency &amp; return improvement
          </div>
        </div>
      ) : (
        <div style={{ color: T3, fontSize: 13, textAlign: "center", paddingTop: 20 }}>Not in model universe</div>
      )}
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTIMATE MOMENTUM CARD
// ─────────────────────────────────────────────────────────────────────────────

const TREND_CONFIG: Record<TrendDir, { arrow: string; label: string; color: string; bg: string }> = {
  up:           { arrow: "↑", label: "Upward",      color: GREEN, bg: "rgba(5,150,105,0.08)"   },
  down:         { arrow: "↓", label: "Downward",    color: RED,   bg: "rgba(220,38,38,0.08)"   },
  mixed:        { arrow: "→", label: "Mixed",       color: T2,    bg: "rgba(100,116,139,0.08)" },
  insufficient: { arrow: "?", label: "Insufficient",color: T3,    bg: "rgba(148,163,184,0.08)" },
};

function TrendBadge({ dir }: { dir: TrendDir | null }) {
  if (!dir) return <span style={{ color: T3, fontSize: 12 }}>—</span>;
  const cfg = TREND_CONFIG[dir];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12,
      fontWeight: 700, fontFamily: "JetBrains Mono, monospace",
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}25`,
      borderRadius: 5, padding: "3px 10px",
    }}>
      <span style={{ fontSize: 14 }}>{cfg.arrow}</span>
      <span>{cfg.label}</span>
    </span>
  );
}

function EstimateCard({ result }: { result: EstimateResult }) {
  return (
    <CardShell
      title="Estimate Momentum" score={result.score} accent="#2563EB"
      legend={[
        { score: 5, label: "All 3 upward (3M trend)" },
        { score: 4, label: "2 of 3 upward"           },
        { score: 3, label: "Mixed / neutral"          },
        { score: 2, label: "2 of 3 downward"          },
        { score: 1, label: "All 3 downward"           },
      ]}
    >
      {result.year ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: T3 }}>3-month consensus trend — FY{result.year}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Revenue",    dir: result.revDir    },
              { label: "EBITDA",     dir: result.ebitdaDir },
              { label: "Net Income", dir: result.niDir     },
            ].map(({ label, dir }) => (
              <div key={label} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", background: "#F8FAFC", borderRadius: 8, border: `1px solid ${BORDER}`,
              }}>
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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  deepDive:    DeepDivePayload;
  latestPrice: number | null;
  onViewDetail: () => void;
}

export default function ScorecardGrid({ deepDive, latestPrice: _latestPrice, onViewDetail }: Props) {
  const [signalData, setSignalData] = useState<TickerSignalPayload | null>(null);

  useEffect(() => {
    if (!deepDive.ticker) return;
    fetch(`/api/quant/ticker-signal?ticker=${encodeURIComponent(deepDive.ticker)}`)
      .then((r) => r.json())
      .then((d: TickerSignalPayload) => setSignalData(d))
      .catch(() => setSignalData(null));
  }, [deepDive.ticker]);

  const qData     = signalData?.data ?? null;
  const estResult = useMemo(() => computeEstimateScore(deepDive.consensusEstimates), [deepDive]);

  const scoreRating   = useMemo(() => scoreCardRating(qData),              [qData]);
  const valueRating   = useMemo(() => factorTo5(qData?.value   ?? null),   [qData]);
  const qualityRating = useMemo(() => factorTo5(qData?.quality ?? null),   [qData]);

  const master      = useMemo(
    () => masterScore([scoreRating, valueRating, qualityRating, estResult.score]),
    [scoreRating, valueRating, qualityRating, estResult.score],
  );
  const masterTheme = scoreTheme(master);
  const masterLabel = master == null ? "N/A" : master >= 4 ? "BULLISH" : master >= 2.5 ? "NEUTRAL" : "BEARISH";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Master Header ─────────────────────────────────────────────────────── */}
      <div style={{
        background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14,
        padding: "20px 24px", boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>

          {/* Big score circle */}
          <div style={{
            width: 96, height: 96, borderRadius: "50%",
            background: masterTheme.bg, border: `3px solid ${masterTheme.border}`,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{ fontSize: 30, fontWeight: 900, fontFamily: "JetBrains Mono, monospace", color: masterTheme.text, lineHeight: 1 }}>
              {master != null ? master.toFixed(1) : "—"}
            </span>
            <span style={{ fontSize: 11, color: T3, marginTop: 3 }}>/ 5.0</span>
          </div>

          {/* Label + pills */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: T3, textTransform: "uppercase" }}>
              Investment Scorecard
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, color: masterTheme.text, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "JetBrains Mono, monospace" }}>
              {masterLabel}
            </span>
            <span style={{ fontSize: 12, color: T3 }}>
              Based on {[scoreRating, valueRating, qualityRating, estResult.score].filter((s) => s != null).length} of 4 factors
            </span>

            {/* Mini pills */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
              {[
                { label: "Score",    score: scoreRating   },
                { label: "Value",    score: valueRating   },
                { label: "Quality",  score: qualityRating },
                { label: "Estimates",score: estResult.score },
              ].map(({ label, score: s }) => {
                const t = scoreTheme(s);
                return (
                  <span key={label} style={{
                    fontSize: 12, fontWeight: 700, fontFamily: "JetBrains Mono, monospace",
                    color: t.text, background: t.bg, border: `1px solid ${t.border}`,
                    borderRadius: 5, padding: "2px 9px", whiteSpace: "nowrap",
                  }}>
                    {label} {s ?? "—"}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── 4-Card Grid ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 w-full">
        <ScoreCard   data={qData} />
        <ValueCard   data={qData} />
        <QualityCard data={qData} />
        <EstimateCard result={estResult} />
      </div>

      {/* ── CTA ───────────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button
          onClick={onViewDetail}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)",
            color: "#fff", border: "none", borderRadius: 10, padding: "11px 28px",
            fontSize: 13, fontWeight: 700, fontFamily: "Inter, sans-serif",
            cursor: "pointer", letterSpacing: "0.02em",
            boxShadow: "0 2px 12px rgba(37,99,235,0.30)",
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
