"use client";

import { useState } from "react";
import FlatAttributionPanel from "@/components/attribution/FlatAttributionPanel";
import SectorAttributionPanel from "@/components/attribution/SectorAttributionPanel";
import MatrixAttributionPanel from "@/components/attribution/MatrixAttributionPanel";
import BetaExposurePanel from "@/components/latam/BetaExposurePanel";
import { FONT_SECONDARY } from "@/lib/patriaTheme";

// ── Types ─────────────────────────────────────────────────────────────────────

// Top Picks salió de acá: vive en Analyst Estimates como "Top Picks LatAm/Brazil".
type ActiveTab = "beta-exposure" | "attribution";

// Planning salió de acá: es ruta de primer nivel (/planning, "Team Planning" en el navbar).
const TABS: { key: ActiveTab; label: string }[] = [
  { key: "beta-exposure", label: "Beta Exposure"     },
  { key: "attribution",   label: "Perf. Attribution" },
];

// ── Attribution section with sub-tabs ────────────────────────────────────────
type AttrMode = "flat" | "sector" | "matrix";

function AttributionSection() {
  const [mode, setMode] = useState<AttrMode>("flat");
  return (
    <div>
      {/* Sub-tab bar */}
      <div
        className="tab-rail"
        style={{
          display: "flex", gap: 2, marginBottom: 16,
          padding: "3px", borderRadius: 10,
          background: "rgba(13,13,56,0.04)",
          border: "1px solid rgba(13,13,56,0.08)",
          width: "fit-content",
        }}
      >
        {(
          [
            { key: "flat",   label: "By Asset (Flat Universe)"    },
            { key: "sector", label: "By Sector (GICS Multi-Layer)" },
            { key: "matrix", label: "Attribution Matrix"           },
          ] as { key: AttrMode; label: string }[]
        ).map(({ key, label }) => {
          const active = mode === key;
          return (
            <button
              key={key}
              onClick={() => setMode(key)}
              style={{
                padding: "5px 16px", borderRadius: 8, fontSize: 12,
                cursor: "pointer", transition: "all 0.15s",
                background: active ? "#FFFFFF"  : "transparent",
                color:      active ? "#0D0D38"  : "rgba(13,13,56,0.62)",
                border:     active ? "1px solid rgba(13,13,56,0.11)" : "1px solid transparent",
                boxShadow:  active ? "0 1px 3px rgba(13,13,56,0.09)" : "none",
                fontWeight: active ? 700 : 500,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {mode === "flat"   && <FlatAttributionPanel />}
      {mode === "sector" && <SectorAttributionPanel />}
      {mode === "matrix" && <MatrixAttributionPanel />}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LatAmPage() {
  // Arranca en la primera pestaña del array (Beta Exposure).
  const [activeTab, setActiveTab] = useState<ActiveTab>(TABS[0].key);

  return (
    <div className="max-w-[1800px] mx-auto page-shell">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0D0D38", letterSpacing: "-0.035em", lineHeight: 1.15, margin: 0 }}>
            LatAm Equities
          </h1>
          <p style={{ fontSize: 12, marginTop: 5, color: "rgba(13,13,56,0.62)", fontWeight: 500, letterSpacing: "0.01em" }}>
            Latin American equity universe · AGF coverage
          </p>
        </div>
      </div>

      {/* ── Sub-navigation tabs ──────────────────────────────────────────────── */}
      <div
        className="tab-rail flex items-center mb-5"
        style={{
          gap: 2, padding: "3px", borderRadius: 10,
          background: "rgba(13,13,56,0.04)",
          border:     "1px solid rgba(13,13,56,0.08)",
          width:      "fit-content",
        }}
      >
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="px-5 py-1.5 rounded-lg text-sm transition-all"
            style={{
              background: activeTab === key ? "#FFFFFF"  : "transparent",
              color:      activeTab === key ? "#0D0D38"  : "rgba(13,13,56,0.62)",
              border:     activeTab === key ? "1px solid rgba(13,13,56,0.11)" : "1px solid transparent",
              boxShadow:  activeTab === key ? "0 1px 3px rgba(13,13,56,0.09)" : "none",
              fontWeight: activeTab === key ? 700 : 500,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Performance Attribution ──────────────────────────────────────────── */}
      {activeTab === "attribution" && <AttributionSection />}

      {/* ── Beta / Factor Exposure ───────────────────────────────────────────── */}
      {activeTab === "beta-exposure" && (
        <div>
          <p style={{ fontSize: 12, color: "rgba(13,13,56,0.62)", marginBottom: 14, fontFamily: FONT_SECONDARY }}>
            Portfolio vs benchmark exposure to risk factors — weighted sum-product of position betas.
          </p>
          <BetaExposurePanel />
        </div>
      )}
    </div>
  );
}
