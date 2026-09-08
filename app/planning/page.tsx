"use client";

import PlanningPanel from "@/components/planning/PlanningPanel";

// Team Planning: ruta de primer nivel. Vivía como pestaña dentro de /latam, pero el
// módulo dejó de ser específico de LatAm — el calendario cubre todas las regiones y
// los sectores son transversales al equipo.

export default function PlanningPage() {
  return (
    <div className="max-w-[1800px] mx-auto px-6 py-6">
      <div className="mb-6">
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0D0D38", letterSpacing: "-0.035em", lineHeight: 1.15, margin: 0 }}>
          Team Planning
        </h1>
        <p style={{ fontSize: 12, marginTop: 5, color: "rgba(13,13,56,0.62)", fontWeight: 500, letterSpacing: "0.01em" }}>
          Research calendar and task coordination across the team
        </p>
      </div>

      <PlanningPanel />
    </div>
  );
}
