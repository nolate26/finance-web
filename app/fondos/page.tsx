"use client";

import { useEffect, useState } from "react";
import CarteraTable from "@/components/fondos/CarteraTable";
import ReturnsDashboard from "@/components/fondos/ReturnsDashboard";
import PerformanceAttribution from "@/components/fondos/PerformanceAttribution";
import { RefreshCw, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";

// ── Fund → rentabilidades page_num mapping ───────────────────────────────────
const FUND_PAGE_MAP: Record<string, string> = {
  Pionero: "1",
  Moneda_Renta_Variable: "2",
  Orange: "2",
  "Moneda_Latin_America_Small_Cap_(LX)": "3",
  "Moneda_Latin_America_Equities_(LX)": "4",
  Glory: "4",
  Mercer: "4",
};

// ── Fund → Performance Attribution fund identifier (matches FUND column in CSV)
const FUND_ATTR_MAP: Record<string, string> = {
  Pionero: "PIONERO",
  Moneda_Renta_Variable: "MRV",
  Orange: "ORANGE",
  "Moneda_Latin_America_Small_Cap_(LX)": "MSC - Moneda Small Cap Latinoamérica",
  "Moneda_Latin_America_Equities_(LX)": "MLE",
  Glory: "GLORY",
  Mercer: "MERCER",
};

// ── Business-ordered fund names per region ────────────────────────────────────
const FUND_ORDER: Record<"Chile" | "LATAM", string[]> = {
  Chile: ["Pionero", "Moneda_Renta_Variable", "Orange"],
  LATAM: ["Moneda_Latin_America_Equities_(LX)", "Moneda_Latin_America_Small_Cap_(LX)", "Glory", "Mercer"],
};

interface CarteraRow {
  company: string;
  portfolioPct: number;
  benchmarkPct: number;
  overweight: number;
  sector: string;
  macroSector: string;
  delta1W: number | null;
  delta1M: number | null;
}

interface FondoMeta {
  id: string;
  name: string;
  displayName: string;
  date: string;
  region: "Chile" | "LATAM";
}

interface FondoData extends FondoMeta {
  benchmark: string;
  cartera: CarteraRow[];
  error?: string;
}

function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} ${parseInt(day)}, ${y}`;
}

export default function FondosPage() {
  const [fondosList, setFondosList] = useState<FondoMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [fondoData, setFondoData] = useState<FondoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [region, setRegion] = useState<"Chile" | "LATAM">("Chile");
  const [sectorFilter, setSectorFilter] = useState<string>("All");
  const [activeTab, setActiveTab] = useState<"cartera" | "returns" | "attribution">("returns");

  useEffect(() => {
    fetch("/api/fondos")
      .then((r) => r.json())
      .then((d: { fondos: FondoMeta[] }) => {
        setFondosList(d.fondos);
        // Select most recent snapshot of the first business-ordered Chile fund
        const firstChileName = FUND_ORDER.Chile.find((n) =>
          d.fondos.some((f) => f.region === "Chile" && f.name === n)
        );
        const latest = firstChileName
          ? d.fondos.filter((f) => f.name === firstChileName).sort((a, b) => b.date.localeCompare(a.date))[0]
          : d.fondos.filter((f) => f.region === "Chile").at(-1);
        if (latest) setSelectedId(latest.id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingData(true);
    setFondoData(null);
    setSectorFilter("All");
    fetch(`/api/fondos?fondo=${encodeURIComponent(selectedId)}`)
      .then((r) => r.json())
      .then((d: FondoData) => {
        setFondoData(d);
        setLoadingData(false);
      })
      .catch(() => setLoadingData(false));
  }, [selectedId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(43,92,224,0.15)", borderTopColor: "#2B5CE0" }}
          />
          <p className="text-sm font-mono" style={{ color: "#64748B" }}>Loading funds...</p>
        </div>
      </div>
    );
  }

  const selectedMeta = fondosList.find((f) => f.id === selectedId);
  const regionFunds = fondosList.filter((f) => f.region === region);
  // Business-ordered fund names: only include funds that actually exist in the API response
  const availableNames = new Set(regionFunds.map((f) => f.name));
  const uniqueNames = FUND_ORDER[region].filter((n) => availableNames.has(n));
  const selectedFundName = selectedMeta?.name ?? "";
  const snapshots = fondosList
    .filter((f) => f.name === selectedFundName)
    .sort((a, b) => b.date.localeCompare(a.date));

  // Unique macro-sectors in this portfolio
  const allSectors = fondoData
    ? ["All", ...Array.from(new Set(fondoData.cartera.map((r) => r.macroSector).filter(Boolean))).sort()]
    : ["All"];

  // Filtered cartera
  const filteredCartera = fondoData
    ? sectorFilter === "All"
      ? fondoData.cartera
      : fondoData.cartera.filter((r) => r.macroSector === sectorFilter)
    : [];

  // snapshots is newest-first; idx 0 = most recent
  const currentSnapshotIdx = snapshots.findIndex((s) => s.id === selectedId);

  function handlePrevDate() {
    // "previous" = older = higher index
    const nextIdx = currentSnapshotIdx + 1;
    if (nextIdx < snapshots.length) setSelectedId(snapshots[nextIdx].id);
  }

  function handleNextDate() {
    // "next" = newer = lower index
    const nextIdx = currentSnapshotIdx - 1;
    if (nextIdx >= 0) setSelectedId(snapshots[nextIdx].id);
  }

  function selectFund(name: string) {
    const latest = fondosList
      .filter((f) => f.name === name)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (latest) setSelectedId(latest.id);
  }

  function switchRegion(r: "Chile" | "LATAM") {
    setRegion(r);
    // Select most recent snapshot of the first business-ordered fund in the new region
    const firstName = FUND_ORDER[r].find((n) =>
      fondosList.some((f) => f.region === r && f.name === n)
    );
    const latest = firstName
      ? fondosList.filter((f) => f.name === firstName).sort((a, b) => b.date.localeCompare(a.date))[0]
      : fondosList.filter((f) => f.region === r).at(-1);
    if (latest) setSelectedId(latest.id);
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "#0F172A" }}>Funds</h1>
          <p className="text-xs mt-1" style={{ color: "#64748B" }}>
            Portfolio composition &amp; deviation vs benchmark
          </p>
        </div>
        {selectedMeta && (
          <div className="flex items-center gap-2 text-xs font-mono" style={{ color: "#94A3B8" }}>
            <RefreshCw size={12} />
            <span>Data as of {fmtDate(selectedMeta.date)}</span>
          </div>
        )}
      </div>

      {/* Region tabs */}
      <div
        className="flex items-center gap-1 mb-4 p-1 rounded-lg"
        style={{ background: "rgba(15,23,42,0.04)", border: "1px solid rgba(15,23,42,0.08)", width: "fit-content" }}
      >
        {(["Chile", "LATAM"] as const).map((r) => (
          <button
            key={r}
            onClick={() => switchRegion(r)}
            className="px-5 py-1.5 rounded-md text-sm font-semibold transition-all"
            style={{
              background: region === r ? "rgba(43,92,224,0.10)" : "transparent",
              color: region === r ? "#1E3A8A" : "#64748B",
              border: region === r ? "1px solid rgba(43,92,224,0.25)" : "1px solid transparent",
            }}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Fund quick-select */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-medium" style={{ color: "#94A3B8" }}>Fund:</span>
        {uniqueNames.map((name) => {
          const displayName = fondosList.find((f) => f.name === name)?.displayName ?? name;
          const isActive = selectedMeta?.name === name;
          return (
            <button
              key={name}
              onClick={() => selectFund(name)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: isActive ? "rgba(43,92,224,0.10)" : "rgba(15,23,42,0.04)",
                color: isActive ? "#2B5CE0" : "#64748B",
                border: `1px solid ${isActive ? "rgba(43,92,224,0.25)" : "rgba(15,23,42,0.08)"}`,
              }}
            >
              {displayName}
            </button>
          );
        })}
      </div>

      {/* Internal tab navigation */}
      <div
        className="flex items-center gap-1 mb-5 p-1 rounded-lg"
        style={{ background: "rgba(15,23,42,0.04)", border: "1px solid rgba(15,23,42,0.08)", width: "fit-content" }}
      >
        {([
          { key: "returns", label: "Returns" },
          { key: "cartera", label: "Cartera" },
          { key: "attribution", label: "Performance Attribution" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="px-5 py-1.5 rounded-md text-sm font-semibold transition-all"
            style={{
              background: activeTab === key ? "rgba(43,92,224,0.10)" : "transparent",
              color: activeTab === key ? "#1E3A8A" : "#64748B",
              border: activeTab === key ? "1px solid rgba(43,92,224,0.25)" : "1px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Returns tab ───────────────────────────────────────────────────────── */}
      {activeTab === "returns" && (
        <ReturnsDashboard
          pageNum={FUND_PAGE_MAP[selectedFundName] ?? "1"}
          fundDisplayName={selectedMeta?.displayName ?? selectedFundName}
        />
      )}

      {/* ── Cartera tab ───────────────────────────────────────────────────────── */}
      {activeTab === "cartera" && (
        <>
          {/* Error state */}
          {fondoData?.error && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-lg mb-5"
              style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)" }}
            >
              <AlertCircle size={16} style={{ color: "#DC2626" }} />
              <p className="text-sm" style={{ color: "#DC2626" }}>
                Could not load fund {fondoData.displayName}: {fondoData.error}
              </p>
            </div>
          )}

          {/* Loading */}
          {loadingData && (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-4">
                <div
                  className="w-8 h-8 rounded-full border-2 animate-spin"
                  style={{ borderColor: "rgba(43,92,224,0.15)", borderTopColor: "#2B5CE0" }}
                />
                <p className="text-sm font-mono" style={{ color: "#64748B" }}>
                  Loading {selectedMeta?.displayName}...
                </p>
              </div>
            </div>
          )}

          {fondoData && !loadingData && fondoData.cartera.length > 0 && (
            <>
              {/* Portfolio date stepper */}
              {snapshots.length > 1 && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-medium mr-1" style={{ color: "#94A3B8" }}>Portfolio snapshot:</span>
                  <div
                    className="flex items-center rounded-md overflow-hidden"
                    style={{ border: "1px solid #E2E8F0", background: "#F8FAFC" }}
                  >
                    <button
                      onClick={handlePrevDate}
                      disabled={currentSnapshotIdx >= snapshots.length - 1}
                      title="Previous (older)"
                      className="flex items-center justify-center transition-colors"
                      style={{
                        width: 32, height: 32,
                        borderRight: "1px solid #E2E8F0",
                        color: currentSnapshotIdx >= snapshots.length - 1 ? "#CBD5E1" : "#475569",
                        cursor: currentSnapshotIdx >= snapshots.length - 1 ? "not-allowed" : "pointer",
                        background: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (currentSnapshotIdx < snapshots.length - 1)
                          (e.currentTarget as HTMLButtonElement).style.color = "#1E3A8A";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color =
                          currentSnapshotIdx >= snapshots.length - 1 ? "#CBD5E1" : "#475569";
                      }}
                    >
                      <ChevronLeft size={15} />
                    </button>

                    <select
                      value={selectedId}
                      onChange={(e) => setSelectedId(e.target.value)}
                      style={{
                        border: "none", outline: "none", background: "transparent",
                        fontSize: 13, fontWeight: 500, color: "#334155",
                        padding: "0 10px", height: 32, cursor: "pointer",
                        appearance: "none", WebkitAppearance: "none",
                        minWidth: 140, textAlign: "center",
                      }}
                    >
                      {snapshots.map((s) => (
                        <option key={s.id} value={s.id}>{fmtDate(s.date)}</option>
                      ))}
                    </select>

                    <button
                      onClick={handleNextDate}
                      disabled={currentSnapshotIdx <= 0}
                      title="Next (newer)"
                      className="flex items-center justify-center transition-colors"
                      style={{
                        width: 32, height: 32,
                        borderLeft: "1px solid #E2E8F0",
                        color: currentSnapshotIdx <= 0 ? "#CBD5E1" : "#475569",
                        cursor: currentSnapshotIdx <= 0 ? "not-allowed" : "pointer",
                        background: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (currentSnapshotIdx > 0)
                          (e.currentTarget as HTMLButtonElement).style.color = "#1E3A8A";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color =
                          currentSnapshotIdx <= 0 ? "#CBD5E1" : "#475569";
                      }}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                  <span className="text-xs font-mono" style={{ color: "#94A3B8" }}>
                    {currentSnapshotIdx + 1} / {snapshots.length}
                  </span>
                </div>
              )}

              {/* Macro Sector filter */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-medium" style={{ color: "#94A3B8" }}>Macro Sector:</span>
                <select
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 7,
                    border: "1px solid rgba(15,23,42,0.10)",
                    background: "#F8FAFF",
                    color: sectorFilter === "All" ? "#64748B" : "#0F172A",
                    fontSize: 13,
                    cursor: "pointer",
                    outline: "none",
                    minWidth: 160,
                  }}
                >
                  {allSectors.map((s) => (
                    <option key={s} value={s}>{s === "All" ? "All Sectors" : s}</option>
                  ))}
                </select>
              </div>

              {/* Portfolio table */}
              <CarteraTable
                cartera={filteredCartera}
                benchmark={fondoData.benchmark}
                fundName={selectedFundName}
              />
            </>
          )}

          {fondoData && !loadingData && fondoData.cartera.length === 0 && !fondoData.error && (
            <div className="flex items-center justify-center h-64 card">
              <p style={{ color: "#64748B" }}>No portfolio data found for this fund</p>
            </div>
          )}
        </>
      )}

      {/* ── Attribution tab ───────────────────────────────────────────────────── */}
      {activeTab === "attribution" && (
        <PerformanceAttribution
          fundId={FUND_ATTR_MAP[selectedFundName]}
          displayName={selectedMeta?.displayName ?? selectedFundName}
        />
      )}
    </div>
  );
}
