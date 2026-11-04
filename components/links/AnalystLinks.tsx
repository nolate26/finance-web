"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Plus, Pencil, Trash2, Check, X, Link2, AlertTriangle, Loader2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { PATRIA, TEXT, BORDER, SURFACE, FONT_SECONDARY } from "@/lib/patriaTheme";
import { useIsAdmin } from "@/lib/useIsAdmin";
import type { AnalystLinkRow, LinkSectionRow } from "@/app/api/links/route";

// Vista "Useful Links" (/links): accesos a los ejercicios y herramientas que arman los
// analistas (planillas, dashboards, carpetas compartidas), agrupados en secciones.
// Cualquier usuario crea secciones y agrega links; el admin edita, ordena y borra.

interface Draft { name: string; url: string; description: string; sectionId: number | null }

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

// Copia de `list` con los elementos i y j intercambiados.
function swapped<T>(list: T[], i: number, j: number): T[] {
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 7,
  border: `1px solid ${BORDER.base}`, background: SURFACE.subtle, fontSize: 12.5,
  color: TEXT.body, outline: "none",
};

const iconBtn = (color: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 26, height: 26, borderRadius: 6, border: `1px solid ${BORDER.base}`,
  background: "#fff", color, cursor: "pointer", flexShrink: 0,
});

const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7,
  fontSize: 12.5, fontWeight: 700, border: "none", background: PATRIA.kingBlue, color: "#fff", cursor: "pointer",
};

function MoveBtn({ dir, disabled, onClick }: { dir: "up" | "down" | "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = { up: ChevronUp, down: ChevronDown, left: ChevronLeft, right: ChevronRight }[dir];
  return (
    <button onClick={onClick} disabled={disabled} title={`Move ${dir}`}
      style={{ ...iconBtn(PATRIA.kingBlue), opacity: disabled ? 0.35 : 1, cursor: disabled ? "default" : "pointer" }}>
      <Icon size={13} />
    </button>
  );
}

function FormActions({ ok, busy, onSave, onCancel }: { ok: boolean; busy: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <>
      <button onClick={onCancel} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, border: `1px solid ${BORDER.base}`, background: "#fff", color: TEXT.label, cursor: "pointer" }}>
        <X size={13} /> Cancel
      </button>
      <button onClick={() => ok && onSave()} disabled={!ok || busy}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, border: "none", background: ok && !busy ? PATRIA.kingBlue : "rgba(13,13,56,0.25)", color: "#fff", cursor: ok && !busy ? "pointer" : "default" }}>
        {busy ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> : <Check size={13} />} Save
      </button>
    </>
  );
}

function SectionForm({ initial, busy, onSave, onCancel }: {
  initial: string; busy: boolean; onSave: (name: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const ok = !!name.trim();
  return (
    <div className="card" style={{ padding: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", border: `1px solid ${PATRIA.kingBlue}55` }}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Section name — e.g. Banks" maxLength={80}
        style={{ ...inputStyle, flex: "1 1 200px", width: "auto" }}
        onKeyDown={(e) => { if (e.key === "Enter" && ok) onSave(name); }} />
      <FormActions ok={ok} busy={busy} onSave={() => onSave(name)} onCancel={onCancel} />
    </div>
  );
}

// `sections` sólo llega al editar: es lo que permite mover el link de sección.
function LinkForm({ initial, sections, busy, onSave, onCancel }: {
  initial: Draft; sections?: LinkSectionRow[]; busy: boolean; onSave: (d: Draft) => void; onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const ok = !!(d.name.trim() && d.url.trim());
  return (
    <div className="card" style={{ padding: 14, border: `1px solid ${PATRIA.kingBlue}55` }}>
      <div style={{ display: "grid", gap: 8 }}>
        <input autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Title — e.g. Bank comps model" maxLength={120} style={inputStyle} />
        <input value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} placeholder="https://…" maxLength={1000} style={{ ...inputStyle, fontFamily: FONT_SECONDARY }}
          onKeyDown={(e) => { if (e.key === "Enter" && ok) onSave(d); }} />
        <input value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="Short description (optional)" maxLength={300} style={inputStyle}
          onKeyDown={(e) => { if (e.key === "Enter" && ok) onSave(d); }} />
        {sections && (
          <select value={d.sectionId ?? ""} onChange={(e) => setD({ ...d, sectionId: e.target.value ? Number(e.target.value) : null })} style={inputStyle}>
            {initial.sectionId === null && <option value="">Unassigned</option>}
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <FormActions ok={ok} busy={busy} onSave={() => onSave(d)} onCancel={onCancel} />
      </div>
    </div>
  );
}

function LinkCard({ link, isAdmin, controls }: { link: AnalystLinkRow; isAdmin: boolean; controls: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 0, display: "flex", alignItems: "stretch", overflow: "hidden" }}>
      <a href={link.url} target="_blank" rel="noopener noreferrer"
        style={{ flex: 1, minWidth: 0, display: "flex", gap: 11, padding: "13px 14px", textDecoration: "none", color: "inherit" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = SURFACE.hover; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
        <span style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(32,68,220,0.08)", color: PATRIA.kingBlue }}>
          <Link2 size={15} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: TEXT.body }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.name}</span>
            <ExternalLink size={11} style={{ color: TEXT.muted, flexShrink: 0 }} />
          </span>
          <span style={{ display: "block", fontSize: 10.5, color: PATRIA.kingBlue, fontFamily: FONT_SECONDARY, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {hostOf(link.url)}
          </span>
          {link.description && (
            <span style={{ display: "block", fontSize: 11.5, color: TEXT.label, marginTop: 5, lineHeight: 1.4 }}>{link.description}</span>
          )}
        </span>
      </a>
      {isAdmin && (
        <div style={{ display: "grid", gridTemplateColumns: "26px 26px", gap: 5, alignContent: "start", padding: "10px 10px 10px 0" }}>
          {controls}
        </div>
      )}
    </div>
  );
}

const linksGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 12,
};

export default function AnalystLinks() {
  const isAdmin = useIsAdmin();
  const [sections, setSections] = useState<LinkSectionRow[]>([]);
  const [links, setLinks] = useState<AnalystLinkRow[] | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/links")
      .then((r) => r.json())
      .then((d: { sections?: LinkSectionRow[]; links?: AnalystLinkRow[]; unavailable?: string; error?: string }) => {
        if (d.error) throw new Error(d.error);
        setSections(d.sections ?? []);
        setLinks(d.links ?? []);
        setUnavailable(d.unavailable ?? null);
      })
      .catch((e: Error) => { setError(e.message); setLinks([]); });
  }, []);
  useEffect(load, [load]);

  function closeForms() {
    setAddingSection(false); setRenamingId(null); setAddingTo(null); setEditingId(null);
  }

  async function send(path: string, method: "POST" | "PATCH" | "PUT", body: object) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not save");
      closeForms();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(path: string, question: string) {
    if (!window.confirm(question)) return;
    setError(null);
    const res = await fetch(path, { method: "DELETE" });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not delete"); return; }
    load();
  }

  const sectionIds = new Set(sections.map((s) => s.id));
  const unassigned = links?.filter((l) => l.sectionId === null || !sectionIds.has(l.sectionId)) ?? [];

  function renderLink(l: AnalystLinkRow, siblings: AnalystLinkRow[], i: number) {
    if (editingId === l.id) {
      return (
        <LinkForm key={l.id} initial={{ name: l.name, url: l.url, description: l.description ?? "", sectionId: l.sectionId }} sections={sections} busy={busy}
          onCancel={() => setEditingId(null)} onSave={(d) => send("/api/links", "PATCH", { id: l.id, ...d })} />
      );
    }
    const ids = siblings.map((x) => x.id);
    const move = (j: number) => send("/api/links", "PUT", { sectionId: l.sectionId, ids: swapped(ids, i, j) });
    return (
      <LinkCard key={l.id} link={l} isAdmin={isAdmin} controls={
        <>
          <button onClick={() => { closeForms(); setEditingId(l.id); }} title="Edit" style={iconBtn(PATRIA.kingBlue)}><Pencil size={12} /></button>
          <button onClick={() => remove(`/api/links?id=${l.id}`, `Delete the link "${l.name}"?`)} title="Delete" style={iconBtn(PATRIA.pink)}><Trash2 size={12} /></button>
          {l.sectionId !== null && (
            <>
              <MoveBtn dir="left" disabled={busy || i === 0} onClick={() => move(i - 1)} />
              <MoveBtn dir="right" disabled={busy || i === siblings.length - 1} onClick={() => move(i + 1)} />
            </>
          )}
        </>
      } />
    );
  }

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: TEXT.body, letterSpacing: "-0.035em", lineHeight: 1.15, margin: 0 }}>
            Useful Links
          </h1>
          <p style={{ fontSize: 12, marginTop: 5, color: TEXT.label, fontWeight: 500, letterSpacing: "0.01em" }}>
            Models, dashboards and exercises built by the team
          </p>
        </div>
        {!addingSection && (
          <button onClick={() => { closeForms(); setAddingSection(true); }} style={primaryBtn}>
            <Plus size={14} /> New section
          </button>
        )}
      </div>

      {(error || unavailable) && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12, padding: "8px 12px", borderRadius: 8, fontSize: 12, color: error ? PATRIA.pink : PATRIA.orange, background: error ? "rgba(248,72,94,0.06)" : "rgba(255,107,6,0.08)", border: `1px solid ${error ? "rgba(248,72,94,0.20)" : "rgba(255,107,6,0.30)"}` }}>
          <AlertTriangle size={13} /> {error ?? unavailable}
        </div>
      )}

      {links === null ? (
        <div className="card" style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Loader2 size={18} style={{ color: PATRIA.kingBlue, animation: "spin 0.8s linear infinite" }} />
        </div>
      ) : (
        <div style={{ display: "grid", gap: 22 }}>
          {addingSection && (
            <SectionForm initial="" busy={busy} onCancel={() => setAddingSection(false)}
              onSave={(name) => send("/api/links/sections", "POST", { name })} />
          )}

          {sections.map((s, i) => {
            const items = links.filter((l) => l.sectionId === s.id);
            const ids = sections.map((x) => x.id);
            return (
              <section key={s.id}>
                {renamingId === s.id ? (
                  <SectionForm initial={s.name} busy={busy} onCancel={() => setRenamingId(null)}
                    onSave={(name) => send("/api/links/sections", "PATCH", { id: s.id, name })} />
                ) : (
                  <div className="patria-subtitle" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "7px 10px 7px 14px", borderRadius: 8 }}>
                    <h2 style={{ flex: "1 1 auto", minWidth: 0, fontSize: 13.5, fontWeight: 700, margin: 0, overflowWrap: "anywhere" }}>{s.name}</h2>
                    {isAdmin && (
                      <>
                        <MoveBtn dir="up" disabled={busy || i === 0} onClick={() => send("/api/links/sections", "PUT", { ids: swapped(ids, i, i - 1) })} />
                        <MoveBtn dir="down" disabled={busy || i === sections.length - 1} onClick={() => send("/api/links/sections", "PUT", { ids: swapped(ids, i, i + 1) })} />
                        <button onClick={() => { closeForms(); setRenamingId(s.id); }} title="Rename" style={iconBtn(PATRIA.kingBlue)}><Pencil size={12} /></button>
                        <button title="Delete" style={iconBtn(PATRIA.pink)}
                          onClick={() => remove(`/api/links/sections?id=${s.id}`, items.length
                            ? `Delete the section "${s.name}" and its ${items.length} link(s)?`
                            : `Delete the section "${s.name}"?`)}>
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                    <button onClick={() => { closeForms(); setAddingTo(s.id); }}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 10px", borderRadius: 6, fontSize: 12, fontWeight: 700, border: "none", background: "#fff", color: PATRIA.kingBlue, cursor: "pointer" }}>
                      <Plus size={13} /> Add link
                    </button>
                  </div>
                )}

                <div style={{ ...linksGrid, marginTop: 12 }}>
                  {addingTo === s.id && (
                    <LinkForm initial={{ name: "", url: "", description: "", sectionId: s.id }} busy={busy} onCancel={() => setAddingTo(null)}
                      onSave={(d) => send("/api/links", "POST", d)} />
                  )}
                  {items.map((l, j) => renderLink(l, items, j))}
                  {items.length === 0 && addingTo !== s.id && (
                    <div style={{ gridColumn: "1 / -1", padding: "4px 2px", color: TEXT.muted, fontSize: 12.5 }}>No links yet.</div>
                  )}
                </div>
              </section>
            );
          })}

          {unassigned.length > 0 && (
            <section>
              <div className="patria-highlight" style={{ padding: "9px 14px", borderRadius: 8, fontSize: 13.5 }}>
                Unassigned{isAdmin ? " — edit a link to move it to a section" : ""}
              </div>
              <div style={{ ...linksGrid, marginTop: 12 }}>
                {unassigned.map((l, j) => renderLink(l, unassigned, j))}
              </div>
            </section>
          )}

          {sections.length === 0 && unassigned.length === 0 && !addingSection && (
            <div className="card" style={{ padding: 36, textAlign: "center", color: TEXT.muted, fontSize: 13 }}>
              No sections yet. Use “New section” to create the first one.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
