"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, LayoutList, Grid3X3 } from "lucide-react";
import KPISummary from "@/components/companies/KPISummary";
import CompanyTable from "@/components/companies/CompanyTable";
import IndustryView from "@/components/companies/IndustryView";
import CompanyModal from "@/components/companies/CompanyModal";
import { Company, SECTOR_MAP } from "@/lib/companies";

const REVERSE_SECTOR_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SECTOR_MAP).map(([k, v]) => [v, k])
);

const SORT_OPTIONS = [
  { value: "mkt_cap_bn_desc", label: "Market Cap ↓", key: "mkt_cap_bn", order: "desc" as const },
  { value: "ret_1y_desc", label: "1Y Return ↓", key: "ret_1y", order: "desc" as const },
  { value: "Fv_ebitda_ltm_asc", label: "FV/EBITDA ↑", key: "Fv_ebitda_ltm", order: "asc" as const },
  { value: "pe_ltm_asc", label: "P/E ↑", key: "pe_ltm", order: "asc" as const },
];

function sortCompanies(
  list: Company[],
  sortBy: string,
  sortOrder: "asc" | "desc"
): Company[] {
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

export default function CompaniesPage() {
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("mkt_cap_bn");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<"table" | "industry">("table");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  const fetchCompanies = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch("/api/companies")
      .then((r) => r.json())
      .then((d: { companies?: Company[]; error?: string }) => {
        if (d.error) {
          setError(true);
        } else {
          setAllCompanies(d.companies ?? []);
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

  // Filtered + sorted companies for table/industry
  const filtered = (() => {
    let list = allCompanies;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        String(c.company ?? "").toLowerCase().includes(q)
      );
    }
    if (selectedSector) {
      list = list.filter((c) => c.sector === selectedSector);
    }
    return sortCompanies(list, sortBy, sortOrder);
  })();

  // Unique sectors from all companies (English display, sorted)
  const uniqueSectorEnglish = Array.from(
    new Set(
      allCompanies
        .map((c) => {
          const sp = c.sector as string;
          return sp ? SECTOR_MAP[sp] ?? sp : null;
        })
        .filter(Boolean) as string[]
    )
  ).sort();

  // Selected sort option label
  const activeSortOption =
    SORT_OPTIONS.find((o) => o.key === sortBy && o.order === sortOrder) ?? SORT_OPTIONS[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{
              borderColor: "rgba(43,92,224,0.15)",
              borderTopColor: "#2B5CE0",
            }}
          />
          <p className="text-sm font-mono" style={{ color: "#64748B" }}>
            Loading companies...
          </p>
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
            Companies
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

      {/* KPI Summary — always uses allCompanies */}
      <KPISummary companies={allCompanies} />

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
        {/* Search input */}
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

        {/* Sector dropdown */}
        <select
          value={selectedSector ? (SECTOR_MAP[selectedSector] ?? selectedSector) : ""}
          onChange={(e) => {
            const englishName = e.target.value;
            setSelectedSector(
              englishName ? (REVERSE_SECTOR_MAP[englishName] ?? englishName) : null
            );
          }}
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
          {uniqueSectorEnglish.map((en) => (
            <option key={en} value={en}>
              {en}
            </option>
          ))}
        </select>

        {/* Sort dropdown */}
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
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* View toggle */}
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
                  if (!isActive)
                    (e.currentTarget as HTMLElement).style.color = "#334155";
                }}
                onMouseLeave={(e) => {
                  if (!isActive)
                    (e.currentTarget as HTMLElement).style.color = "#64748B";
                }}
              >
                {mode === "table" ? <LayoutList size={13} /> : <Grid3X3 size={13} />}
                {mode === "table" ? "Table" : "Industry"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results count */}
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
              {" "}in {SECTOR_MAP[selectedSector] ?? selectedSector}
            </span>
          )}
          {search && (
            <span>
              {" "}matching &ldquo;{search}&rdquo;
            </span>
          )}
        </div>
      )}

      {/* Main content */}
      {viewMode === "table" ? (
        <CompanyTable
          companies={filtered}
          onSelect={setSelectedCompany}
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

      {/* Company detail modal */}
      <CompanyModal
        company={selectedCompany}
        onClose={() => setSelectedCompany(null)}
      />
    </div>
  );
}
