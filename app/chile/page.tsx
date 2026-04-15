"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, LayoutList, Grid3X3 } from "lucide-react";
import CompanyTable from "@/components/companies/CompanyTable";
import IndustryView from "@/components/companies/IndustryView";
import CompanyModal from "@/components/companies/CompanyModal";
import IndicesTable from "@/components/chile/IndicesTable";
import TopPicksForm from "@/components/top-picks/TopPicksForm";
import { Company } from "@/lib/companies";
import ProjectionsPage from "@/app/projections/page";

type ActiveTab = "stock-selection" | "projections" | "top-picks";

const SORT_OPTIONS = [
  { value: "mkt_cap_bn_desc",      label: "Mkt Cap ↓",       key: "mkt_cap_bn",      order: "desc" as const },
  { value: "ret_ytd_desc",         label: "YTD Return ↓",    key: "ret_ytd",         order: "desc" as const },
  { value: "Fv_ebitda_2026e_asc",  label: "FV/EBITDA 26E ↑", key: "Fv_ebitda_2026e", order: "asc"  as const },
  { value: "pe_2026e_asc",         label: "P/E 26E ↑",       key: "pe_2026e",        order: "asc"  as const },
  { value: "div_yield_2026e_desc", label: "Div Yield ↓",     key: "div_yield_2026e", order: "desc" as const },
];

function sortCompanies(list: Company[], sortBy: string, sortOrder: "asc" | "desc"): Company[] {
  return [...list].sort((a, b) => {
    const av = a[sortBy];
    const bv = b[sortBy];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const diff =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
    return sortOrder === "asc" ? diff : -diff;
  });
}

export default function ChilePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("stock-selection");

  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [indices, setIndices] = useState<Record<string, unknown>[]>([]);
  const [metadata, setMetadata] = useState<{ cierre_cartera: string; precios: string; resultados: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("mkt_cap_bn");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<"table" | "industry">("table");
  const [selectedCompanies, setSelectedCompanies] = useState<Company[]>([]);

  function handleSelectCompany(company: Company) {
    setSelectedCompanies((prev) => {
      if (prev.some((c) => c.company === company.company)) return prev;
      return [company, ...prev];
    });
  }

  function handleCloseCompany(company: Company) {
    setSelectedCompanies((prev) => prev.filter((c) => c.company !== company.company));
  }

  const fetchCompanies = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch("/api/chile/stock-selection")
      .then((r) => r.json())
      .then((d: { companies?: Company[]; indices?: Record<string, unknown>[]; metadata?: { cierre_cartera: string; precios: string; resultados: string }; error?: string }) => {
        if (d.error) {
          setError(true);
        } else {
          setAllCompanies(d.companies ?? []);
          setIndices(d.indices ?? []);
          setMetadata(d.metadata ?? null);
        }
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const filtered = (() => {
    let list = allCompanies;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => String(c.company ?? "").toLowerCase().includes(q));
    }
    if (selectedSector) {
      list = list.filter((c) => (c.industria as string)?.trim() === selectedSector.trim());
    }
    return sortCompanies(list, sortBy, sortOrder);
  })();

  const uniqueSectors = Array.from(
    new Set(allCompanies.map((c) => (c.industria as string)?.trim()).filter(Boolean))
  ).sort();

  const activeSortOption =
    SORT_OPTIONS.find((o) => o.key === sortBy && o.order === sortOrder) ?? SORT_OPTIONS[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(43,92,224,0.15)", borderTopColor: "#2B5CE0" }}
          />
          <p className="text-sm font-mono" style={{ color: "#64748B" }}>Loading companies...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div
          style={{
            background: "rgba(220,38,38,0.06)",
            border: "1px solid rgba(220,38,38,0.15)",
            borderRadius: 10,
            padding: "24px 32px",
            textAlign: "center",
          }}
        >
          <p style={{ color: "#DC2626", marginBottom: 12, fontSize: 14 }}>
            Failed to load companies data
          </p>
          <button
            onClick={fetchCompanies}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              background: "rgba(43,92,224,0.08)",
              border: "1px solid rgba(43,92,224,0.20)",
              color: "#2B5CE0",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em" }}>
            Chile Equities
          </h1>
          <p style={{ fontSize: 12, marginTop: 4, color: "#64748B" }}>
            Chilean Equity Universe — AGF Coverage
          </p>
        </div>
        <button
          onClick={fetchCompanies}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 8,
            background: "rgba(43,92,224,0.06)",
            border: "1px solid rgba(15,23,42,0.10)",
            color: "#64748B",
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "JetBrains Mono, monospace",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "#334155";
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(43,92,224,0.25)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "#64748B";
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(15,23,42,0.10)";
          }}
        >
          <RefreshCw size={12} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Sub-navigation tabs */}
      <div
        className="flex items-center gap-1 mb-5 p-1 rounded-lg"
        style={{
          background: "rgba(15,23,42,0.04)",
          border: "1px solid rgba(15,23,42,0.08)",
          width: "fit-content",
        }}
      >
        {(["stock-selection", "projections", "top-picks"] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-5 py-1.5 rounded-md text-sm font-semibold transition-all"
            style={{
              background: activeTab === tab ? "rgba(43,92,224,0.10)" : "transparent",
              color: activeTab === tab ? "#1E3A8A" : "#64748B",
              border: activeTab === tab ? "1px solid rgba(43,92,224,0.25)" : "1px solid transparent",
            }}
          >
            {tab === "stock-selection" ? "Stock Selection" : tab === "projections" ? "Projections" : "Top Picks"}
          </button>
        ))}
      </div>

      {/* ── Stock Selection ─────────────────────────────────────────────────── */}
      {activeTab === "stock-selection" && (
        <>
          {/* Metadata bar */}
          {metadata && (
            <p className="text-xs mb-3" style={{ color: "#94A3B8", fontFamily: "monospace" }}>
              Data as of · Cierre Cartera: <span style={{ color: "#64748B" }}>{metadata.cierre_cartera}</span>
              {" "}|{" "}Precios: <span style={{ color: "#64748B" }}>{metadata.precios}</span>
              {" "}|{" "}Resultados: <span style={{ color: "#64748B" }}>{metadata.resultados}</span>
            </p>
          )}

          {/* Benchmark indices table */}
          <IndicesTable indices={indices} />

          {/* Search & Filter Bar */}
          <div
            className="card"
            style={{
              padding: "12px 16px",
              marginBottom: 16,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div style={{ position: "relative", flex: "1 1 200px", minWidth: 160 }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company..."
                style={{
                  width: "100%",
                  padding: "7px 12px",
                  borderRadius: 7,
                  background: "#F8FAFF",
                  border: "1px solid rgba(15,23,42,0.10)",
                  color: "#0F172A",
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "Inter, sans-serif",
                }}
                onFocus={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(43,92,224,0.35)";
                }}
                onBlur={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(15,23,42,0.10)";
                }}
              />
            </div>

            <select
              value={selectedSector ?? ""}
              onChange={(e) => setSelectedSector(e.target.value || null)}
              style={{
                padding: "7px 12px",
                borderRadius: 7,
                background: "#F8FAFF",
                border: "1px solid rgba(15,23,42,0.10)",
                color: selectedSector ? "#0F172A" : "#64748B",
                fontSize: 13,
                cursor: "pointer",
                outline: "none",
                minWidth: 160,
              }}
            >
              <option value="">All Sectors</option>
              {uniqueSectors.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {viewMode === "table" && (
              <select
                value={activeSortOption.value}
                onChange={(e) => {
                  const opt = SORT_OPTIONS.find((o) => o.value === e.target.value);
                  if (opt) {
                    setSortBy(opt.key);
                    setSortOrder(opt.order);
                  }
                }}
                style={{
                  padding: "7px 12px",
                  borderRadius: 7,
                  background: "#F8FAFF",
                  border: "1px solid rgba(15,23,42,0.10)",
                  color: "#0F172A",
                  fontSize: 13,
                  cursor: "pointer",
                  outline: "none",
                  minWidth: 150,
                }}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}

            <div
              style={{
                display: "flex",
                gap: 4,
                padding: 3,
                borderRadius: 8,
                background: "#F0F4FA",
                border: "1px solid rgba(15,23,42,0.08)",
                marginLeft: "auto",
              }}
            >
              {(["table", "industry"] as const).map((mode) => {
                const isActive = viewMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 12px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                      border: "none",
                      background: isActive ? "rgba(43,92,224,0.10)" : "transparent",
                      color: isActive ? "#1E3A8A" : "#64748B",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.color = "#334155";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.color = "#64748B";
                    }}
                  >
                    {mode === "table" ? <LayoutList size={13} /> : <Grid3X3 size={13} />}
                    {mode === "table" ? "Table" : "Industry"}
                  </button>
                );
              })}
            </div>
          </div>

          {(search || selectedSector) && (
            <div
              style={{
                fontSize: 12,
                color: "#64748B",
                fontFamily: "JetBrains Mono, monospace",
                marginBottom: 10,
              }}
            >
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              {selectedSector && (
                <span style={{ color: "#2B5CE0" }}>
                  {" "}in {selectedSector}
                </span>
              )}
              {search && <span>{" "}matching &ldquo;{search}&rdquo;</span>}
            </div>
          )}

          {viewMode === "table" ? (
            <CompanyTable
              companies={filtered}
              onSelect={handleSelectCompany}
              sortBy={sortBy}
              setSortBy={setSortBy}
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
            />
          ) : (
            <IndustryView
              companies={allCompanies}
              onSectorClick={(sector) => {
                setSelectedSector(sector === "" ? null : sector);
                if (sector) setViewMode("table");
              }}
              activeSector={selectedSector}
            />
          )}

          {selectedCompanies.map((company) => (
            <CompanyModal
              key={company.company as string}
              company={company}
              onClose={() => handleCloseCompany(company)}
            />
          ))}
        </>
      )}

      {/* ── Projections ─────────────────────────────────────────────────────── */}
      {activeTab === "projections" && <ProjectionsPage />}

      {/* ── Top Picks ───────────────────────────────────────────────────────── */}
      {activeTab === "top-picks" && <TopPicksForm defaultRegion="CHILE" />}
    </div>
  );
}
