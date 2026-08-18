"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import QuantModelTable from "@/components/quant/QuantModelTable";
import MomentumTable from "@/components/quant/MomentumTable";

type View = "model" | "momentum";

const VIEWS: { key: View; label: string; sub: string; accent: string }[] = [
  { key: "model",    label: "Multi-Factor Model", sub: "Value · Quality ranking & portfolio signals", accent: "#2044DC" },
  { key: "momentum", label: "Price Momentum",     sub: "Pure price-momentum ranking",                  accent: "#001EAF" },
];

function QuantAnalysisContent() {
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>("model");

  // Honor ?view=momentum (e.g. coming from the scorecard cards)
  useEffect(() => {
    const v = searchParams.get("view");
    if (v === "momentum" || v === "model") setView(v);
  }, [searchParams]);

  const active = VIEWS.find(v => v.key === view) ?? VIEWS[0];

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Spin keyframe (used by the tables' loading spinners) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0D0D38", letterSpacing: "-0.035em", lineHeight: 1.15, margin: 0 }}>
          Quant Analysis
        </h1>
        <p style={{ fontSize: 12, color: "rgba(13,13,56,0.62)", marginTop: 5, fontWeight: 500, letterSpacing: "0.01em" }}>
          {active.sub} · LatAm Equities
        </p>
      </div>

      {/* View switcher (segmented control) */}
      <div style={{ display: "inline-flex", background: "rgba(13,13,56,0.04)", border: "1px solid rgba(13,13,56,0.08)", borderRadius: 10, padding: 3, marginBottom: 24 }}>
        {VIEWS.map(v => {
          const isActive = view === v.key;
          return (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              style={{
                padding: "7px 18px", fontSize: 12.5, fontWeight: isActive ? 700 : 600,
                color: isActive ? "#FFFFFF" : "rgba(13,13,56,0.62)",
                background: isActive ? v.accent : "transparent",
                border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap",
                transition: "all 0.12s",
                boxShadow: isActive ? `0 1px 3px ${v.accent}55` : "none",
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {view === "model"    && <QuantModelTable />}
      {view === "momentum" && <MomentumTable />}
    </div>
  );
}

export default function QuantAnalysisPage() {
  return (
    <Suspense>
      <QuantAnalysisContent />
    </Suspense>
  );
}
