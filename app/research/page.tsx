"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Loader2, Search, X, ChevronDown, Mail, ExternalLink, Copy, Check, Send, Pencil, Trash2, Save } from "lucide-react";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { FONT_SECONDARY } from "@/lib/patriaTheme";
import { prepareResearchHtml } from "@/lib/researchHtml";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResearchRecord {
  id:             number;
  company:        string;
  date:           string;
  category:       string;
  title:          string | null;
  subject:        string | null;
  from:           string | null;
  html:           string;
  industry:       string;
  targetPrice:    number | null;
  recommendation: string | null;
}

interface Filters {
  categories: string[];
  companies:  string[];
  froms:      string[];
  industries: string[];
}

interface ResearchTicker {
  ticker:   string;
  name:     string;
  industry: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// Local "today" as an ISO yyyy-mm-dd string (avoids UTC off-by-one).
function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// yyyy-mm-dd → dd-mm-yyyy (the subject-line date format).
function isoToDMY(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function senderName(from: string | null): string {
  if (!from) return "—";
  const match = from.match(/^([^<]+)</);
  return match ? match[1].trim() : from.replace(/<.*>/, "").trim() || from;
}

// Target price: ignore null / NaN, format the rest with thousands separators.
function fmtTarget(v: number | null | undefined): string | null {
  if (v == null || Number.isNaN(v)) return null;
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// Recommendation: treat "N/A", "NaN", "null", "-", "" as empty.
function cleanRec(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t || /^(n\/?a|nan|null|none|-+)$/i.test(t)) return null;
  return t;
}

// ── Category grouping ──────────────────────────────────────────────────────────

// Mismas categorías que el compositor de asunto (TYPE_OPTIONS).
const GROUP_ORDER = ["Meetings", "Update", "Case", "Earnings", "Sellside", "Other"] as const;
type Group = (typeof GROUP_ORDER)[number];

function categoryGroup(cat: string | null | undefined): Group {
  const c = (cat ?? "").toLowerCase();
  if (c.includes("meeting"))                        return "Meetings";
  if (/sell[\s-]?side/.test(c))                     return "Sellside";
  if (c.includes("earning"))                        return "Earnings";
  if (c.includes("case"))                           return "Case";
  if (c.includes("update"))                         return "Update";
  return "Other";
}

const GROUP_COLORS: Record<Group, { bg: string; border: string; text: string }> = {
  Meetings: { bg: "rgba(32,68,220,0.08)",   border: "rgba(32,68,220,0.22)",   text: "#2044DC" },
  Update:   { bg: "rgba(0,30,175,0.08)",   border: "rgba(0,30,175,0.22)",   text: "#001EAF" },
  Case:     { bg: "rgba(0,30,175,0.08)",  border: "rgba(0,30,175,0.22)",  text: "#0D0D38" },
  Earnings: { bg: "rgba(32,68,220,0.08)",   border: "rgba(32,68,220,0.22)",   text: "#001EAF" },
  Sellside: { bg: "rgba(255,107,6,0.08)",   border: "rgba(255,107,6,0.22)",   text: "#FF6B06" },
  Other:    { bg: "rgba(13,13,56,0.08)", border: "rgba(13,13,56,0.22)", text: "#0D0D38" },
};
function groupColor(g: Group) { return GROUP_COLORS[g]; }

// Cuántas notas (más recientes) se muestran por categoría antes de expandir.
const PREVIEW_COUNT = 4;

// Recommendation pill colour by direction.
function recColor(rec: string) {
  const t = rec.toUpperCase();
  if (/BUY|OVERWEIGHT|OUTPERFORM|ACCUMULATE|ADD|COMPRA|SOBREPONDERAR/.test(t))
    return { bg: "rgba(0,30,175,0.10)",  border: "rgba(0,30,175,0.28)",  text: "#001EAF" };
  if (/SELL|UNDERWEIGHT|UNDERPERFORM|REDUCE|VENTA|SUBPONDERAR/.test(t))
    return { bg: "rgba(248,72,94,0.10)",  border: "rgba(248,72,94,0.28)",  text: "#F8485E" };
  if (/HOLD|NEUTRAL|MARKET|EQUAL|MANTENER|PERFORM/.test(t))
    return { bg: "rgba(255,107,6,0.10)",  border: "rgba(255,107,6,0.28)",  text: "#FF6B06" };
  return { bg: "rgba(13,13,56,0.10)", border: "rgba(13,13,56,0.26)", text: "rgba(13,13,56,0.62)" };
}

const GRID = "110px 150px minmax(160px,1fr) 120px 90px 120px 140px 36px";

// ── Filter chip ───────────────────────────────────────────────────────────────

function FilterSelect({
  label, value, options, onChange,
}: {
  label:    string;
  value:    string;
  options:  string[];
  onChange: (v: string) => void;
}) {
  const active = value !== "";
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: "none",
          padding:    "6px 28px 6px 10px",
          borderRadius: 8,
          background: active ? "rgba(32,68,220,0.07)" : "#F5F7FD",
          border:     active ? "1px solid rgba(32,68,220,0.30)" : "1px solid rgba(13,13,56,0.12)",
          color:      active ? "#001EAF" : "rgba(13,13,56,0.62)",
          fontSize:   12,
          fontWeight: active ? 600 : 400,
          fontFamily: FONT_SECONDARY,
          cursor:     "pointer",
          outline:    "none",
          minWidth:   120,
        }}
      >
        <option value="">{label}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown
        size={12}
        style={{
          position: "absolute", right: 8, pointerEvents: "none",
          color: active ? "#2044DC" : "rgba(13,13,56,0.45)",
        }}
      />
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────

function DetailModal({
  record, onClose, isAdmin, onChanged,
}: {
  record:    ResearchRecord;
  onClose:   () => void;
  isAdmin:   boolean;
  onChanged: () => void;
}) {
  const col = groupColor(categoryGroup(record.category));
  const tp  = fmtTarget(record.targetPrice);
  const rec = cleanRec(record.recommendation);
  // Solo el <body> del correo: el <style> de Word se descarta y las viñetas
  // las pone `.research-html` (globals.css).
  const bodyHtml = useMemo(() => prepareResearchHtml(record.html), [record.html]);

  // ── Admin edit state ──────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);   // cuerpo editable (contentEditable)
  const [form, setForm] = useState({
    company:        record.company,
    date:           record.date,
    category:       record.category,
    title:          record.title ?? "",
    targetPrice:    record.targetPrice != null ? String(record.targetPrice) : "",
    recommendation: record.recommendation ?? "",
  });

  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));
  const editInput: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 7,
    border: "1px solid rgba(13,13,56,0.14)", background: "#F5F7FD", fontSize: 12.5, color: "#0D0D38", outline: "none",
  };

  async function save() {
    setErr(null);
    if (!form.company.trim() || !form.category.trim() || !form.date) {
      setErr("Company, categoría y fecha son obligatorios."); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/research/${record.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company:        form.company.trim(),
          date:           form.date,
          category:       form.category.trim(),
          title:          form.title.trim() || null,
          targetPrice:    form.targetPrice.trim() === "" ? null : Number(form.targetPrice),
          recommendation: form.recommendation.trim() || null,
          html:           bodyRef.current ? bodyRef.current.innerHTML : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo guardar.");
      onChanged();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("¿Eliminar esta nota de research? Esta acción no se puede deshacer.")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/research/${record.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo eliminar.");
      onChanged();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(13,13,56,0.55)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "32px 24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 18,
          boxShadow: "0 32px 80px rgba(13,13,56,0.28), 0 0 0 1px rgba(13,13,56,0.06)",
          width: "100%", maxWidth: 1020,
          maxHeight: "90vh", display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ── Modal header ──────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: "22px 28px 18px",
          borderBottom: "1px solid rgba(13,13,56,0.07)",
          background: "linear-gradient(to bottom, #F5F7FD, #fff)",
          gap: 16, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Chips row */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.10em",
                textTransform: "uppercase",
                padding: "3px 9px", borderRadius: 6,
                background: col.bg, border: `1px solid ${col.border}`, color: col.text,
              }}>
                {record.category}
              </span>
              <span style={{
                fontSize: 11, color: "rgba(13,13,56,0.62)",
                fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
                background: "#F5F7FD", borderRadius: 5,
                padding: "2px 7px",
              }}>
                {formatDate(record.date)}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, color: "#2044DC",
                background: "rgba(32,68,220,0.07)",
                border: "1px solid rgba(32,68,220,0.18)",
                borderRadius: 6, padding: "2px 9px",
              }}>
                {record.company}
              </span>
              {tp && (
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "#0D0D38",
                  background: "#F5F7FD", border: "1px solid rgba(13,13,56,0.10)",
                  borderRadius: 6, padding: "2px 9px", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
                }}>
                  TP {tp}
                </span>
              )}
              {rec && (() => {
                const rc = recColor(rec);
                return (
                  <span style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                    padding: "3px 9px", borderRadius: 6,
                    background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text,
                  }}>
                    {rec}
                  </span>
                );
              })()}
              {record.industry && record.industry !== "Other" && (
                <span style={{ fontSize: 10, color: "rgba(13,13,56,0.62)" }}>
                  {record.industry}
                </span>
              )}
            </div>

            {/* Title */}
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0D0D38", lineHeight: 1.3, letterSpacing: "-0.01em" }}>
              {record.title ?? record.subject ?? "No title"}
            </div>

            {/* From */}
            {record.from && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 7 }}>
                <Mail size={11} style={{ color: "rgba(13,13,56,0.62)", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "rgba(13,13,56,0.62)" }}>{record.from}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
            {isAdmin && !editing && (
              <>
                <button
                  onClick={() => { setEditing(true); setErr(null); }}
                  title="Editar / mover esta nota"
                  style={{
                    display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 12px",
                    borderRadius: 9, background: "rgba(32,68,220,0.07)", border: "1px solid rgba(32,68,220,0.22)",
                    color: "#2044DC", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  <Pencil size={13} /> Editar
                </button>
                <button
                  onClick={remove}
                  disabled={saving}
                  title="Eliminar esta nota"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 34, height: 34, borderRadius: 9,
                    background: "rgba(248,72,94,0.06)", border: "1px solid rgba(248,72,94,0.22)",
                    color: "#F8485E", cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
            {/* Close */}
            <button
              onClick={onClose}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                background: "transparent", border: "1px solid rgba(13,13,56,0.10)",
                cursor: "pointer", color: "rgba(13,13,56,0.62)", transition: "all 0.12s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(13,13,56,0.06)";
                (e.currentTarget as HTMLElement).style.color = "#0D0D38";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "rgba(13,13,56,0.62)";
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Admin edit form ─────────────────────────────────────────── */}
        {editing && (
          <div style={{ padding: "16px 28px", borderBottom: "1px solid rgba(13,13,56,0.07)", background: "#F5F7FD", flexShrink: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(13,13,56,0.62)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Company (mover)</span>
                <input value={form.company} onChange={(e) => patch({ company: e.target.value })} style={editInput} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(13,13,56,0.62)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Categoría</span>
                <input value={form.category} onChange={(e) => patch({ category: e.target.value })} style={editInput} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(13,13,56,0.62)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Fecha</span>
                <input type="date" value={form.date} onChange={(e) => patch({ date: e.target.value })} style={editInput} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(13,13,56,0.62)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Título</span>
                <input value={form.title} onChange={(e) => patch({ title: e.target.value })} style={editInput} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(13,13,56,0.62)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Target Price</span>
                <input type="number" value={form.targetPrice} onChange={(e) => patch({ targetPrice: e.target.value })} style={{ ...editInput, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(13,13,56,0.62)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Recomendación</span>
                <input value={form.recommendation} onChange={(e) => patch({ recommendation: e.target.value })} placeholder="BUY / HOLD / SELL…" style={editInput} />
              </label>
            </div>

            {err && <div style={{ marginTop: 10, fontSize: 12, color: "#F8485E" }}>{err}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button
                onClick={() => { setEditing(false); setErr(null); }}
                disabled={saving}
                style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(13,13,56,0.14)", background: "#fff", color: "rgba(13,13,56,0.62)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "7px 16px", borderRadius: 8, border: "none",
                  background: saving ? "rgba(32,68,220,0.5)" : "#2044DC", color: "#fff",
                  fontSize: 12.5, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> : <Save size={13} />}
                Guardar
              </button>
            </div>
          </div>
        )}

        {/* ── HTML body ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
          {editing && (
            <div style={{ maxWidth: 760, margin: "0 auto", padding: "14px 40px 0", display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#2044DC" }}>
              <Pencil size={12} /> Contenido editable — escribe directamente sobre el texto de la nota.
            </div>
          )}
          <div
            ref={bodyRef}
            className="research-html"
            contentEditable={editing}
            suppressContentEditableWarning
            style={{
              maxWidth: 760, margin: "0 auto",
              padding: "32px 40px 48px",
              fontSize: 14, lineHeight: 1.75, color: "#0D0D38",
              fontFamily: FONT_SECONDARY,
              ...(editing ? {
                border: "1px solid rgba(32,68,220,0.35)",
                borderRadius: 10,
                background: "#F5F7FD",
                margin: "8px 24px 24px",
                padding: "20px 28px",
                minHeight: 140,
                outline: "none",
              } : {}),
            }}
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Table row ─────────────────────────────────────────────────────────────────

function NoteRow({ r, zebra, onClick }: { r: ResearchRecord; zebra: boolean; onClick: () => void }) {
  const col = groupColor(categoryGroup(r.category));
  const tp  = fmtTarget(r.targetPrice);
  const rec = cleanRec(r.recommendation);
  const rc  = rec ? recColor(rec) : null;
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: "0 16px",
        padding: "13px 20px",
        alignItems: "center",
        borderBottom: "1px solid rgba(13,13,56,0.05)",
        background: zebra ? "rgba(13,13,56,0.012)" : "transparent",
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.03)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = zebra ? "rgba(13,13,56,0.012)" : "transparent"; }}
    >
      {/* Date */}
      <div style={{ fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", fontSize: 11, color: "rgba(13,13,56,0.62)", whiteSpace: "nowrap" }}>
        {formatDate(r.date)}
      </div>

      {/* Company + industry */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0D0D38", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {r.company}
        </div>
        <div style={{ fontSize: 10, color: "rgba(13,13,56,0.62)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {r.industry}
        </div>
      </div>

      {/* Title */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#0D0D38", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {r.title ?? r.subject ?? <span style={{ color: "rgba(13,13,56,0.62)" }}>No title</span>}
        </div>
      </div>

      {/* Category badge */}
      <div>
        <span style={{
          display: "inline-block",
          fontSize: 10, fontWeight: 700,
          padding: "2px 8px", borderRadius: 6,
          background: col.bg, border: `1px solid ${col.border}`, color: col.text,
          whiteSpace: "nowrap", maxWidth: "100%",
          overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {r.category}
        </span>
      </div>

      {/* Target price */}
      <div style={{ fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", fontSize: 11, fontWeight: 600, color: tp ? "#0D0D38" : "rgba(13,13,56,0.45)", whiteSpace: "nowrap" }}>
        {tp ?? "—"}
      </div>

      {/* Recommendation */}
      <div>
        {rec && rc ? (
          <span style={{
            display: "inline-block", fontSize: 10, fontWeight: 800,
            letterSpacing: "0.04em", textTransform: "uppercase",
            padding: "2px 8px", borderRadius: 6,
            background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text,
            whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {rec}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "rgba(13,13,56,0.62)" }}>—</span>
        )}
      </div>

      {/* From */}
      <div style={{ fontSize: 11, color: "rgba(13,13,56,0.62)", display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
        <Mail size={11} style={{ flexShrink: 0, color: "rgba(13,13,56,0.62)" }} />
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {senderName(r.from)}
        </span>
      </div>

      {/* Open icon */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ExternalLink size={13} style={{ color: "rgba(13,13,56,0.62)" }} />
      </div>
    </div>
  );
}

// ── Subject composer ────────────────────────────────────────────────────────────

const SUBJECT_EMAIL = "meetingsequities@patria.com";
const TYPE_OPTIONS  = ["Meetings", "Update", "Case", "Earnings", "Sellside", "Other"] as const;
const REC_OPTIONS   = ["", "BUY", "SELL", "HOLD"] as const;

// Searchable multi-select for BBG tickers.
function TickerPicker({
  universe, selected, onChange,
}: {
  universe: ResearchTicker[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open,  setOpen]  = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chosen = new Set(selected);
    return universe
      .filter((t) => !chosen.has(t.ticker))
      .filter((t) => !q || t.ticker.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [universe, selected, query]);

  const add    = (t: string) => { onChange([...selected, t]); setQuery(""); setOpen(true); };
  const remove = (t: string) => onChange(selected.filter((x) => x !== t));

  // Enter picks the single/top match, letting a fast typist add without the mouse.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && results.length > 0) { e.preventDefault(); add(results[0].ticker); }
    if (e.key === "Backspace" && !query && selected.length > 0) remove(selected[selected.length - 1]);
  };

  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%" }}>
      <div
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", flexWrap: "wrap", gap: 5,
          minHeight: 34, padding: "3px 8px", boxSizing: "border-box",
          borderRadius: 8, background: "#F5F7FD",
          border: "1px solid rgba(13,13,56,0.12)", cursor: "text",
        }}
      >
        {selected.map((t) => (
          <span key={t} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 11, fontWeight: 700, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
            color: "#001EAF", background: "rgba(32,68,220,0.09)",
            border: "1px solid rgba(32,68,220,0.22)", borderRadius: 6, padding: "2px 4px 2px 7px",
          }}>
            {t}
            <button
              onClick={(e) => { e.stopPropagation(); remove(t); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "none", background: "transparent", cursor: "pointer",
                color: "#2044DC", padding: 0, lineHeight: 0,
              }}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={selected.length ? "" : "Search BBG ticker…"}
          style={{
            flex: "1 1 80px", minWidth: 80, border: "none", outline: "none",
            background: "transparent", fontSize: 12, color: "#0D0D38",
            fontFamily: FONT_SECONDARY,
          }}
        />
      </div>

      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          background: "#fff", borderRadius: 10,
          border: "1px solid rgba(13,13,56,0.10)",
          boxShadow: "0 12px 32px rgba(13,13,56,0.16)",
          overflow: "hidden", maxHeight: 260, overflowY: "auto",
        }}>
          {results.map((t) => (
            <button
              key={t.ticker}
              onClick={() => add(t.ticker)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                width: "100%", textAlign: "left", padding: "8px 12px",
                border: "none", borderBottom: "1px solid rgba(13,13,56,0.05)",
                background: "transparent", cursor: "pointer",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.05)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", color: "#0D0D38" }}>
                  {t.ticker}
                </span>
                <span style={{ display: "block", fontSize: 10, color: "rgba(13,13,56,0.62)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t.name}
                </span>
              </span>
              <span style={{ fontSize: 10, color: "rgba(13,13,56,0.62)", whiteSpace: "nowrap", flexShrink: 0 }}>{t.industry}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Small labelled field wrapper for the composer grid.
function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(13,13,56,0.45)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const composerInput: React.CSSProperties = {
  padding: "7px 10px", borderRadius: 8, background: "#F5F7FD",
  border: "1px solid rgba(13,13,56,0.12)", color: "#0D0D38",
  fontSize: 12, outline: "none", fontFamily: FONT_SECONDARY,
  boxSizing: "border-box", width: "100%",
};

function SubjectComposer({ universe }: { universe: ResearchTicker[] }) {
  const [type,    setType]    = useState<(typeof TYPE_OPTIONS)[number]>("Update");
  const [tickers, setTickers] = useState<string[]>([]);
  const [title,   setTitle]   = useState("");
  const [date,    setDate]    = useState(todayISO());
  const [rec,     setRec]     = useState<(typeof REC_OPTIONS)[number]>("");
  const [tp,      setTp]      = useState("0");
  const [copied,  setCopied]  = useState(false);

  // Type | TICKER1, TICKER2 | Title | dd-mm-yyyy | REC | TP
  const subject = useMemo(() => {
    return [
      type,
      tickers.join(", "),
      title.trim(),
      isoToDMY(date),
      rec,
      tp.trim(),
    ].join(" | ");
  }, [type, tickers, title, date, rec, tp]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(subject);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable */ }
  };

  const mailto = `mailto:${SUBJECT_EMAIL}?subject=${encodeURIComponent(subject)}`;

  return (
    <div style={{
      background: "#fff",
      border: "1px solid rgba(13,13,56,0.08)",
      borderRadius: 12,
      padding: "14px 16px",
      marginBottom: 16,
      boxShadow: "0 1px 4px rgba(13,13,56,0.05)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Send size={14} style={{ color: "#2044DC" }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: "#0D0D38", letterSpacing: "-0.01em" }}>
          Compose email subject
        </span>
        <span style={{ fontSize: 11, color: "rgba(13,13,56,0.45)" }}>
          — genera el asunto para enviar a {SUBJECT_EMAIL}
        </span>
      </div>

      {/* Inputs */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "130px minmax(200px,1.4fr) minmax(170px,1.5fr) 140px 100px 90px",
        gap: 10, alignItems: "end",
      }}>
        <Field label="Type">
          <div style={{ position: "relative" }}>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as (typeof TYPE_OPTIONS)[number])}
              style={{ ...composerInput, appearance: "none", paddingRight: 26, cursor: "pointer" }}
            >
              {TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <ChevronDown size={12} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "rgba(13,13,56,0.45)" }} />
          </div>
        </Field>

        <Field label="BBG Ticker(s)">
          <TickerPicker universe={universe} selected={tickers} onChange={setTickers} />
        </Field>

        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Free text…" style={composerInput} />
        </Field>

        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...composerInput, cursor: "pointer" }} />
        </Field>

        <Field label="REC">
          <div style={{ position: "relative" }}>
            <select
              value={rec}
              onChange={(e) => setRec(e.target.value as (typeof REC_OPTIONS)[number])}
              style={{ ...composerInput, appearance: "none", paddingRight: 26, cursor: "pointer" }}
            >
              <option value="">—</option>
              {REC_OPTIONS.filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <ChevronDown size={12} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "rgba(13,13,56,0.45)" }} />
          </div>
        </Field>

        <Field label="TP">
          <input
            type="number"
            value={tp}
            onChange={(e) => setTp(e.target.value)}
            style={{ ...composerInput, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}
          />
        </Field>
      </div>

      {/* Preview + actions */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap",
      }}>
        <div style={{
          flex: "1 1 320px", minWidth: 240,
          padding: "9px 12px", borderRadius: 8,
          background: "#F5F7FD", border: "1px solid rgba(13,13,56,0.08)",
          fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", fontSize: 12, color: "#0D0D38",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {subject}
        </div>

        <button
          onClick={copy}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 14px", borderRadius: 8,
            background: copied ? "rgba(0,30,175,0.10)" : "#fff",
            border: copied ? "1px solid rgba(0,30,175,0.35)" : "1px solid rgba(13,13,56,0.14)",
            color: copied ? "#001EAF" : "#0D0D38",
            fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.12s", flexShrink: 0,
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy subject"}
        </button>

        <a
          href={mailto}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 16px", borderRadius: 8,
            background: "#2044DC", border: "1px solid #2044DC",
            color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
            textDecoration: "none", flexShrink: 0,
          }}
        >
          <Mail size={14} /> Open email
        </a>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ResearchPage() {
  const [records,  setRecords]  = useState<ResearchRecord[]>([]);
  const [filters,  setFilters]  = useState<Filters>({ categories: [], companies: [], froms: [], industries: [] });
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<ResearchRecord | null>(null);
  const [tickers,  setTickers]  = useState<ResearchTicker[]>([]);
  const isAdmin = useIsAdmin();
  // Categorías expandidas (por defecto se muestran las más recientes; al hacer clic se ven todas).
  const [expanded, setExpanded] = useState<Set<Group>>(new Set());

  // Active filters
  const [fCompany,  setFCompany]  = useState("");
  const [fGroup,    setFGroup]    = useState<"" | Group>("");
  const [fFrom,     setFFrom]     = useState("");
  const [fIndustry, setFIndustry] = useState("");
  const [fSearch,   setFSearch]   = useState("");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo,   setFDateTo]   = useState("");

  const reload = useCallback(() => {
    setLoading(true);
    fetch("/api/research")
      .then((r) => r.json())
      .then((d: { records?: ResearchRecord[]; filters?: Filters }) => {
        setRecords(d.records ?? []);
        setFilters(d.filters ?? { categories: [], companies: [], froms: [], industries: [] });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();

    // BBG ticker universe for the subject composer's searchable picker.
    fetch("/api/research/tickers")
      .then((r) => r.json())
      .then((d: { tickers?: ResearchTicker[] }) => setTickers(d.tickers ?? []))
      .catch(() => {});
  }, [reload]);

  const visible = useMemo(() => {
    const q = fSearch.trim().toLowerCase();
    return records.filter((r) => {
      if (fCompany  && r.company  !== fCompany)  return false;
      if (fGroup    && categoryGroup(r.category) !== fGroup) return false;
      if (fIndustry && r.industry !== fIndustry) return false;
      if (fFrom && !(r.from ?? "").toLowerCase().includes(fFrom.toLowerCase())) return false;
      if (fDateFrom && r.date < fDateFrom) return false;
      if (fDateTo   && r.date > fDateTo)   return false;
      if (q) {
        const hay = [r.company, r.category, r.title, r.subject, r.from, r.industry, r.recommendation]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, fCompany, fGroup, fFrom, fIndustry, fSearch, fDateFrom, fDateTo]);

  // Groups present in the data, in canonical order.
  const groups = useMemo(
    () => GROUP_ORDER.filter((g) => records.some((r) => categoryGroup(r.category) === g)),
    [records]
  );

  // Bucket the visible records into ordered sections.
  const sections = useMemo(() => {
    const map = new Map<Group, ResearchRecord[]>();
    for (const r of visible) {
      const g = categoryGroup(r.category);
      (map.get(g) ?? map.set(g, []).get(g)!).push(r);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, rows: map.get(g)! }));
  }, [visible]);

  const activeFilterCount = [fCompany, fGroup, fFrom, fIndustry, fDateFrom, fDateTo].filter(Boolean).length;

  const clearAll = () => {
    setFCompany(""); setFGroup(""); setFFrom("");
    setFIndustry(""); setFDateFrom(""); setFDateTo(""); setFSearch("");
  };

  const toggleGroup = (g: Group) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });

  // Con una búsqueda activa mostramos todas las coincidencias (no truncamos por categoría).
  const forceExpand = fSearch.trim().length > 0;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0D0D38", letterSpacing: "-0.035em", lineHeight: 1.15, marginBottom: 5 }}>
            Research Notes
          </h1>
          <p style={{ fontSize: 12, color: "rgba(13,13,56,0.62)", fontWeight: 500, letterSpacing: "0.01em" }}>
            Sell-side research · Coverage updates · Ingested by email
          </p>
        </div>
        {!loading && (
          <span style={{
            fontSize: 12, fontWeight: 700, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
            color: "#2044DC", background: "rgba(32,68,220,0.07)",
            border: "1px solid rgba(32,68,220,0.18)",
            borderRadius: 8, padding: "4px 12px",
          }}>
            {visible.length} / {records.length} notes
          </span>
        )}
      </div>

      {/* ── Subject composer ────────────────────────────────────────────── */}
      <SubjectComposer universe={tickers} />

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div style={{
        background: "#fff",
        border: "1px solid rgba(13,13,56,0.08)",
        borderRadius: 12,
        padding: "14px 18px",
        marginBottom: 16,
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        boxShadow: "0 1px 4px rgba(13,13,56,0.05)",
      }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 180px", minWidth: 160 }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "rgba(13,13,56,0.45)", pointerEvents: "none" }} />
          <input
            type="text"
            value={fSearch}
            onChange={(e) => setFSearch(e.target.value)}
            placeholder="Search title, company, subject…"
            style={{
              width: "100%", padding: "7px 10px 7px 28px",
              borderRadius: 8, background: "#F5F7FD",
              border: "1px solid rgba(13,13,56,0.12)",
              color: "#0D0D38", fontSize: 12, outline: "none",
              fontFamily: FONT_SECONDARY, boxSizing: "border-box",
            }}
            onFocus={(e)  => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(32,68,220,0.35)"; }}
            onBlur={(e)   => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,13,56,0.12)"; }}
          />
        </div>

        <FilterSelect label="Industry"   value={fIndustry} options={filters.industries} onChange={setFIndustry} />
        <FilterSelect label="Company"    value={fCompany}  options={filters.companies}  onChange={setFCompany}  />
        <FilterSelect label="Group"      value={fGroup}    options={groups as unknown as string[]} onChange={(v) => setFGroup(v as "" | Group)} />
        <FilterSelect label="From"       value={fFrom}     options={filters.froms}       onChange={setFFrom}     />

        {/* Date range */}
        <input
          type="date"
          value={fDateFrom}
          onChange={(e) => setFDateFrom(e.target.value)}
          title="From date"
          style={{
            padding: "6px 10px", borderRadius: 8,
            background: fDateFrom ? "rgba(32,68,220,0.07)" : "#F5F7FD",
            border: fDateFrom ? "1px solid rgba(32,68,220,0.30)" : "1px solid rgba(13,13,56,0.12)",
            color: fDateFrom ? "#001EAF" : "rgba(13,13,56,0.45)",
            fontSize: 12, outline: "none", cursor: "pointer",
            fontFamily: FONT_SECONDARY,
          }}
        />
        <span style={{ color: "rgba(13,13,56,0.45)", fontSize: 12 }}>–</span>
        <input
          type="date"
          value={fDateTo}
          onChange={(e) => setFDateTo(e.target.value)}
          title="To date"
          style={{
            padding: "6px 10px", borderRadius: 8,
            background: fDateTo ? "rgba(32,68,220,0.07)" : "#F5F7FD",
            border: fDateTo ? "1px solid rgba(32,68,220,0.30)" : "1px solid rgba(13,13,56,0.12)",
            color: fDateTo ? "#001EAF" : "rgba(13,13,56,0.45)",
            fontSize: 12, outline: "none", cursor: "pointer",
            fontFamily: FONT_SECONDARY,
          }}
        />

        {/* Clear */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearAll}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "6px 10px", borderRadius: 7,
              background: "transparent",
              border: "1px solid rgba(248,72,94,0.20)",
              color: "#F8485E", fontSize: 11, fontWeight: 600,
              cursor: "pointer", transition: "all 0.12s", flexShrink: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(248,72,94,0.05)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <X size={11} /> Clear {activeFilterCount}
          </button>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div style={{
        background: "#fff",
        border: "1px solid rgba(13,13,56,0.08)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(13,13,56,0.05)",
      }}>
        {/* Column headers */}
        <div style={{
          display: "grid",
          gridTemplateColumns: GRID,
          gap: "0 16px",
          padding: "9px 20px",
          background: "#F5F7FD",
          borderBottom: "1px solid rgba(13,13,56,0.07)",
        }}>
          {["Date", "Company", "Title", "Category", "Target Price", "Recommendation", "From", ""].map((h, i) => (
            <div key={h || `c${i}`} style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: "rgba(13,13,56,0.62)", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {h}
            </div>
          ))}
        </div>

        {/* Body */}
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 10, color: "rgba(13,13,56,0.45)" }}>
            <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 13 }}>Loading research notes…</span>
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: "60px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(13,13,56,0.62)", marginBottom: 4 }}>No notes match your filters</div>
            <div style={{ fontSize: 12, color: "rgba(13,13,56,0.45)" }}>Try adjusting or clearing the active filters</div>
          </div>
        ) : (
          sections.map(({ group, rows }) => {
            const gc = groupColor(group);
            const isOpen      = forceExpand || expanded.has(group);
            const canCollapse = !forceExpand && rows.length > PREVIEW_COUNT;
            const shown       = isOpen ? rows : rows.slice(0, PREVIEW_COUNT);
            const hiddenCount = rows.length - shown.length;
            return (
              <div key={group}>
                {/* Group / section header — clickeable para expandir/colapsar */}
                <div
                  onClick={canCollapse ? () => toggleGroup(group) : undefined}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    padding: "8px 20px",
                    background: gc.bg,
                    borderTop: "1px solid rgba(13,13,56,0.05)",
                    borderBottom: `1px solid ${gc.border}`,
                    cursor: canCollapse ? "pointer" : "default",
                    userSelect: "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {canCollapse && (
                      <ChevronDown
                        size={13}
                        style={{
                          color: gc.text,
                          transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                          transition: "transform 0.15s",
                        }}
                      />
                    )}
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: gc.text }}>
                      {group}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: gc.text, opacity: 0.7, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                      {rows.length}
                    </span>
                  </div>
                  {canCollapse && (
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: gc.text, opacity: 0.75 }}>
                      {isOpen ? "Show less" : `Show all ${rows.length}`}
                    </span>
                  )}
                </div>

                {shown.map((r, idx) => (
                  <NoteRow key={r.id} r={r} zebra={idx % 2 === 1} onClick={() => setSelected(r)} />
                ))}

                {/* Footer expand — visible sólo cuando hay filas ocultas */}
                {canCollapse && !isOpen && (
                  <button
                    onClick={() => toggleGroup(group)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      width: "100%", padding: "9px 20px",
                      background: "transparent", border: "none",
                      borderBottom: "1px solid rgba(13,13,56,0.05)",
                      color: gc.text, fontSize: 11, fontWeight: 700,
                      cursor: "pointer", transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = gc.bg; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <ChevronDown size={13} /> Show {hiddenCount} more {group.toLowerCase()} note{hiddenCount === 1 ? "" : "s"}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Detail modal ─────────────────────────────────────────────────── */}
      {selected && (
        <DetailModal
          record={selected}
          onClose={() => setSelected(null)}
          isAdmin={isAdmin}
          onChanged={reload}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
