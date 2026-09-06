"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import QuantModelTable from "@/components/quant/QuantModelTable";
import MomentumTable from "@/components/quant/MomentumTable";
import { FONT_SECONDARY } from "@/lib/patriaTheme";

type View = "model" | "momentum";

const VIEWS: { key: View; label: string; sub: string; accent: string }[] = [
  { key: "model",    label: "Multi-Factor Model", sub: "Value · Quality ranking & portfolio signals", accent: "#2044DC" },
  { key: "momentum", label: "Price Momentum",     sub: "Pure price-momentum ranking",                  accent: "#001EAF" },
];

export default function QuantAnalysisPanel() {
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>("model");

  // Honor ?view=momentum (e.g. coming from the scorecard cards)
  useEffect(() => {
    const v = searchParams.get("view");
    if (v === "momentum" || v === "model") setView(v);
  }, [searchParams]);

  const active = VIEWS.find(v => v.key === view) ?? VIEWS[0];

  return (
    <div>
      {/* Spin keyframe (used by the tables' loading spinners) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <p style={{ fontSize: 12, color: "rgba(13,13,56,0.62)", marginBottom: 14, fontFamily: FONT_SECONDARY }}>
        {active.sub} · LatAm Equities
      </p>

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
