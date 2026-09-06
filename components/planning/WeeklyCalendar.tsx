"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";
import { useIsAdmin } from "@/lib/useIsAdmin";
import {
  PLAN_REGIONS, CATEGORY_STYLE, categoryStyle, regionLabel, regionDayName,
  mondayOf, isoDate, displayDate, cellDateLabel, dateLabel, weekRange,
} from "@/lib/planning";
import type { WeeklyCell, WeeklyPayload } from "@/app/api/planning/weekly/route";
import type { AnalystOption } from "@/app/api/planning/analysts/route";
import WeeklyCellModal from "./WeeklyCellModal";

// Vista macro: la grilla semanal del Excel. Una columna por región, una fila por
// semana. El admin edita una celda con click; el resto sólo lee.
//
// FECHAS: la llave sigue siendo el lunes (weekly_plan.week_start), pero cada región
// se RENDERIZA en el día que le toca — Chile martes, LatAm jueves. Ver displayDate()
// en lib/planning.ts. Por eso una misma fila muestra dos fechas distintas.

const WEEKS_AHEAD = 16;   // ventana por defecto: ~4 meses hacia adelante
const WEEKS_BACK  = 4;

interface Props {
  /** Se llama al pinchar el contador de tareas de una celda. */
  onOpenTasks?: (cell: WeeklyCell) => void;
}

export default function WeeklyCalendar({ onOpenTasks }: Props) {
  const isAdmin = useIsAdmin();

  const [anchor, setAnchor]     = useState(() => mondayOf(new Date()));
  const [cells, setCells]       = useState<WeeklyCell[]>([]);
  const [analysts, setAnalysts] = useState<AnalystOption[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [editing, setEditing]   = useState<{ region: string; weekIso: string } | null>(null);

  // Ventana de semanas visible, derivada del ancla.
  const weeks = useMemo(() => {
    const from = new Date(anchor); from.setUTCDate(from.getUTCDate() - WEEKS_BACK * 7);
    const to   = new Date(anchor); to.setUTCDate(to.getUTCDate() + WEEKS_AHEAD * 7);
    return weekRange(isoDate(from), isoDate(to));
  }, [anchor]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wRes, aRes] = await Promise.all([
        fetch(`/api/planning/weekly?from=${weeks[0]}&to=${weeks[weeks.length - 1]}`),
        fetch("/api/planning/analysts"),
      ]);
      if (!wRes.ok) throw new Error("Could not load the calendar");
      const w: WeeklyPayload = await wRes.json();
      setCells(w.cells);
      if (aRes.ok) setAnalysts((await aRes.json()).analysts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load error");
    } finally {
      setLoading(false);
    }
  }, [weeks]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Las regiones fijas siempre se muestran (aunque estén vacías); las que aparezcan
  // sólo en la DB se agregan al final para no esconder datos que alguien cargó.
  const regions = useMemo(() => {
    const extra = [...new Set(cells.map((c) => c.region))]
      .filter((r) => !PLAN_REGIONS.includes(r as (typeof PLAN_REGIONS)[number]))
      .sort();
    return [...PLAN_REGIONS, ...extra];
  }, [cells]);

  const byKey = useMemo(() => {
    const m = new Map<string, WeeklyCell>();
    for (const c of cells) m.set(`${c.region}|${c.weekStart}`, c);
    return m;
  }, [cells]);

  const thisMonday = isoDate(mondayOf(new Date()));
  const todayIso   = isoDate(new Date());

  function shift(deltaWeeks: number) {
    setAnchor((a) => {
      const n = new Date(a);
      n.setUTCDate(n.getUTCDate() + deltaWeeks * 7);
      return n;
    });
  }

  const editingCell = editing ? byKey.get(`${editing.region}|${editing.weekIso}`) ?? null : null;

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Control bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 2, padding: 3,
          borderRadius: 9, background: "rgba(13,13,56,0.04)", border: `1px solid ${BORDER.base}`,
        }}>
          <button onClick={() => shift(-4)} title="Back 4 weeks" style={navBtn}><ChevronLeft size={14} /></button>
          <button
            onClick={() => setAnchor(mondayOf(new Date()))}
            style={{ ...navBtn, width: "auto", padding: "0 12px", fontSize: 11.5, fontWeight: 700 }}
          >
            Today
          </button>
          <button onClick={() => shift(4)} title="Forward 4 weeks" style={navBtn}><ChevronRight size={14} /></button>
        </div>

        <span style={{ fontSize: 11.5, color: TEXT.muted, fontFamily: FONT_SECONDARY }}>
          {dateLabel(weeks[0])} — {dateLabel(weeks[weeks.length - 1])}
        </span>

        {/* Color legend */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginLeft: "auto", alignItems: "center" }}>
          {(["update", "banks", "top_picks", "results", "alert", "holiday"] as const).map((c) => {
            const s = CATEGORY_STYLE[c];
            return (
              <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  width: 9, height: 9, borderRadius: 2,
                  background: s.bg, border: `1px solid ${s.border}`, display: "inline-block",
                }} />
                <span style={{ fontSize: 10, color: TEXT.muted }}>{s.label}</span>
              </span>
            );
          })}
        </div>
      </div>

      {error && (
        <div style={{
          fontSize: 12.5, color: "#B01029", background: "rgba(248,72,94,0.07)",
          border: "1px solid rgba(248,72,94,0.22)", borderRadius: 9,
          padding: "10px 14px", marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      {/* ── Grid ─────────────────────────────────────────────────────────────── */}
      <div style={{
        background: "#FFFFFF", border: `1px solid ${BORDER.base}`, borderRadius: 12,
        boxShadow: "0 1px 4px rgba(13,13,56,0.06)", overflow: "hidden",
      }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 12 }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              border: "2px solid rgba(32,68,220,0.2)", borderTopColor: PATRIA.kingBlue,
              animation: "spin 0.8s linear infinite",
            }} />
            <span style={{ fontSize: 12, color: TEXT.label }}>Loading calendar…</span>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {regions.map((r) => (
                    <th
                      key={r}
                      colSpan={3}
                      style={{
                        padding: "9px 14px", textAlign: "center",
                        background: PATRIA.darkBlue, color: "#FFFFFF",
                        fontSize: 12.5, fontWeight: 800, letterSpacing: "0.02em",
                        borderRight: "3px solid #FFFFFF",
                      }}
                    >
                      {regionLabel(r)}
                      <span style={{
                        marginLeft: 7, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.06em",
                        textTransform: "uppercase", color: "rgba(255,255,255,0.55)",
                      }}>
                        {regionDayName(r)}s
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((wk) => {
                  const isNow = wk === thisMonday;
                  return (
                    <tr key={wk}>
                      {regions.map((r) => {
                        const cell = byKey.get(`${r}|${wk}`);
                        const initials = cell?.allAnalysts
                          ? "All"
                          : cell?.analysts.map((a) => a.initials).filter(Boolean).join(" / ") || "-";

                        return (
                          <CellGroup
                            key={`${r}|${wk}`}
                            region={r}
                            weekIso={wk}
                            isNow={isNow}
                            isToday={displayDate(r, wk) === todayIso}
                            cell={cell}
                            style={categoryStyle(cell?.category)}
                            initials={initials}
                            isAdmin={isAdmin}
                            onEdit={() => isAdmin && setEditing({ region: r, weekIso: wk })}
                            onOpenTasks={onOpenTasks}
                          />
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isAdmin && !loading && (
        <p style={{ fontSize: 11, color: TEXT.muted, marginTop: 10, fontStyle: "italic" }}>
          Only an administrator can edit the calendar.
        </p>
      )}

      {editing && (
        <WeeklyCellModal
          region={editing.region}
          weekIso={editing.weekIso}
          cell={editingCell}
          analysts={analysts}
          onClose={() => setEditing(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}

// ── Una celda = 3 <td>: fecha | tópico | analistas ───────────────────────────
function CellGroup({
  region, weekIso, isNow, isToday, cell, style: s, initials, isAdmin, onEdit, onOpenTasks,
}: {
  region:   string;
  weekIso:  string;
  isNow:    boolean;
  isToday:  boolean;
  cell:     WeeklyCell | undefined;
  style:    { bg: string; border: string; text: string };
  initials: string;
  isAdmin:  boolean;
  onEdit:   () => void;
  onOpenTasks?: (cell: WeeklyCell) => void;
}) {
  const rowBorder = `1px solid ${BORDER.subtle}`;
  const hl = cell?.highlighted;

  return (
    <>
      {/* Date — el día que le toca a la región, no el lunes de la llave */}
      <td style={{
        padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap",
        width: 72, borderBottom: rowBorder,
        fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
        fontSize: 11, fontWeight: isToday ? 800 : 600,
        color: isToday ? PATRIA.kingBlue : TEXT.label,
        background: hl ? "rgba(255,187,141,0.20)" : isNow ? "rgba(32,68,220,0.05)" : "transparent",
        borderLeft: hl ? `2px solid ${PATRIA.orange}` : isNow ? `2px solid ${PATRIA.kingBlue}` : "2px solid transparent",
      }}>
        {cellDateLabel(region, weekIso)}
      </td>

      {/* Topic */}
      <td
        onClick={onEdit}
        title={isAdmin ? "Edit cell" : cell?.notes ?? undefined}
        style={{
          padding: 0, borderBottom: rowBorder,
          cursor: isAdmin ? "pointer" : "default",
        }}
      >
        <div style={{
          padding: "6px 11px", minHeight: 26,
          display: "flex", alignItems: "center", gap: 7,
          background: s.bg, color: s.text,
          borderTop: cell ? `1px solid ${s.border}` : "none",
          borderBottom: cell ? `1px solid ${s.border}` : "none",
          fontSize: 11.5, fontWeight: cell ? 700 : 500,
        }}>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {cell?.topic ?? (isAdmin ? <span style={{ color: TEXT.disabled, fontWeight: 500 }}>+ add</span> : "")}
          </span>

          {!!cell?.taskCount && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenTasks?.(cell); }}
              title={`${cell.taskCount} task${cell.taskCount === 1 ? "" : "s"} on the board`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0,
                fontSize: 9.5, fontWeight: 800, padding: "1px 6px", borderRadius: 5,
                background: "rgba(255,255,255,0.72)", color: PATRIA.blue,
                border: `1px solid ${s.border}`, cursor: "pointer",
                fontFamily: FONT_SECONDARY,
              }}
            >
              <ListChecks size={9} />{cell.taskCount}
            </button>
          )}
        </div>
      </td>

      {/* Analysts */}
      <td style={{
        padding: "6px 10px", textAlign: "center", whiteSpace: "nowrap",
        width: 74, borderBottom: rowBorder, borderRight: "3px solid #FFFFFF",
        fontFamily: FONT_SECONDARY, fontSize: 10.5, fontWeight: 700,
        color: cell ? PATRIA.darkBlue : TEXT.disabled,
      }}>
        {cell ? initials : "-"}
      </td>
    </>
  );
}

const navBtn: React.CSSProperties = {
  width: 26, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
  borderRadius: 6, background: "#FFFFFF", border: `1px solid ${BORDER.base}`,
  color: TEXT.label, cursor: "pointer",
};
