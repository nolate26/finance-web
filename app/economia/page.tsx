"use client";

import { useEffect, useState } from "react";
import ValuationTable from "@/components/economia/ValuationTable";
import PerformanceTable from "@/components/economia/PerformanceTable";
import PEHistoryChart from "@/components/economia/PEHistoryChart";
import MacroPanel from "@/components/economia/MacroPanel";
import CommoditiesPanel from "@/components/economia/CommoditiesPanel";
import { Calendar } from "lucide-react";

interface EconomiaData {
  resumenPE: Record<string, unknown>[];
  tablaMaestra: Record<string, unknown>[];
  allHistoriaPE: Record<string, unknown>[];
  updateDate: string | null;
}

interface MacroData {
  annual: Record<string, unknown>[];
  quarterly: Record<string, unknown>[];
  revisions: Record<string, unknown>[];
  tenYearHistory: Record<string, unknown>[];
}

interface CommoditiesData {
  historical: {
    meta: Record<string, unknown>[];
    series: Record<string, unknown>[];
  };
  projections: Record<string, unknown>[];
}

type View = "valuations" | "macro" | "commodities";

const VIEWS: { key: View; label: string }[] = [
  { key: "valuations", label: "Valuations" },
  { key: "macro", label: "Macro" },
  { key: "commodities", label: "Commodities" },
];

// Slot accent colors matching ValuationTable badge colors
const SLOT_COLORS = ["#2B5CE0", "#D97706", "#059669"];

function formatUpdateDate(d: string): string {
  const [datePart, timePart] = d.split(" ");
  const [y, m, day] = datePart.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const hhmm = timePart?.slice(0, 5) ?? "";
  return `${months[parseInt(m, 10) - 1]} ${parseInt(day, 10)}, ${y}${hhmm ? ` · ${hhmm}` : ""}`;
}

export default function EconomiaPage() {
  const [data, setData] = useState<EconomiaData | null>(null);
  const [macroData, setMacroData] = useState<MacroData | null>(null);
  const [commoditiesData, setCommoditiesData] = useState<CommoditiesData | null>(null);
  const [loading, setLoading] = useState(true);

  // 2 active indices — slot 0 controlled by table click, slot 1 by dropdown
  const [selectedIndices, setSelectedIndices] = useState<[string, string]>([
    "MSCI EM LatAm", "IPSA (Chile)",
  ]);

  const [view, setView] = useState<View>("valuations");

  useEffect(() => {
    Promise.all([
      fetch("/api/economia").then((r) => r.json()),
      fetch("/api/macro").then((r) => r.json()),
      fetch("/api/commodities").then((r) => r.json()),
    ])
      .then(([econ, macro, comm]) => {
        setData(econ as EconomiaData);
        setMacroData(macro as MacroData);
        setCommoditiesData(comm as CommoditiesData);
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
            style={{ borderColor: "rgba(43,92,224,0.15)", borderTopColor: "#2B5CE0" }}
          />
          <p className="text-sm font-mono" style={{ color: "#64748B" }}>
            Loading market data...
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <p style={{ color: "#DC2626" }}>Error loading market data</p>
      </div>
    );
  }

  // All available index names for secondary chart dropdowns
  const allIndices = (data.resumenPE as { Index: string }[]).map((r) => r.Index);

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "#0F172A" }}>Market</h1>
          <p className="text-xs mt-1" style={{ color: "#64748B" }}>
            Global valuations, macro projections &amp; commodity prices
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {data.updateDate && (
            <div className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "#94A3B8" }}>
              <Calendar size={11} />
              <span>{formatUpdateDate(data.updateDate)}</span>
            </div>
          )}
          <span className="text-xs" style={{ color: "#CBD5E1" }}>Fuente: Bloomberg</span>
        </div>
      </div>

      {/* Sub-tab nav */}
      <div
        className="flex items-center gap-1 mb-6 p-1 rounded-lg"
        style={{
          background: "rgba(15,23,42,0.04)",
          border: "1px solid rgba(15,23,42,0.08)",
          width: "fit-content",
        }}
      >
        {VIEWS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className="px-5 py-1.5 rounded-md text-sm font-semibold transition-all"
            style={{
              background: view === key ? "rgba(43,92,224,0.10)" : "transparent",
              color: view === key ? "#1E3A8A" : "#64748B",
              border: view === key ? "1px solid rgba(43,92,224,0.25)" : "1px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── VALUATIONS ──────────────────────────────────────────────────────── */}
      {view === "valuations" && (
        <>
          {/* Table + 3 stacked charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
            <ValuationTable
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data={data.resumenPE as any}
              selectedIndices={selectedIndices}
              onSelectIndex={(idx) =>
                setSelectedIndices([idx, selectedIndices[1]])
              }
            />

            {/* 2 charts stacked */}
            <div className="flex flex-col gap-4">
              {/* Chart 1 — controlled by table click */}
              <PEHistoryChart
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                allHistory={data.allHistoriaPE as any}
                selectedIndex={selectedIndices[0]}
                accentColor={SLOT_COLORS[0]}
              />
              {/* Chart 2 — prominent dropdown selector */}
              <PEHistoryChart
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                allHistory={data.allHistoriaPE as any}
                selectedIndex={selectedIndices[1]}
                availableIndices={allIndices}
                onIndexChange={(idx) =>
                  setSelectedIndices([selectedIndices[0], idx])
                }
                accentColor={SLOT_COLORS[1]}
              />
            </div>
          </div>

          <PerformanceTable
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={data.tablaMaestra as any}
          />

          {/* Bloomberg footer */}
          <div className="flex justify-end mt-2">
            <span className="text-xs" style={{ color: "#CBD5E1" }}>Fuente: Bloomberg</span>
          </div>
        </>
      )}

      {/* ── MACRO ────────────────────────────────────────────────────────────── */}
      {view === "macro" && macroData && (
        <MacroPanel
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          annual={macroData.annual as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          revisions={macroData.revisions as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tenYearHistory={macroData.tenYearHistory as any}
        />
      )}
      {view === "macro" && !macroData && (
        <div className="flex items-center justify-center h-48">
          <p style={{ color: "#64748B" }}>Macro data unavailable</p>
        </div>
      )}

      {/* ── COMMODITIES ──────────────────────────────────────────────────────── */}
      {view === "commodities" && commoditiesData && (
        <CommoditiesPanel
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          historical={commoditiesData.historical as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          projections={commoditiesData.projections as any}
        />
      )}
      {view === "commodities" && !commoditiesData && (
        <div className="flex items-center justify-center h-48">
          <p style={{ color: "#64748B" }}>Commodities data unavailable</p>
        </div>
      )}
    </div>
  );
}
