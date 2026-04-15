"use client";

import { useEffect, useState, useCallback } from "react";
import CompanySidebar from "@/components/deep-dive/CompanySidebar";
import ValuationChart from "@/components/deep-dive/ValuationChart";
import KPICards from "@/components/deep-dive/KPICards";
import ConsensusChart from "@/components/deep-dive/ConsensusChart";
import PriceEarningsChart from "@/components/deep-dive/PriceEarningsChart";
import AnalystDonut from "@/components/deep-dive/AnalystDonut";
import ConsensusMomentumCards from "@/components/deep-dive/ConsensusMomentumCards";
import RelatedReports from "@/components/deep-dive/RelatedReports";
import type { CompanyListItem } from "@/app/api/companies/list/route";
import type { DeepDivePayload, PortfolioWeightSnap } from "@/app/api/companies/[ticker]/route";

// ── Shared card style ─────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(15,23,42,0.08)",
  borderRadius: 12,
  padding: "18px 20px",
  boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
};

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.10em",
        color: "#64748B",
        textTransform: "uppercase",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ display: "inline-block", width: 3, height: 12, borderRadius: 2, background: "#2B5CE0" }} />
      {children}
    </div>
  );
}

// ── Loading spinner ────────────────────────────────────────────────────────────
function Spinner({ small }: { small?: boolean }) {
  const size = small ? 20 : 32;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid rgba(43,92,224,0.15)`,
        borderTopColor: "#2B5CE0",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}

// ── Empty / placeholder ───────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color: "#94A3B8",
      }}
    >
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="20" stroke="#E2E8F0" strokeWidth="2" />
        <path d="M16 24h16M24 16v16" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>
          Select a company
        </div>
        <div style={{ fontSize: 12, color: "#94A3B8" }}>
          Choose a ticker from the sidebar to explore its deep dive
        </div>
      </div>
    </div>
  );
}

// ── Active Weight Badge ───────────────────────────────────────────────────────

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  const pct = Number(v) * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
}

function owColor(v: number | null): { text: string; bg: string; border: string } {
  const n = v == null ? null : Number(v);
  if (n == null || n === 0) return { text: "#475569", bg: "rgba(100,116,139,0.10)", border: "rgba(100,116,139,0.22)" };
  return n > 0
    ? { text: "#15803D", bg: "rgba(22,163,74,0.10)",  border: "rgba(22,163,74,0.25)"  }
    : { text: "#B91C1C", bg: "rgba(220,38,38,0.10)",  border: "rgba(220,38,38,0.25)"  };
}

function ActiveWeightBadge({ weights }: { weights: PortfolioWeightSnap[] }) {
  if (weights.length === 0) return null;

  // Short display name: strip common suffixes for compact columns
  const shortName = (name: string) =>
    name.replace(/\s*(fund|fondo|equity|latam)\s*/gi, "").trim() || name;

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      gap:           6,
      fontFamily:    "JetBrains Mono, monospace",
      background:    "#F8FAFC",
      border:        "1px solid rgba(15,23,42,0.08)",
      borderRadius:  10,
      padding:       "10px 14px",
      minWidth:      0,
    }}>
      {/* Label */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", color: "#94A3B8", textTransform: "uppercase" }}>
        Portfolio Positioning
      </div>

      {/* Table */}
      <div style={{ display: "grid", gridTemplateColumns: `80px repeat(${weights.length}, 1fr)`, gap: "3px 10px", alignItems: "center" }}>

        {/* Header row — fund names */}
        <div style={{ fontSize: 9, color: "#94A3B8" }} />
        {weights.map((w) => (
          <div key={w.fundName} style={{ fontSize: 10, fontWeight: 700, color: "#64748B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "center" }}>
            {shortName(w.fundName)}
          </div>
        ))}

        {/* Benchmark weight row */}
        <div style={{ fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap" }}>Bmk Weight</div>
        {weights.map((w) => (
          <div key={w.fundName} style={{ fontSize: 10, color: "#475569", fontWeight: 600, textAlign: "center" }}>
            {fmtPct(w.benchmarkWeight)}
          </div>
        ))}

        {/* Active weight row */}
        <div style={{ fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap" }}>Active Wgt</div>
        {weights.map((w) => {
          const c = owColor(w.overweight);
          return (
            <div key={w.fundName} style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              fontSize:       10,
              fontWeight:     800,
              color:          c.text,
              background:     c.bg,
              border:         `1px solid ${c.border}`,
              borderRadius:   4,
              padding:        "2px 6px",
              whiteSpace:     "nowrap",
              textAlign:      "center",
            }}>
              {fmtPct(w.overweight)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const [selectedItem, setSelectedItem] = useState<CompanyListItem | null>(null);
  const [deepDive, setDeepDive] = useState<DeepDivePayload | null>(null);
  const [diveLoading, setDiveLoading] = useState(false);
  const [diveError, setDiveError] = useState<string | null>(null);

  // Fetch company list once, then auto-select CCU (or first company)
  useEffect(() => {
    fetch("/api/companies/list")
      .then((r) => r.json())
      .then((d: { companies?: CompanyListItem[] }) => {
        const list = d.companies ?? [];
        setCompanies(list);
        if (list.length > 0) {
          const defaultItem =
            list.find((c) => c.ticker === "CCU CI Equity") ?? list[0];
          handleSelect(defaultItem);
        }
      })
      .catch(() => setCompanies([]))
      .finally(() => setListLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // handleSelect is stable (useCallback with no deps) — intentionally omitted

  // Fetch deep dive when ticker changes
  const handleSelect = useCallback((item: CompanyListItem) => {
    setSelectedItem(item);
    setDiveLoading(true);
    setDiveError(null);
    setDeepDive(null);

    fetch(`/api/companies/${item.ticker}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: DeepDivePayload) => setDeepDive(d))
      .catch((e) => setDiveError(String(e)))
      .finally(() => setDiveLoading(false));
  }, []);

  // Derived values for analyst donut + header
  // Price and date come from priceRange52w — it holds the real market snapshot date
  const latestPriceRange = deepDive?.priceRange52w ?? null;
  const latestPrice      = latestPriceRange?.pxLast ?? deepDive?.priceVsEarnings.at(-1)?.pxLast ?? null;
  const latestPriceDate  = latestPriceRange?.date   ?? null;

  function fmtHeaderPrice(v: number): string {
    return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtHeaderDate(iso: string): string {
    const d = new Date(iso + "T12:00:00");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  return (
    <>
      {/* Spin keyframe — injected once */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ display: "flex", height: "calc(100vh - 64px)", overflow: "hidden" }}>
        {/* ── Sidebar ───────────────────────────────────────────────────────── */}
        <div style={{ width: 220, flexShrink: 0, overflow: "hidden" }}>
          <CompanySidebar
            companies={companies}
            selectedTicker={selectedItem?.ticker ?? null}
            onSelect={handleSelect}
            loading={listLoading}
          />
        </div>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 0 }}>

          {/* No selection */}
          {!selectedItem && !diveLoading && <EmptyState />}

          {/* Loading */}
          {diveLoading && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <Spinner />
                <span style={{ fontSize: 12, color: "#94A3B8", fontFamily: "JetBrains Mono, monospace" }}>
                  Loading {selectedItem?.ticker}...
                </span>
              </div>
            </div>
          )}

          {/* Error */}
          {diveError && (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  background: "rgba(220,38,38,0.06)",
                  border: "1px solid rgba(220,38,38,0.15)",
                  borderRadius: 10,
                  padding: "20px 28px",
                  textAlign: "center",
                }}
              >
                <div style={{ color: "#DC2626", fontSize: 13, marginBottom: 8 }}>
                  Failed to load data for {selectedItem?.ticker}
                </div>
                <div style={{ color: "#94A3B8", fontSize: 11 }}>{diveError}</div>
              </div>
            </div>
          )}

          {/* Dashboard — only when data is ready */}
          {deepDive && !diveLoading && (
            <>
              {/* ══ Company header ══════════════════════════════════════════════ */}
              <div style={{ marginBottom: 20 }}>

                {/* ── Band 1: Identifiers row ── */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  flexWrap: "wrap",
                  paddingBottom: 16,
                  marginBottom: 16,
                  borderBottom: "1px solid rgba(15,23,42,0.07)",
                }}>

                  {/* Ticker */}
                  <h1 style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: "#0F172A",
                    letterSpacing: "-0.03em",
                    fontFamily: "JetBrains Mono, monospace",
                    lineHeight: 1,
                    margin: 0,
                  }}>
                    {selectedItem.nombre}
                  </h1>

                  {/* Price chip */}
                  {latestPrice != null && (
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 9,
                      padding: "4px 12px 4px 9px",
                      boxShadow: "0 2px 10px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.05)",
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 6px #10B981", flexShrink: 0 }} />
                      <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "#F1F5F9", lineHeight: 1, letterSpacing: "-0.02em" }}>
                        {fmtHeaderPrice(latestPrice)}
                      </span>
                    </span>
                  )}

                  {/* "As of" badge */}
                  {latestPriceDate && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: "#64748B",
                      background: "#F1F5F9", border: "1px solid #E2E8F0",
                      borderRadius: 6, padding: "3px 9px",
                      fontFamily: "Inter, sans-serif", letterSpacing: "0.01em",
                      whiteSpace: "nowrap",
                    }}>
                      As of {fmtHeaderDate(latestPriceDate)}
                    </span>
                  )}

                  {/* Separator dot */}
                  {selectedItem?.nombre && (
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#CBD5E1", flexShrink: 0 }} />
                  )}

                  {/* Company full name */}
                  {selectedItem?.nombre && (
                    <span style={{
                      fontSize: 18,
                      fontWeight: 600,
                      color: "#334155",
                      letterSpacing: "-0.01em",
                      fontFamily: "Inter, sans-serif",
                    }}>
                      {deepDive.ticker}
                    </span>
                  )}
                </div>

                {/* ── Band 2: Description + Portfolio grid ── */}
                <div className="grid grid-cols-12 gap-6 items-start">

                  {/* Description — 7 cols */}
                  <div className={deepDive.portfolioWeights.length > 0 ? "col-span-7" : "col-span-12"}>
                    {deepDive.companyDescription ? (
                      <p style={{ fontSize: 14, color: "#475569", margin: 0, lineHeight: 1.8 }}>
                        {deepDive.companyDescription}
                      </p>
                    ) : (
                      <p style={{ fontSize: 13, color: "#CBD5E1", margin: 0, fontStyle: "italic" }}>
                        No description available.
                      </p>
                    )}
                  </div>

                  {/* Portfolio Positioning — 5 cols */}
                  {deepDive.portfolioWeights.length > 0 && (
                    <div className="col-span-5">
                      <ActiveWeightBadge weights={deepDive.portfolioWeights} />
                    </div>
                  )}
                </div>
              </div>

              {/* ── ROW 1: Historical Valuation (3/4) + Market Snapshot (1/4) ── */}
              <div className="grid lg:grid-cols-4 gap-6 mb-4">
                <div className="lg:col-span-3" style={{ ...CARD, minHeight: 320 }}>
                  <SectionLabel>Historical Valuation</SectionLabel>
                  {deepDive.valuationHistory.length > 0 ? (
                    <div style={{ height: 260 }}>
                      <ValuationChart data={deepDive.valuationHistory} />
                    </div>
                  ) : (
                    <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#CBD5E1", fontSize: 12 }}>
                      No valuation history data
                    </div>
                  )}
                </div>

                <div className="lg:col-span-1" style={{ ...CARD }}>
                  <SectionLabel>Market Snapshot</SectionLabel>
                  <KPICards
                    priceRange={latestPriceRange}
                    shortInterest={deepDive.shortInterest}
                  />
                </div>
              </div>

              {/* ── ROW 2: Consensus Evolution (2/5) + Estimate Momentum (3/5) ── */}
              <div className="grid lg:grid-cols-5 items-stretch gap-4 mb-4">
                <div className="lg:col-span-2 flex flex-col" style={{ ...CARD }}>
                  <SectionLabel>Consensus Evolution</SectionLabel>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <ConsensusChart data={deepDive.consensusEstimates} />
                  </div>
                </div>

                <div className="lg:col-span-3 flex flex-col" style={{ ...CARD }}>
                  <SectionLabel>Estimate Momentum — Consensus Revisions</SectionLabel>
                  <ConsensusMomentumCards data={deepDive.consensusEstimates} totalReturn={deepDive.totalReturn} />
                </div>
              </div>

              {/* ── ROW 3: Sell Side Sentiment (1/3) + Price vs Earnings (2/3) ─── */}
              <div className="grid lg:grid-cols-3 gap-6 mb-4">
                <div className="lg:col-span-1" style={{ ...CARD }}>
                  <SectionLabel>Sell Side Sentiment</SectionLabel>
                  <AnalystDonut
                    analystRec={deepDive.analystRec}
                    targetPrice={deepDive.analystRec?.targetPrice ?? null}
                    currentPrice={latestPrice}
                  />
                </div>

                <div className="lg:col-span-2" style={{ ...CARD }}>
                  <SectionLabel>Price vs Earnings Estimates</SectionLabel>
                  <div style={{ height: 220 }}>
                    <PriceEarningsChart data={deepDive.priceVsEarnings} consensus={deepDive.consensusEstimates} />
                  </div>
                </div>
              </div>

              {/* ── ROW 4: Related Reports — full width ──────────────────────── */}
              <div style={{ ...CARD, marginBottom: 24 }}>
                <RelatedReports />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
