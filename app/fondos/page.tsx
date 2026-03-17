"use client";

import { useEffect, useState } from "react";
import CarteraChart from "@/components/fondos/CarteraChart";
import CarteraTable from "@/components/fondos/CarteraTable";
import { ChevronDown, RefreshCw, AlertCircle } from "lucide-react";

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

interface FondoData {
  id: string;
  name: string;
  date: string;
  benchmark: string;
  cartera: CarteraRow[];
  error?: string;
}

interface FondoMeta {
  id: string;
  name: string;
  date: string;
}

export default function FondosPage() {
  const [fondosList, setFondosList] = useState<FondoMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [fondoData, setFondoData] = useState<FondoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Load available fondos
  useEffect(() => {
    fetch("/api/fondos")
      .then(r => r.json())
      .then((d: { fondos: FondoMeta[] }) => {
        setFondosList(d.fondos);
        if (d.fondos.length > 0) setSelectedId(d.fondos[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load fondo data when selection changes
  useEffect(() => {
    if (!selectedId) return;
    setLoadingData(true);
    setFondoData(null);
    fetch(`/api/fondos?fondo=${encodeURIComponent(selectedId)}`)
      .then(r => r.json())
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
          <div className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }}
          />
          <p className="text-sm font-mono" style={{ color: "#475569" }}>Cargando fondos...</p>
        </div>
      </div>
    );
  }

  const selectedMeta = fondosList.find(f => f.id === selectedId);

  // Summary stats
  const longPositions = fondoData?.cartera.filter(r => r.portfolioPct > 0).length ?? 0;
  const overweightCount = fondoData?.cartera.filter(r => r.overweight > 0).length ?? 0;
  const underweightCount = fondoData?.cartera.filter(r => r.overweight < 0).length ?? 0;
  const totalWeight = fondoData?.cartera.reduce((s, r) => s + r.portfolioPct, 0) ?? 0;

  // Group fondos by name for the quick-switch buttons (show latest per fund)
  const fundNames = [...new Set(fondosList.map(f => f.name))];

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Fondos</h1>
          <p className="text-xs mt-1" style={{ color: "#475569" }}>
            Composición y desviación vs benchmark IPSA
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono" style={{ color: "#334155" }}>
          <RefreshCw size={12} />
          <span>{selectedMeta ? `Datos al ${selectedMeta.date}` : "—"}</span>
        </div>
      </div>

      {/* Fund selector */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="text-xs font-medium" style={{ color: "#475569" }}>Seleccionar fondo:</div>
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(v => !v)}
            className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: "rgba(59,130,246,0.12)",
              border: "1px solid rgba(59,130,246,0.3)",
              color: "#fff",
              minWidth: 200,
            }}
          >
            <span className="flex-1 text-left">
              {selectedMeta ? `${selectedMeta.name}` : "—"}
            </span>
            {selectedMeta && (
              <span className="text-xs font-mono" style={{ color: "#475569" }}>{selectedMeta.date}</span>
            )}
            <ChevronDown size={14} style={{ color: "#3B82F6" }} />
          </button>

          {dropdownOpen && (
            <div
              className="absolute left-0 top-full mt-1 rounded-lg overflow-hidden z-50 w-72"
              style={{
                background: "#0A1628",
                border: "1px solid rgba(59,130,246,0.2)",
                boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
              }}
            >
              {fondosList.map(f => (
                <button
                  key={f.id}
                  onClick={() => { setSelectedId(f.id); setDropdownOpen(false); }}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm transition-colors text-left"
                  style={{
                    background: selectedId === f.id ? "rgba(59,130,246,0.12)" : "transparent",
                    color: selectedId === f.id ? "#fff" : "#94A3B8",
                    borderBottom: "1px solid rgba(59,130,246,0.08)",
                  }}
                  onMouseEnter={e => {
                    if (selectedId !== f.id)
                      (e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.06)";
                  }}
                  onMouseLeave={e => {
                    if (selectedId !== f.id)
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <span className="font-semibold">{f.name}</span>
                  <span className="text-xs font-mono" style={{ color: "#334155" }}>{f.date}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick switch buttons — one per unique fund name (latest version) */}
        <div className="flex gap-1 flex-wrap">
          {fundNames.map(name => {
            // Pick the latest entry for this fund name
            const latest = fondosList.filter(f => f.name === name).at(-1)!;
            const isActive = selectedMeta?.name === name;
            return (
              <button
                key={name}
                onClick={() => setSelectedId(latest.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: isActive ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.03)",
                  color: isActive ? "#3B82F6" : "#475569",
                  border: `1px solid ${isActive ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error state */}
      {fondoData?.error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg mb-5"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <AlertCircle size={16} style={{ color: "#EF4444" }} />
          <p className="text-sm" style={{ color: "#FCA5A5" }}>
            No se pudo leer el archivo del fondo {fondoData.name}. El archivo puede estar en formato incompatible (.xls).
          </p>
        </div>
      )}

      {/* Loading state */}
      {loadingData && (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }}
            />
            <p className="text-sm font-mono" style={{ color: "#475569" }}>
              Procesando {selectedMeta?.name}...
            </p>
          </div>
        </div>
      )}

      {/* Stats strip */}
      {fondoData && !loadingData && fondoData.cartera.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Posiciones activas", value: longPositions, suffix: "" },
              { label: "Peso total", value: (totalWeight * 100).toFixed(1), suffix: "%" },
              { label: "Sobreponderadas", value: overweightCount, suffix: "", color: "#10B981" },
              { label: "Subponderadas", value: underweightCount, suffix: "", color: "#EF4444" },
            ].map(({ label, value, suffix, color }) => (
              <div key={label} className="card px-4 py-3">
                <div className="text-[11px]" style={{ color: "#475569" }}>{label}</div>
                <div className="text-2xl font-bold font-mono mt-1"
                  style={{ color: color ?? "#fff" }}
                >
                  {value}<span className="text-base font-normal" style={{ color: "#475569" }}>{suffix}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Chart + Table */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <CarteraChart
              cartera={fondoData.cartera}
              fondoName={`${fondoData.name} (${fondoData.date})`}
              benchmark={fondoData.benchmark}
            />
            <CarteraTable cartera={fondoData.cartera} benchmark={fondoData.benchmark} />
          </div>
        </>
      )}

      {/* Empty state after load */}
      {fondoData && !loadingData && fondoData.cartera.length === 0 && !fondoData.error && (
        <div className="flex items-center justify-center h-64 card">
          <p style={{ color: "#475569" }}>No se encontraron datos en la hoja &apos;Cartera vs Benchmark&apos;</p>
        </div>
      )}
    </div>
  );
}
