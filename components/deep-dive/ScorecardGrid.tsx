"use client";

import { useMemo, useEffect, useState } from "react";
import type { DeepDivePayload } from "@/app/api/companies/[ticker]/route";
import type { TickerSignalPayload, TickerSignalData } from "@/app/api/quant/ticker-signal/route";

// ─────────────────────────────────────────────────────────────────────────────
// SCORING FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

// Normalize to 0–1 (handles both 0-1 and 0-100 storage)
function norm(v: number | null): number | null {
  if (v == null) return null;
  return v > 1 ? v / 100 : v;
}

// Factor values are stored 0–1 where SMALLER is better. Convert to a 0–1
// "goodness" where higher = better (0 raw = best = 1.0).
function goodness(v: number | null): number | null {
  const n = norm(v);
  return n == null ? null : 1 - n;
}

// Goodness (0–1) → 1–5 score
function factorTo5(v: number | null): number | null {
  const g = goodness(v);
  if (g == null) return null;
  if (g > 0.80) return 5;
  if (g > 0.60) return 4;
  if (g > 0.40) return 3;
  if (g > 0.20) return 2;
  return 1;
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
// CARD SHELL (compact — no score-scale footer)
// ─────────────────────────────────────────────────────────────────────────────

interface CardShellProps {
  title:    string;
  score:    number | null;
  children: React.ReactNode;
  accent?:  string;
}

function CardShell({ title, score, children, accent = "#2563EB" }: CardShellProps) {
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTOR GAUGE — big inverted percentile (higher = better), integer
// ─────────────────────────────────────────────────────────────────────────────

function FactorGauge({ value }: { value: number | null }) {
  const g    = goodness(value);
  const pct  = g != null ? Math.max(0, Math.min(100, g * 100)) : null;
  const col  = pct == null ? T3 : pct > 70 ? "#1E40AF" : pct > 40 ? "#3B82F6" : "#93C5FD";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Big number */}
      <div style={{
        fontSize: 52, fontWeight: 900, fontFamily: "JetBrains Mono, monospace",
        color: col, letterSpacing: "-0.04em", lineHeight: 1,
      }}>
        {pct != null ? Math.round(pct) + "%" : "—"}
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

function ValueCard({ data }: { data: TickerSignalData | null }) {
  const score = factorTo5(data?.value ?? null);
  return (
    <CardShell title="Value Factor" score={score} accent="#0891B2">
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
    <CardShell title="Quality Factor" score={score} accent="#7C3AED">
      {data ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <FactorGauge value={data.quality} />

          {/* ROE + ΔROE */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: T3, textTransform: "uppercase", marginBottom: 5 }}>
              Raw inputs
            </div>
            {[
              { label: "ROE",   val: fmtPctRaw(data.roe),      colored: false, v: data.roe },
              { label: "ΔROE",  val: fmtPctRaw(data.deltaRoe), colored: true,  v: data.deltaRoe },
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

function PricingMomentumCard() {
  return (
    <CardShell title="Pricing Momentum" score={null} accent="#0D9488">
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 10, height: "100%", minHeight: 150, color: T3,
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.4 }}>
          <path d="M3 17l6-6 4 4 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M17 7h4v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em" }}>Coming soon</span>
      </div>
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

  const qData = signalData?.data ?? null;

  const valueRating   = useMemo(() => factorTo5(qData?.value   ?? null), [qData]);
  const qualityRating = useMemo(() => factorTo5(qData?.quality ?? null), [qData]);
  const pricingRating: number | null = null;   // Pricing Momentum — not implemented yet

  const factors = [valueRating, qualityRating, pricingRating];

  const master      = useMemo(() => masterScore(factors), [valueRating, qualityRating]);
  const masterTheme = scoreTheme(master);
  const masterLabel = master == null ? "N/A" : master >= 4 ? "BULLISH" : master >= 2.5 ? "NEUTRAL" : "BEARISH";
  const factorsUsed = factors.filter((s) => s != null).length;

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
              Based on {factorsUsed} of 3 factors
            </span>

            {/* Mini pills */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
              {[
                { label: "Value",            score: valueRating   },
                { label: "Quality",          score: qualityRating },
                { label: "Pricing Momentum", score: pricingRating },
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

      {/* ── 3-Card Grid ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full items-stretch">
        <ValueCard   data={qData} />
        <QualityCard data={qData} />
        <PricingMomentumCard />
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
