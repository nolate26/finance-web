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
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em" }}>
            Chile Equities
          </h1>
          <p style={{ fontSize: 12, marginTop: 4, color: "#64748B" }}>
            Chilean Equity Universe — AGF Coverage
          </p>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div
        className="flex items-center gap-1 mb-5 p-1 rounded-lg"
        style={{
          background: "rgba(15,23,42,0.04)",
          border: "1px solid rgba(15,23,42,0.08)",
          width: "fit-content",
        }}
      >
        {(["stock-selection", "projections", "top-picks", "active-decisions"] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-5 py-1.5 rounded-md text-sm font-semibold transition-all"
            style={{
              background: activeTab === tab ? "rgba(43,92,224,0.10)" : "transparent",
              color: activeTab === tab ? "#1E3A8A" : "#64748B",
              border: activeTab === tab ? "1px solid rgba(43,92,224,0.25)" : "1px solid transparent",
            }}
          >
            {tab === "stock-selection" ? "Stock Selection" : tab === "projections" ? "Projections" : tab === "top-picks" ? "Top Picks" : "Active Decisions"}
          </button>
        ))}
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
