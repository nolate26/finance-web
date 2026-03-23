"use client";

import { useEffect, useState } from "react";
import CarteraChart from "@/components/fondos/CarteraChart";
import CarteraTable from "@/components/fondos/CarteraTable";
import FundReturnsTable from "@/components/fondos/FundReturnsTable";
import { RefreshCw, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";

interface CarteraRow {
  company: string;
  portfolioPct: number;
  benchmarkPct: number;
  overweight: number;
  sector: string;
  delta1W: number | null;
  delta1M: number | null;
}

interface ReturnRow {
  clase: string;
  ytd: number | null;
  oneYear: number | null;
  threeYears: number | null;
  fiveYears: number | null;
  tenYears: number | null;
  sinceInception: number | null;
  moic: number | null;
  alpha: number | null;
  stdDev3Y: number | null;
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
  returns: ReturnRow[];
  reportDate: string | null;
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

  useEffect(() => {
    fetch("/api/fondos")
      .then((r) => r.json())
      .then((d: { fondos: FondoMeta[] }) => {
        setFondosList(d.fondos);
        const chileFunds = d.fondos.filter((f) => f.region === "Chile");
        const latest = chileFunds.at(-1);
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
  const uniqueNames = [...new Set(regionFunds.map((f) => f.name))];
  const selectedFundName = selectedMeta?.name ?? "";
  const snapshots = fondosList
    .filter((f) => f.name === selectedFundName)
    .sort((a, b) => b.date.localeCompare(a.date));

  // Unique sectors in this portfolio
  const allSectors = fondoData
    ? ["All", ...Array.from(new Set(fondoData.cartera.map((r) => r.sector).filter(Boolean))).sort()]
    : ["All"];

  // Filtered cartera
  const filteredCartera = fondoData
    ? sectorFilter === "All"
      ? fondoData.cartera
      : fondoData.cartera.filter((r) => r.sector === sectorFilter)
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
    const regionList = fondosList.filter((f) => f.region === r);
    const latest = regionList.at(-1);
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

      {/* Content */}
      {fondoData && !loadingData && fondoData.cartera.length > 0 && (
        <>
          {/* Returns table — top */}
          <FundReturnsTable
            returns={fondoData.returns}
            fundName={fondoData.displayName}
            reportDate={fondoData.reportDate}
          />

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

          {/* Sector filter */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs font-medium" style={{ color: "#94A3B8" }}>Sector:</span>
            {allSectors.map((s) => {
              const isActive = sectorFilter === s;
              return (
                <button
                  key={s}
                  onClick={() => setSectorFilter(s)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: isActive ? "rgba(43,92,224,0.10)" : "rgba(15,23,42,0.04)",
                    color: isActive ? "#2B5CE0" : "#64748B",
                    border: `1px solid ${isActive ? "rgba(43,92,224,0.25)" : "rgba(15,23,42,0.08)"}`,
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>

          {/* Table + Chart side-by-side on desktop */}
          <div className="flex flex-col md:flex-row items-stretch gap-4 md:gap-6">
            <div className="w-full md:w-1/2 md:h-full overflow-x-auto">
              <CarteraTable
                cartera={filteredCartera}
                benchmark={fondoData.benchmark}
                fundName={selectedFundName}
              />
            </div>
            <div className="w-full md:w-1/2">
              <CarteraChart
                cartera={filteredCartera}
                fondoName={`${fondoData.displayName} · ${fmtDate(fondoData.date)}`}
                benchmark={fondoData.benchmark}
              />
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {fondoData && !loadingData && fondoData.cartera.length === 0 && !fondoData.error && (
        <div className="flex items-center justify-center h-64 card">
          <p style={{ color: "#64748B" }}>No data found for this fund</p>
        </div>
      )}
    </div>
  );
}
