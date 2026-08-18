"use client";

import { useState } from "react";
import TopPicksForm from "@/components/top-picks/TopPicksForm";
import ActiveDecisions from "@/components/chile/ActiveDecisions";
import StockSelectionV1 from "@/components/chile/StockSelectionV1";
import ProjectionsPage from "@/app/projections/page";

type ActiveTab = "stock-selection" | "projections" | "top-picks" | "active-decisions";

export default function ChilePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("stock-selection");

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0D0D38", letterSpacing: "-0.035em", lineHeight: 1.15, margin: 0 }}>
            Chile Equities
          </h1>
          <p style={{ fontSize: 12, marginTop: 5, color: "rgba(13,13,56,0.62)", fontWeight: 500, letterSpacing: "0.01em" }}>
            Chilean equity universe · AGF coverage
          </p>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div
        className="flex items-center mb-5"
        style={{
          gap: 2, padding: "3px", borderRadius: 10,
          background: "rgba(13,13,56,0.04)",
          border: "1px solid rgba(13,13,56,0.08)",
          width: "fit-content",
        }}
      >
        {(["stock-selection", "projections", "top-picks", "active-decisions"] as ActiveTab[]).map((tab) => {
          const active = activeTab === tab;
          const label = tab === "stock-selection" ? "Stock Selection"
                      : tab === "projections"     ? "Projections"
                      : tab === "top-picks"       ? "Top Picks"
                      :                             "Active Decisions";
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-5 py-1.5 rounded-lg text-sm transition-all"
              style={{
                background: active ? "#FFFFFF"  : "transparent",
                color:      active ? "#0D0D38"  : "rgba(13,13,56,0.62)",
                border:     active ? "1px solid rgba(13,13,56,0.11)" : "1px solid transparent",
                boxShadow:  active ? "0 1px 3px rgba(13,13,56,0.09)" : "none",
                fontWeight: active ? 700 : 500,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Stock Selection ─────────────────────────────────────────────────── */}
      {activeTab === "stock-selection" && <StockSelectionV1 />}

      {/* ── Projections ─────────────────────────────────────────────────────── */}
      {activeTab === "projections" && <ProjectionsPage />}

      {/* ── Top Picks ───────────────────────────────────────────────────────── */}
      {activeTab === "top-picks" && <TopPicksForm defaultRegion="CHILE" />}

      {/* ── Active Decisions ────────────────────────────────────────────────── */}
      {activeTab === "active-decisions" && <ActiveDecisions />}
    </div>
  );
}
