"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, MessageSquare, CalendarDays, Loader2, Check, Lock,
  ChevronDown, ChevronRight, Settings2, Users,
} from "lucide-react";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { PRIORITY_STYLE, PRIORITY_RANK, STATUS_LABEL, isoDate, type TaskPriority } from "@/lib/planning";
import type { TaskDTO, TasksPayload, SectorDTO, SectorsPayload, SectionDTO } from "@/lib/planningTasks";
import type { AnalystOption } from "@/app/api/planning/analysts/route";
import TaskDetailModal from "./TaskDetailModal";
import SectorEditorModal from "./SectorEditorModal";

// Vista micro: una caja por SECTOR, y dentro de cada sector una lista por sub-sección.
// Reemplazó a la grilla por analista.
//
// VISIBILIDAD: todos ven todo. Lo que cambia por usuario es `sector.canWrite`, que
// llega calculado del servidor — un sector ajeno se renderiza completo pero sin
// checkbox, sin botón de agregar y con un candado en la cabecera.

interface Props {
  /** Filtra por una celda del calendario macro (viene del contador de la grilla). */
  weeklyPlanId?: string;
}

/** Pendientes primero por fecha, luego por prioridad; el resto por sortOrder. */
function sortTasks(list: TaskDTO[]): TaskDTO[] {
  return [...list].sort((a, b) => {
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    const pa = PRIORITY_RANK[(a.priority as TaskPriority)] ?? 1;
    const pb = PRIORITY_RANK[(b.priority as TaskPriority)] ?? 1;
    if (pa !== pb) return pa - pb;
    return a.sortOrder - b.sortOrder;
  });
}

export default function SectorGrid({ weeklyPlanId }: Props) {
  const isAdmin = useIsAdmin();

  const [sectors, setSectors]   = useState<SectorDTO[]>([]);
  const [tasks, setTasks]       = useState<TaskDTO[]>([]);
  const [analysts, setAnalysts] = useState<AnalystOption[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [openId, setOpenId]     = useState<string | null>(null);
  const [editing, setEditing]   = useState<SectorDTO | "new" | null>(null);
  const [hideDone, setHideDone] = useState(false);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (weeklyPlanId) params.set("weeklyPlanId", weeklyPlanId);
      const [sRes, tRes] = await Promise.all([
        fetch("/api/planning/sectors"),
        fetch(`/api/planning/tasks?${params}`),
      ]);
      const s: SectorsPayload & { error?: string } = await sRes.json();
      const t: TasksPayload   & { error?: string } = await tRes.json();
      if (!sRes.ok) throw new Error(s.error ?? "Could not load sectors");
      if (!tRes.ok) throw new Error(t.error ?? "Could not load tasks");
      setSectors(s.sectors);
      setTasks(t.tasks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load error");
    } finally {
      setLoading(false);
    }
  }, [weeklyPlanId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    fetch("/api/planning/analysts")
      .then((r) => (r.ok ? r.json() : { analysts: [] }))
      .then((d) => setAnalysts(d.analysts ?? []))
      .catch(() => {});
  }, []);

  const bySection = useMemo(() => {
    const m = new Map<string, TaskDTO[]>();
    for (const t of tasks) {
      const cur = m.get(t.sectionId) ?? [];
      cur.push(t);
      m.set(t.sectionId, cur);
    }
    return m;
  }, [tasks]);

  const general = sectors.find((s) => s.isGeneral) ?? null;
  const rest    = sectors.filter((s) => !s.isGeneral);

  // Con el filtro del calendario puesto, un sector sin tareas de esa semana es ruido.
  const visibleRest = weeklyPlanId
    ? rest.filter((s) => s.sections.some((sec) => (bySection.get(sec.id)?.length ?? 0) > 0))
    : rest;

  // ── Mutaciones ──────────────────────────────────────────────────────────────

  async function patchTask(id: string, body: Record<string, unknown>, optimistic?: Partial<TaskDTO>) {
    if (optimistic) setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...optimistic } : t)));
    try {
      const res = await fetch(`/api/planning/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not save");
      setTasks((ts) => ts.map((t) => (t.id === id ? d.task : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      fetchAll();   // el optimismo se revierte con la verdad del servidor
    }
  }

  async function createTask(sectionId: string, title: string) {
    const t = title.trim();
    if (!t) return;
    try {
      const res = await fetch("/api/planning/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, sectionId, weeklyPlanId: weeklyPlanId ?? undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not create the task");
      setTasks((ts) => [...ts, d.task]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the task");
    }
  }

  function toggleDone(t: TaskDTO) {
    const next = t.status === "done" ? "todo" : "done";
    patchTask(t.id, { status: next }, { status: next });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const totalOpen = tasks.filter((t) => t.status !== "done").length;
  const myWritable = sectors.filter((s) => s.canWrite).length;

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: TEXT.label }}>
          {sectors.length} sector{sectors.length === 1 ? "" : "s"} · {totalOpen} open task{totalOpen === 1 ? "" : "s"}
          {!isAdmin && (
            <span style={{ color: TEXT.muted }}>
              {" "}· you can edit {myWritable}
            </span>
          )}
        </span>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 11.5, color: TEXT.label, cursor: "pointer", fontWeight: 600,
          }}>
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
              style={{ accentColor: PATRIA.kingBlue, width: 13, height: 13 }}
            />
            Hide completed
          </label>

          {isAdmin && (
            <button
              onClick={() => setEditing("new")}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 11.5, fontWeight: 700, padding: "6px 13px", borderRadius: 8,
                background: PATRIA.blue, color: "#FFFFFF", border: "none", cursor: "pointer",
              }}
            >
              <Plus size={13} /> New sector
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 12.5, color: "#B01029", background: "rgba(248,72,94,0.07)",
          border: "1px solid rgba(248,72,94,0.22)", borderRadius: 9,
          padding: "10px 14px", marginBottom: 12,
        }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: "none", border: "none", color: "#B01029", cursor: "pointer", fontSize: 11, fontWeight: 700 }}
          >
            OK
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "70px 0", gap: 10 }}>
          <Loader2 size={20} style={{ animation: "spin 0.8s linear infinite", color: PATRIA.kingBlue }} />
          <span style={{ fontSize: 12.5, color: TEXT.label }}>Loading sectors…</span>
        </div>
      ) : sectors.length === 0 ? (
        <div style={{
          padding: "50px 20px", textAlign: "center", background: "#F5F7FD",
          borderRadius: 12, border: `1px solid ${BORDER.subtle}`,
        }}>
          <p style={{ fontSize: 13, color: TEXT.label, margin: 0 }}>
            {isAdmin
              ? "No sectors yet. Create the first one with “New sector”."
              : "No sectors have been set up yet."}
          </p>
        </div>
      ) : (
        <>
          {/* ── Coordinación General: transversal, ancho completo, arriba ────── */}
          {general && (
            <div style={{ marginBottom: 16 }}>
              <SectorBox
                sector={general}
                tasksOf={(id) => bySection.get(id) ?? []}
                hideDone={hideDone}
                isAdmin={isAdmin}
                wide
                onToggleDone={toggleDone}
                onOpenTask={setOpenId}
                onCreate={createTask}
                onEditSector={() => setEditing(general)}
              />
            </div>
          )}

          {/* ── Resto de los sectores ────────────────────────────────────────── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 14, alignItems: "start",
          }}>
            {visibleRest.map((s) => (
              <SectorBox
                key={s.id}
                sector={s}
                tasksOf={(id) => bySection.get(id) ?? []}
                hideDone={hideDone}
                isAdmin={isAdmin}
                onToggleDone={toggleDone}
                onOpenTask={setOpenId}
                onCreate={createTask}
                onEditSector={() => setEditing(s)}
              />
            ))}
          </div>

          {weeklyPlanId && visibleRest.length === 0 && !general && (
            <p style={{ fontSize: 12, color: TEXT.muted, textAlign: "center", padding: "30px 0" }}>
              No tasks linked to this week yet.
            </p>
          )}
        </>
      )}

      {openId && (
        <TaskDetailModal
          taskId={openId}
          analysts={analysts}
          sectors={sectors}
          onClose={() => setOpenId(null)}
          onChanged={fetchAll}
        />
      )}

      {editing && (
        <SectorEditorModal
          sector={editing === "new" ? null : editing}
          analysts={analysts}
          onClose={() => setEditing(null)}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}

// ── Caja de un sector ────────────────────────────────────────────────────────
function SectorBox({
  sector, tasksOf, hideDone, isAdmin, wide, onToggleDone, onOpenTask, onCreate, onEditSector,
}: {
  sector:       SectorDTO;
  tasksOf:      (sectionId: string) => TaskDTO[];
  hideDone:     boolean;
  isAdmin:      boolean;
  wide?:        boolean;
  onToggleDone: (t: TaskDTO) => void;
  onOpenTask:   (id: string) => void;
  onCreate:     (sectionId: string, title: string) => void;
  onEditSector: () => void;
}) {
  const all  = sector.sections.flatMap((s) => tasksOf(s.id));
  const open = all.filter((t) => t.status !== "done").length;
  const done = all.length - open;

  return (
    <div style={{
      background: "#FFFFFF", borderRadius: 12,
      border: `1px solid ${sector.isGeneral ? "rgba(32,68,220,0.30)" : BORDER.base}`,
      boxShadow: "0 1px 4px rgba(13,13,56,0.06)", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 9,
        padding: "10px 13px", borderBottom: `1px solid ${BORDER.subtle}`,
        background: sector.isGeneral ? "rgba(32,68,220,0.06)" : "#F5F7FD",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{
              fontSize: wide ? 14 : 13, fontWeight: 800, color: PATRIA.darkBlue,
              letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {sector.name}
            </span>
            {!sector.canWrite && (
              <span
                title="You are not a member of this sector — read only"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0,
                  fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 5,
                  background: "rgba(13,13,56,0.06)", color: TEXT.muted,
                  border: `1px solid ${BORDER.base}`,
                }}
              >
                <Lock size={9} /> read only
              </span>
            )}
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: 7, marginTop: 2,
            fontSize: 10, color: TEXT.muted, fontFamily: FONT_SECONDARY,
          }}>
            <span>{open} open{done > 0 && ` · ${done} done`}</span>
            {sector.members.length > 0 && (
              <span
                title={sector.members.map((m) => m.name ?? m.email).join(", ")}
                style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
              >
                <Users size={9} />
                {sector.members.map((m) => m.initials ?? (m.name ?? m.email ?? "?").slice(0, 2).toUpperCase()).join(" · ")}
              </span>
            )}
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={onEditSector}
            title="Edit sector, members and sub-sections"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 24, height: 24, borderRadius: 7, flexShrink: 0,
              background: "#FFFFFF", border: `1px solid ${BORDER.base}`,
              color: TEXT.label, cursor: "pointer",
            }}
          >
            <Settings2 size={12} />
          </button>
        )}
      </div>

      {/* Sub-secciones */}
      <div style={{
        padding: "6px 10px 10px",
        // El sector general es ancho: sus sub-secciones van en columnas.
        ...(wide ? {
          display: "grid",
          gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))`,
          gap: 10,
        } : {}),
      }}>
        {sector.sections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            tasks={tasksOf(section.id)}
            hideDone={hideDone}
            canWrite={sector.canWrite}
            onToggleDone={onToggleDone}
            onOpenTask={onOpenTask}
            onCreate={(title) => onCreate(section.id, title)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Una sub-sección con su lista ─────────────────────────────────────────────
function SectionBlock({
  section, tasks, hideDone, canWrite, onToggleDone, onOpenTask, onCreate,
}: {
  section:      SectionDTO;
  tasks:        TaskDTO[];
  hideDone:     boolean;
  canWrite:     boolean;
  onToggleDone: (t: TaskDTO) => void;
  onOpenTask:   (id: string) => void;
  onCreate:     (title: string) => void;
}) {
  const [adding, setAdding]     = useState(false);
  const [title, setTitle]       = useState("");
  const [showDone, setShowDone] = useState(false);

  const open = sortTasks(tasks.filter((t) => t.status !== "done"));
  const done = tasks
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  function submit() {
    if (title.trim()) onCreate(title);
    setTitle("");
    setAdding(false);
  }

  return (
    <div style={{ marginTop: 6 }}>
      {/* Cabecera de la sub-sección */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 4px 5px" }}>
        <span style={{
          fontSize: 9.5, fontWeight: 800, letterSpacing: "0.07em",
          textTransform: "uppercase", color: TEXT.label,
        }}>
          {section.name}
        </span>
        <span style={{
          fontSize: 9.5, fontWeight: 700, color: TEXT.muted,
          background: "rgba(13,13,56,0.05)", borderRadius: 5,
          padding: "0 5px", fontFamily: FONT_SECONDARY,
        }}>
          {open.length}
        </span>
        {canWrite && (
          <button
            onClick={() => { setAdding(true); setTitle(""); }}
            title={`New task in ${section.name}`}
            style={{
              marginLeft: "auto", background: "transparent", border: "none",
              cursor: "pointer", color: TEXT.label, padding: 1, display: "flex",
            }}
          >
            <Plus size={13} />
          </button>
        )}
      </div>

      {adding && (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter")  submit();
            if (e.key === "Escape") { setAdding(false); setTitle(""); }
          }}
          placeholder="Task title…"
          style={{
            width: "100%", boxSizing: "border-box", padding: "6px 9px", marginBottom: 6,
            borderRadius: 8, border: `1px solid ${PATRIA.kingBlue}`,
            background: "#FFFFFF", color: PATRIA.darkBlue, fontSize: 12, outline: "none",
          }}
        />
      )}

      {open.length === 0 && !adding && (
        <p style={{
          fontSize: 11, color: TEXT.disabled, fontStyle: "italic",
          padding: "6px 4px 8px", margin: 0,
        }}>
          No open tasks
        </p>
      )}

      {open.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          canWrite={canWrite}
          onToggleDone={() => onToggleDone(t)}
          onOpen={() => onOpenTask(t.id)}
        />
      ))}

      {!hideDone && done.length > 0 && (
        <>
          <button
            onClick={() => setShowDone((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 4, width: "100%",
              padding: "4px 4px", background: "transparent", border: "none", cursor: "pointer",
              fontSize: 9.5, fontWeight: 700, letterSpacing: "0.05em",
              textTransform: "uppercase", color: TEXT.muted,
            }}
          >
            {showDone ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Completed ({done.length})
          </button>
          {showDone && done.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              canWrite={canWrite}
              onToggleDone={() => onToggleDone(t)}
              onOpen={() => onOpenTask(t.id)}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ── Fila de tarea ────────────────────────────────────────────────────────────
function TaskRow({
  task, canWrite, onToggleDone, onOpen,
}: {
  task:         TaskDTO;
  canWrite:     boolean;
  onToggleDone: () => void;
  onOpen:       () => void;
}) {
  const done       = task.status === "done";
  const inProgress = task.status === "in_progress";
  const pr         = PRIORITY_STYLE[(task.priority as TaskPriority)] ?? PRIORITY_STYLE.medium;
  const overdue    = !!task.dueDate && !done && task.dueDate < isoDate(new Date());

  return (
    <div
      onClick={onOpen}
      style={{
        display: "flex", alignItems: "flex-start", gap: 7,
        padding: "6px 7px", borderRadius: 7, cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.045)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {/* Checkbox rápido — sólo si puedes escribir en el sector */}
      <button
        onClick={(e) => { e.stopPropagation(); if (canWrite) onToggleDone(); }}
        disabled={!canWrite}
        title={!canWrite ? "Read only" : done ? "Reopen" : "Mark as completed"}
        style={{
          width: 14, height: 14, flexShrink: 0, marginTop: 2, borderRadius: 4,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: done ? (canWrite ? PATRIA.blue : "rgba(13,13,56,0.28)") : "#FFFFFF",
          border: `1.5px solid ${done ? (canWrite ? PATRIA.blue : "rgba(13,13,56,0.28)") : "rgba(13,13,56,0.24)"}`,
          cursor: canWrite ? "pointer" : "not-allowed",
          opacity: canWrite ? 1 : 0.65,
          transition: "all 0.12s",
        }}
      >
        {done && <Check size={9} strokeWidth={3.5} color="#FFFFFF" />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, lineHeight: 1.4,
          color: done ? TEXT.muted : PATRIA.darkBlue,
          textDecoration: done ? "line-through" : "none",
          wordBreak: "break-word",
        }}>
          {task.title}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
          {inProgress && (
            <span
              title={STATUS_LABEL.in_progress}
              style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 700, color: PATRIA.kingBlue }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: PATRIA.kingBlue, display: "inline-block" }} />
              {STATUS_LABEL.in_progress}
            </span>
          )}

          {!done && (
            <span style={{
              fontSize: 8.5, fontWeight: 800, padding: "1px 5px", borderRadius: 4,
              background: pr.bg, color: pr.text, border: `1px solid ${pr.border}`,
            }}>
              {pr.label}
            </span>
          )}

          {task.dueDate && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontSize: 9.5, fontWeight: 600, fontFamily: FONT_SECONDARY,
              color: overdue ? "#B01029" : TEXT.muted,
            }}>
              <CalendarDays size={9} />
              {task.dueDate.slice(8, 10)}-{task.dueDate.slice(5, 7)}
            </span>
          )}

          {task.commentCount > 0 && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 2,
              fontSize: 9.5, color: TEXT.muted, fontFamily: FONT_SECONDARY,
            }}>
              <MessageSquare size={9} />{task.commentCount}
            </span>
          )}

          {task.assignee && (
            <span
              title={task.assignee.name ?? task.assignee.email ?? ""}
              style={{
                marginLeft: "auto", fontSize: 8.5, fontWeight: 800,
                padding: "1px 5px", borderRadius: 4, fontFamily: FONT_SECONDARY,
                background: "rgba(32,68,220,0.09)", color: PATRIA.blue,
                border: "1px solid rgba(32,68,220,0.22)",
              }}
            >
              {task.assignee.initials
                ?? (task.assignee.name ?? task.assignee.email ?? "?").slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
