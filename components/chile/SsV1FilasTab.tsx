"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Save, ChevronDown, ChevronRight, RefreshCw, Eye, EyeOff, Plus, X, Zap, Check, AlertTriangle } from "lucide-react";
import { PATRIA, FONT_SECONDARY, TEXT } from "@/lib/patriaTheme";
import { OVERRIDE_FIELDS } from "@/lib/ssOverrideFields";
import type { SsRowStatus, RowStatus } from "@/app/api/admin/ss-rows/route";
import type { VerifyResult } from "@/app/api/admin/empresas/verify/route";

// ── Pestaña "Filas del Stock Selection" ─────────────────────────────────────────
// Una línea por compañía de stock_selection_v1 con el motivo por el que se ve o no se ve.
// Es la respuesta al modo de falla silencioso de la vista: sin esto, una compañía que no
// homologa simplemente no aparece y no hay dónde enterarse de que existe.

const TEXT1 = PATRIA.darkBlue;
const TEXT2 = TEXT.label;
const TEXT3 = TEXT.muted;
const BORDER = "rgba(13,13,56,0.09)";
const NAVY = PATRIA.darkBlue;
const INK = PATRIA.kingBlue;
const SURFACE = "#F5F7FD";
const ZEBRA = "#F5F7FD";
const POS = PATRIA.blue;
const NEG = PATRIA.pink;
const WARN = PATRIA.orange;
const NUMF: React.CSSProperties = { fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" };

const STATUS_META: Record<RowStatus, { label: string; color: string; bg: string; hint: string }> = {
  ok: { label: "OK", color: POS, bg: "rgba(0,30,175,0.08)", hint: "Se ve en la tabla y todas sus series tienen retorno." },
  "sin-homologacion": { label: "Sin homologar", color: NEG, bg: "rgba(248,72,94,0.12)", hint: "No existe en empresas_industrias_v2 → la vista la descarta en silencio." },
  oculta: { label: "Oculta", color: TEXT3, bg: "rgba(13,13,56,0.07)", hint: "Ocultada a mano. Los datos siguen intactos." },
  "sin-retornos": { label: "Sin retornos", color: WARN, bg: "rgba(255,107,6,0.12)", hint: "Se ve, pero alguna serie no tiene retorno cargado en el snapshot." },
  sembrada: { label: "Sembrada", color: INK, bg: "rgba(32,68,220,0.10)", hint: "Dada de alta a mano: se ve en la tabla con los valores que cargaste, pero el script todavía no la trae. Cuando empiece a mandarla, pasa a alimentarse sola." },
};

interface FilasPayload {
  rows: SsRowStatus[];
  counts: { total: number; ok: number; sinHomologacion: number; ocultas: number; sinRetornos: number; sembradas: number };
  snapshotRows: number;
  unusedReturns: string[];
}

/** Período activo de la vista — los datos iniciales se guardan contra ese trimestre. */
export interface PeriodoActivo { fy: number; q: number; label: string }

export default function SsV1FilasTab({ onSourceChanged, periodo }: { onSourceChanged: () => void; periodo: PeriodoActivo | null }) {
  const [data, setData] = useState<FilasPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<RowStatus | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);
  // null = cerrado · SsRowStatus = homologar una fila existente · "nueva" = alta desde cero
  const [creating, setCreating] = useState<SsRowStatus | "nueva" | null>(null);
  const [showUnused, setShowUnused] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetch("/api/admin/ss-rows")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Error al cargar"); return d as FilasPayload; })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const toggleHidden = (r: SsRowStatus) => {
    const hide = !r.hidden;
    // Al ocultar se pide motivo: dentro de un mes nadie se acuerda por qué faltaba una fila.
    const reason = hide ? window.prompt(`Ocultar "${r.company}" de la vista.\n\nMotivo (opcional, queda en la bitácora):`, "") : null;
    if (hide && reason === null) return; // canceló
    setBusy(r.key);
    fetch("/api/admin/ss-rows", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: r.company, hidden: hide, reason }),
    })
      .then(async (res) => { const j = await res.json(); if (!res.ok) throw new Error(j.error || "Error"); })
      .then(() => { load(); onSourceChanged(); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(null));
  };

  // Deshacer una clonación. Sólo borra las filas marcadas como clonadas: lo que cargó el
  // script queda intacto, así que es lo que hay que correr cuando llega el dato real.
  const borrarClonadas = (r: SsRowStatus) => {
    if (!window.confirm(
      `Borrar las ${r.clonedRows} filas que se clonaron desde “${r.clonedFrom}” a “${r.company}”.\n\n` +
      `Las filas que cargó el script NO se tocan. Después de esto, la compañía va a mostrar sólo sus datos propios.`,
    )) return;
    setBusy(r.key);
    fetch(`/api/admin/ss-clone?company=${encodeURIComponent(r.company)}`, { method: "DELETE" })
      .then(async (res) => { const j = await res.json(); if (!res.ok) throw new Error(j.error || "Error"); })
      .then(() => { load(); onSourceChanged(); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(null));
  };

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) =>
      (filter === "all" || r.status === filter) &&
      (!term || r.company.toLowerCase().includes(term) || (r.tickerBBG ?? "").toLowerCase().includes(term)),
    );
  }, [data, q, filter]);

  const th: React.CSSProperties = { padding: "6px 8px", textAlign: "left", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fff", background: NAVY, whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 2 };
  const td: React.CSSProperties = { padding: "5px 8px", borderBottom: `1px solid ${BORDER}`, fontSize: 11, color: TEXT1, verticalAlign: "middle" };
  const chip = (active: boolean, color: string, bg: string): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 5, fontSize: 10.5, fontWeight: 700,
    border: `1px solid ${active ? color : BORDER}`, background: active ? bg : "#fff", color: active ? color : TEXT2, cursor: "pointer",
  });

  const c = data?.counts;
  return (
    <div style={{ padding: "10px 12px 12px" }}>
      {/* Los contadores son el filtro: el número que te preocupa es el botón que te lleva ahí. */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 8 }}>
        <button onClick={() => setFilter("all")} style={chip(filter === "all", INK, "rgba(32,68,220,0.08)")}>Todas {c ? c.total : "—"}</button>
        <button onClick={() => setFilter("ok")} style={chip(filter === "ok", POS, STATUS_META.ok.bg)}>OK {c ? c.ok : "—"}</button>
        <button onClick={() => setFilter("sin-homologacion")} style={chip(filter === "sin-homologacion", NEG, STATUS_META["sin-homologacion"].bg)}>
          Sin homologar {c ? c.sinHomologacion : "—"}
        </button>
        <button onClick={() => setFilter("sin-retornos")} style={chip(filter === "sin-retornos", WARN, STATUS_META["sin-retornos"].bg)}>
          Sin retornos {c ? c.sinRetornos : "—"}
        </button>
        <button onClick={() => setFilter("oculta")} style={chip(filter === "oculta", TEXT2, STATUS_META.oculta.bg)}>Ocultas {c ? c.ocultas : "—"}</button>
        {!!c?.sembradas && (
          <button onClick={() => setFilter("sembrada")} style={chip(filter === "sembrada", INK, STATUS_META.sembrada.bg)}>Sembradas {c.sembradas}</button>
        )}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "1 1 150px", minWidth: 130, padding: "5px 9px", borderRadius: 6, background: SURFACE, border: `1px solid ${BORDER}` }}>
          <Search size={12} color={TEXT3} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…"
            style={{ border: "none", outline: "none", fontSize: 12, color: TEXT1, background: "transparent", width: "100%" }} />
        </div>
        {/* Alta desde cero: para una empresa que todavía no existe en ninguna tabla — el
            caso de un ticker nuevo que recién va a empezar a cargarse. */}
        <button onClick={() => setCreating("nueva")}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: "none", background: INK, color: "#fff", cursor: "pointer" }}>
          <Plus size={12} /> Crear empresa nueva
        </button>
        <button onClick={load} title="Recargar" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", color: NAVY, cursor: "pointer" }}>
          <RefreshCw size={13} style={loading ? { animation: "spin 0.8s linear infinite" } : undefined} />
        </button>
      </div>

      {error && <div style={{ fontSize: 12, color: NEG, fontWeight: 600, marginBottom: 8 }}>{error}</div>}

      <div style={{ overflow: "auto", maxHeight: 400, border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>Compañía</th>
              <th style={th}>Estado</th>
              <th style={th}>Ticker BBG</th>
              <th style={th}>Retornos por serie</th>
              <th style={th}>Industria</th>
              <th style={{ ...th, textAlign: "right" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const m = STATUS_META[r.status];
              return (
                <tr key={r.key} style={{ background: i % 2 === 0 ? "#fff" : ZEBRA, opacity: r.hidden ? 0.6 : 1 }}>
                  <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {r.company}
                    {r.dual && <span style={{ marginLeft: 5, fontSize: 8.5, fontWeight: 700, color: INK, background: "rgba(32,68,220,0.10)", borderRadius: 3, padding: "1px 4px" }}>A/B</span>}
                    <div style={{ fontSize: 9, color: TEXT3, fontWeight: 400, ...NUMF }}>
                      {r.seeded ? "sin filas en SS v1 — a la espera del cargador" : `${r.quarters} filas en SS v1`}
                      {r.clonedRows > 0 && (
                        <span title={`${r.clonedRows} de esas filas se clonaron desde ${r.clonedFrom}. El cargador no las va a pisar.`}
                          style={{ marginLeft: 5, fontWeight: 700, color: WARN, cursor: "help" }}>
                          · {r.clonedRows} clonadas de {r.clonedFrom}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={td}>
                    <span title={m.hint} style={{ display: "inline-block", fontSize: 9.5, fontWeight: 700, color: m.color, background: m.bg, border: `1px solid ${m.color}`, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>
                      {m.label}
                    </span>
                    {r.hiddenReason && <div style={{ fontSize: 9, color: TEXT3, marginTop: 2 }}>{r.hiddenReason}</div>}
                  </td>
                  <td style={{ ...td, ...NUMF, fontSize: 10.5, whiteSpace: "nowrap", color: r.tickerBBG ? TEXT1 : NEG }}>{r.tickerBBG ?? "— sin fila —"}</td>
                  <td style={td}>
                    {/* Una pastilla por serie: distingue "no hay fila en el snapshot" de
                        "hay fila pero llegó vacía", que son dos problemas distintos. */}
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {r.series.map((s) => {
                        const col = s.hasAnyReturn ? POS : s.hasReturnRow ? WARN : NEG;
                        const txt = s.hasAnyReturn ? "✓" : s.hasReturnRow ? "vacía" : "✕";
                        const why = s.hasAnyReturn ? "con retorno" : s.hasReturnRow ? "la fila llegó sin ningún retorno" : "no hay fila en el snapshot";
                        return (
                          <span key={s.label} title={`${s.bbg ?? "sin ticker"} → ${why}${s.retAsOf ? ` · al ${s.retAsOf}` : ""}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 700, color: col, border: `1px solid ${col}`, borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap" }}>
                            {s.label}: {txt}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ ...td, fontSize: 10, color: TEXT2, maxWidth: 130 }}>{r.industria || "—"}</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    {r.status === "sin-homologacion" && (
                      <button onClick={() => setCreating(r)} title="Crear la fila de empresas_industrias_v2 que le falta"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", fontSize: 10, fontWeight: 700, borderRadius: 5, border: "none", background: NEG, color: "#fff", cursor: "pointer", marginRight: 4 }}>
                        <Plus size={10} /> Homologar
                      </button>
                    )}
                    {r.clonedRows > 0 && (
                      <button onClick={() => borrarClonadas(r)} disabled={busy === r.key}
                        title={`Borrar las ${r.clonedRows} filas clonadas desde ${r.clonedFrom}. Las cargadas por el script no se tocan.`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", fontSize: 10, fontWeight: 700, borderRadius: 5, border: `1px solid ${WARN}`, background: "#fff", color: WARN, cursor: busy === r.key ? "default" : "pointer", marginRight: 4 }}>
                        Borrar clonadas
                      </button>
                    )}
                    <button onClick={() => toggleHidden(r)} disabled={busy === r.key}
                      title={r.hidden ? "Volver a mostrarla en la tabla" : "Ocultarla de la tabla (no borra datos)"}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", fontSize: 10, fontWeight: 700, borderRadius: 5, border: `1px solid ${BORDER}`, background: "#fff", color: r.hidden ? POS : TEXT2, cursor: busy === r.key ? "default" : "pointer" }}>
                      {r.hidden ? <><Eye size={10} /> Mostrar</> : <><EyeOff size={10} /> Ocultar</>}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && shown.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 26, textAlign: "center", color: TEXT3, fontSize: 12.5 }}>Sin filas para el filtro actual.</td></tr>
            )}
            {loading && !data && (
              <tr><td colSpan={6} style={{ padding: 26, textAlign: "center", color: TEXT3, fontSize: 12.5 }}>Cargando…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* El otro lado del hueco: retornos cargados que ninguna fila de la vista consume. */}
      {!!data?.unusedReturns.length && (
        <div style={{ marginTop: 8, border: `1px solid ${BORDER}`, borderRadius: 6, overflow: "hidden" }}>
          <button onClick={() => setShowUnused((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "7px 10px", background: SURFACE, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: TEXT2, textAlign: "left" }}>
            {showUnused ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {data.unusedReturns.length} tickers del snapshot que la vista no usa
            <span style={{ fontWeight: 400, color: TEXT3 }}>· de {data.snapshotRows} filas cargadas</span>
          </button>
          {showUnused && (
            <div style={{ padding: "8px 10px", fontSize: 10.5, color: TEXT2, ...NUMF, lineHeight: 1.7, maxHeight: 140, overflow: "auto" }}>
              {data.unusedReturns.join(" · ")}
              <div style={{ marginTop: 6, fontSize: 10, color: TEXT3, fontFamily: "inherit" }}>
                Son índices, monedas y commodities que carga el script, más empresas sin fila en stock_selection_v1.
                Si alguna debería verse, el ticker de su fila en Homologación no coincide con el que manda el script.
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 10.5, color: TEXT3, marginTop: 8, lineHeight: 1.55 }}>
        <strong style={{ color: TEXT2 }}>Ocultar</strong> no borra nada: marca la compañía en <em>stock_selection_hidden</em> y la vista la saltea. Se revierte con Mostrar.
        {" "}<strong style={{ color: TEXT2 }}>Homologar</strong> crea la fila que le falta en <em>empresas_industrias_v2</em>; sin ella la compañía se descarta sin aviso por cargados que estén sus datos.
        {" "}Para cambiar el ticker de una fila que ya existe, andá a la pestaña Homologación.
      </div>

      {creating && (
        <CrearHomologacion
          row={creating === "nueva" ? null : creating}
          periodo={periodo}
          // Candidatas a clonar: las que tienen fundamentales cargados de verdad.
          fuentes={(data?.rows ?? []).filter((r) => r.quarters > 0).map((r) => r.company)}
          onClose={() => setCreating(null)}
          onSaved={() => { setCreating(null); load(); onSourceChanged(); }}
        />
      )}
    </div>
  );
}

// ── Alta de una empresa ─────────────────────────────────────────────────────────
// Dos usos con el mismo formulario:
//   · `row` != null — homologar una compañía que YA tiene fundamentales cargados y se está
//     cayendo por falta de fila en empresas_industrias_v2. El nombre viene prellenado y no
//     se toca: tiene que machear con stock_selection_v1 o se sigue cayendo.
//   · `row` == null — alta desde cero de una empresa que todavía no existe en ninguna tabla
//     (un ticker nuevo que recién va a empezar a cargarse). Acá el nombre SÍ se escribe, y
//     hay que escribirlo tal como lo va a mandar el cargador.
//
// Los "datos iniciales" son opcionales y NO se escriben en stock_selection_v1 (esa la
// repuebla el cargador con createMany/skipDuplicates: una fila puesta a mano ahí BLOQUEARÍA
// el valor real cuando llegue). Van a stock_selection_override, que es la capa pensada para
// eso: se aplica encima, es reversible y queda en la bitácora.
function CrearHomologacion({ row, periodo, fuentes, onClose, onSaved }: {
  row: SsRowStatus | null; periodo: PeriodoActivo | null; fuentes: string[]; onClose: () => void; onSaved: () => void;
}) {
  const nuevo = row == null;
  const [clonarDe, setClonarDe] = useState("");
  const [f, setF] = useState({
    nombreLatam: row?.company ?? "", nombreChile: row?.company ?? "", tickerBloomberg: "", yahooFinanceTicker: "",
    isin: "", industriaChile: "", industriaGics: "", moneda: "CLP",
  });
  // Datos iniciales: sólo los que el usuario escriba se guardan. Vacío = lo llena el script.
  const [vals, setVals] = useState<Record<string, string>>({});
  const [openData, setOpenData] = useState(false);
  const [saving, setSaving] = useState<null | "empresa" | "clon" | "datos">(null);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<VerifyResult | null>(null);
  const [checking, setChecking] = useState(false);

  const nombre = f.nombreLatam.trim();
  const ticker = f.tickerBloomberg.trim();
  const listo = !!nombre && !!ticker && saving == null;

  // Probar el símbolo de Yahoo ANTES de guardarlo: un ticker deslistado se guarda sin
  // chistar y deja la empresa en la tabla sin precio ni retornos.
  const probar = () => {
    const t = f.yahooFinanceTicker.trim();
    if (!t || checking) return;
    setChecking(true); setCheck(null);
    fetch(`/api/admin/empresas/verify?ticker=${encodeURIComponent(t)}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Error al probar"); return d as VerifyResult; })
      .then(setCheck)
      .catch((e: Error) => setError(e.message))
      .finally(() => setChecking(false));
  };

  const numericos = () => Object.entries(vals)
    .map(([field, raw]) => ({ field, value: Number(String(raw).replace(/\s|,/g, "")) }))
    .filter((c) => String(vals[c.field]).trim() !== "" && Number.isFinite(c.value));

  const save = async () => {
    if (!listo) return;
    setSaving("empresa"); setError(null);
    try {
      const res = await fetch("/api/admin/empresas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, nombreChile: f.nombreChile.trim() || nombre }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error al crear la empresa");

      // Clonar el historial, si eligió de dónde. Va antes de los datos iniciales para que
      // un override escrito a mano quede pisando a la serie clonada y no al revés.
      if (clonarDe) {
        setSaving("clon");
        const rc = await fetch("/api/admin/ss-clone", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: clonarDe, to: nombre }),
        });
        const dc = await rc.json();
        if (!rc.ok) throw new Error(dc.error || "La empresa se creó, pero falló la clonación");
      }

      // Datos iniciales, si los escribió. Se guardan contra el trimestre activo de la vista:
      // un override vive por período, igual que cualquier otra edición manual.
      const cells = numericos();
      if (cells.length) {
        if (!periodo) throw new Error("La empresa se creó, pero no hay trimestre activo para guardar los datos iniciales.");
        setSaving("datos");
        const r2 = await fetch("/api/chile/stock-selection-v1/overrides", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fiscalYear: periodo.fy, quarter: periodo.q,
            changes: cells.map((c) => ({ company: nombre, field: c.field, value: c.value })),
          }),
        });
        const d2 = await r2.json();
        if (!r2.ok) throw new Error(d2.error || "La empresa se creó, pero fallaron los datos iniciales");
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message); setSaving(null);
    }
  };

  const field = (key: keyof typeof f, label: string, ph = "", required = false, hint?: string) => (
    <div style={{ padding: "3px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, fontSize: 12, color: TEXT1 }}>{label}{required && <span style={{ color: NEG }}> *</span>}</div>
        <input value={f[key]} onChange={(e) => { setF((p) => ({ ...p, [key]: e.target.value })); if (key === "yahooFinanceTicker") setCheck(null); }}
          placeholder={ph} disabled={key === "nombreLatam" && !nuevo}
          style={{ width: 210, padding: "5px 8px", fontSize: 12, ...NUMF, borderRadius: 6, border: `1px solid ${BORDER}`, background: key === "nombreLatam" && !nuevo ? SURFACE : "#fff", color: TEXT1, outline: "none" }} />
      </div>
      {hint && <div style={{ fontSize: 9.5, color: TEXT3, textAlign: "right", marginTop: 1 }}>{hint}</div>}
    </div>
  );

  const grupos = [...new Set(OVERRIDE_FIELDS.filter((o) => o.scope !== "dual").map((o) => o.group))];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(13,13,56,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "min(560px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 48px rgba(13,13,56,0.35)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 16px", background: NAVY, color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Plus size={15} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>{nuevo ? "Crear empresa nueva" : `Homologar · ${row!.company}`}</span>
          </div>
          <button onClick={onClose} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", cursor: "pointer" }}><X size={15} /></button>
        </div>

        <div style={{ overflow: "auto", flex: 1, padding: "10px 16px 14px" }}>
          <div style={{ fontSize: 11, color: TEXT2, marginBottom: 8, lineHeight: 1.5 }}>
            {nuevo ? (
              <>Escribí el <strong>nombre</strong> exactamente como lo va a mandar el cargador de Stock Selection: es la llave con la que se van a enganchar sus fundamentales cuando lleguen. El <strong>ticker Bloomberg</strong> es la llave de retornos, recomendación y carteras.</>
            ) : (
              <>El <strong>nombre</strong> viene prellenado desde <em>stock_selection_v1</em> y no se edita: tiene que machear o la compañía se sigue cayendo. El <strong>ticker Bloomberg</strong> es la llave con la que se le buscan retornos y recomendación.</>
            )}
          </div>

          {field("nombreLatam", "Nombre (latam)", "Pampa", true, nuevo ? "el que manda el cargador" : "fijo: viene de stock_selection_v1")}
          {field("nombreChile", "Nombre (chile)", nombre || "Pampa", false, "si va vacío se copia el de arriba")}
          {field("tickerBloomberg", "Ticker Bloomberg", "PAMPA CI Equity", true, "único en toda la maestra")}

          {/* Yahoo + prueba */}
          <div style={{ padding: "3px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, fontSize: 12, color: TEXT1 }}>Ticker Yahoo</div>
              <input value={f.yahooFinanceTicker} onChange={(e) => { setF((p) => ({ ...p, yahooFinanceTicker: e.target.value })); setCheck(null); }}
                placeholder="PAMPA.SN"
                style={{ width: 150, padding: "5px 8px", fontSize: 12, ...NUMF, borderRadius: 6, border: `1px solid ${check ? (check.ok ? POS : NEG) : BORDER}`, background: "#fff", color: TEXT1, outline: "none" }} />
              <button onClick={probar} disabled={!f.yahooFinanceTicker.trim() || checking}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, width: 54, justifyContent: "center", padding: "5px 0", fontSize: 11, fontWeight: 700, borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", color: f.yahooFinanceTicker.trim() ? INK : TEXT3, cursor: f.yahooFinanceTicker.trim() && !checking ? "pointer" : "default" }}>
                <Zap size={11} /> {checking ? "…" : "Probar"}
              </button>
            </div>
            {check && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 4, padding: "5px 8px", borderRadius: 6, background: check.ok ? "rgba(0,30,175,0.06)" : "rgba(248,72,94,0.08)", border: `1px solid ${check.ok ? POS : NEG}33`, fontSize: 10.5, color: TEXT2, lineHeight: 1.45 }}>
                {check.ok ? <Check size={12} color={POS} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={12} color={NEG} style={{ flexShrink: 0, marginTop: 1 }} />}
                <span>
                  {check.ok ? (
                    <>
                      <strong style={{ color: TEXT1 }}>{check.name ?? check.effective}</strong>
                      {check.exchange ? ` · ${check.exchange}` : ""}
                      {check.price != null ? ` · ${check.price} ${check.currency ?? ""}` : ""}
                      <span style={{ ...NUMF, color: TEXT3 }}> · {check.points} cierres en 1 año</span>
                      {check.error && <div style={{ color: WARN, marginTop: 2 }}>{check.error}</div>}
                    </>
                  ) : (check.error ?? "Yahoo no devuelve datos para ese símbolo.")}
                </span>
              </div>
            )}
          </div>

          {field("isin", "ISIN", "CLP8716G1059")}
          {field("industriaChile", "Industria (Chile)")}
          {field("industriaGics", "Industria (GICS)")}
          {field("moneda", "Moneda", "CLP", false, "moneda de reporte de los fundamentales")}

          {/* ── Clonar historial (opcional) ────────────────────────────────── */}
          {nuevo && (
            <div style={{ marginTop: 10, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: TEXT1 }}>Clonar historial desde</span>
                <select value={clonarDe} onChange={(e) => setClonarDe(e.target.value)}
                  style={{ width: 210, padding: "5px 7px", fontSize: 12, borderRadius: 6, border: `1px solid ${clonarDe ? INK : BORDER}`, background: "#fff", color: TEXT1, outline: "none" }}>
                  <option value="">— sin historial —</option>
                  {fuentes.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ fontSize: 10.5, color: TEXT2, lineHeight: 1.5, marginTop: 6 }}>
                Copia todas las filas de <em>stock_selection_v1</em> de esa compañía bajo el nombre nuevo, así la
                empresa arranca con su serie de fundamentales y múltiplos en vez de nacer vacía. No copia
                proyecciones ni precios: los precios y retornos salen del ticker, así que vienen solos.
              </div>
              {clonarDe && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 6, padding: "6px 8px", borderRadius: 6, background: "rgba(255,107,6,0.08)", border: `1px solid ${WARN}44`, fontSize: 10.5, color: TEXT1, lineHeight: 1.45 }}>
                  <AlertTriangle size={12} color={WARN} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Las filas clonadas quedan marcadas y <strong>el cargador no las va a pisar</strong>. Cuando el
                    script empiece a mandar datos reales de <strong>{nombre || "la empresa nueva"}</strong>, borralas
                    desde esta misma pestaña con “Borrar clonadas”.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Datos iniciales (opcional) ─────────────────────────────────── */}
          <div style={{ marginTop: 10, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
            <button onClick={() => setOpenData((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 10px", background: SURFACE, border: "none", cursor: "pointer", textAlign: "left" }}>
              {openData ? <ChevronDown size={12} color={TEXT2} /> : <ChevronRight size={12} color={TEXT2} />}
              <span style={{ fontSize: 12, fontWeight: 700, color: TEXT1 }}>Datos iniciales</span>
              <span style={{ fontSize: 10.5, color: TEXT3 }}>
                opcional · {periodo ? periodo.label : "sin trimestre activo"}
              </span>
              {numericos().length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 700, color: INK, background: "rgba(32,68,220,0.10)", borderRadius: 4, padding: "1px 6px" }}>
                  {numericos().length} cargados
                </span>
              )}
            </button>
            {openData && (
              <div style={{ padding: "9px 10px 11px" }}>
                <div style={{ fontSize: 10.5, color: TEXT2, lineHeight: 1.5, marginBottom: 8 }}>
                  Todo en <strong>millones</strong> y en la moneda de reporte, igual que la fuente.
                  Lo que dejes <strong>vacío</strong> lo llena el script cuando cargue la empresa.
                  Lo que escribas se guarda como edición manual del trimestre {periodo?.label ?? "activo"} y
                  <strong> sigue ganando sobre el dato cargado</strong> hasta que lo borres desde el panel de edición de la tabla.
                </div>
                {!periodo && (
                  <div style={{ fontSize: 10.5, color: WARN, marginBottom: 8 }}>
                    No hay trimestre activo (la tabla todavía no cargó): abrí Stock Selection y volvé, o creá la empresa sin datos.
                  </div>
                )}
                {grupos.map((g) => (
                  <div key={g} style={{ marginBottom: 7 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: TEXT3, marginBottom: 3 }}>{g}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "4px 10px" }}>
                      {OVERRIDE_FIELDS.filter((o) => o.group === g && o.scope !== "dual").map((o) => (
                        <div key={o.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ flex: 1, fontSize: 11, color: TEXT2 }}>{o.label}</span>
                          <input value={vals[o.key] ?? ""} inputMode="decimal"
                            onChange={(e) => setVals((p) => ({ ...p, [o.key]: e.target.value }))}
                            placeholder="—" disabled={!periodo}
                            style={{ width: 86, padding: "4px 7px", fontSize: 11, ...NUMF, textAlign: "right", borderRadius: 5, border: `1px solid ${BORDER}`, background: periodo ? "#fff" : SURFACE, color: TEXT1, outline: "none" }} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ fontSize: 10.5, color: TEXT3, marginTop: 9, lineHeight: 1.5 }}>
            {nuevo
              ? "Con sólo el nombre y el ticker la empresa queda homologada y lista: aparece en la tabla en cuanto el cargador la traiga, o antes si le cargás datos iniciales."
              : "La compañía ya tiene fundamentales cargados: apenas guardes la homologación aparece en la tabla con sus datos reales."}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "10px 16px", borderTop: `1px solid ${BORDER}`, background: SURFACE }}>
          {error && <span style={{ fontSize: 11.5, color: NEG, fontWeight: 600, marginRight: "auto", maxWidth: 300, lineHeight: 1.4 }}>{error}</span>}
          <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT2, cursor: "pointer" }}>Cancelar</button>
          <button onClick={save} disabled={!listo}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: "none", cursor: listo ? "pointer" : "default", color: "#fff", background: listo ? INK : "rgba(13,13,56,0.45)" }}>
            <Save size={13} />
            {saving === "empresa" ? "Creando…" : saving === "clon" ? "Clonando historial…" : saving === "datos" ? "Guardando datos…" : nuevo ? "Crear empresa" : "Crear fila"}
          </button>
        </div>
      </div>
    </div>
  );
}
