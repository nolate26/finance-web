"use client";

import { useState } from "react";

type QuantTab = "momentum" | "kpi" | "resources";

const TABS: { key: QuantTab; label: string }[] = [
  { key: "momentum", label: "Momentum Model" },
  { key: "kpi", label: "KPI Matrix" },
  { key: "resources", label: "Resources" },
];

export default function QuantPage() {
  const [activeTab, setActiveTab] = useState<QuantTab>("momentum");

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em" }}>
          Quant &amp; Signals
        </h1>
        <p style={{ fontSize: 12, marginTop: 4, color: "#64748B" }}>
          Quantitative models, factor signals, and systematic research tools
        </p>
      </div>

      {/* Tab nav */}
      <div
        className="flex items-center gap-1 mb-6 p-1 rounded-lg"
        style={{
          background: "rgba(15,23,42,0.04)",
          border: "1px solid rgba(15,23,42,0.08)",
          width: "fit-content",
        }}
      >
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="px-5 py-1.5 rounded-md text-sm font-semibold transition-all"
            style={{
              background: activeTab === key ? "rgba(43,92,224,0.10)" : "transparent",
              color: activeTab === key ? "#1E3A8A" : "#64748B",
              border: activeTab === key ? "1px solid rgba(43,92,224,0.25)" : "1px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content placeholders */}
      {activeTab === "momentum" && (
        <div
          className="card flex flex-col items-center justify-center gap-3"
          style={{ minHeight: 320 }}
        >
          <div
            style={{
              width: 48, height: 48, borderRadius: 12,
              background: "rgba(43,92,224,0.08)",
              border: "1px solid rgba(43,92,224,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22,
            }}
          >
            📈
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Momentum Model</p>
          <p style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", maxWidth: 360 }}>
            Cross-sectional momentum scores and signal ranking across the Chilean equity universe.
            Data pipeline coming soon.
          </p>
        </div>
      )}

      {activeTab === "kpi" && (
        <div
          className="card flex flex-col items-center justify-center gap-3"
          style={{ minHeight: 320 }}
        >
          <div
            style={{
              width: 48, height: 48, borderRadius: 12,
              background: "rgba(43,92,224,0.08)",
              border: "1px solid rgba(43,92,224,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22,
            }}
          >
            🧮
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>KPI Matrix</p>
          <p style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", maxWidth: 360 }}>
            Aggregated financial KPIs across sectors — revenue growth, margin trends, and
            consensus estimate revisions. Data pipeline coming soon.
          </p>
        </div>
      )}

      {activeTab === "resources" && (
        <div
          className="card flex flex-col items-center justify-center gap-3"
          style={{ minHeight: 320 }}
        >
          <div
            style={{
              width: 48, height: 48, borderRadius: 12,
              background: "rgba(43,92,224,0.08)",
              border: "1px solid rgba(43,92,224,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22,
            }}
          >
            📚
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Resources</p>
          <p style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", maxWidth: 360 }}>
            Research papers, methodology documentation, and model calibration notes.
            Coming soon.
          </p>
        </div>
      )}
    </div>
  );
}
