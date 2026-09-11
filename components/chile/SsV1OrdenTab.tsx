"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, RefreshCw, Plus, Trash2, ChevronUp, ChevronDown, GripVertical, AlertTriangle, Check, RotateCcw } from "lucide-react";
import { PATRIA, FONT_SECONDARY, TEXT } from "@/lib/patriaTheme";
import { normName, type OrdenPayload, type OrdenSeccion } from "@/lib/chileCompanyOrder";
import type { SsRowStatus } from "@/app/api/admin/ss-rows/route";

// ── Pestaña "Orden y secciones" ─────────────────────────────────────────────────
// Reemplaza al FIXED_SECTIONS hardcodeado: acá se define en qué bloque va cada empresa y en
// qué orden, y eso manda en Stock Selection y en Proyecciones (las dos leen el mismo orden).
//
// El editor trabaja sobre una copia local y recién al Guardar manda la estructura entera,
// que la API reescribe en una transacción. Así no hay estados a medias ni una empresa
// colgada entre dos secciones mientras se arrastra.

const TEXT1 = PATRIA.darkBlue;
const TEXT2 = TEXT.label;
const TEXT3 = TEXT.muted;
const BORDER = "rgba(13,13,56,0.09)";
const NAVY = PATRIA.darkBlue;
const INK = PATRIA.kingBlue;
const SURFACE = "#F5F7FD";
const POS = PATRIA.blue;
const NEG = PATRIA.pink;
const WARN = PATRIA.orange;
const NUMF: React.CSSProperties = { fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" };

interface Arrastre { seccion: number; idx: number }

export default function SsV1OrdenTab({ onSourceChanged }: { onSourceChanged: () => void }) {
  const [secciones, setSecciones] = useState<OrdenSeccion[]>([]);
  const [fuente, setFuente] = useState<"db" | "codigo" | null>(null);
  const [universo, setUniverso] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [sucio, setSucio] = useState(false);
  const [sel, setSel] = useState(0);             // sección abierta a la derecha
  const [drag, setDrag] = useState<Arrastre | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null); setDone(null);
    Promise.all([
      fetch("/api/chile/orden").then((r) => r.json()) as Promise<OrdenPayload>,
      fetch("/api/admin/ss-rows").then((r) => r.json()) as Promise<{ rows?: SsRowStatus[] }>,
    ])
      .then(([orden, filas]) => {
        setSecciones(orden.secciones.map((s) => ({ nombre: s.nombre, empresas: [...s.empresas] })));
        setFuente(orden.fuente);
        setUniverso((filas.rows ?? []).map((r) => r.company));
        setSucio(false);
        setSel((s) => Math.min(s, Math.max(orden.secciones.length - 1, 0)));
      })
      .catch(() => setError("No se pudo cargar el orden"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const mut = (f: (s: OrdenSeccion[]) => OrdenSeccion[]) => {
    setSecciones((prev) => f(prev.map((s) => ({ nombre: s.nombre, empresas: [...s.empresas] }))));
    setSucio(true); setDone(null);
  };

  // Empresas de la vista que todavía no están en ninguna sección. Son las que hoy caen al
  // final de la tabla en orden alfabético — el bloque "sin asignar" existe para verlas.
  const asignadas = useMemo(() => new Set(secciones.flatMap((s) => s.empresas.map(normName))), [secciones]);
  const sinAsignar = useMemo(
    () => universo.filter((c) => !asignadas.has(normName(c))).sort((a, b) => a.localeCompare(b, "es")),
    [universo, asignadas],
  );
  // Nombres en el orden que no existen en la vista: sobraron de una cobertura anterior.
  const enUniverso = useMemo(() => new Set(universo.map(normName)), [universo]);

  const moverSeccion = (i: number, d: -1 | 1) => mut((s) => {
    const j = i + d; if (j < 0 || j >= s.length) return s;
    [s[i], s[j]] = [s[j], s[i]];
    setSel(j);
    return s;
  });
  const moverEmpresa = (si: number, i: number, d: -1 | 1) => mut((s) => {
    const arr = s[si].empresas, j = i + d;
    if (j < 0 || j >= arr.length) return s;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return s;
  });
  const aSeccion = (si: number, i: number, destino: number) => mut((s) => {
    if (destino === si || destino < 0 || destino >= s.length) return s;
    const [c] = s[si].empresas.splice(i, 1);
    s[destino].empresas.push(c);
    return s;
  });
  const sacar = (si: number, i: number) => mut((s) => { s[si].empresas.splice(i, 1); return s; });
  const agregar = (company: string, si: number) => mut((s) => { s[si]?.empresas.push(company); return s; });

  const soltar = (destSeccion: number, destIdx: number | null) => {
    const d = drag; setDrag(null);
    if (!d) return;
    mut((s) => {
      const [c] = s[d.seccion].empresas.splice(d.idx, 1);
      if (c == null) return s;
      const arr = s[destSeccion].empresas;
      // Al mover dentro de la misma lista, el índice destino ya corrió por el splice.
      const at = destIdx == null ? arr.length : d.seccion === destSeccion && d.idx < destIdx ? destIdx - 1 : destIdx;
      arr.splice(Math.max(0, Math.min(at, arr.length)), 0, c);
      return s;
    });
  };

  const guardar = () => {
    if (saving) return;
    setSaving(true); setError(null); setDone(null);
    fetch("/api/chile/orden", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secciones }),
    })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "No se pudo guardar"); return d; })
      .then((d: { secciones: number; empresas: number }) => {
        setSucio(false); setFuente("db");
        setDone(`Guardado: ${d.empresas} empresas en ${d.secciones} secciones.`);
        onSourceChanged();
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setSaving(false));
  };

  const btn = (extra?: React.CSSProperties): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
    padding: "3px 7px", fontSize: 10, fontWeight: 700, borderRadius: 5,
    border: `1px solid ${BORDER}`, background: "#fff", color: TEXT2, cursor: "pointer", ...extra,
  });

  const secActual = secciones[sel];

  return (
    <div style={{ padding: "10px 12px 12px" }}>

      {/* Barra */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 9 }}>
        <span style={{ fontSize: 11.5, color: TEXT2 }}>
          {secciones.length} secciones · <span style={NUMF}>{asignadas.size}</span> empresas ordenadas
        </span>
        {fuente === "codigo" && (
          <span title="Todavía no se guardó ningún orden desde acá: se está mostrando el del código. Guardá para pasar a manejarlo desde la web."
            style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: WARN, background: "rgba(255,107,6,0.10)", border: `1px solid ${WARN}55`, borderRadius: 4, padding: "1px 6px", cursor: "help" }}>
            orden del código
          </span>
        )}
        {sucio && (
          <span style={{ fontSize: 10, fontWeight: 700, color: WARN }}>· cambios sin guardar</span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => mut((s) => [...s, { nombre: `Sección ${s.length + 1}`, empresas: [] }])} style={btn({ color: INK, borderColor: `${INK}55` })}>
          <Plus size={11} /> Nueva sección
        </button>
        <button onClick={load} title="Descartar cambios y recargar" style={btn()}>
          <RotateCcw size={11} /> Descartar
        </button>
        <button onClick={guardar} disabled={!sucio || saving}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", fontSize: 11.5, fontWeight: 700, borderRadius: 6, border: "none", background: sucio && !saving ? INK : "rgba(13,13,56,0.25)", color: "#fff", cursor: sucio && !saving ? "pointer" : "default" }}>
          {saving ? <RefreshCw size={12} style={{ animation: "spin 0.8s linear infinite" }} /> : <Save size={12} />} Guardar orden
        </button>
      </div>

      {error && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: NEG, fontWeight: 600, marginBottom: 8 }}><AlertTriangle size={13} /> {error}</div>}
      {done && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: POS, fontWeight: 600, marginBottom: 8 }}><Check size={13} /> {done}</div>}
      {loading && <div style={{ fontSize: 12, color: TEXT3, padding: 20, textAlign: "center" }}>Cargando…</div>}

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(190px, 260px) 1fr", gap: 10, alignItems: "start" }}>

          {/* ── Secciones ──────────────────────────────────────────────────── */}
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "6px 9px", background: NAVY, color: "#fff", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Secciones · en orden
            </div>
            <div style={{ maxHeight: 420, overflow: "auto" }}>
              {secciones.map((s, i) => (
                <div key={i}
                  onClick={() => setSel(i)}
                  // Soltar una empresa sobre la sección = moverla al final de esa sección.
                  onDragOver={(e) => { if (drag) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); soltar(i, null); }}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 7px", borderBottom: `1px solid ${BORDER}`, background: i === sel ? "rgba(32,68,220,0.08)" : "#fff", cursor: "pointer" }}>
                  <span style={{ ...NUMF, fontSize: 9, color: TEXT3, width: 14, textAlign: "right" }}>{i + 1}</span>
                  <input value={s.nombre}
                    onChange={(e) => { const v = e.target.value; mut((p) => { p[i].nombre = v; return p; }); }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ flex: 1, minWidth: 0, padding: "3px 5px", fontSize: 11.5, fontWeight: i === sel ? 700 : 500, borderRadius: 4, border: `1px solid transparent`, background: "transparent", color: TEXT1, outline: "none" }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = "#fff"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent"; }} />
                  <span style={{ ...NUMF, fontSize: 9.5, color: TEXT3 }}>{s.empresas.length}</span>
                  <button onClick={(e) => { e.stopPropagation(); moverSeccion(i, -1); }} disabled={i === 0} style={btn({ padding: "1px 3px", opacity: i === 0 ? 0.3 : 1 })}><ChevronUp size={11} /></button>
                  <button onClick={(e) => { e.stopPropagation(); moverSeccion(i, 1); }} disabled={i === secciones.length - 1} style={btn({ padding: "1px 3px", opacity: i === secciones.length - 1 ? 0.3 : 1 })}><ChevronDown size={11} /></button>
                  <button onClick={(e) => { e.stopPropagation(); if (s.empresas.length) { setError(`“${s.nombre}” todavía tiene ${s.empresas.length} empresas`); return; } mut((p) => p.filter((_, j) => j !== i)); setSel(0); }}
                    title={s.empresas.length ? "Vaciala primero" : "Borrar sección"}
                    style={btn({ padding: "1px 3px", color: s.empresas.length ? TEXT3 : NEG })}><Trash2 size={11} /></button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Empresas de la sección elegida ─────────────────────────────── */}
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "6px 9px", background: NAVY, color: "#fff", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {secActual ? `${secActual.nombre} · ${secActual.empresas.length} empresas` : "Sin sección elegida"}
            </div>
            <div style={{ maxHeight: 420, overflow: "auto", padding: "4px 0" }}
              onDragOver={(e) => { if (drag) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); soltar(sel, null); }}>
              {secActual?.empresas.map((c, i) => {
                const huerfana = !enUniverso.has(normName(c));
                return (
                  <div key={`${c}-${i}`} draggable
                    onDragStart={() => setDrag({ seccion: sel, idx: i })}
                    onDragEnd={() => setDrag(null)}
                    onDragOver={(e) => { if (drag) e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); soltar(sel, i); }}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 9px", background: drag?.seccion === sel && drag.idx === i ? SURFACE : "transparent", cursor: "grab" }}>
                    <GripVertical size={12} color={TEXT3} style={{ flexShrink: 0 }} />
                    <span style={{ ...NUMF, fontSize: 9, color: TEXT3, width: 18, textAlign: "right" }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: 11.5, color: huerfana ? TEXT3 : TEXT1, fontWeight: 600 }}>
                      {c}
                      {huerfana && (
                        <span title="Este nombre no existe hoy en Stock Selection: quedó de una cobertura anterior. No molesta, pero podés sacarlo."
                          style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: WARN, cursor: "help" }}>sin datos</span>
                      )}
                    </span>
                    <button onClick={() => moverEmpresa(sel, i, -1)} disabled={i === 0} style={btn({ padding: "1px 3px", opacity: i === 0 ? 0.3 : 1 })}><ChevronUp size={11} /></button>
                    <button onClick={() => moverEmpresa(sel, i, 1)} disabled={i === secActual.empresas.length - 1} style={btn({ padding: "1px 3px", opacity: i === secActual.empresas.length - 1 ? 0.3 : 1 })}><ChevronDown size={11} /></button>
                    <select value="" onChange={(e) => { const d = parseInt(e.target.value, 10); if (Number.isFinite(d)) aSeccion(sel, i, d); }}
                      title="Mover a otra sección"
                      style={{ width: 92, padding: "2px 4px", fontSize: 10, borderRadius: 5, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT2, outline: "none" }}>
                      <option value="">mover a…</option>
                      {secciones.map((s, j) => j !== sel && <option key={j} value={j}>{s.nombre}</option>)}
                    </select>
                    <button onClick={() => sacar(sel, i)} title="Sacar del orden (cae al final de la tabla)" style={btn({ padding: "1px 3px", color: NEG })}><Trash2 size={11} /></button>
                  </div>
                );
              })}
              {secActual && secActual.empresas.length === 0 && (
                <div style={{ padding: "18px 10px", textAlign: "center", fontSize: 11, color: TEXT3 }}>
                  Sección vacía. Arrastrá empresas acá o usá “agregar” desde la lista de abajo.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Sin asignar ──────────────────────────────────────────────────── */}
      {!loading && (
        <div style={{ marginTop: 10, border: `1px solid ${sinAsignar.length ? WARN : BORDER}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "6px 9px", background: sinAsignar.length ? "rgba(255,107,6,0.09)" : SURFACE, fontSize: 10.5, fontWeight: 700, color: sinAsignar.length ? WARN : TEXT2 }}>
            Sin asignar · {sinAsignar.length}
            <span style={{ fontWeight: 400, color: TEXT3, marginLeft: 6 }}>
              caen al final de la tabla, en orden alfabético
            </span>
          </div>
          {sinAsignar.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "8px 9px", maxHeight: 140, overflow: "auto" }}>
              {sinAsignar.map((c) => (
                <button key={c} onClick={() => agregar(c, sel)}
                  title={secActual ? `Agregar a “${secActual.nombre}”` : "Elegí una sección primero"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", fontSize: 10.5, fontWeight: 600, borderRadius: 5, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT1, cursor: "pointer" }}>
                  <Plus size={10} color={INK} /> {c}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 10.5, color: TEXT3, marginTop: 9, lineHeight: 1.55 }}>
        Este orden manda en <strong style={{ color: TEXT2 }}>Stock Selection</strong> y en <strong style={{ color: TEXT2 }}>Proyecciones</strong>: las dos tablas
        leen el mismo, y el borde entre bloques se dibuja donde cambia la sección. Sólo aplica con el
        botón “Orden por sector” activo; si ordenás por una columna, manda esa columna.
        {fuente === "codigo" && " Mientras no guardes, sigue vigente el orden del código."}
      </div>
    </div>
  );
}
