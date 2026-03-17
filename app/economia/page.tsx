"use client";

import { useEffect, useState } from "react";
import ValuationTable from "@/components/economia/ValuationTable";
import PerformanceTable from "@/components/economia/PerformanceTable";
import PEHistoryChart from "@/components/economia/PEHistoryChart";
import { RefreshCw } from "lucide-react";

interface EconomiaData {
  resumenPE: Record<string, unknown>[];
  tablaMaestra: Record<string, unknown>[];
  allHistoriaPE: Record<string, unknown>[];
}

export default function EconomiaPage() {
  const [data, setData] = useState<EconomiaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState("S&P 500");
  const [period, setPeriod] = useState<"1Y" | "3Y" | "5Y">("1Y");

  useEffect(() => {
    fetch("/api/economia")
      .then(r => r.json())
      .then((d: EconomiaData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3B82F6" }}
          />
          <p className="text-sm font-mono" style={{ color: "#475569" }}>Cargando datos...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <p style={{ color: "#EF4444" }}>Error al cargar datos económicos</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Economía Global</h1>
          <p className="text-xs mt-1" style={{ color: "#475569" }}>
            Valuación P/E, retornos por período y múltiplos de mercado
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono" style={{ color: "#334155" }}>
          <RefreshCw size={12} />
          <span>Datos al {new Date().toLocaleDateString("es-CL")}</span>
        </div>
      </div>

      {/* Summary stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "S&P 500 P/E", value: data.resumenPE.find((r: Record<string, unknown>) => r.Index === "S&P 500")?.[`Today (P/E)`], suffix: "x" },
          { label: "Nasdaq 100 P/E", value: data.resumenPE.find((r: Record<string, unknown>) => r.Index === "Nasdaq 100")?.[`Today (P/E)`], suffix: "x" },
          { label: "IPSA P/E", value: data.resumenPE.find((r: Record<string, unknown>) => r.Index === "IPSA")?.[`Today (P/E)`], suffix: "x" },
          { label: "Nikkei P/E", value: data.resumenPE.find((r: Record<string, unknown>) => r.Index === "Nikkei 225")?.[`Today (P/E)`], suffix: "x" },
        ].map(({ label, value, suffix }) => (
          <div key={label} className="card px-4 py-3">
            <div className="text-[11px]" style={{ color: "#475569" }}>{label}</div>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              {typeof value === "number" ? value.toFixed(1) : "—"}<span className="text-base font-normal" style={{ color: "#475569" }}>{suffix}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
        {/* Valuation table - left */}
        <ValuationTable
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data={data.resumenPE as any}
          selectedIndex={selectedIndex}
          onSelectIndex={setSelectedIndex}
        />

        {/* History chart - right */}
        <PEHistoryChart
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          allHistory={data.allHistoriaPE as any}
          selectedIndex={selectedIndex}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          resumen={data.resumenPE as any}
          period={period}
          onPeriodChange={setPeriod}
        />
      </div>

      {/* Performance & multiples table */}
      <PerformanceTable
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data={data.tablaMaestra as any}
      />
    </div>
  );
}
