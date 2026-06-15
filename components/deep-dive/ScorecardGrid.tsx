"use client";

import { useMemo, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DeepDivePayload } from "@/app/api/companies/[ticker]/route";
import type { TickerSignalPayload, TickerSignalData, TickerMomentumData } from "@/app/api/quant/ticker-signal/route";

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

// Momentum score is a 0–100 rank-percentile where HIGHER is better. Map to 1–5.
function pctScoreTo5(v: number | null): number | null {
  if (v == null) return null;
  if (v >= 80) return 5;
  if (v >= 60) return 4;
  if (v >= 40) return 3;
  if (v >= 20) return 2;
  return 1;
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
  onClick?: () => void;
}

function CardShell({ title, score, children, accent = "#2563EB", onClick }: CardShellProps) {
  const theme = scoreTheme(score);
  const clickable = onClick != null;
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick!(); } } : undefined}
      onMouseEnter={clickable ? (e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = `0 6px 20px ${accent}26`;
        el.style.transform = "translateY(-2px)";
        el.style.borderColor = `${accent}55`;
      } : undefined}
      onMouseLeave={clickable ? (e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = "0 1px 4px rgba(15,23,42,0.06)";
        el.style.transform = "translateY(0)";
        el.style.borderColor = BORDER;
      } : undefined}
      style={{
        background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12,
        boxShadow: "0 1px 4px rgba(15,23,42,0.06)", display: "flex",
        flexDirection: "column", overflow: "hidden",
        cursor: clickable ? "pointer" : "default",
        transition: "box-shadow 0.16s, transform 0.16s, border-color 0.16s",
        outline: "none",
      }}
    >
      <div style={{ height: 4, background: accent, borderRadius: "12px 12px 0 0" }} />
      <div style={{ padding: "20px 22px", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.07em", color: T2, textTransform: "uppercase" }}>
            {title}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {score != null && (
              <span style={{
                fontSize: 14, fontWeight: 800, fontFamily: "JetBrains Mono, monospace",
                color: theme.text, background: theme.bg, border: `1px solid ${theme.border}`,
                borderRadius: 6, padding: "3px 11px",
              }}>
                {score}/5
              </span>
            )}
            {clickable && (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ color: accent, opacity: 0.7 }}>
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
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

function ValueCard({ data, onClick }: { data: TickerSignalData | null; onClick?: () => void }) {
  const score = factorTo5(data?.value ?? null);
  return (
    <CardShell title="Value Factor" score={score} accent="#0891B2" onClick={onClick}>
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

function QualityCard({ data, onClick }: { data: TickerSignalData | null; onClick?: () => void }) {
  const score = factorTo5(data?.quality ?? null);

  function fmtPctRaw(v: number | null): string {
    if (v == null) return "—";
    const pct = Math.abs(v) > 1 ? v : v * 100;
    return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
  }

  return (
    <CardShell title="Quality Factor" score={score} accent="#7C3AED" onClick={onClick}>
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

// z-score → visual emphasis (matches the Momentum Ranking table)
function momZTheme(z: number | null): { text: string; bg: string; border: string; label: string | null } {
  if (z == null) return { text: T3, bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.22)", label: null };
  if (z >= 3)   return { text: "#fff",    bg: RED,                       border: RED,                       label: "EXTREME" };
  if (z >= 2)   return { text: "#B45309", bg: "rgba(217,119,6,0.14)",   border: "rgba(217,119,6,0.45)",   label: "OUTLIER" };
  if (z >= 1)   return { text: "#0F766E", bg: "rgba(13,148,136,0.12)",  border: "rgba(13,148,136,0.32)",  label: null };
  if (z <= -1)  return { text: T2,        bg: "rgba(100,116,139,0.10)", border: "rgba(100,116,139,0.24)", label: null };
  return          { text: T2,             bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.18)", label: null };
}

function PricingMomentumCard({ data, onClick }: { data: TickerMomentumData | null; onClick?: () => void }) {
  const score  = pctScoreTo5(data?.score ?? null);
  const pct    = data?.score != null ? Math.max(0, Math.min(100, data.score)) : null;
  const col    = pct == null ? T3 : pct > 70 ? "#0F766E" : pct > 40 ? "#0D9488" : "#5EEAD4";
  const zt     = momZTheme(data?.zscore ?? null);

  return (
    <CardShell title="Pricing Momentum" score={score} accent="#0D9488" onClick={onClick}>
      {data ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Big score number — same % format as the other factor gauges */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{
              fontSize: 52, fontWeight: 900, fontFamily: "JetBrains Mono, monospace",
              color: col, letterSpacing: "-0.04em", lineHeight: 1,
            }}>
              {pct != null ? Math.round(pct) + "%" : "—"}
            </div>
            {pct != null && (
              <div style={{ height: 6, borderRadius: 3, background: "rgba(15,23,42,0.07)", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 3, transition: "width 0.4s" }} />
              </div>
            )}
            <div style={{ fontSize: 12, color: T3 }}>Momentum percentile vs. LatAm universe</div>
          </div>

          {/* Z-score — flagged when the move is disproportionate */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            background: zt.bg, border: `1px solid ${zt.border}`, borderRadius: 8, padding: "9px 12px",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: T3, textTransform: "uppercase" }}>
                Z-Score
              </span>
              <span style={{ fontSize: 10.5, color: T3 }}>
                σ vs. universe average
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {zt.label && (
                <span style={{
                  fontSize: 8.5, fontWeight: 800, letterSpacing: "0.06em",
                  color: zt.text === "#fff" ? "#fff" : zt.text,
                  background: zt.text === "#fff" ? RED : "transparent",
                  border: `1px solid ${zt.text === "#fff" ? RED : zt.border}`,
                  borderRadius: 4, padding: "1px 6px",
                }}>
                  {zt.label}
                </span>
              )}
              <span style={{
                fontSize: 18, fontWeight: 800, fontFamily: "JetBrains Mono, monospace",
                color: zt.text === "#fff" ? RED : zt.text,
              }}>
                {data.zscore != null ? (data.zscore >= 0 ? "+" : "") + data.zscore.toFixed(2) + "σ" : "—"}
              </span>
            </div>
          </div>

          {/* Raw inputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: T3, textTransform: "uppercase", marginBottom: 5 }}>
              Raw inputs
            </div>
            {[
              { label: "Momentum return", val: data.signal != null ? (data.signal >= 0 ? "+" : "") + data.signal.toFixed(1) + "%" : "—", green: data.signal != null && data.signal >= 0 },
              { label: "Universe rank",   val: data.rank != null ? "#" + data.rank : "—", green: false },
            ].map(({ label, val, green }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 11, color: T3 }}>{label}</span>
                <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: green ? GREEN : T1 }}>{val}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: T3 }}>
            14.5-month trailing total return (skip 3 weeks)
          </div>
        </div>
      ) : (
        <div style={{ color: T3, fontSize: 13, textAlign: "center", paddingTop: 20 }}>Not in momentum universe</div>
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
  const router = useRouter();
  const [signalData, setSignalData] = useState<TickerSignalPayload | null>(null);

  useEffect(() => {
    if (!deepDive.ticker) return;
    fetch(`/api/quant/ticker-signal?ticker=${encodeURIComponent(deepDive.ticker)}`)
      .then((r) => r.json())
      .then((d: TickerSignalPayload) => setSignalData(d))
      .catch(() => setSignalData(null));
  }, [deepDive.ticker]);

  const qData = signalData?.data ?? null;
  const mData = signalData?.momentum ?? null;

  const valueRating   = useMemo(() => factorTo5(qData?.value   ?? null), [qData]);
  const qualityRating = useMemo(() => factorTo5(qData?.quality ?? null), [qData]);
  const pricingRating = useMemo(() => pctScoreTo5(mData?.score ?? null), [mData]);

  const factors = [valueRating, qualityRating, pricingRating];

  const master      = useMemo(() => masterScore(factors), [valueRating, qualityRating, pricingRating]);
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
        <ValueCard   data={qData} onClick={() => router.push("/quant-analysis?view=model")} />
        <QualityCard data={qData} onClick={() => router.push("/quant-analysis?view=model")} />
        <PricingMomentumCard data={mData} onClick={() => router.push("/quant-analysis?view=momentum")} />
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
