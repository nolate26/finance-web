"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Trash2, Loader2, Send, Check } from "lucide-react";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";
import { useIsAdmin } from "@/lib/useIsAdmin";
import {
  TASK_STATUSES, STATUS_LABEL, TASK_PRIORITIES, PRIORITY_STYLE,
  PLAN_REGIONS, regionLabel,
  type TaskPriority,
} from "@/lib/planning";
import type { TaskDTO } from "@/lib/planningTasks";
import type { CommentDTO } from "@/app/api/planning/tasks/[id]/comments/route";
import type { AnalystOption } from "@/app/api/planning/analysts/route";

// Detalle de una tarjeta: campos editables arriba, feed de comentarios abajo.
// El admin puede reasignar y borrar; el analista edita todo lo demás de lo suyo.

interface Props {
  taskId:   string;
  analysts: AnalystOption[];
  onClose:  () => void;
  onChanged: () => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: 8,
  border: `1px solid ${BORDER.base}`, background: "#F5F7FD",
  color: PATRIA.darkBlue, fontSize: 12.5, outline: "none", fontFamily: FONT_SECONDARY,
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.07em",
  textTransform: "uppercase", color: TEXT.muted, marginBottom: 5,
};

function initialsOf(u: { initials: string | null; name: string | null; email: string | null }): string {
  if (u.initials) return u.initials;
  const base = u.name || u.email || "?";
  return base.slice(0, 2).toUpperCase();
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)  return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)   return `${d} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TaskDetailModal({ taskId, analysts, onClose, onChanged }: Props) {
  const isAdmin = useIsAdmin();

  const [task, setTask]         = useState<TaskDTO | null>(null);
  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [draft, setDraft]       = useState("");
  const [posting, setPosting]   = useState(false);

  const feedEnd = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/planning/tasks/${taskId}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not load the task");
      setTask(d.task);
      setComments(d.comments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load error");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    feedEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [comments.length]);

  // Guarda un campo y refresca el tablero de fondo, sin cerrar el modal.
  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/planning/tasks/${taskId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not save");
      setTask(d.task);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function postComment() {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/planning/tasks/${taskId}/comments`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ body }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not post the comment");
      setComments((c) => [...c, d.comment]);
      setDraft("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post the comment");
    } finally {
      setPosting(false);
    }
  }

  async function removeTask() {
    if (!confirm("Delete this task and all its comments?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/planning/tasks/${taskId}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not delete the task");
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the task");
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(13,13,56,0.42)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF", borderRadius: 14, width: "min(660px, 100%)",
          maxHeight: "88vh", display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(13,13,56,0.28)", border: `1px solid ${BORDER.base}`,
        }}
      >
        {loading || !task ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 70, gap: 10 }}>
            <Loader2 size={18} style={{ animation: "spin 0.8s linear infinite", color: PATRIA.kingBlue }} />
            <span style={{ fontSize: 12.5, color: TEXT.label }}>{error ?? "Loading…"}</span>
          </div>
        ) : (
          <>
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div style={{
              padding: "14px 18px", borderBottom: `1px solid ${BORDER.subtle}`,
              background: "#F5F7FD", display: "flex", alignItems: "flex-start", gap: 12,
            }}>
              <input
                defaultValue={task.title}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== task.title) patch({ title: v });
                }}
                maxLength={300}
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  fontSize: 15, fontWeight: 800, color: PATRIA.darkBlue,
                  letterSpacing: "-0.015em", padding: 0,
                }}
              />
              <button
                onClick={onClose}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: TEXT.label, padding: 2 }}
              >
                <X size={18} />
              </button>
            </div>

            {/* ── Cuerpo ─────────────────────────────────────────────────────── */}
            <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
              {/* Estado + prioridad */}
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
                <div style={{ flex: "1 1 180px" }}>
                  <label style={labelStyle}>Status</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {TASK_STATUSES.map((s) => {
                      const on = task.status === s;
                      return (
                        <button
                          key={s}
                          onClick={() => !on && patch({ status: s })}
                          style={{
                            flex: 1, padding: "5px 8px", borderRadius: 7, fontSize: 11,
                            fontWeight: on ? 800 : 600, cursor: on ? "default" : "pointer",
                            background: on ? PATRIA.blue : "#F5F7FD",
                            color:      on ? "#FFFFFF" : TEXT.label,
                            border: `1px solid ${on ? PATRIA.blue : BORDER.base}`,
                            whiteSpace: "nowrap", transition: "all 0.12s",
                          }}
                        >
                          {STATUS_LABEL[s]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ flex: "1 1 150px" }}>
                  <label style={labelStyle}>Priority</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {TASK_PRIORITIES.map((p) => {
                      const on = task.priority === p;
                      const st = PRIORITY_STYLE[p];
                      return (
                        <button
                          key={p}
                          onClick={() => !on && patch({ priority: p })}
                          style={{
                            flex: 1, padding: "5px 8px", borderRadius: 7, fontSize: 11,
                            fontWeight: on ? 800 : 600, cursor: on ? "default" : "pointer",
                            background: on ? st.bg : "#F5F7FD",
                            color:      on ? st.text : TEXT.label,
                            border: `1px solid ${on ? st.border : BORDER.base}`,
                            transition: "all 0.12s",
                          }}
                        >
                          {st.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Fecha / analista / región */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                <div style={{ flex: "1 1 150px" }}>
                  <label style={labelStyle}>Due date</label>
                  <input
                    type="date"
                    defaultValue={task.dueDate ?? ""}
                    onChange={(e) => patch({ dueDate: e.target.value || null })}
                    style={inputStyle}
                  />
                </div>

                <div style={{ flex: "1 1 170px" }}>
                  <label style={labelStyle}>Analyst</label>
                  {isAdmin ? (
                    <select
                      value={task.assignee.id}
                      onChange={(e) => patch({ assigneeId: e.target.value })}
                      style={{ ...inputStyle, cursor: "pointer" }}
                    >
                      {analysts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.initials ? `${a.initials} · ` : ""}{a.name || a.email}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ ...inputStyle, background: "#FFFFFF", color: TEXT.label }}>
                      {task.assignee.name || task.assignee.email}
                    </div>
                  )}
                </div>

                <div style={{ flex: "1 1 130px" }}>
                  <label style={labelStyle}>Region</label>
                  <select
                    value={task.region ?? ""}
                    onChange={(e) => patch({ region: e.target.value || null })}
                    style={{ ...inputStyle, cursor: "pointer" }}
                  >
                    <option value="">—</option>
                    {PLAN_REGIONS.map((r) => (
                      <option key={r} value={r}>{regionLabel(r)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Descripción */}
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Description</label>
                <textarea
                  defaultValue={task.description ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (task.description ?? "")) patch({ description: v });
                  }}
                  rows={3}
                  placeholder="Task details…"
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55 }}
                />
              </div>

              {/* ── Feed de comentarios ──────────────────────────────────────── */}
              <div style={{ borderTop: `1px solid ${BORDER.subtle}`, paddingTop: 14 }}>
                <label style={{ ...labelStyle, marginBottom: 10 }}>
                  Comments {comments.length > 0 && `(${comments.length})`}
                </label>

                {comments.length === 0 && (
                  <p style={{ fontSize: 11.5, color: TEXT.disabled, fontStyle: "italic", marginBottom: 12 }}>
                    No comments yet.
                  </p>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                  {comments.map((c) => (
                    <div key={c.id} style={{ display: "flex", gap: 9 }}>
                      <span style={{
                        width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(32,68,220,0.10)", color: PATRIA.blue,
                        fontSize: 10, fontWeight: 800, fontFamily: FONT_SECONDARY,
                      }}>
                        {initialsOf(c.author)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: PATRIA.darkBlue }}>
                            {c.author.name || c.author.email}
                          </span>
                          <span style={{ fontSize: 10, color: TEXT.disabled, fontFamily: FONT_SECONDARY }}>
                            {relTime(c.createdAt)}
                          </span>
                        </div>
                        <p style={{
                          fontSize: 12.5, color: TEXT.body, marginTop: 2,
                          lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
                        }}>
                          {c.body}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={feedEnd} />
                </div>

                {/* Nuevo comentario */}
                <div style={{ display: "flex", gap: 7, alignItems: "flex-end" }}>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter envía, Shift+Enter hace salto de línea.
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(); }
                    }}
                    rows={2}
                    placeholder="Write an update…  (Enter to send)"
                    style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                  />
                  <button
                    onClick={postComment}
                    disabled={posting || !draft.trim()}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 36, height: 36, flexShrink: 0, borderRadius: 8,
                      background: draft.trim() ? PATRIA.blue : "#F5F7FD",
                      color: draft.trim() ? "#FFFFFF" : TEXT.disabled,
                      border: `1px solid ${draft.trim() ? PATRIA.blue : BORDER.base}`,
                      cursor: draft.trim() && !posting ? "pointer" : "default",
                    }}
                  >
                    {posting
                      ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} />
                      : <Send size={14} />}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{
                  fontSize: 12, color: "#B01029", background: "rgba(248,72,94,0.08)",
                  border: "1px solid rgba(248,72,94,0.24)", borderRadius: 8,
                  padding: "8px 11px", marginTop: 12,
                }}>
                  {error}
                </div>
              )}
            </div>

            {/* ── Footer ─────────────────────────────────────────────────────── */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 18px", borderTop: `1px solid ${BORDER.subtle}`, background: "#F5F7FD",
            }}>
              <button
                onClick={removeTask}
                disabled={saving}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 12, fontWeight: 600, color: PATRIA.pink,
                  background: "transparent", border: "none",
                  cursor: saving ? "default" : "pointer", padding: "5px 2px",
                }}
              >
                <Trash2 size={13} /> Delete task
              </button>

              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 10.5, color: TEXT.disabled, fontFamily: FONT_SECONDARY,
              }}>
                {saving
                  ? <><Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} /> saving…</>
                  : <><Check size={11} /> changes save instantly</>}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
