"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Plus, Pencil, Trash2, Check, X, Link2, AlertTriangle, Loader2 } from "lucide-react";
import { PATRIA, TEXT, BORDER, SURFACE, FONT_SECONDARY } from "@/lib/patriaTheme";
import { useIsAdmin } from "@/lib/useIsAdmin";
import type { AnalystLinkRow } from "@/app/api/links/route";

// Pestaña "Useful Links" de Chile y LatAm: accesos a los ejercicios y herramientas que
// arman los analistas (planillas, dashboards, carpetas compartidas). Todos los ven;
// el admin agrega, edita y borra.

type Region = "CHILE" | "LATAM";
interface Draft { name: string; url: string; description: string }

const EMPTY: Draft = { name: "", url: "", description: "" };

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
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

function LinkForm({ initial, busy, onSave, onCancel }: {
  initial: Draft; busy: boolean; onSave: (d: Draft) => void; onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const ok = d.name.trim() && d.url.trim();
  return (
    <div className="card" style={{ padding: 14, border: `1px solid ${PATRIA.kingBlue}55` }}>
      <div style={{ display: "grid", gap: 8 }}>
        <input autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Name — e.g. Bank comps model" maxLength={120} style={inputStyle} />
        <input value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} placeholder="https://…" maxLength={1000} style={{ ...inputStyle, fontFamily: FONT_SECONDARY }}
          onKeyDown={(e) => { if (e.key === "Enter" && ok) onSave(d); }} />
        <input value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="Short description (optional)" maxLength={300} style={inputStyle}
          onKeyDown={(e) => { if (e.key === "Enter" && ok) onSave(d); }} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <button onClick={onCancel} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, border: `1px solid ${BORDER.base}`, background: "#fff", color: TEXT.label, cursor: "pointer" }}>
          <X size={13} /> Cancel
        </button>
        <button onClick={() => ok && onSave(d)} disabled={!ok || busy}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, border: "none", background: ok && !busy ? PATRIA.kingBlue : "rgba(13,13,56,0.25)", color: "#fff", cursor: ok && !busy ? "pointer" : "default" }}>
          {busy ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> : <Check size={13} />} Save
        </button>
      </div>
    </div>
  );
}

export default function AnalystLinks({ region }: { region: Region }) {
  const isAdmin = useIsAdmin();
  const [links, setLinks] = useState<AnalystLinkRow[] | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/links?region=${region}`)
      .then((r) => r.json())
      .then((d: { links?: AnalystLinkRow[]; unavailable?: string; error?: string }) => {
        if (d.error) throw new Error(d.error);
        setLinks(d.links ?? []);
        setUnavailable(d.unavailable ?? null);
      })
      .catch((e: Error) => { setError(e.message); setLinks([]); });
  }, [region]);
  useEffect(load, [load]);

  async function send(method: "POST" | "PATCH", body: object) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/links", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not save");
      setAdding(false); setEditingId(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(l: AnalystLinkRow) {
    if (!window.confirm(`Delete the link "${l.name}"?`)) return;
    setError(null);
    const res = await fetch(`/api/links?id=${l.id}`, { method: "DELETE" });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not delete"); return; }
    setLinks((prev) => prev?.filter((x) => x.id !== l.id) ?? prev);
  }

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 3, height: 22, background: PATRIA.kingBlue, borderRadius: 2 }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT.body, letterSpacing: "-0.02em", margin: 0 }}>Useful Links</h2>
          </div>
          <p style={{ fontSize: 12, color: TEXT.label, margin: "5px 0 0 13px" }}>
            Models, dashboards and exercises built by the {region === "CHILE" ? "Chile" : "LatAm"} team
          </p>
        </div>
        {isAdmin && !adding && (
          <button onClick={() => { setAdding(true); setEditingId(null); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, fontSize: 12.5, fontWeight: 700, border: "none", background: PATRIA.kingBlue, color: "#fff", cursor: "pointer" }}>
            <Plus size={14} /> Add link
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
          {adding && (
            <LinkForm initial={EMPTY} busy={busy} onCancel={() => setAdding(false)}
              onSave={(d) => send("POST", { region, ...d })} />
          )}

          {links.map((l) =>
            editingId === l.id ? (
              <LinkForm key={l.id} initial={{ name: l.name, url: l.url, description: l.description ?? "" }} busy={busy}
                onCancel={() => setEditingId(null)} onSave={(d) => send("PATCH", { id: l.id, ...d })} />
            ) : (
              <div key={l.id} className="card" style={{ padding: 0, display: "flex", alignItems: "stretch", overflow: "hidden" }}>
                <a href={l.url} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, minWidth: 0, display: "flex", gap: 11, padding: "13px 14px", textDecoration: "none", color: "inherit" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = SURFACE.hover; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(32,68,220,0.08)", color: PATRIA.kingBlue }}>
                    <Link2 size={15} />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: TEXT.body }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                      <ExternalLink size={11} style={{ color: TEXT.muted, flexShrink: 0 }} />
                    </span>
                    <span style={{ display: "block", fontSize: 10.5, color: PATRIA.kingBlue, fontFamily: FONT_SECONDARY, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {hostOf(l.url)}
                    </span>
                    {l.description && (
                      <span style={{ display: "block", fontSize: 11.5, color: TEXT.label, marginTop: 5, lineHeight: 1.4 }}>{l.description}</span>
                    )}
                  </span>
                </a>
                {isAdmin && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "10px 10px 10px 0" }}>
                    <button onClick={() => { setEditingId(l.id); setAdding(false); }} title="Edit" style={iconBtn(PATRIA.kingBlue)}><Pencil size={12} /></button>
                    <button onClick={() => remove(l)} title="Delete" style={iconBtn(PATRIA.pink)}><Trash2 size={12} /></button>
                  </div>
                )}
              </div>
            ),
          )}

          {links.length === 0 && !adding && (
            <div className="card" style={{ gridColumn: "1 / -1", padding: 36, textAlign: "center", color: TEXT.muted, fontSize: 13 }}>
              No links yet.{isAdmin ? " Use “Add link” to create the first one." : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
