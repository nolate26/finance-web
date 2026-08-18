"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Loader2, Mail, X, ChevronDown, FileText, Pencil, Trash2, Save } from "lucide-react";
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    day: "2-digit", month: "short", year: "numeric",
  });
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

const GROUP_ORDER = ["Earnings", "Update", "Cases", "Others"] as const;
type Group = (typeof GROUP_ORDER)[number];

function categoryGroup(cat: string | null | undefined): Group {
  const c = (cat ?? "").toLowerCase();
  if (c.includes("earning")) return "Earnings";
  if (c.includes("update"))  return "Update";
  if (c.includes("case"))    return "Cases";
  return "Others";
}

const GROUP_COLORS: Record<Group, { bg: string; border: string; text: string }> = {
  Earnings: { bg: "rgba(32,68,220,0.08)",   border: "rgba(32,68,220,0.22)",   text: "#001EAF" },
  Update:   { bg: "rgba(0,30,175,0.08)",   border: "rgba(0,30,175,0.22)",   text: "#001EAF" },
  Cases:    { bg: "rgba(0,30,175,0.08)",  border: "rgba(0,30,175,0.22)",  text: "#0D0D38" },
  Others:   { bg: "rgba(13,13,56,0.08)", border: "rgba(13,13,56,0.22)", text: "#0D0D38" },
};
function groupColor(g: Group) { return GROUP_COLORS[g]; }

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

const T3     = "rgba(13,13,56,0.45)";
const BORDER = "rgba(13,13,56,0.08)";

const GRID = "95px minmax(150px,1fr) 120px 90px 120px 130px";

// ── Detail modal ──────────────────────────────────────────────────────────────

function DetailModal({
  record, onClose, isAdmin, onChanged,
}: {
  record:    ResearchRecord;
  onClose:   () => void;
  isAdmin:   boolean;
  onChanged: () => void;
}) {
  const group = categoryGroup(record.category);
  const col   = groupColor(group);
  const tp    = fmtTarget(record.targetPrice);
  const rec   = cleanRec(record.recommendation);
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
          // Cuerpo editado en vivo (contentEditable). Si el ref no está montado, no se toca.
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
        position: "fixed", inset: 0, zIndex: 2000,
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
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: "22px 28px 18px",
          borderBottom: `1px solid ${BORDER}`,
          background: "linear-gradient(to bottom, #F5F7FD, #fff)",
          gap: 16, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.10em", textTransform: "uppercase",
                padding: "3px 9px", borderRadius: 6,
                background: col.bg, border: `1px solid ${col.border}`, color: col.text,
              }}>
                {record.category}
              </span>
              <span style={{ fontSize: 11, color: "rgba(13,13,56,0.62)", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", background: "#F5F7FD", borderRadius: 5, padding: "2px 7px" }}>
                {formatDate(record.date)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#2044DC", background: "rgba(32,68,220,0.07)", border: "1px solid rgba(32,68,220,0.18)", borderRadius: 6, padding: "2px 9px" }}>
                {record.company}
              </span>
              {tp && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#0D0D38", background: "#F5F7FD", border: "1px solid rgba(13,13,56,0.10)", borderRadius: 6, padding: "2px 9px", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                  TP {tp}
                </span>
              )}
              {rec && (() => {
                const rc = recColor(rec);
                return (
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", padding: "3px 9px", borderRadius: 6, background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text }}>
                    {rec}
                  </span>
                );
              })()}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0D0D38", lineHeight: 1.3, letterSpacing: "-0.01em" }}>
              {record.title ?? record.subject ?? "No title"}
            </div>
            {record.from && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 7 }}>
                <Mail size={11} style={{ color: T3, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "rgba(13,13,56,0.62)" }}>{record.from}</span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
            {/* Admin actions */}
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
            <button
              onClick={onClose}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                background: "transparent", border: `1px solid ${BORDER}`,
                cursor: "pointer", color: "rgba(13,13,56,0.62)", transition: "all 0.12s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(13,13,56,0.06)"; (e.currentTarget as HTMLElement).style.color = "#0D0D38"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(13,13,56,0.62)"; }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Admin edit form ─────────────────────────────────────────────── */}
        {editing && (
          <div style={{ padding: "16px 28px", borderBottom: `1px solid ${BORDER}`, background: "#F5F7FD", flexShrink: 0 }}>
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

            {err && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#F8485E" }}>{err}</div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button
                onClick={() => { setEditing(false); setErr(null); }}
                disabled={saving}
                style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "#fff", color: "rgba(13,13,56,0.62)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
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

        {/* HTML body */}
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
              padding: "24px 40px 48px",
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

// ── Row ─────────────────────────────────────────────────────────────────────

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
        gap: "0 14px",
        padding: "11px 18px",
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

      {/* Title */}
      <div style={{ fontSize: 12, color: "#0D0D38", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {r.title ?? r.subject ?? <span style={{ color: "rgba(13,13,56,0.28)", fontStyle: "italic" }}>No title</span>}
      </div>

      {/* Category badge */}
      <div>
        <span style={{
          display: "inline-block", fontSize: 10, fontWeight: 700,
          padding: "2px 8px", borderRadius: 5,
          background: col.bg, border: `1px solid ${col.border}`, color: col.text,
          whiteSpace: "nowrap", maxWidth: "100%",
          overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {r.category}
        </span>
      </div>

      {/* Target price */}
      <div style={{ fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", fontSize: 11, fontWeight: 600, color: tp ? "#0D0D38" : "rgba(13,13,56,0.28)", whiteSpace: "nowrap" }}>
        {tp ?? "—"}
      </div>

      {/* Recommendation */}
      <div>
        {rec && rc ? (
          <span style={{
            display: "inline-block", fontSize: 10, fontWeight: 800,
            letterSpacing: "0.04em", textTransform: "uppercase",
            padding: "2px 8px", borderRadius: 5,
            background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text,
            whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {rec}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "rgba(13,13,56,0.28)" }}>—</span>
        )}
      </div>

      {/* From */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
        <Mail size={10} style={{ flexShrink: 0, color: "rgba(13,13,56,0.28)" }} />
        <span style={{ fontSize: 11, color: "rgba(13,13,56,0.62)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {senderName(r.from)}
        </span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  ticker: string | null;
}

export default function ResearchNotesPanel({ ticker }: Props) {
  const [records,  setRecords]  = useState<ResearchRecord[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState<ResearchRecord | null>(null);
  const [fGroup,   setFGroup]   = useState<"" | Group>("");
  const isAdmin = useIsAdmin();

  const reload = useCallback(() => {
    if (!ticker) { setRecords([]); return; }
    setLoading(true);
    fetch(`/api/research?company=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d: { records?: ResearchRecord[] }) => setRecords(d.records ?? []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [ticker]);

  useEffect(() => { setFGroup(""); reload(); }, [reload]);

  // Groups present in the data, in canonical order.
  const groups = useMemo(
    () => GROUP_ORDER.filter((g) => records.some((r) => categoryGroup(r.category) === g)),
    [records]
  );

  const visible = useMemo(
    () => fGroup ? records.filter((r) => categoryGroup(r.category) === fGroup) : records,
    [records, fGroup]
  );

  // Bucket the visible records into ordered groups for sectioned display.
  const sections = useMemo(() => {
    const map = new Map<Group, ResearchRecord[]>();
    for (const r of visible) {
      const g = categoryGroup(r.category);
      (map.get(g) ?? map.set(g, []).get(g)!).push(r);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, rows: map.get(g)! }));
  }, [visible]);

  // ── Empty / no ticker ─────────────────────────────────────────────────────

  if (!ticker) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px", color: T3, fontSize: 13 }}>
        Select a company to see research notes
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px", gap: 10, color: T3 }}>
        <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 13 }}>Loading research notes…</span>
      </div>
    );
  }

  // ── No notes ──────────────────────────────────────────────────────────────

  if (records.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "52px 24px", gap: 10 }}>
        <FileText size={28} style={{ color: "rgba(13,13,56,0.10)" }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(13,13,56,0.62)", marginBottom: 3 }}>No research notes for {ticker}</div>
          <div style={{ fontSize: 12, color: T3 }}>Notes are ingested automatically from email</div>
        </div>
      </div>
    );
  }

  // ── Header bar ────────────────────────────────────────────────────────────

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Filter + count row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 12, fontWeight: 700, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
            color: "#2044DC", background: "rgba(32,68,220,0.07)",
            border: "1px solid rgba(32,68,220,0.18)",
            borderRadius: 7, padding: "3px 10px",
          }}>
            {visible.length} note{visible.length !== 1 ? "s" : ""}
          </span>

          {/* Group filter */}
          {groups.length > 1 && (
            <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              <select
                value={fGroup}
                onChange={(e) => setFGroup(e.target.value as "" | Group)}
                style={{
                  appearance: "none",
                  padding: "5px 26px 5px 10px",
                  borderRadius: 7,
                  background: fGroup ? "rgba(32,68,220,0.07)" : "#F5F7FD",
                  border: fGroup ? "1px solid rgba(32,68,220,0.28)" : `1px solid ${BORDER}`,
                  color: fGroup ? "#001EAF" : "rgba(13,13,56,0.62)",
                  fontSize: 12, fontWeight: fGroup ? 600 : 400,
                  fontFamily: FONT_SECONDARY,
                  cursor: "pointer", outline: "none",
                  minWidth: 130,
                }}
              >
                <option value="">All groups</option>
                {groups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <ChevronDown size={12} style={{ position: "absolute", right: 7, pointerEvents: "none", color: fGroup ? "#2044DC" : T3 }} />
            </div>
          )}

          {fGroup && (
            <button
              onClick={() => setFGroup("")}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 8px", borderRadius: 6,
                background: "transparent", border: "1px solid rgba(248,72,94,0.18)",
                color: "#F8485E", fontSize: 11, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <X size={10} /> Clear
            </button>
          )}
        </div>

        {/* Notes list */}
        <div style={{
          background: "#fff",
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          overflow: "hidden",
        }}>
          {/* Column headers */}
          <div style={{
            display: "grid",
            gridTemplateColumns: GRID,
            gap: "0 14px",
            padding: "8px 18px",
            background: "#F5F7FD",
            borderBottom: "1px solid rgba(13,13,56,0.06)",
          }}>
            {["Date", "Title", "Category", "Target Price", "Recommendation", "From"].map((h) => (
              <div key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: T3, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {h}
              </div>
            ))}
          </div>

          {visible.length === 0 ? (
            <div style={{ padding: "32px 18px", textAlign: "center", fontSize: 12, color: T3 }}>
              No notes for this group
            </div>
          ) : (
            sections.map(({ group, rows }) => {
              const gc = groupColor(group);
              return (
                <div key={group}>
                  {/* Group / section header */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 18px",
                    background: gc.bg,
                    borderTop: "1px solid rgba(13,13,56,0.05)",
                    borderBottom: `1px solid ${gc.border}`,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: gc.text }}>
                      {group}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: gc.text, opacity: 0.7, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                      {rows.length}
                    </span>
                  </div>

                  {rows.map((r, idx) => (
                    <NoteRow key={r.id} r={r} zebra={idx % 2 === 1} onClick={() => setSelected(r)} />
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>

      {selected && (
        <DetailModal
          record={selected}
          onClose={() => setSelected(null)}
          isAdmin={isAdmin}
          onChanged={reload}
        />
      )}
    </>
  );
}
