"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CompanySidebar from "@/components/deep-dive/CompanySidebar";
import ValuationChart from "@/components/deep-dive/ValuationChart";
import KPICards from "@/components/deep-dive/KPICards";
import ConsensusChart from "@/components/deep-dive/ConsensusChart";
import PriceEarningsChart from "@/components/deep-dive/PriceEarningsChart";
import AnalystDonut from "@/components/deep-dive/AnalystDonut";
import ConsensusMomentumCards from "@/components/deep-dive/ConsensusMomentumCards";
import RelatedReports from "@/components/deep-dive/RelatedReports";
import ScorecardGrid from "@/components/deep-dive/ScorecardGrid";
import ModelExplorer from "@/components/deep-dive/ModelExplorer";
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

const FUND_DISPLAY_NAMES: Record<string, string> = {
  Moneda_Renta_Variable:                   "MRV",
  "Moneda_Latin_America_Equities_(LX)":    "LA Equities (LX)",
  "Moneda_Latin_America_Small_Cap_(LX)":   "LA Small Cap (LX)",
  Pionero:                                 "Pionero",
  Orange:                                  "Orange",
  Glory:                                   "Glory",
  Mercer:                                  "Mercer",
};

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  const pct = Number(v) * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
}

function fmtFundPct(v: number | null): string {
  if (v == null) return "—";
  // portfolioWeight is stored as a decimal (e.g. 0.035 → 3.50%)
  const pct = Number(v) * 100;
  return pct.toFixed(2) + "%";
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

        {/* Header row — fund display names */}
        <div style={{ fontSize: 9, color: "#94A3B8" }} />
        {weights.map((w) => (
          <div key={w.fundName} style={{ fontSize: 10, fontWeight: 700, color: "#64748B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "center" }}>
            {FUND_DISPLAY_NAMES[w.fundName] ?? w.fundName.replace(/_/g, " ")}
          </div>
        ))}

        {/* Fund weight row */}
        <div style={{ fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap" }}>Fund %</div>
        {weights.map((w) => (
          <div key={w.fundName} style={{ fontSize: 10, color: "#475569", fontWeight: 600, textAlign: "center" }}>
            {fmtFundPct(w.portfolioWeight)}
          </div>
        ))}

        {/* Active weight row */}
        <div style={{ fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap" }}>OW/UW</div>
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

// ── Componente Interno (El contenido real) ────────────────────────────────────
function CompaniesContent() {
  const searchParams = useSearchParams();
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const [selectedItem, setSelectedItem] = useState<CompanyListItem | null>(null);
  const [deepDive, setDeepDive] = useState<DeepDivePayload | null>(null);
  const [diveLoading, setDiveLoading] = useState(false);
  const [diveError, setDiveError] = useState<string | null>(null);
  const [view,        setView]        = useState<"scorecard" | "detail">("scorecard");
  const [analysisTab, setAnalysisTab] = useState<"model" | "consensus">("consensus");
  // Uploaded docs keyed by ticker → array of {url, label}
  const [companyDocs, setCompanyDocs] = useState<Record<string, { url: string; label: string }[]>>({});

  // Fetch company list once, then auto-select from ?ticker= param, CCU, or first
  useEffect(() => {
    const tickerParam = searchParams.get("ticker");
    const tabParam    = searchParams.get("tab");
    fetch("/api/companies/list")
      .then((r) => r.json())
      .then((d: { companies?: CompanyListItem[] }) => {
        const list = d.companies ?? [];
        setCompanies(list);
        if (list.length > 0) {
          const defaultItem =
            (tickerParam ? list.find((c) => c.ticker === tickerParam) : null) ??
            list.find((c) => c.ticker === "CCU CI Equity") ??
            list[0];
          handleSelect(defaultItem);
          if (tabParam === "model" || tabParam === "consensus") {
            setAnalysisTab(tabParam);
          }
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
    setView("scorecard");
    setAnalysisTab("consensus");

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