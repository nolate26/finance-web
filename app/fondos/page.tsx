"use client";

import { useEffect, useState } from "react";
import CarteraChart from "@/components/fondos/CarteraChart";
import CarteraTable from "@/components/fondos/CarteraTable";
import { RefreshCw, Calendar, AlertCircle } from "lucide-react";

interface CarteraRow {
  company: string;
  portfolioPct: number;
  benchmarkPct: number;
  overweight: number;
  industria: string;
  analista: string;
  top_pick: string;
  observacion: string;
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
  // YYYY-MM-DD → Mar 13, 2026
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

  useEffect(() => {
    fetch("/api/fondos")
      .then((r) => r.json())
      .then((d: { fondos: FondoMeta[] }) => {
        setFondosList(d.fondos);
        // Auto-select latest Chile fund
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
            style={{ borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }}
          />
          <p className="text-sm font-mono" style={{ color: "#475569" }}>
            Loading funds...
          </p>
        </div>
      </div>
    );
  }

  const selectedMeta = fondosList.find((f) => f.id === selectedId);

  // Funds in current region
  const regionFunds = fondosList.filter((f) => f.region === region);

  // Unique fund names in this region (for quick-select buttons)
  const uniqueNames = [...new Set(regionFunds.map((f) => f.name))];

  // All snapshots of the currently selected fund (for history pills)
  const selectedFundName = selectedMeta?.name ?? "";
  const snapshots = fondosList
    .filter((f) => f.name === selectedFundName)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  // KPI stats
  const longPositions = fondoData?.cartera.filter((r) => r.portfolioPct > 0).length ?? 0;
  const overweightCount = fondoData?.cartera.filter((r) => r.overweight > 0).length ?? 0;
  const underweightCount = fondoData?.cartera.filter((r) => r.overweight < 0).length ?? 0;
  const totalWeight = fondoData?.cartera.reduce((s, r) => s + r.portfolioPct, 0) ?? 0;

  function selectFund(name: string) {
    // Select latest snapshot for that fund
    const latest = fondosList
      .filter((f) => f.name === name)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (latest) setSelectedId(latest.id);
  }

  function switchRegion(r: "Chile" | "LATAM") {
    setRegion(r);
    // Auto-select latest fund in that region
    const regionList = fondosList.filter((f) => f.region === r);
    const latest = regionList.at(-1);
    if (latest) setSelectedId(latest.id);
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Funds</h1>
          <p className="text-xs mt-1" style={{ color: "#475569" }}>
            Portfolio composition &amp; deviation vs benchmark
          </p>
        </div>
        {selectedMeta && (
          <div className="flex items-center gap-2 text-xs font-mono" style={{ color: "#334155" }}>
            <RefreshCw size={12} />
            <span>Data as of {fmtDate(selectedMeta.date)}</span>
          </div>
        )}
      </div>

      {/* Region tabs: Chile | LATAM */}
      <div
        className="flex items-center gap-1 mb-4 p-1 rounded-lg"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(59,130,246,0.12)",
          width: "fit-content",
        }}
      >
        {(["Chile", "LATAM"] as const).map((r) => (
          <button
            key={r}
            onClick={() => switchRegion(r)}
            className="px-5 py-1.5 rounded-md text-sm font-semibold transition-all"
            style={{
              background: region === r ? "rgba(59,130,246,0.2)" : "transparent",
              color: region === r ? "#3B82F6" : "#475569",
              border: region === r ? "1px solid rgba(59,130,246,0.35)" : "1px solid transparent",
            }}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Fund quick-select buttons */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-medium" style={{ color: "#334155" }}>
          Fund:
        </span>
        {uniqueNames.map((name) => {
          const displayName =
            fondosList.find((f) => f.name === name)?.displayName ?? name;
          const isActive = selectedMeta?.name === name;
          return (
            <button
              key={name}
              onClick={() => selectFund(name)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: isActive ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.04)",
                color: isActive ? "#60A5FA" : "#64748B",
                border: `1px solid ${isActive ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.07)"}`,
              }}
            >
              {displayName}
            </button>
          );
        })}
      </div>

      {/* Snapshot history pills */}
      {snapshots.length > 1 && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="flex items-center gap-1 text-xs" style={{ color: "#334155" }}>
            <Calendar size={11} />
            History:
          </span>
          {snapshots.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className="px-2.5 py-1 rounded text-xs font-mono transition-all"
              style={{
                background:
                  selectedId === s.id ? "rgba(6,182,212,0.15)" : "rgba(255,255,255,0.03)",
                color: selectedId === s.id ? "#06B6D4" : "#475569",
                border: `1px solid ${selectedId === s.id ? "rgba(6,182,212,0.35)" : "rgba(255,255,255,0.06)"}`,
              }}
            >
              {fmtDate(s.date)}
            </button>
          ))}
        </div>
      )}

      {/* Error state */}
      {fondoData?.error && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-lg mb-5"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <AlertCircle size={16} style={{ color: "#EF4444" }} />
          <p className="text-sm" style={{ color: "#FCA5A5" }}>
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
              style={{ borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }}
            />
            <p className="text-sm font-mono" style={{ color: "#475569" }}>
              Loading {selectedMeta?.displayName}...
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      {fondoData && !loadingData && fondoData.cartera.length > 0 && (
        <>
          {/* KPI stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Active Positions", value: longPositions, suffix: "" },
              { label: "Total Weight", value: (totalWeight * 100).toFixed(1), suffix: "%" },
              {
                label: "Overweight",
                value: overweightCount,
                suffix: "",
                color: "#10B981",
              },
              {
                label: "Underweight",
                value: underweightCount,
                suffix: "",
                color: "#EF4444",
              },
            ].map(({ label, value, suffix, color }) => (
              <div key={label} className="card px-4 py-3">
                <div className="text-[11px]" style={{ color: "#475569" }}>
                  {label}
                </div>
                <div
                  className="text-2xl font-bold font-mono mt-1"
                  style={{ color: color ?? "#fff" }}
                >
                  {value}
                  <span
                    className="text-base font-normal"
                    style={{ color: "#475569" }}
                  >
                    {suffix}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Table — full width, on top */}
          <div className="mb-5">
            <CarteraTable
              cartera={fondoData.cartera}
              benchmark={fondoData.benchmark}
            />
          </div>

          {/* Chart — full width, below */}
          <CarteraChart
            cartera={fondoData.cartera}
            fondoName={`${fondoData.displayName} · ${fmtDate(fondoData.date)}`}
            benchmark={fondoData.benchmark}
          />
        </>
      )}

      {/* Empty state */}
      {fondoData && !loadingData && fondoData.cartera.length === 0 && !fondoData.error && (
        <div className="flex items-center justify-center h-64 card">
          <p style={{ color: "#475569" }}>No data found for this fund</p>
        </div>
      )}
    </div>
  );
}
