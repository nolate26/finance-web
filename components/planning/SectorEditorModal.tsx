"use client";

import { useState } from "react";
import { X, Trash2, Loader2, Plus, Check } from "lucide-react";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";
import { DEFAULT_SECTIONS } from "@/lib/planning";
import type { SectorDTO } from "@/lib/planningTasks";
import type { AnalystOption } from "@/app/api/planning/analysts/route";

// Editor de un sector. Sólo lo monta el admin: nombre, descripción, miembros y
// sub-secciones. `sector` null = crear uno nuevo.
//
// Las sub-secciones sólo se editan sobre un sector YA existente, porque cada una es
// una fila propia con su id. Al crear, la API siembra las tres por defecto y el
// formulario vuelve a abrirse en modo edición para ajustarlas.

interface Props {
  sector:   SectorDTO | null;
  analysts: AnalystOption[];
  onClose:  () => void;
  onSaved:  () => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 8,
  border: `1px solid ${BORDER.base}`, background: "#F5F7FD",
  color: PATRIA.darkBlue, fontSize: 13, outline: "none", fontFamily: FONT_SECONDARY,
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
  textTransform: "uppercase", color: TEXT.muted, marginBottom: 6,
};

export default function SectorEditorModal({ sector, analysts, onClose, onSaved }: Props) {
  const isNew = sector === null;

  const [name, setName]           = useState(sector?.name ?? "");
  const [description, setDesc]    = useState(sector?.description ?? "");
  const [isGeneral, setIsGeneral] = useState(sector?.isGeneral ?? false);
  const [members, setMembers]     = useState<string[]>(sector?.members.map((m) => m.id) ?? []);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Sub-secciones (sólo en edición)
  const [sections, setSections] = useState(sector?.sections ?? []);
  const [newSection, setNewSection] = useState("");
  const [busySection, setBusySection] = useState<string | null>(null);

  function toggleMember(id: string) {
    setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        isNew ? "/api/planning/sectors" : `/api/planning/sectors/${sector!.id}`,
        {
          method:  isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ name, description, isGeneral, memberIds: members }),
        },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not save");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  }

  async function removeSector() {
    if (!sector) return;
    if (!confirm(`Delete the sector "${sector.name}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/planning/sectors/${sector.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not delete");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
      setSaving(false);
    }
  }

  // ── Sub-secciones ───────────────────────────────────────────────────────────

  async function addSection() {
    const n = newSection.trim();
    if (!n || !sector) return;
    setBusySection("new");
    setError(null);
    try {
      const res = await fetch(`/api/planning/sectors/${sector.id}/sections`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: n }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not add the sub-section");
      setSections((s) => [...s, { id: d.id, name: d.name, sortOrder: d.sortOrder }]);
      setNewSection("");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the sub-section");
    } finally {
      setBusySection(null);
    }
  }

  async function renameSection(sectionId: string, raw: string) {
    const n = raw.trim();
    const current = sections.find((s) => s.id === sectionId);
    if (!sector || !current || !n || n === current.name) return;
    setBusySection(sectionId);
    setError(null);
    try {
      const res = await fetch(`/api/planning/sectors/${sector.id}/sections`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sectionId, name: n }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not rename");
      setSections((s) => s.map((x) => (x.id === sectionId ? { ...x, name: n } : x)));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename");
      // Vuelve al nombre real: el input es no controlado y quedaría mostrando lo que falló.
      setSections((s) => [...s]);
    } finally {
      setBusySection(null);
    }
  }

  async function deleteSection(sectionId: string) {
    if (!sector) return;
    setBusySection(sectionId);
    setError(null);
    try {
      const res = await fetch(
        `/api/planning/sectors/${sector.id}/sections?sectionId=${sectionId}`,
        { method: "DELETE" },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not delete the sub-section");
      setSections((s) => s.filter((x) => x.id !== sectionId));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the sub-section");
    } finally {
      setBusySection(null);
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
          background: "#FFFFFF", borderRadius: 14, width: "min(580px, 100%)",
          maxHeight: "88vh", display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(13,13,56,0.28)", border: `1px solid ${BORDER.base}`,
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderBottom: `1px solid ${BORDER.subtle}`, background: "#F5F7FD",
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: PATRIA.darkBlue, letterSpacing: "-0.01em" }}>
            {isNew ? "New sector" : sector!.name}
          </span>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: TEXT.label, padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 18, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Nombre */}
          <div>
            <label style={labelStyle}>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Financials, Commodities, Retail"
              maxLength={120}
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* Descripción */}
          <div>
            <label style={labelStyle}>Description</label>
            <input
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional"
              maxLength={300}
              style={inputStyle}
            />
          </div>

          {/* General */}
          {(isNew || sector!.isGeneral) && (
            <label style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              fontSize: 12.5, color: PATRIA.darkBlue, cursor: isNew ? "pointer" : "default", fontWeight: 600,
            }}>
              <input
                type="checkbox"
                checked={isGeneral}
                disabled={!isNew}
                onChange={(e) => setIsGeneral(e.target.checked)}
                style={{ accentColor: PATRIA.kingBlue, width: 14, height: 14, marginTop: 2 }}
              />
              <span>
                General coordination
                <span style={{ display: "block", fontSize: 11, color: TEXT.muted, fontWeight: 500, marginTop: 2 }}>
                  Renders full-width above the grid. Only one can exist, and it cannot be deleted.
                  Everyone sees it; who can write is decided by its members, like any sector.
                </span>
              </span>
            </label>
          )}

          {/* Miembros */}
          <div>
            <label style={labelStyle}>
              Members — {members.length === 0 ? "admins only" : `${members.length} can write here`}
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {analysts.length === 0 && (
                <p style={{ fontSize: 11.5, color: TEXT.muted, fontStyle: "italic", margin: 0 }}>
                  No users available.
                </p>
              )}
              {analysts.map((a) => {
                const on = members.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleMember(a.id)}
                    title={a.email ?? ""}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "5px 11px", borderRadius: 7, fontSize: 11.5, fontWeight: 700,
                      cursor: "pointer", transition: "all 0.12s", fontFamily: FONT_SECONDARY,
                      background: on ? "rgba(32,68,220,0.12)" : "#F5F7FD",
                      color:      on ? PATRIA.blue : TEXT.label,
                      border: `1px solid ${on ? "rgba(32,68,220,0.38)" : BORDER.base}`,
                    }}
                  >
                    {on && <Check size={10} />}
                    {a.initials ?? (a.name ?? a.email ?? "?").slice(0, 2).toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sub-secciones */}
          <div>
            <label style={labelStyle}>Sub-sections</label>

            {isNew ? (
              <p style={{ fontSize: 11.5, color: TEXT.muted, margin: 0, lineHeight: 1.5 }}>
                It will be created with {DEFAULT_SECTIONS.map((s) => `“${s}”`).join(", ")}.
                Reopen the sector afterwards to rename them or add more.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sections.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      defaultValue={s.name}
                      onBlur={(e) => renameSection(s.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      maxLength={120}
                      style={{ ...inputStyle, padding: "6px 10px", fontSize: 12.5 }}
                    />
                    <button
                      onClick={() => deleteSection(s.id)}
                      disabled={busySection === s.id || sections.length <= 1}
                      title={sections.length <= 1
                        ? "A sector needs at least one sub-section"
                        : "Delete sub-section"}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 30, height: 30, flexShrink: 0, borderRadius: 7,
                        background: "rgba(248,72,94,0.05)",
                        border: "1px solid rgba(248,72,94,0.20)",
                        color: PATRIA.pink,
                        cursor: sections.length <= 1 ? "not-allowed" : "pointer",
                        opacity: sections.length <= 1 ? 0.4 : 1,
                      }}
                    >
                      {busySection === s.id
                        ? <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} />
                        : <Trash2 size={12} />}
                    </button>
                  </div>
                ))}

                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <input
                    value={newSection}
                    onChange={(e) => setNewSection(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addSection(); }}
                    placeholder="New sub-section…"
                    maxLength={120}
                    style={{ ...inputStyle, padding: "6px 10px", fontSize: 12.5 }}
                  />
                  <button
                    onClick={addSection}
                    disabled={!newSection.trim() || busySection === "new"}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 30, height: 30, flexShrink: 0, borderRadius: 7,
                      background: newSection.trim() ? PATRIA.blue : "#F5F7FD",
                      color: newSection.trim() ? "#FFFFFF" : TEXT.disabled,
                      border: `1px solid ${newSection.trim() ? PATRIA.blue : BORDER.base}`,
                      cursor: newSection.trim() ? "pointer" : "default",
                    }}
                  >
                    {busySection === "new"
                      ? <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} />
                      : <Plus size={13} />}
                  </button>
                </div>
              </div>
            )}
          </div>

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
          {!isNew && !sector!.isGeneral ? (
            <button
              onClick={removeSector}
              disabled={saving}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 12, fontWeight: 600, color: PATRIA.pink,
                background: "transparent", border: "none",
                cursor: saving ? "default" : "pointer", padding: "6px 2px",
              }}
            >
              <Trash2 size={13} /> Delete sector
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
              disabled={saving || !name.trim()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 18px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                background: name.trim() ? PATRIA.blue : "rgba(13,13,56,0.20)",
                color: "#FFFFFF", border: "none",
                cursor: saving || !name.trim() ? "default" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving && <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />}
              {isNew ? "Create" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
