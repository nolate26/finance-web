"use client";

import { useState } from "react";
import { X, Trash2, Loader2 } from "lucide-react";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";
import {
  PLAN_CATEGORIES, CATEGORY_STYLE, cellDateLabel, displayDate, regionLabel, regionDayName,
  type PlanCategory,
} from "@/lib/planning";
import type { WeeklyCell } from "@/app/api/planning/weekly/route";
import type { AnalystOption } from "@/app/api/planning/analysts/route";

// Editor de una celda del calendario. Sólo lo monta el admin.
// La celda puede no existir todavía: en ese caso `cell` es null y el PUT la crea.
//
// El header muestra la fecha que le TOCA a la región (Chile martes, LatAm jueves),
// pero lo que se manda al PUT sigue siendo el lunes: ésa es la llave de la fila.

interface Props {
  region:   string;
  weekIso:  string;
  cell:     WeeklyCell | null;
  analysts: AnalystOption[];
  onClose:  () => void;
  onSaved:  () => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 11px", borderRadius: 8,
  border: `1px solid ${BORDER.base}`, background: "#F5F7FD",
  color: PATRIA.darkBlue, fontSize: 13, outline: "none",
  fontFamily: FONT_SECONDARY,
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
  textTransform: "uppercase", color: TEXT.muted, marginBottom: 6,
};

export default function WeeklyCellModal({ region, weekIso, cell, analysts, onClose, onSaved }: Props) {
  const [topic, setTopic]             = useState(cell?.topic ?? "");
  const [category, setCategory]       = useState<PlanCategory>((cell?.category as PlanCategory) ?? "update");
  const [allAnalysts, setAllAnalysts] = useState(cell?.allAnalysts ?? false);
  const [highlighted, setHighlighted] = useState(cell?.highlighted ?? false);
  const [notes, setNotes]             = useState(cell?.notes ?? "");
  const [selected, setSelected]       = useState<string[]>(cell?.analysts.map((a) => a.id) ?? []);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/planning/weekly", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          region, weekStart: weekIso, topic, category,
          allAnalysts, highlighted, notes,
          analystIds: allAnalysts ? [] : selected,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not save");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!cell) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/planning/weekly?region=${encodeURIComponent(region)}&weekStart=${weekIso}`,
        { method: "DELETE" },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not clear the cell");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear the cell");
    } finally {
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
          background: "#FFFFFF", borderRadius: 14, width: "min(560px, 100%)",
          maxHeight: "88vh", overflowY: "auto",
          boxShadow: "0 20px 60px rgba(13,13,56,0.28)",
          border: `1px solid ${BORDER.base}`,
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderBottom: `1px solid ${BORDER.subtle}`, background: "#F5F7FD",
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: PATRIA.darkBlue, letterSpacing: "-0.01em" }}>
              {regionLabel(region)} · {cellDateLabel(region, weekIso)}
            </div>
            <div style={{ fontSize: 11, color: TEXT.muted, marginTop: 2, fontFamily: FONT_SECONDARY }}>
              {regionDayName(region)}, {displayDate(region, weekIso)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: TEXT.label, padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Tópico */}
          <div>
            <label style={labelStyle}>Topic</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Update: Hapag-Vapores / Quiñenco"
              maxLength={300}
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* Categoría / color */}
          <div>
            <label style={labelStyle}>Category</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PLAN_CATEGORIES.map((c) => {
                const s = CATEGORY_STYLE[c];
                const on = category === c;
                return (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    style={{
                      padding: "5px 12px", borderRadius: 7, fontSize: 11.5,
                      fontWeight: on ? 800 : 600, cursor: "pointer",
                      background: s.bg === "transparent" ? "#FFFFFF" : s.bg,
                      color: s.text,
                      border: `1px solid ${on ? s.text : s.border}`,
                      boxShadow: on ? `0 0 0 2px ${s.border}` : "none",
                      transition: "all 0.12s",
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Analistas */}
          <div>
            <label style={labelStyle}>Analysts</label>
            <label style={{
              display: "flex", alignItems: "center", gap: 7, marginBottom: 9,
              fontSize: 12.5, color: PATRIA.darkBlue, cursor: "pointer", fontWeight: 600,
            }}>
              <input
                type="checkbox"
                checked={allAnalysts}
                onChange={(e) => setAllAnalysts(e.target.checked)}
                style={{ accentColor: PATRIA.kingBlue, width: 14, height: 14 }}
              />
              Whole team (&ldquo;All&rdquo;)
            </label>

            {!allAnalysts && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {analysts.filter((a) => a.initials).length === 0 && (
                  <p style={{ fontSize: 11.5, color: TEXT.muted, fontStyle: "italic" }}>
                    No user has initials yet. Set them in Administration → Users.
                  </p>
                )}
                {analysts.filter((a) => a.initials).map((a) => {
                  const on = selected.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggle(a.id)}
                      title={a.name ?? a.email ?? ""}
                      style={{
                        padding: "5px 11px", borderRadius: 7, fontSize: 11.5, fontWeight: 700,
                        cursor: "pointer", transition: "all 0.12s",
                        fontFamily: FONT_SECONDARY,
                        background: on ? "rgba(32,68,220,0.12)" : "#F5F7FD",
                        color:      on ? PATRIA.blue : TEXT.label,
                        border: `1px solid ${on ? "rgba(32,68,220,0.38)" : BORDER.base}`,
                      }}
                    >
                      {a.initials}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal note for the week (optional)"
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          {/* Destacar */}
          <label style={{
            display: "flex", alignItems: "center", gap: 7,
            fontSize: 12.5, color: PATRIA.darkBlue, cursor: "pointer", fontWeight: 600,
          }}>
            <input
              type="checkbox"
              checked={highlighted}
              onChange={(e) => setHighlighted(e.target.checked)}
              style={{ accentColor: PATRIA.orange, width: 14, height: 14 }}
            />
            Highlight this week
          </label>

          {error && (
            <div style={{
              fontSize: 12, color: "#B01029", background: "rgba(248,72,94,0.08)",
              border: "1px solid rgba(248,72,94,0.24)", borderRadius: 8, padding: "8px 11px",
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 18px", borderTop: `1px solid ${BORDER.subtle}`, background: "#F5F7FD",
        }}>
          {cell ? (
            <button
              onClick={remove}
              disabled={saving}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 12, fontWeight: 600, color: PATRIA.pink,
                background: "transparent", border: "none",
                cursor: saving ? "default" : "pointer", padding: "6px 2px",
              }}
            >
              <Trash2 size={13} /> Clear cell
            </button>
          ) : <span />}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "7px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                background: "#FFFFFF", color: TEXT.label,
                border: `1px solid ${BORDER.base}`, cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 18px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                background: PATRIA.blue, color: "#FFFFFF", border: "none",
                cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
              }}
            >
              {saving && <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
