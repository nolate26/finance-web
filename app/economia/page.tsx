"use client";

import { useEffect, useState } from "react";
import ValuationTable from "@/components/economia/ValuationTable";
import PerformanceTable from "@/components/economia/PerformanceTable";
import PEHistoryChart from "@/components/economia/PEHistoryChart";
import MacroPanel from "@/components/economia/MacroPanel";
import CommoditiesPanel from "@/components/economia/CommoditiesPanel";
import { RefreshCw } from "lucide-react";

interface EconomiaData {
  resumenPE: Record<string, unknown>[];
  tablaMaestra: Record<string, unknown>[];
  allHistoriaPE: Record<string, unknown>[];
}

interface MacroData {
  annual: Record<string, unknown>[];
  quarterly: Record<string, unknown>[];
  commodities: Record<string, unknown>[];
}

type View = "valuations" | "macro" | "commodities";

const VIEWS: { key: View; label: string }[] = [
  { key: "valuations", label: "Valuations" },
  { key: "macro", label: "Macro" },
  { key: "commodities", label: "Commodities" },
];

export default function EconomiaPage() {
  const [data, setData] = useState<EconomiaData | null>(null);
  const [macroData, setMacroData] = useState<MacroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState("S&P 500");
  const [period, setPeriod] = useState<"1Y" | "3Y" | "5Y">("1Y");
  const [view, setView] = useState<View>("valuations");

  useEffect(() => {
    Promise.all([
      fetch("/api/economia").then((r) => r.json()),
      fetch("/api/macro").then((r) => r.json()),
    ])
      .then(([econ, macro]) => {
        setData(econ as EconomiaData);
        setMacroData(macro as MacroData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(43,92,224,0.2)", borderTopColor: "#2B5CE0" }}
          />
          <p className="text-sm font-mono" style={{ color: "#475569" }}>
            Loading market data...
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <p style={{ color: "#EF4444" }}>Error loading market data</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Market</h1>
          <p className="text-xs mt-1" style={{ color: "#475569" }}>
            Global valuations, macro projections &amp; commodity prices
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono" style={{ color: "#2D3E6E" }}>
          <RefreshCw size={12} />
          <span>
            {new Date().toLocaleDateString("en-US", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      {/* Sub-tab nav */}
      <div
        className="flex items-center gap-1 mb-6 p-1 rounded-lg"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(43,92,224,0.12)",
          width: "fit-content",
        }}
      >
        {VIEWS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className="px-5 py-1.5 rounded-md text-sm font-semibold transition-all"
            style={{
              background: view === key ? "rgba(43,92,224,0.22)" : "transparent",
              color: view === key ? "#FFFFFF" : "#7A8FAD",
              border:
                view === key
                  ? "1px solid rgba(80,128,255,0.42)"
                  : "1px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── VALUATIONS ──────────────────────────────────────────────────────── */}
      {view === "valuations" && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              {
                label: "S&P 500 P/E",
                value: data.resumenPE.find(
                  (r: Record<string, unknown>) => r.Index === "S&P 500"
                )?.[`Today (P/E)`],
                suffix: "x",
              },
              {
                label: "Nasdaq 100 P/E",
                value: data.resumenPE.find(
                  (r: Record<string, unknown>) => r.Index === "Nasdaq 100"
                )?.[`Today (P/E)`],
                suffix: "x",
              },
              {
                label: "IPSA P/E",
                value: data.resumenPE.find(
                  (r: Record<string, unknown>) => r.Index === "IPSA"
                )?.[`Today (P/E)`],
                suffix: "x",
              },
              {
                label: "Nikkei P/E",
                value: data.resumenPE.find(
                  (r: Record<string, unknown>) => r.Index === "Nikkei 225"
                )?.[`Today (P/E)`],
                suffix: "x",
              },
            ].map(({ label, value, suffix }) => (
              <div key={label} className="card px-4 py-3">
                <div className="text-[11px]" style={{ color: "#475569" }}>
                  {label}
                </div>
                <div className="text-2xl font-bold font-mono text-white mt-1">
                  {typeof value === "number" ? value.toFixed(1) : "—"}
                  <span className="text-base font-normal" style={{ color: "#475569" }}>
                    {suffix}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
            <ValuationTable
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data={data.resumenPE as any}
              selectedIndex={selectedIndex}
              onSelectIndex={setSelectedIndex}
            />
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

          <PerformanceTable
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={data.tablaMaestra as any}
          />
        </>
      )}

      {/* ── MACRO ────────────────────────────────────────────────────────────── */}
      {view === "macro" && macroData && (
        <MacroPanel
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          annual={macroData.annual as any}
        />
      )}
      {view === "macro" && !macroData && (
        <div className="flex items-center justify-center h-48">
          <p style={{ color: "#475569" }}>Macro data unavailable</p>
        </div>
      )}

      {/* ── COMMODITIES ──────────────────────────────────────────────────────── */}
      {view === "commodities" && macroData && (
        <CommoditiesPanel
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          commodities={macroData.commodities as any}
        />
      )}
      {view === "commodities" && !macroData && (
        <div className="flex items-center justify-center h-48">
          <p style={{ color: "#475569" }}>Commodities data unavailable</p>
        </div>
      )}
    </div>
  );
}
