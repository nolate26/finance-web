"use client";

import type { PriceRange52wSnap, ShortInterestSnap } from "@/app/api/companies/[ticker]/route";

interface Props {
  priceRange: PriceRange52wSnap | null;
  shortInterest: ShortInterestSnap | null;
}

function fmtPrice(v: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function KPICards({ priceRange, shortInterest }: Props) {
  const CARD: React.CSSProperties = {
    background: "#F8FAFF",
    border: "1px solid rgba(15,23,42,0.08)",
    borderRadius: 10,
    padding: "14px 16px",
    marginBottom: 12,
  };
  const LABEL: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "#94A3B8",
    textTransform: "uppercase",
    marginBottom: 12,
  };

  // 52-week range bar
  const range52 = priceRange
    ? (() => {
        const { pxLast, high52w, low52w } = priceRange;
        const span = high52w - low52w;
        const pct = span > 0 ? ((pxLast - low52w) / span) * 100 : 50;
        return { pct: Math.max(0, Math.min(100, pct)) };
      })()
    : null;

  return (
    <div>
      {/* 52-week range card */}
      <div style={CARD}>
        <div style={LABEL}>52-Week Range</div>
        {priceRange && range52 ? (
          <>
            {/* Range bar */}
            <div style={{ position: "relative", height: 6, borderRadius: 4, background: "rgba(15,23,42,0.08)", marginBottom: 10 }}>
              <div
                style={{
                  position: "absolute",
                  left: `calc(${range52.pct}% - 6px)`,
                  top: -3,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: "#2B5CE0",
                  border: "2px solid #fff",
                  boxShadow: "0 1px 4px rgba(43,92,224,0.35)",
                }}
              />
              {/* Low-to-high fill */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: `${range52.pct}%`,
                  height: "100%",
                  borderRadius: 4,
                  background: "linear-gradient(90deg, #059669, #2B5CE0)",
                  opacity: 0.4,
                }}
              />
            </div>

            {/* Min / Current / Max */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 9, color: "#94A3B8", marginBottom: 2 }}>52w Low</div>
                <div style={{ fontSize: 12, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: "#DC2626" }}>
                  {fmtPrice(priceRange.low52w)}
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "#94A3B8", marginBottom: 2 }}>Current</div>
                <div style={{ fontSize: 16, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "#0F172A" }}>
                  {fmtPrice(priceRange.pxLast)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, color: "#94A3B8", marginBottom: 2 }}>52w High</div>
                <div style={{ fontSize: 12, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: "#059669" }}>
                  {fmtPrice(priceRange.high52w)}
                </div>
              </div>
            </div>

            {/* Range pct */}
            {priceRange.pctRange !== null && (
              <div style={{ marginTop: 10, fontSize: 11, color: "#64748B", textAlign: "center" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace" }}>
                  {range52.pct.toFixed(0)}%
                </span>
                <span style={{ marginLeft: 4, fontSize: 10 }}>of 52w range</span>
              </div>
            )}
          </>
        ) : (
          <div style={{ color: "#CBD5E1", fontSize: 12, textAlign: "center" }}>No data</div>
        )}
      </div>

      {/* Short interest card */}
      <div style={CARD}>
        <div style={LABEL}>Short Interest</div>
        {shortInterest ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 28, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "#DC2626" }}>
              {shortInterest.shortIntRatio.toFixed(1)}
            </span>
            <span style={{ fontSize: 12, color: "#94A3B8" }}>days to cover</span>
          </div>
        ) : (
          <div style={{ color: "#CBD5E1", fontSize: 12, textAlign: "center" }}>No data</div>
        )}
        <div style={{ marginTop: 6, fontSize: 10, color: "#94A3B8" }}>
          Short Interest Ratio (SIR) — shares sold short / avg daily volume
        </div>
      </div>
    </div>
  );
}
