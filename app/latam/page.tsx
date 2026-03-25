"use client";

import { useState } from "react";

type ActiveTab = "stock-selection" | "top-picks";

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 320 }}>
      <div
        style={{
          textAlign: "center",
          padding: "40px 48px",
          borderRadius: 14,
          background: "rgba(43,92,224,0.04)",
          border: "1px solid rgba(43,92,224,0.12)",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.4 }}>🌎</div>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#1E3A8A", marginBottom: 6 }}>
          {label}
        </p>
        <p style={{ fontSize: 13, color: "#64748B" }}>Module coming soon...</p>
      </div>
    </div>
  );
}

export default function LatAmPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("stock-selection");

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em" }}>
          LatAm Equities
        </h1>
        <p style={{ fontSize: 12, marginTop: 4, color: "#64748B" }}>
          Latin American Equity Universe — AGF Coverage
        </p>
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
        {(["stock-selection", "top-picks"] as ActiveTab[]).map((tab) => (
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
            {tab === "stock-selection" ? "Stock Selection" : "Top Picks"}
          </button>
        ))}
      </div>

      {activeTab === "stock-selection" && (
        <ComingSoon label="LatAm Stock Selection" />
      )}
      {activeTab === "top-picks" && (
        <ComingSoon label="LatAm Top Picks" />
      )}
    </div>
  );
}
