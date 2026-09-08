"use client";

import { useState } from "react";
import { Sigma, Award } from "lucide-react";
import ConsensusCheckTable from "@/components/latam/ConsensusCheckTable";
import AnalystTrackRecord from "@/components/quant/AnalystTrackRecord";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";

// Analyst Estimates. Absorbió el track record del difunto módulo "Analysis": las dos
// vistas miran lo mismo desde ángulos distintos —qué proyecta el analista hoy, y qué
// tan bien le fue con lo que proyectó antes—, así que tenerlas en pestañas separadas
// del navbar obligaba a saltar entre secciones para una sola pregunta.

type View = "estimates" | "track-record";

const VIEWS: { key: View; label: string; icon: typeof Sigma; sub: string }[] = [
  {
    key:   "estimates",
    label: "Estimates",
    icon:  Sigma,
    sub:   "Moneda analyst estimates vs Bloomberg consensus · latest model snapshot per company",
  },
  {
    key:   "track-record",
    label: "Analyst Track Record",
    icon:  Award,
    sub:   "Hit rate and performance of past analyst recommendations",
  },
];

export default function EstimatesPage() {
  const [view, setView] = useState<View>("estimates");
  const active = VIEWS.find((v) => v.key === view) ?? VIEWS[0];

  return (
    <div className="max-w-[1800px] mx-auto px-6 py-6">
      {/* Las tablas internas usan este keyframe para sus spinners. */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <h1 style={{ fontSize: 22, fontWeight: 800, color: PATRIA.darkBlue, letterSpacing: "-0.035em", lineHeight: 1.15, margin: 0 }}>
          Analyst Estimates
        </h1>
        <p style={{ fontSize: 12, marginTop: 5, color: TEXT.label, fontWeight: 500, letterSpacing: "0.01em" }}>
          {active.sub}
        </p>
      </div>

      {/* ── View switcher ───────────────────────────────────────────────────── */}
      <div style={{
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

      {view === "estimates" && (
        <>
          <p style={{ fontSize: 12, color: TEXT.label, marginBottom: 14, fontFamily: FONT_SECONDARY }}>
            Click a row to open the full model.
          </p>
          <ConsensusCheckTable />
        </>
      )}

      {view === "track-record" && <AnalystTrackRecord />}
    </div>
  );
}
