"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, pointerWithin,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, GripVertical, ListChecks, Loader2, Send } from "lucide-react";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";
import { useIsAdmin } from "@/lib/useIsAdmin";
import {
  PLAN_REGIONS, CATEGORY_STYLE, categoryStyle, regionLabel, regionDayName,
  mondayOf, isoDate, displayDate, cellDateLabel, dateLabel, weekRange, localToday, orderWithInserted,
} from "@/lib/planning";
import type { WeeklyCell, WeeklyPayload } from "@/app/api/planning/weekly/route";
import type { PublishBody } from "@/app/api/planning/weekly/publish/route";
import type { AnalystOption } from "@/app/api/planning/analysts/route";
import WeeklyCellModal, { type CellFields } from "./WeeklyCellModal";

// Vista macro: la grilla semanal del Excel. Una columna por región, una fila por
// semana. El admin edita una celda con click y la mueve arrastrándola; el resto
// sólo lee.
//
// FECHAS: la llave sigue siendo el lunes (weekly_plan.week_start), pero cada región
// se RENDERIZA en el día que le toca — Chile martes, LatAm jueves. Ver displayDate()
// en lib/planning.ts. Por eso una misma fila muestra dos fechas distintas.
//
// VARIAS POR CASILLA: un mismo día puede tener dos o más actividades y la fila se
// estira para mostrarlas todas, una debajo de otra. Por eso la casilla es una LISTA
// —byKey devuelve WeeklyCell[]— y cada actividad se direcciona por su id.
//
// DRAG & DROP: cada actividad es un draggable (id = weekly_plan.id). Soltar sobre una
// casilla la suma al final; soltar SOBRE otra actividad la inserta delante de ella,
// que es como se reordena un día con dos. Ya no hay intercambio: existía porque no
// cabían dos en el mismo lugar y ahora sí caben.
//
// BORRADOR: editar y arrastrar sólo cambia este navegador. `edits` y `deletedIds` van
// encima de lo que trajo el servidor; el botón de abajo los manda juntos a
// POST /api/planning/weekly/publish, que los guarda y avisa por Telegram. El borrador
// vive en sessionStorage para sobrevivir a cambiar de pestaña o de página: la vista se
// desmonta y, sin eso, un click en el navbar perdía el trabajo sin avisar.

const DRAFT_KEY  = "planning-calendar-draft";
const NEW_PREFIX = "new:";   // id provisional de una actividad que todavía no está en la base

const WEEKS_AHEAD = 16;   // ventana por defecto: ~4 meses hacia adelante
const WEEKS_BACK  = 0;    // la semana del ancla es la PRIMERA fila: "Today" deja la semana actual arriba

// Anchos fijos de las columnas de fecha y analistas. Con `tableLayout: fixed` las
// dos columnas de tópico (sin ancho) se reparten el resto en partes iguales, así
// Chile y LatAm miden lo mismo aunque una tenga tópicos más largos.
const DATE_COL_W    = 72;
const ANALYST_COL_W = 74;

interface DragData { cell: WeeklyCell; region: string; weekIso: string }
/** `beforeId` = insertar delante de esa actividad; null = al final de la casilla. */
interface DropData { region: string; weekIso: string; beforeId: string | null }

interface Props {
  /** Se llama al pinchar el contador de tareas de una celda. */
  onOpenTasks?: (cell: WeeklyCell) => void;
}

function initialsOf(cell: WeeklyCell | undefined): string {
  if (!cell) return "-";
  if (cell.allAnalysts) return "All";
  return cell.analysts.map((a) => a.initials).filter(Boolean).join(" / ") || "-";
}

/** Qué celda se está editando: una existente, o una nueva en esa casilla. */
interface Editing { region: string; weekIso: string; cell: WeeklyCell | null }

const analystKey = (c: WeeklyCell) => c.analysts.map((a) => a.id).sort().join();

/** Una edición puede dejar la celda como estaba, p. ej. arrastrarla y devolverla. */
function sameCell(a: WeeklyCell, b: WeeklyCell): boolean {
  return a.region === b.region && a.weekStart === b.weekStart && a.sortOrder === b.sortOrder
    && a.topic === b.topic && a.category === b.category && a.notes === b.notes
    && a.allAnalysts === b.allAnalysts && a.highlighted === b.highlighted
    && analystKey(a) === analystKey(b);
}

export default function WeeklyCalendar({ onOpenTasks }: Props) {
  const isAdmin = useIsAdmin();

  const [anchor, setAnchor]     = useState(() => mondayOf(localToday()));
  const [serverCells, setServerCells] = useState<WeeklyCell[]>([]);
  const [edits, setEdits]             = useState<Record<string, WeeklyCell>>({});   // borrador, por id
  const [deletedIds, setDeletedIds]   = useState<string[]>([]);                     // borrador
  const [analysts, setAnalysts] = useState<AnalystOption[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [editing, setEditing]   = useState<Editing | null>(null);
  const [dragging, setDragging] = useState<WeeklyCell | null>(null);   // celda en el aire
  const [publishing, setPublishing] = useState(false);                 // POST /publish en vuelo
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  useEffect(() => { setPortalEl(document.body); }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { edits?: Record<string, WeeklyCell>; deletedIds?: string[] };
      setEdits(d.edits ?? {});
      setDeletedIds(d.deletedIds ?? []);
    } catch { /* sin storage el borrador dura lo que dure la vista */ }
  }, []);

  useEffect(() => {
    try {
      if (Object.keys(edits).length || deletedIds.length) {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ edits, deletedIds }));
      } else {
        sessionStorage.removeItem(DRAFT_KEY);
      }
    } catch { /* ídem */ }
  }, [edits, deletedIds]);

  // El click tiene que seguir siendo click (abre el editor): con el mouse sólo se
  // arrastra tras mover 6px. En táctil se arrastra con toque sostenido; deslizar
  // antes del delay sigue siendo scroll, que es lo que costó arreglar en móvil.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );

  // Ventana de semanas visible, derivada del ancla.
  const weeks = useMemo(() => {
    const from = new Date(anchor); from.setUTCDate(from.getUTCDate() - WEEKS_BACK * 7);
    const to   = new Date(anchor); to.setUTCDate(to.getUTCDate() + WEEKS_AHEAD * 7);
    return weekRange(isoDate(from), isoDate(to));
  }, [anchor]);

  // `silent` refresca sin pasar por el spinner: para resincronizar tras un drag,
  // donde la tabla ya está pintada y el parpadeo sería peor que nada.
  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const [wRes, aRes] = await Promise.all([
        fetch(`/api/planning/weekly?from=${weeks[0]}&to=${weeks[weeks.length - 1]}`),
        fetch("/api/planning/analysts"),
      ]);
      if (!wRes.ok) throw new Error("Could not load the calendar");
      const w: WeeklyPayload = await wRes.json();
      setServerCells(w.cells);
      if (aRes.ok) setAnalysts((await aRes.json()).analysts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load error");
    } finally {
      setLoading(false);
    }
  }, [weeks]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Lo que se pinta: el servidor con el borrador encima. Una actividad editada que cae
  // fuera de las semanas visibles entra igual, sólo que ninguna fila la muestra.
  const cells = useMemo(() => [
    ...serverCells.filter((c) => !edits[c.id] && !deletedIds.includes(c.id)),
    ...Object.values(edits),
  ], [serverCells, edits, deletedIds]);

  // Lo que de verdad cambió. Un borrador que volvió a su estado original no cuenta.
  const saves = useMemo(() => {
    const server = new Map(serverCells.map((c) => [c.id, c]));
    return Object.values(edits).filter((c) => {
      const s = server.get(c.id);
      return !s || !sameCell(s, c);
    });
  }, [serverCells, edits]);
  const dirty = saves.length > 0 || deletedIds.length > 0;

  // Las regiones fijas siempre se muestran (aunque estén vacías); las que aparezcan
  // sólo en la DB se agregan al final para no esconder datos que alguien cargó.
  const regions = useMemo(() => {
    const extra = [...new Set(cells.map((c) => c.region))]
      .filter((r) => !PLAN_REGIONS.includes(r as (typeof PLAN_REGIONS)[number]))
      .sort();
    return [...PLAN_REGIONS, ...extra];
  }, [cells]);

  // Una casilla es una LISTA: varias actividades pueden compartir región y semana.
  const byKey = useMemo(() => {
    const m = new Map<string, WeeklyCell[]>();
    for (const c of cells) {
      const k = `${c.region}|${c.weekStart}`;
      const list = m.get(k);
      if (list) list.push(c);
      else m.set(k, [c]);
    }
    // El servidor ya las manda ordenadas, pero las del borrador van al final de `cells`.
    for (const list of m.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return m;
  }, [cells]);

  const thisMonday = isoDate(mondayOf(localToday()));
  const todayIso   = isoDate(localToday());

  function goToday() {
    setAnchor(mondayOf(localToday()));
  }

  function shift(deltaWeeks: number) {
    setAnchor((a) => {
      const n = new Date(a);
      n.setUTCDate(n.getUTCDate() + deltaWeeks * 7);
      return n;
    });
  }

  function handleDragStart(e: DragStartEvent) {
    const data = e.active.data.current as DragData | undefined;
    setDragging(data?.cell ?? null);
  }

  function stage(changed: WeeklyCell[]) {
    setEdits((prev) => ({ ...prev, ...Object.fromEntries(changed.map((c) => [c.id, c])) }));
  }

  function handleDragEnd(e: DragEndEvent) {
    setDragging(null);
    const src = e.active.data.current as DragData | undefined;
    const dst = e.over?.data.current as DropData | undefined;
    if (!src || !dst) return;
    // Soltar sobre sí misma no es un movimiento.
    if (dst.beforeId === src.cell.id) return;

    const sameSlot = src.region === dst.region && src.weekIso === dst.weekIso;
    if (sameSlot && !dst.beforeId) return;   // al final de su propia casilla: nada que hacer

    // Se renumera la casilla destino entera: la que entra y las que corre de lugar.
    const target  = byKey.get(`${dst.region}|${dst.weekIso}`) ?? [];
    const ordered = orderWithInserted(target.map((c) => c.id), src.cell.id, dst.beforeId);
    stage(ordered.map((id, sortOrder) => ({
      ...(target.find((c) => c.id === id) ?? src.cell),
      region: dst.region, weekStart: dst.weekIso, sortOrder,
    })));
  }

  function applyEdit(fields: CellFields) {
    if (!editing) return;
    const { region, weekIso, cell } = editing;
    if (cell) {
      stage([{ ...cell, ...fields }]);
    } else {
      const last = byKey.get(`${region}|${weekIso}`)?.at(-1);
      stage([{
        ...fields, id: `${NEW_PREFIX}${Date.now()}`, region, weekStart: weekIso,
        sortOrder: (last?.sortOrder ?? -1) + 1, taskCount: 0, updatedBy: null, updatedAt: "",
      }]);
    }
    setEditing(null);
  }

  function removeCell(cell: WeeklyCell) {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[cell.id];
      return next;
    });
    if (!cell.id.startsWith(NEW_PREFIX)) setDeletedIds((prev) => [...prev, cell.id]);
    setEditing(null);
  }

  function discard() {
    if (!window.confirm("Discard all unsaved calendar changes?")) return;
    setEdits({});
    setDeletedIds([]);
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      const body: PublishBody = {
        deletes: deletedIds,
        saves:   saves.map(({ id, analysts: team, ...c }) => ({
          ...c,
          id: id.startsWith(NEW_PREFIX) ? undefined : id,
          analystIds: team.map((a) => a.id),
        })),
      };
      const res = await fetch("/api/planning/weekly/publish", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not save the calendar");
      setEdits({});
      setDeletedIds([]);
      await fetchData({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the calendar");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Control bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 2, padding: 3,
          borderRadius: 9, background: "rgba(13,13,56,0.04)", border: `1px solid ${BORDER.base}`,
        }}>
          <button onClick={() => shift(-1)} title="Back 1 week" style={navBtn}><ChevronLeft size={14} /></button>
          <button
            onClick={goToday}
            title="Go to the current week"
            style={{ ...navBtn, width: "auto", padding: "0 12px", fontSize: 11.5, fontWeight: 700 }}
          >
            Today
          </button>
          <button onClick={() => shift(1)} title="Forward 1 week" style={navBtn}><ChevronRight size={14} /></button>
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
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragging(null)}
        accessibility={{
          // Las instrucciones por defecto hablan de la barra espaciadora y acá no
          // hay sensor de teclado: sólo mouse y toque sostenido.
          screenReaderInstructions: {
            draggable: "Drag with the mouse, or press and hold on touch, to move this activity to another day. Dropping on a day that already has activities adds it to that day; dropping on an activity places it above.",
          },
        }}
      >
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
            // `minWidth` en la tabla: son dos regiones × 3 columnas (fecha, tópico,
            // analistas). Sin mínimo, `width: 100%` las comprime hasta que el
            // tópico queda en una palabra por línea.
            <div className="scroll-x">
              <table style={{ width: "100%", minWidth: 760, tableLayout: "fixed", borderCollapse: "collapse", fontSize: 12 }}>
                {regions.map((r) => (
                  <colgroup key={r}>
                    <col style={{ width: DATE_COL_W }} />
                    <col />
                    <col style={{ width: ANALYST_COL_W }} />
                  </colgroup>
                ))}
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
                        {regions.map((r) => (
                          <CellGroup
                            key={`${r}|${wk}`}
                            region={r}
                            weekIso={wk}
                            isNow={isNow}
                            isToday={displayDate(r, wk) === todayIso}
                            cells={byKey.get(`${r}|${wk}`) ?? []}
                            isAdmin={isAdmin}
                            draggingId={dragging?.id ?? null}
                            dragDisabled={publishing}
                            onEdit={(cell) => isAdmin && !publishing && setEditing({ region: r, weekIso: wk, cell })}
                            onOpenTasks={onOpenTasks}
                          />
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* La sombra que sigue al puntero. Va en un portal a <body> para que ningún
            transform/zoom de los contenedores (FitTablesLandscape) la desplace. */}
        {portalEl && createPortal(
          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
            {dragging && (
              // Fondo blanco debajo: los colores de categoría son translúcidos y
              // sin él la tarjeta deja ver las filas por las que pasa.
              <div style={{
                cursor: "grabbing", background: "#FFFFFF", borderRadius: 6, overflow: "hidden",
                boxShadow: "0 10px 28px rgba(13,13,56,0.28)",
              }}>
                <TopicPill cell={dragging} isAdmin style={categoryStyle(dragging.category)} />
              </div>
            )}
          </DragOverlay>,
          portalEl,
        )}
      </DndContext>

      {/* Sticky abajo: con 17 semanas en pantalla, un botón en la barra de arriba
          quedaría fuera de vista justo después de editar. */}
      {isAdmin && dirty && (
        <div style={{
          position: "sticky", bottom: 12, zIndex: 20, marginTop: 12,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "10px 14px", borderRadius: 10, background: PATRIA.darkBlue,
          boxShadow: "0 6px 20px rgba(13,13,56,0.28)",
        }}>
          <span style={{ flex: "1 1 200px", fontSize: 12.5, fontWeight: 600, color: "#FFFFFF" }}>
            Unsaved changes — the team won&rsquo;t see them until you save.
          </span>
          <button
            onClick={discard}
            disabled={publishing}
            style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
              background: "transparent", color: "#FFFFFF",
              border: "1px solid rgba(255,255,255,0.35)", cursor: publishing ? "default" : "pointer",
            }}
          >
            Discard
          </button>
          <button
            onClick={publish}
            disabled={publishing}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
              background: "#FFFFFF", color: PATRIA.kingBlue, border: "none",
              cursor: publishing ? "default" : "pointer", opacity: publishing ? 0.7 : 1,
            }}
          >
            {publishing
              ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
              : <Send size={13} />}
            Save &amp; notify team
          </button>
        </div>
      )}

      {!isAdmin && !loading && (
        <p style={{ fontSize: 11, color: TEXT.muted, marginTop: 10, fontStyle: "italic" }}>
          Only an administrator can edit the calendar.
        </p>
      )}

      {editing && (
        <WeeklyCellModal
          region={editing.region}
          weekIso={editing.weekIso}
          cell={editing.cell}
          analysts={analysts}
          onClose={() => setEditing(null)}
          onApply={applyEdit}
          onDelete={removeCell}
        />
      )}
    </div>
  );
}

// ── Una casilla = 2 <td>: fecha | pila de actividades ────────────────────────
// El segundo <td> abarca las columnas de tópico y analistas (colSpan 2) porque cada
// actividad lleva SUS analistas: con tres <td> sueltos, una casilla de dos actividades
// tendría una columna de tópicos de dos líneas y una de analistas de una, sin forma de
// saber cuál es de cuál. Adentro, cada fila reparte el ancho igual que las columnas —
// el resto para el tópico, ANALYST_COL_W para las siglas—, así la grilla se sigue
// leyendo alineada entre regiones.
function CellGroup({
  region, weekIso, isNow, isToday, cells, isAdmin, draggingId, dragDisabled, onEdit, onOpenTasks,
}: {
  region:       string;
  weekIso:      string;
  isNow:        boolean;
  isToday:      boolean;
  /** Las actividades de esta casilla, ya ordenadas. Vacío = casilla libre. */
  cells:        WeeklyCell[];
  isAdmin:      boolean;
  /** id de la actividad que se está arrastrando ahora, si hay una. */
  draggingId:   string | null;
  dragDisabled: boolean;
  /** null = crear una actividad nueva en esta casilla. */
  onEdit:       (cell: WeeklyCell | null) => void;
  onOpenTasks?: (cell: WeeklyCell) => void;
}) {
  const rowBorder = `1px solid ${BORDER.subtle}`;
  // La casilla se marca si CUALQUIERA de sus actividades está destacada.
  const hl = cells.some((c) => c.highlighted);
  const slotKey = `${region}|${weekIso}`;

  // Dos destinos de nivel casilla —la columna de fecha y la franja de abajo—, los dos
  // "al final". Insertar en una posición concreta es cosa de cada actividad, que trae
  // su propio droppable con beforeId.
  const appendData = { region, weekIso, beforeId: null } satisfies DropData;
  const dropDate = useDroppable({ id: `${slotKey}#date`, data: appendData, disabled: !isAdmin });
  const dropTail = useDroppable({ id: `${slotKey}#tail`, data: appendData, disabled: !isAdmin });

  const dragActive = !!draggingId;
  const tailDrop   = dropTail.isOver && dragActive;
  const dateDrop   = dropDate.isOver && dragActive;
  const dropTint   = "rgba(32,68,220,0.06)";

  // La franja de abajo es a la vez el "+ add" y la zona para soltar al final. Sin
  // actividades ocupa la casilla entera; con actividades es una línea fina, y para
  // quien no es admin no existe.
  const showTail = isAdmin || cells.length === 0;

  // Con actividades cargadas la franja va MUDA: un "+ add another" fijo debajo de
  // cada día llenaba el calendario de texto que no es contenido. Sigue estando y
  // sigue siendo clickeable —ahí se agrega la segunda actividad y ahí se suelta al
  // final—, pero sólo se anuncia al pasar por encima o al arrastrar algo.
  const [hover, setHover] = useState(false);
  const stacked = cells.length > 0;
  const tailLabel = tailDrop ? "Drop here"
    : !isAdmin ? ""
    : !stacked ? "+ add"
    : hover ? "+ add another"
    : "";

  return (
    <>
      {/* Date — el día que le toca a la región, no el lunes de la llave */}
      <td ref={dropDate.setNodeRef} style={{
        padding: "4px 10px", textAlign: "right", whiteSpace: "nowrap",
        verticalAlign: "top", borderBottom: rowBorder,
        fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
        fontSize: 11, fontWeight: isToday ? 800 : 600,
        color: isToday ? PATRIA.kingBlue : TEXT.label,
        background: dateDrop ? dropTint : hl ? "rgba(255,187,141,0.20)" : isNow ? "rgba(32,68,220,0.05)" : "transparent",
        borderLeft: dateDrop ? `2px solid ${PATRIA.kingBlue}`
          : hl ? `2px solid ${PATRIA.orange}`
          : isNow ? `2px solid ${PATRIA.kingBlue}` : "2px solid transparent",
      }}>
        {cellDateLabel(region, weekIso)}
      </td>

      {/* Actividades: una debajo de otra, la fila se estira sola */}
      <td
        colSpan={2}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          padding: 0, verticalAlign: "top",
          borderBottom: rowBorder, borderRight: "3px solid #FFFFFF",
        }}
      >
        {cells.map((cell) => (
          <ActivityRow
            key={cell.id}
            cell={cell}
            region={region}
            weekIso={weekIso}
            isAdmin={isAdmin}
            draggingId={draggingId}
            dragDisabled={dragDisabled}
            onEdit={onEdit}
            onOpenTasks={onOpenTasks}
          />
        ))}

        {showTail && (
          <div
            ref={dropTail.setNodeRef}
            onClick={() => isAdmin && onEdit(null)}
            title={isAdmin ? (stacked ? "Add another activity this day" : "Add activity") : undefined}
            style={{
              display: "flex", alignItems: "center",
              // Con actividades queda casi cerrada (4px) para no dejar un hueco en
              // blanco bajo cada día; se abre al pasar el mouse o al arrastrar, que
              // es cuando sirve para agregar o soltar al final.
              padding: stacked ? "0 11px" : "3px 11px",
              minHeight: stacked ? (tailLabel || dragActive ? 16 : 4) : 22,
              cursor: isAdmin ? "pointer" : "default",
              background: tailDrop ? dropTint : "transparent",
              boxShadow: tailDrop ? `inset 0 0 0 2px ${PATRIA.kingBlue}` : "none",
              fontSize: stacked ? 10 : 11.5,
              fontWeight: tailDrop ? 700 : 500,
              color: tailDrop ? PATRIA.kingBlue : TEXT.disabled,
              transition: "background 0.12s, box-shadow 0.12s, opacity 0.12s, min-height 0.12s",
              opacity: tailLabel ? 1 : 0,
            }}
          >
            {tailLabel}
          </div>
        )}
      </td>
    </>
  );
}

// ── Una actividad dentro de la casilla ───────────────────────────────────────
// Es a la vez draggable (se lleva a otra casilla) y droppable (soltar encima inserta
// DELANTE de ella, que es como se ordenan dos actividades del mismo día).
function ActivityRow({
  cell, region, weekIso, isAdmin, draggingId, dragDisabled, onEdit, onOpenTasks,
}: {
  cell:         WeeklyCell;
  region:       string;
  weekIso:      string;
  isAdmin:      boolean;
  draggingId:   string | null;
  dragDisabled: boolean;
  onEdit:       (cell: WeeklyCell) => void;
  onOpenTasks?: (cell: WeeklyCell) => void;
}) {
  const s = categoryStyle(cell.category);
  const draggable = isAdmin && !dragDisabled;

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id:   `cell:${cell.id}`,
    data: { region, weekIso, beforeId: cell.id } satisfies DropData,
    disabled: !isAdmin,
  });

  const { setNodeRef: setDragRef, attributes, listeners, isDragging } = useDraggable({
    id:   cell.id,
    data: { cell, region, weekIso } satisfies DragData,
    disabled: !draggable,
  });

  // Se inserta ARRIBA de ésta, así que la guía va arriba. Va posicionada en absoluto
  // para no empujar la fila 2px cada vez que el puntero pasa por encima.
  const showInsert = isOver && !!draggingId && draggingId !== cell.id;

  return (
    <div ref={setDropRef} style={{ position: "relative" }}>
      {showInsert && (
        <div style={{
          position: "absolute", left: 0, right: 0, top: -1, height: 2,
          background: PATRIA.kingBlue, zIndex: 2, pointerEvents: "none",
        }} />
      )}

      <div
        ref={setDragRef}
        {...(draggable ? attributes : {})}
        {...listeners}
        onClick={() => isAdmin && onEdit(cell)}
        title={
          !isAdmin ? cell.notes ?? undefined
          : "Click to edit · drag to move or reorder"
        }
        style={{
          display: "flex", alignItems: "stretch",
          cursor: draggable ? "grab" : isAdmin ? "pointer" : "default",
          opacity: isDragging ? 0.35 : 1,
          // Sin esto, el toque sostenido en iOS selecciona el texto o abre el
          // menú contextual en vez de levantar la actividad.
          userSelect: draggable ? "none" : undefined,
          WebkitUserSelect: draggable ? "none" : undefined,
          WebkitTouchCallout: draggable ? "none" : undefined,
          transition: "opacity 0.12s",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <TopicPill cell={cell} isAdmin={isAdmin} style={s} onOpenTasks={onOpenTasks} />
        </div>

        {/* Las siglas de ESTA actividad, alineadas con la columna de analistas */}
        <div style={{
          width: ANALYST_COL_W, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 10px", whiteSpace: "nowrap",
          fontFamily: FONT_SECONDARY, fontSize: 10.5, fontWeight: 700,
          color: PATRIA.darkBlue,
        }}>
          {initialsOf(cell)}
        </div>
      </div>
    </div>
  );
}

// ── La "tarjeta" del tópico: se pinta en la celda y, mientras se arrastra, en el
//    DragOverlay que sigue al puntero ────────────────────────────────────────
function TopicPill({
  cell, isAdmin, style: s, onOpenTasks,
}: {
  cell:         WeeklyCell;
  isAdmin:      boolean;
  style:        { bg: string; border: string; text: string };
  onOpenTasks?: (cell: WeeklyCell) => void;
}) {
  return (
    <div style={{
      padding: "4px 11px", minHeight: 22,
      display: "flex", alignItems: "center", gap: 7,
      background: s.bg, color: s.text,
      borderTop: `1px solid ${s.border}`,
      borderBottom: `1px solid ${s.border}`,
      fontSize: 11.5, fontWeight: 700,
    }}>
      {isAdmin && (
        <GripVertical size={11} style={{ flexShrink: 0, marginLeft: -5, opacity: 0.45 }} />
      )}

      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {cell.topic}
      </span>

      {!!cell.taskCount && (
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
  );
}

const navBtn: React.CSSProperties = {
  width: 26, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
  borderRadius: 6, background: "#FFFFFF", border: `1px solid ${BORDER.base}`,
  color: TEXT.label, cursor: "pointer",
};
