"use client";

import { useState } from "react";
import { CalendarRange, LayoutGrid, X } from "lucide-react";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";
import { cellDateLabel, regionLabel } from "@/lib/planning";
import type { WeeklyCell } from "@/app/api/planning/weekly/route";
import WeeklyCalendar from "./WeeklyCalendar";
import SectorGrid from "./SectorGrid";

// Contenedor del módulo de planificación: la vista macro (calendario) y la micro
// (grilla de analistas) comparten pantalla a través de este switch. El puente entre
// ambas es el contador de tareas de una celda: al pincharlo se salta a la grilla ya
// filtrada por esa semana.

type View = "calendar" | "sectors";

const VIEWS: { key: View; label: string; icon: typeof CalendarRange; sub: string }[] = [
  { key: "calendar", label: "Calendar",     icon: CalendarRange, sub: "Weekly research planning by region" },
  { key: "sectors",  label: "Sectors",  icon: LayoutGrid,    sub: "Tasks by sector and sub-section · everyone can see, members can edit" },
];

export default function PlanningPanel() {
  const [view, setView] = useState<View>("calendar");
  // Cuando se entra a la grilla desde una celda, el filtro por semana queda visible
  // como un chip que se puede sacar.
  const [planFilter, setPlanFilter] = useState<WeeklyCell | null>(null);

  const active = VIEWS.find((v) => v.key === view) ?? VIEWS[0];

  function openTasksFor(cell: WeeklyCell) {
    setPlanFilter(cell);
    setView("sectors");
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: TEXT.label, marginBottom: 14, fontFamily: FONT_SECONDARY }}>
        {active.sub}
      </p>

      {/* View switcher */}
      <div style={{
        display: "inline-flex", background: "rgba(13,13,56,0.04)",
        border: `1px solid ${BORDER.base}`, borderRadius: 10, padding: 3, marginBottom: 18,
      }}>
        {VIEWS.map(({ key, label, icon: Icon }) => {
          const on = view === key;
          return (
            <button
              key={key}
              onClick={() => { setView(key); if (key === "calendar") setPlanFilter(null); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 16px", fontSize: 12.5, fontWeight: on ? 700 : 600,
                color: on ? "#FFFFFF" : TEXT.label,
                background: on ? PATRIA.kingBlue : "transparent",
                border: "none", borderRadius: 8, cursor: "pointer",
                transition: "all 0.12s",
                boxShadow: on ? `0 1px 3px ${PATRIA.kingBlue}55` : "none",
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Chip del filtro que viene del calendario */}
      {view === "sectors" && planFilter && (
        <div style={{ marginBottom: 14 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            fontSize: 11.5, fontWeight: 600, padding: "5px 8px 5px 11px", borderRadius: 8,
            background: "rgba(32,68,220,0.08)", color: PATRIA.blue,
            border: "1px solid rgba(32,68,220,0.24)",
          }}>
            {regionLabel(planFilter.region)} · {cellDateLabel(planFilter.region, planFilter.weekStart)}
            {planFilter.topic ? ` · ${planFilter.topic}` : ""}
            <button
              onClick={() => setPlanFilter(null)}
              title="Show all tasks"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: PATRIA.blue, display: "flex", padding: 0 }}
            >
              <X size={13} />
            </button>
          </span>
        </div>
      )}

      {view === "calendar" && <WeeklyCalendar onOpenTasks={openTasksFor} />}
      {view === "sectors" && (
        // La key fuerza un remount al cambiar el filtro: la grilla recarga desde cero
        // en vez de arrastrar el estado de la vista anterior.
        <SectorGrid key={planFilter?.id ?? "all"} weeklyPlanId={planFilter?.id} />
      )}
    </div>
  );
}
