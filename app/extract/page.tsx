"use client";

import { useState } from "react";
import { Table2, GitCompareArrows } from "lucide-react";
import ModelsExtractor from "@/components/extract/ModelsExtractor";
import ConsensusExtractor from "@/components/extract/ConsensusExtractor";
import { TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";

// Extract Data: query builder visual sobre los modelos de analista y el consenso
// Bloomberg. Sin SQL: filtros → selección → tabla → Excel / PDF.
//   · Financial Models — exportador masivo (último snapshot por empresa/banco).
//   · Consensus View   — consenso vs modelo por año objetivo, última foto o historia.

type View = "models" | "consensus";

const VIEWS: { key: View; label: string; icon: typeof Table2; sub: string }[] = [
  {
    key:   "models",
    label: "Financial Models",
    icon:  Table2,
    sub:   "Bulk extract of analyst models · filter by country, sector, model type and ticker · pick the metrics and years · export to Excel / PDF",
  },
  {
    key:   "consensus",
    label: "Consensus View",
    icon:  GitCompareArrows,
    sub:   "Bloomberg consensus vs Moneda model by target year · latest snapshot or monthly history · model multiples at live price",
  },
];

export default function ExtractPage() {
  const [view, setView] = useState<View>("models");
  const active = VIEWS.find((v) => v.key === view) ?? VIEWS[0];

  return (
    <div className="max-w-[1800px] mx-auto page-shell">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div className="mb-5">
        <h1 style={{ fontSize: 22, fontWeight: 800, color: PATRIA.darkBlue, letterSpacing: "-0.035em", lineHeight: 1.15, margin: 0 }}>
          Extract Data
        </h1>
        <p style={{ fontSize: 12, marginTop: 5, color: TEXT.label, fontWeight: 500, letterSpacing: "0.01em" }}>
          {active.sub}
        </p>
      </div>

      <div className="tab-rail" style={{
        display: "inline-flex", background: "rgba(13,13,56,0.04)",
        border: `1px solid ${BORDER.base}`, borderRadius: 10, padding: 3, marginBottom: 18,
      }}>
        {VIEWS.map(({ key, label, icon: Icon }) => {
          const on = view === key;
          return (
            <button
              key={key}
              onClick={() => setView(key)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 16px", fontSize: 12.5, fontWeight: on ? 700 : 600,
                color: on ? "#FFFFFF" : TEXT.label,
                background: on ? PATRIA.kingBlue : "transparent",
                border: "none", borderRadius: 8, cursor: "pointer",
                transition: "all 0.12s", whiteSpace: "nowrap",
                boxShadow: on ? `0 1px 3px ${PATRIA.kingBlue}55` : "none",
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Las dos vistas se mantienen montadas para no perder la selección al cambiar de pestaña. */}
      <div hidden={view !== "models"}><ModelsExtractor /></div>
      <div hidden={view !== "consensus"}><ConsensusExtractor /></div>
    </div>
  );
}
