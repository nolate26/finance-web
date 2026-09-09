"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Search, Loader2, Check } from "lucide-react";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";
import type { PickSectorDTO } from "@/lib/topPicks";

// Modal para agregar un pick. Reemplaza al flujo anterior —"Add Company" creaba una
// fila vacía y había que llenar cuatro campos en línea antes de poder guardar—; acá se
// busca la empresa, se elige sector y se agrega en un paso.

interface SearchResult {
  nombreLatam:    string;
  industriaGics:  string | null;
  industriaChile: string | null;
}

interface Props {
  region:     "CHILE" | "LATAM";
  periodIso:  string;               // "YYYY-MM-01"
  sectors:    PickSectorDTO[];      // sólo los que la sesión puede escribir
  /** Empresas ya en el período: se marcan como agregadas y no se pueden repetir. */
  taken:      Set<string>;
  onClose:    () => void;
  onAdded:    () => void;
}

export default function AddPickModal({ region, periodIso, sectors, taken, onClose, onAdded }: Props) {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<SearchResult[]>([]);
  const [searching, setSearch]  = useState(false);
  const [picked, setPicked]     = useState<SearchResult | null>(null);
  const [sectorId, setSectorId] = useState(sectors[0]?.id ?? "");
  const [comment, setComment]   = useState("");
  const [target, setTarget]     = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isChile = region === "CHILE";

  // Búsqueda con debounce: se dispara desde 2 caracteres para no pedir el universo
  // entero en cada tecla.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearch(false); return; }
    setSearch(true);
    debounce.current = setTimeout(() => {
      fetch(`/api/companies/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d: { results?: SearchResult[] }) => setResults(d.results ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearch(false));
    }, 220);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visible = useMemo(() => results.slice(0, 30), [results]);

  async function save() {
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/top-picks", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          region,
          period_date:  periodIso,
          nombreLatam:  picked.nombreLatam,
          sectorId:     sectorId || null,
          comment,
          targetPrice:  target.trim() ? Number(target) : null,
          industryGroup: isChile ? picked.industriaChile : picked.industriaGics,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo agregar");
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar");
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Add top pick"
      style={{
        position: "fixed", inset: 0, zIndex: 150,
        background: "rgba(13,13,56,0.45)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF", borderRadius: 14, width: "min(520px, 100%)",
          maxHeight: "88vh", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 70px rgba(13,13,56,0.30)", border: `1px solid ${BORDER.base}`,
          overflow: "hidden",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px", borderBottom: `1px solid ${BORDER.subtle}`, background: "#F5F7FD",
        }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: PATRIA.darkBlue, letterSpacing: "-0.015em" }}>
            Add top pick
          </span>
          <button onClick={onClose} aria-label="Close"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: TEXT.label, padding: 3, display: "flex" }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* ── Buscador ─────────────────────────────────────────────────────── */}
          <div>
            <label style={labelStyle}>Company</label>
            {picked ? (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "9px 12px", borderRadius: 9,
                background: "rgba(32,68,220,0.07)", border: "1px solid rgba(32,68,220,0.26)",
              }}>
                <Check size={14} style={{ color: PATRIA.blue, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: PATRIA.darkBlue }}>
                  {picked.nombreLatam}
                </span>
                <button
                  onClick={() => { setPicked(null); setQuery(""); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: PATRIA.blue, fontSize: 11, fontWeight: 700 }}
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <div style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "8px 11px", borderRadius: 9,
                  border: `1px solid ${BORDER.base}`, background: "#F5F7FD",
                }}>
                  <Search size={13} style={{ color: TEXT.muted, flexShrink: 0 }} />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Type at least 2 letters…"
                    style={{
                      flex: 1, background: "transparent", border: "none", outline: "none",
                      fontSize: 13, color: PATRIA.darkBlue, fontFamily: FONT_SECONDARY,
                    }}
                  />
                  {searching && <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite", color: PATRIA.kingBlue }} />}
                </div>

                {query.trim().length >= 2 && (
                  <div style={{
                    marginTop: 6, maxHeight: 220, overflowY: "auto",
                    border: `1px solid ${BORDER.subtle}`, borderRadius: 9,
                  }}>
                    {visible.length === 0 && !searching ? (
                      <p style={{ fontSize: 11.5, color: TEXT.muted, textAlign: "center", padding: "18px 12px", margin: 0, fontStyle: "italic" }}>
                        No match for &ldquo;{query}&rdquo;
                      </p>
                    ) : visible.map((r) => {
                      const already = taken.has(r.nombreLatam);
                      return (
                        <button
                          key={r.nombreLatam}
                          onClick={() => !already && setPicked(r)}
                          disabled={already}
                          title={already ? "Ya está en los picks de este período" : undefined}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, width: "100%",
                            padding: "8px 11px", background: "transparent", border: "none",
                            borderBottom: `1px solid ${BORDER.subtle}`, textAlign: "left",
                            cursor: already ? "not-allowed" : "pointer",
                            opacity: already ? 0.45 : 1,
                          }}
                          onMouseEnter={(e) => { if (!already) (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.05)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        >
                          <span style={{ flex: 1, fontSize: 12.5, color: TEXT.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.nombreLatam}
                          </span>
                          {already && (
                            <span style={{ fontSize: 9.5, fontWeight: 700, color: TEXT.muted, whiteSpace: "nowrap" }}>added</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Sector ───────────────────────────────────────────────────────── */}
          <div>
            <label style={labelStyle}>Sector</label>
            {sectors.length === 0 ? (
              <p style={{ fontSize: 11.5, color: "#B01029", margin: 0 }}>
                No hay sectores donde puedas escribir. Pide a un admin que te agregue a uno.
              </p>
            ) : (
              <select
                value={sectorId}
                onChange={(e) => setSectorId(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* ── Comentario y TP ──────────────────────────────────────────────── */}
          <div>
            <label style={labelStyle}>Comment</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Thesis / rationale"
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          {/* Antes sólo se pedía en Chile. Se abre a las dos regiones para que el
              campo exista donde también se puede editar después. Sigue siendo opcional. */}
          {(
            <div>
              <label style={labelStyle}>Target price</label>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                placeholder="Optional"
                style={{ ...inputStyle, fontFamily: FONT_SECONDARY }}
              />
            </div>
          )}

          {error && (
            <div style={{
              fontSize: 12, color: "#B01029", background: "rgba(248,72,94,0.08)",
              border: "1px solid rgba(248,72,94,0.24)", borderRadius: 8, padding: "8px 11px",
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
          padding: "11px 18px", borderTop: `1px solid ${BORDER.subtle}`, background: "#F5F7FD",
        }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: "#FFFFFF", color: TEXT.label, border: `1px solid ${BORDER.base}`, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !picked || (!sectorId && sectors.length > 0)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 18px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
              background: picked ? PATRIA.blue : "rgba(13,13,56,0.20)",
              color: "#FFFFFF", border: "none",
              cursor: picked && !saving ? "pointer" : "default",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving && <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />}
            Add pick
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 9,
  border: "1px solid rgba(13,13,56,0.10)", background: "#F5F7FD",
  color: PATRIA.darkBlue, fontSize: 13, outline: "none", fontFamily: FONT_SECONDARY,
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
  textTransform: "uppercase", color: TEXT.muted, marginBottom: 6,
};
