"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, MessageSquare, CalendarDays, Loader2, Check, ChevronDown, ChevronRight } from "lucide-react";
import { useSession } from "next-auth/react";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";
import { useIsAdmin } from "@/lib/useIsAdmin";
import {
  PRIORITY_STYLE, PRIORITY_RANK, STATUS_LABEL,
  regionLabel, isoDate,
  type TaskPriority,
} from "@/lib/planning";
import type { TaskDTO, TasksPayload } from "@/lib/planningTasks";
import type { AnalystOption } from "@/app/api/planning/analysts/route";
import TaskDetailModal from "./TaskDetailModal";

// Vista micro: una caja por analista con su lista de tareas. Reemplazó al Kanban —
// no hay columnas de estado ni drag & drop.
//
//   · Admin   — una caja por cada analista del equipo, en grilla.
//   · Usuario — sólo su propia caja, a ancho completo.
//
// El estado se sigue moviendo: el checkbox alterna pendiente ↔ completada, y el
// modal de detalle (con el feed de comentarios) mantiene los tres estados, así que
// "In progress" sigue existiendo y se marca en la lista con un punto azul.

interface Props {
  /** Filtra por una celda del calendario macro (viene del contador de la grilla). */
  weeklyPlanId?: string;
}

/** Pendientes primero por fecha, luego por prioridad; completadas al final. */
function sortTasks(list: TaskDTO[]): TaskDTO[] {
  return [...list].sort((a, b) => {
    // Sin fecha va al final del bloque de pendientes.
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

export default function AnalystGrid({ weeklyPlanId }: Props) {
  const isAdmin = useIsAdmin();
  const { data: session } = useSession();
  const myId = session?.user?.id ?? null;

  const [tasks, setTasks]       = useState<TaskDTO[]>([]);
  const [analysts, setAnalysts] = useState<AnalystOption[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [openId, setOpenId]     = useState<string | null>(null);
  const [hideDone, setHideDone] = useState(false);

  const fetchTasks = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (weeklyPlanId) params.set("weeklyPlanId", weeklyPlanId);
      const res = await fetch(`/api/planning/tasks?${params}`);
      const d: TasksPayload & { error?: string } = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not load tasks");
      setTasks(d.tasks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load error");
    } finally {
      setLoading(false);
    }
  }, [weeklyPlanId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    fetch("/api/planning/analysts")
      .then((r) => (r.ok ? r.json() : { analysts: [] }))
      .then((d) => setAnalysts(d.analysts ?? []))
      .catch(() => {});
  }, []);

  // Qué cajas se dibujan. El admin ve al equipo: todo el que tenga sigla (es decir,
  // que participe del calendario) más cualquiera que tenga tareas aunque no la tenga.
  // Un usuario normal ve una sola caja, la suya.
  const boxes = useMemo(() => {
    if (!isAdmin) {
      const me = analysts.find((a) => a.id === myId);
      return me ? [me] : [];
    }
    const withTasks = new Set(tasks.map((t) => t.assignee.id));
    return analysts
      .filter((a) => (
        // Filtrando por una semana del calendario, dibujar al equipo entero llenaría
        // la pantalla de cajas vacías: ahí sólo van los que tienen algo en esa semana.
        weeklyPlanId ? withTasks.has(a.id) : (a.initials || withTasks.has(a.id))
      ))
      .sort((a, b) => {
        // El admin se ve a sí mismo primero; después por sigla.
        if (a.id === myId) return -1;
        if (b.id === myId) return 1;
        return (a.initials ?? a.name ?? "").localeCompare(b.initials ?? b.name ?? "");
      });
  }, [isAdmin, analysts, tasks, myId, weeklyPlanId]);

  const byAnalyst = useMemo(() => {
    const m = new Map<string, { open: TaskDTO[]; done: TaskDTO[] }>();
    for (const t of tasks) {
      const cur = m.get(t.assignee.id) ?? { open: [], done: [] };
      (t.status === "done" ? cur.done : cur.open).push(t);
      m.set(t.assignee.id, cur);
    }
    for (const v of m.values()) {
      v.open = sortTasks(v.open);
      // Completadas: lo último terminado arriba.
      v.done.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    }
    return m;
  }, [tasks]);

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
      fetchTasks();   // el optimismo se revierte con la verdad del servidor
    }
  }

  async function createTask(assigneeId: string, title: string) {
    const t = title.trim();
    if (!t) return;
    try {
      const res = await fetch("/api/planning/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          // Sólo el admin puede asignar a terceros; la API vuelve a validarlo.
          assigneeId: isAdmin ? assigneeId : undefined,
          weeklyPlanId: weeklyPlanId ?? undefined,
        }),
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

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: TEXT.label }}>
          {isAdmin
            ? `${boxes.length} analyst${boxes.length === 1 ? "" : "s"} · ${totalOpen} open task${totalOpen === 1 ? "" : "s"}`
            : `Your tasks · ${totalOpen} open`}
        </span>

        <label style={{
          marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6,
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

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "70px 0", gap: 10 }}>
          <Loader2 size={20} style={{ animation: "spin 0.8s linear infinite", color: PATRIA.kingBlue }} />
          <span style={{ fontSize: 12.5, color: TEXT.label }}>Loading tasks…</span>
        </div>
      ) : boxes.length === 0 ? (
        <div style={{
          padding: "50px 20px", textAlign: "center", background: "#F5F7FD",
          borderRadius: 12, border: `1px solid ${BORDER.subtle}`,
        }}>
          <p style={{ fontSize: 13, color: TEXT.label, margin: 0 }}>
            {!isAdmin
              ? "Your user is not set up as an analyst yet."
              : weeklyPlanId
                ? "No tasks linked to this week yet."
                : "No analysts yet. Set initials for your users in Administration → Users."}
          </p>
        </div>
      ) : (
        <div style={{
          display: "grid",
          // El analista ve una sola caja, así que ocupa todo el ancho; el admin ve
          // una grilla que se acomoda al número de personas.
          gridTemplateColumns: isAdmin ? "repeat(auto-fill, minmax(320px, 1fr))" : "1fr",
          gap: 14, alignItems: "start",
        }}>
          {boxes.map((a) => (
            <AnalystBox
              key={a.id}
              analyst={a}
              isMe={a.id === myId}
              canCreate={isAdmin || a.id === myId}
              open={byAnalyst.get(a.id)?.open ?? []}
              done={hideDone ? [] : byAnalyst.get(a.id)?.done ?? []}
              doneCount={byAnalyst.get(a.id)?.done.length ?? 0}
              hideDone={hideDone}
              onToggleDone={toggleDone}
              onOpen={setOpenId}
              onCreate={(title) => createTask(a.id, title)}
            />
          ))}
        </div>
      )}

      {openId && (
        <TaskDetailModal
          taskId={openId}
          analysts={analysts}
          onClose={() => setOpenId(null)}
          onChanged={fetchTasks}
        />
      )}
    </div>
  );
}

// ── Caja de un analista ──────────────────────────────────────────────────────
function AnalystBox({
  analyst, isMe, canCreate, open, done, doneCount, hideDone, onToggleDone, onOpen, onCreate,
}: {
  analyst:      AnalystOption;
  isMe:         boolean;
  canCreate:    boolean;
  open:         TaskDTO[];
  done:         TaskDTO[];
  doneCount:    number;
  hideDone:     boolean;
  onToggleDone: (t: TaskDTO) => void;
  onOpen:       (id: string) => void;
  onCreate:     (title: string) => void;
}) {
  const [adding, setAdding]     = useState(false);
  const [title, setTitle]       = useState("");
  const [showDone, setShowDone] = useState(false);

  function submit() {
    if (title.trim()) onCreate(title);
    setTitle("");
    setAdding(false);
  }

  const badge = analyst.initials
    ?? (analyst.name ?? analyst.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div style={{
      background: "#FFFFFF", borderRadius: 12,
      border: `1px solid ${isMe ? "rgba(32,68,220,0.28)" : BORDER.base}`,
      boxShadow: "0 1px 4px rgba(13,13,56,0.06)", overflow: "hidden",
    }}>
      {/* Header de la caja */}
      <div style={{
        display: "flex", alignItems: "center", gap: 9,
        padding: "10px 13px", borderBottom: `1px solid ${BORDER.subtle}`,
        background: isMe ? "rgba(32,68,220,0.05)" : "#F5F7FD",
      }}>
        <span style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isMe ? PATRIA.blue : "rgba(13,13,56,0.08)",
          color: isMe ? "#FFFFFF" : PATRIA.darkBlue,
          fontSize: 11, fontWeight: 800, fontFamily: FONT_SECONDARY,
        }}>
          {badge}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 700, color: PATRIA.darkBlue,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {analyst.name || analyst.email}
            {isMe && <span style={{ fontSize: 9.5, color: TEXT.muted, fontWeight: 600, marginLeft: 6 }}>you</span>}
          </div>
          <div style={{ fontSize: 10, color: TEXT.muted, fontFamily: FONT_SECONDARY }}>
            {open.length} open{doneCount > 0 && ` · ${doneCount} done`}
          </div>
        </div>

        {canCreate && (
          <button
            onClick={() => { setAdding(true); setTitle(""); }}
            title="New task"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 24, height: 24, borderRadius: 7, flexShrink: 0,
              background: "#FFFFFF", border: `1px solid ${BORDER.base}`,
              color: PATRIA.blue, cursor: "pointer",
            }}
          >
            <Plus size={13} />
          </button>
        )}
      </div>

      {/* Lista */}
      <div style={{ padding: "8px 10px 10px" }}>
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
              width: "100%", boxSizing: "border-box", padding: "7px 10px", marginBottom: 8,
              borderRadius: 8, border: `1px solid ${PATRIA.kingBlue}`,
              background: "#FFFFFF", color: PATRIA.darkBlue, fontSize: 12.5, outline: "none",
            }}
          />
        )}

        {open.length === 0 && !adding && (
          <p style={{
            fontSize: 11.5, color: TEXT.disabled, fontStyle: "italic",
            textAlign: "center", padding: "16px 0", margin: 0,
          }}>
            No open tasks
          </p>
        )}

        {open.map((t) => (
          <TaskRow key={t.id} task={t} onToggleDone={() => onToggleDone(t)} onOpen={() => onOpen(t.id)} />
        ))}

        {/* Completadas, plegadas por defecto */}
        {!hideDone && done.length > 0 && (
          <>
            <button
              onClick={() => setShowDone((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 5, width: "100%",
                marginTop: open.length ? 8 : 0, padding: "5px 4px",
                background: "transparent", border: "none", cursor: "pointer",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                textTransform: "uppercase", color: TEXT.muted,
              }}
            >
              {showDone ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              Completed ({done.length})
            </button>

            {showDone && done.map((t) => (
              <TaskRow key={t.id} task={t} onToggleDone={() => onToggleDone(t)} onOpen={() => onOpen(t.id)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Fila de tarea ────────────────────────────────────────────────────────────
function TaskRow({
  task, onToggleDone, onOpen,
}: {
  task:         TaskDTO;
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
        display: "flex", alignItems: "flex-start", gap: 8,
        padding: "7px 8px", borderRadius: 8, cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.045)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {/* Checkbox rápido */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleDone(); }}
        title={done ? "Reopen" : "Mark as completed"}
        style={{
          width: 15, height: 15, flexShrink: 0, marginTop: 2, borderRadius: 4,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: done ? PATRIA.blue : "#FFFFFF",
          border: `1.5px solid ${done ? PATRIA.blue : "rgba(13,13,56,0.24)"}`,
          cursor: "pointer", transition: "all 0.12s",
        }}
      >
        {done && <Check size={10} strokeWidth={3.5} color="#FFFFFF" />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 600, lineHeight: 1.4,
          color: done ? TEXT.muted : PATRIA.darkBlue,
          textDecoration: done ? "line-through" : "none",
          wordBreak: "break-word",
        }}>
          {task.title}
        </div>

        {/* Metadatos */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4, flexWrap: "wrap" }}>
          {inProgress && (
            <span
              title={STATUS_LABEL.in_progress}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 9.5, fontWeight: 700, color: PATRIA.kingBlue,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: PATRIA.kingBlue, display: "inline-block" }} />
              {STATUS_LABEL.in_progress}
            </span>
          )}

          {!done && (
            <span style={{
              fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 4,
              background: pr.bg, color: pr.text, border: `1px solid ${pr.border}`,
            }}>
              {pr.label}
            </span>
          )}

          {task.dueDate && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontSize: 10, fontWeight: 600, fontFamily: FONT_SECONDARY,
              color: overdue ? "#B01029" : TEXT.muted,
            }}>
              <CalendarDays size={9.5} />
              {task.dueDate.slice(8, 10)}-{task.dueDate.slice(5, 7)}
            </span>
          )}

          {task.region && (
            <span style={{ fontSize: 9.5, color: TEXT.disabled, fontWeight: 600 }}>
              {regionLabel(task.region)}
            </span>
          )}

          {task.commentCount > 0 && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontSize: 10, color: TEXT.muted, fontFamily: FONT_SECONDARY,
            }}>
              <MessageSquare size={9.5} />{task.commentCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
