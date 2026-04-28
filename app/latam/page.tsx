"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import LatamTable, { type LatamCompany } from "@/components/latam/LatamTable";
import TopPicksForm from "@/components/top-picks/TopPicksForm";
import FlatAttributionPanel from "@/components/attribution/FlatAttributionPanel";
import SectorAttributionPanel from "@/components/attribution/SectorAttributionPanel";
import MatrixAttributionPanel from "@/components/attribution/MatrixAttributionPanel";
import EarningsDashboard from "@/components/earnings/EarningsDashboard";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActiveTab = "stock-selection" | "top-picks" | "attribution" | "earnings";
type FundFilter = "all" | "MLE" | "MSC" | "others";

interface SortOption {
  value:  string;
  label:  string;
  key:    string;
  order:  "asc" | "desc";
}

// ── Sort options ──────────────────────────────────────────────────────────────

const SORT_OPTIONS: SortOption[] = [
  { value: "mktCapUsd_desc",      label: "Mkt Cap ↓",          key: "mktCapUsd",      order: "desc" },
  { value: "retYtd_desc",         label: "YTD Return ↓",       key: "retYtd",         order: "desc" },
  { value: "ret1W_desc",          label: "1W Return ↓",        key: "ret1W",          order: "desc" },
  { value: "ret1Y_desc",          label: "1Y Return ↓",        key: "ret1Y",          order: "desc" },
  { value: "tpUpside_desc",       label: "TP Upside ↓",        key: "tpUpside",       order: "desc" },
  { value: "peCurYr_asc",         label: "P/E 2026e ↑",        key: "peCurYr",        order: "asc"  },
  { value: "evEbitdaCurYr_asc",   label: "EV/EBITDA 2026e ↑",  key: "evEbitdaCurYr",  order: "asc"  },
  { value: "divYield_desc",       label: "Div Yield ↓",        key: "divYield",       order: "desc" },
  { value: "leverage_asc",        label: "Leverage ↑",         key: "leverage",       order: "asc"  },
  { value: "epsRev1W_desc",       label: "EPS Rev 1W ↓",       key: "epsRev1W",       order: "desc" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sortCompanies(
  list: LatamCompany[],
  key: string,
  order: "asc" | "desc"
): LatamCompany[] {
  return [...list].sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[key];
    const bv = (b as unknown as Record<string, unknown>)[key];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const diff =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
    return order === "asc" ? diff : -diff;
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

// ── Attribution section with sub-tabs ────────────────────────────────────────
type AttrMode = "flat" | "sector" | "matrix";

function AttributionSection() {
  const [mode, setMode] = useState<AttrMode>("flat");
  return (
    <div>
      {/* Sub-tab bar */}
      <div
        style={{
          display: "flex", gap: 4, marginBottom: 16,
          padding: 4, borderRadius: 9,
          background: "rgba(15,23,42,0.03)",
          border: "1px solid rgba(15,23,42,0.07)",
          width: "fit-content",
        }}
      >
        {(
          [
            { key: "flat",   label: "By Asset (Flat Universe)"    },
            { key: "sector", label: "By Sector (GICS Multi-Layer)" },
            { key: "matrix", label: "Attribution Matrix"           },
          ] as { key: AttrMode; label: string }[]
        ).map(({ key, label }) => {
          const active = mode === key;
          return (
            <button
              key={key}
              onClick={() => setMode(key)}
              style={{
                padding: "5px 16px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                cursor: "pointer", transition: "all 0.1s",
                background: active ? "rgba(37,99,235,0.10)" : "transparent",
                color:      active ? "#1E3A8A"              : "#64748B",
                border:     active ? "1px solid rgba(37,99,235,0.25)" : "1px solid transparent",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {mode === "flat"   && <FlatAttributionPanel />}
      {mode === "sector" && <SectorAttributionPanel />}
      {mode === "matrix" && <MatrixAttributionPanel />}
    </div>
  );
}

export default function LatAmPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("stock-selection");

  // data
  const [allCompanies, setAllCompanies] = useState<LatamCompany[]>([]);
  const [metadata, setMetadata]         = useState<{ snapshotDate: string } | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(false);

  // filters
  const [search, setSearch]               = useState("");
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [fundFilter, setFundFilter]       = useState<FundFilter>("all");
  const [sortBy, setSortBy]               = useState("mktCapUsd");
  const [sortOrder, setSortOrder]         = useState<"asc" | "desc">("desc");

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch("/api/latam/stock-selection")
      .then((r) => r.json())
      .then((d: { companies?: LatamCompany[]; metadata?: { snapshotDate: string }; error?: string }) => {
        if (d.error) {
          setError(true);
        } else {
          setAllCompanies(d.companies ?? []);
          setMetadata(d.metadata ?? null);
        }
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const uniqueSectors = Array.from(
    new Set(allCompanies.map((c) => c.sector).filter((s): s is string => !!s))
  ).sort();

  const filtered: LatamCompany[] = (() => {
    let list = allCompanies;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.company.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q)
      );
    }
    if (selectedSector) {
      list = list.filter((c) => c.sector === selectedSector);
    }
    if (fundFilter === "MLE") {
      list = list.filter((c) => c.funds.includes("MLE"));
    } else if (fundFilter === "MSC") {
      list = list.filter((c) => c.funds.includes("MSC"));
    } else if (fundFilter === "others") {
      list = list.filter((c) => c.funds.length === 0);
    }
    return sortCompanies(list, sortBy, sortOrder);
  })();

  const activeSortOption =
    SORT_OPTIONS.find((o) => o.key === sortBy && o.order === sortOrder) ?? SORT_OPTIONS[0];

  // ── Design tokens ─────────────────────────────────────────────────────────

  const CONTROL_STYLE: React.CSSProperties = {
    padding:     "7px 11px",
    borderRadius: 7,
    background:  "#F8FAFF",
    border:      "1px solid rgba(15,23,42,0.10)",
    color:       "#0F172A",
    fontSize:    13,
    cursor:      "pointer",
    outline:     "none",
    fontFamily:  "Inter, sans-serif",
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(43,92,224,0.15)", borderTopColor: "#2B5CE0" }}
          />
          <p className="text-sm font-mono" style={{ color: "#64748B" }}>
            Loading LatAm universe...
          </p>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div
          style={{
            background:   "rgba(220,38,38,0.06)",
            border:       "1px solid rgba(220,38,38,0.15)",
            borderRadius: 10,
            padding:      "24px 36px",
            textAlign:    "center",
          }}
        >
          <p style={{ color: "#DC2626", marginBottom: 12, fontSize: 14 }}>
            Failed to load LatAm data
          </p>
          <button
            onClick={fetchData}
            style={{
              padding:     "6px 18px",
              borderRadius: 6,
              background:  "rgba(43,92,224,0.08)",
              border:      "1px solid rgba(43,92,224,0.20)",
              color:       "#2B5CE0",
              cursor:      "pointer",
              fontSize:    13,
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1800px] mx-auto px-6 py-6">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display:        "flex",
          alignItems:     "flex-start",
          justifyContent: "space-between",
          marginBottom:   20,
          flexWrap:       "wrap",
          gap:            12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em" }}>
            LatAm Equities
          </h1>
          <p style={{ fontSize: 12, marginTop: 4, color: "#64748B" }}>
            Latin American Equity Universe — AGF Coverage
          </p>
        </div>

        <button
          onClick={fetchData}
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        6,
            padding:    "6px 12px",
            borderRadius: 8,
            background: "rgba(43,92,224,0.06)",
            border:     "1px solid rgba(15,23,42,0.10)",
            color:      "#64748B",
            cursor:     "pointer",
            fontSize:   12,
            fontFamily: "JetBrains Mono, monospace",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color       = "#334155";
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(43,92,224,0.25)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color       = "#64748B";
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(15,23,42,0.10)";
          }}
        >
          <RefreshCw size={12} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ── Sub-navigation tabs ──────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1 mb-5 p-1 rounded-lg"
        style={{
          background: "rgba(15,23,42,0.04)",
          border:     "1px solid rgba(15,23,42,0.08)",
          width:      "fit-content",
        }}
      >
        {(
          [
            { key: "stock-selection", label: "Stock Selection"     },
            { key: "top-picks",       label: "Top Picks"           },
            { key: "attribution",     label: "Perf. Attribution"   },
            { key: "earnings",        label: "Earnings Surprises"  },
          ] as { key: ActiveTab; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="px-5 py-1.5 rounded-md text-sm font-semibold transition-all"
            style={{
              background: activeTab === key ? "rgba(43,92,224,0.10)" : "transparent",
              color:      activeTab === key ? "#1E3A8A" : "#64748B",
              border:     activeTab === key ? "1px solid rgba(43,92,224,0.25)" : "1px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Stock Selection ──────────────────────────────────────────────────── */}
      {activeTab === "stock-selection" && (
        <>
          {/* Metadata bar */}
          {metadata && (
            <p
              className="text-xs mb-3"
              style={{ color: "#94A3B8", fontFamily: "monospace" }}
            >
              Data as of ·{" "}
              <span style={{ color: "#64748B" }}>{metadata.snapshotDate}</span>
              {" "}·{" "}
              <span style={{ color: "#64748B" }}>{allCompanies.length} companies</span>
            </p>
          )}

          {/* Filter / Sort bar */}
          <div
            className="card"
            style={{
              padding:     "12px 16px",
              marginBottom: 14,
              display:     "flex",
              gap:         10,
              flexWrap:    "wrap",
              alignItems:  "center",
            }}
          >
            {/* Search */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company or ticker..."
              style={{
                ...CONTROL_STYLE,
                flex:     "1 1 200px",
                minWidth: 180,
                color:    search ? "#0F172A" : "#94A3B8",
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(43,92,224,0.35)";
                (e.currentTarget as HTMLElement).style.color       = "#0F172A";
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(15,23,42,0.10)";
              }}
            />

            {/* Sector filter */}
            <select
              value={selectedSector ?? ""}
              onChange={(e) => setSelectedSector(e.target.value || null)}
              style={{
                ...CONTROL_STYLE,
                minWidth: 170,
                color:    selectedSector ? "#0F172A" : "#64748B",
              }}
            >
              <option value="">All Sectors</option>
              {uniqueSectors.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {/* Fund filter */}
            <div
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          2,
                padding:      "3px",
                borderRadius: 8,
                background:   "rgba(15,23,42,0.04)",
                border:       "1px solid rgba(15,23,42,0.08)",
              }}
            >
              {(["all", "MLE", "MSC", "others"] as FundFilter[]).map((f) => {
                const active = fundFilter === f;
                const labels: Record<FundFilter, string> = {
                  all: "All", MLE: "MLE", MSC: "MSC", others: "Others",
                };
                const colors: Record<FundFilter, { text: string; bg: string; border: string }> = {
                  all:    { text: "#64748B", bg: "rgba(43,92,224,0.10)",  border: "rgba(43,92,224,0.25)"  },
                  MLE:    { text: "#1E3A8A", bg: "rgba(43,92,224,0.12)",  border: "rgba(43,92,224,0.30)"  },
                  MSC:    { text: "#065F46", bg: "rgba(5,150,105,0.12)",  border: "rgba(5,150,105,0.30)"  },
                  others: { text: "#4B5563", bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.25)" },
                };
                const c = colors[f];
                return (
                  <button
                    key={f}
                    onClick={() => setFundFilter(f)}
                    style={{
                      padding:      "4px 12px",
                      borderRadius: 6,
                      fontSize:     12,
                      fontWeight:   600,
                      fontFamily:   "Inter, sans-serif",
                      cursor:       "pointer",
                      transition:   "all 0.12s",
                      background:   active ? c.bg      : "transparent",
                      color:        active ? c.text    : "#94A3B8",
                      border:       active ? `1px solid ${c.border}` : "1px solid transparent",
                    }}
                  >
                    {labels[f]}
                  </button>
                );
              })}
            </div>

            {/* Sort */}
            <select
              value={activeSortOption.value}
              onChange={(e) => {
                const opt = SORT_OPTIONS.find((o) => o.value === e.target.value);
                if (opt) { setSortBy(opt.key); setSortOrder(opt.order); }
              }}
              style={{ ...CONTROL_STYLE, minWidth: 170 }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* Result count */}
            {(search || selectedSector) && (
              <span
                style={{
                  marginLeft: "auto",
                  fontSize:   12,
                  color:      "#64748B",
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                {selectedSector && (
                  <span style={{ color: "#2B5CE0" }}> in {selectedSector}</span>
                )}
                {search && (
                  <span> matching &ldquo;{search}&rdquo;</span>
                )}
              </span>
            )}
          </div>

          {/* Bloomberg-style table */}
          <LatamTable
            companies={filtered}
            sortBy={sortBy}
            setSortBy={(key) => { setSortBy(key); }}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
          />
        </>
      )}

      {/* ── Top Picks ────────────────────────────────────────────────────────── */}
      {activeTab === "top-picks" && <TopPicksForm defaultRegion="LATAM" />}

      {/* ── Performance Attribution ──────────────────────────────────────────── */}
      {activeTab === "attribution" && <AttributionSection />}

      {/* ── Earnings Surprises ───────────────────────────────────────────────── */}
      {activeTab === "earnings" && <EarningsDashboard />}
    </div>
  );
}
