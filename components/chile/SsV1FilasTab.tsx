"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Save, ChevronDown, ChevronRight, RefreshCw, Eye, EyeOff, Plus, X, AlertTriangle } from "lucide-react";
import { PATRIA, FONT_SECONDARY, TEXT } from "@/lib/patriaTheme";
import { OVERRIDE_FIELDS } from "@/lib/ssOverrideFields";
import { norm } from "@/lib/ssHomologacion";
import { normBBG } from "@/lib/bbg";
import type { SsRowStatus, RowStatus } from "@/app/api/admin/ss-rows/route";
import type { EmpresaAdminRow } from "@/app/api/admin/empresas/route";

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
  "sin-homologacion": { label: "Sin homologar", color: NEG, bg: "rgba(248,72,94,0.12)", hint: "No existe en empresas_industrias_v2 → la vista la descarta en silencio. Se crea en Database Tables, con este mismo nombre." },
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
  const [adding, setAdding] = useState(false);
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
        {/* Suma a la vista una empresa que ya existe en la maestra. Crearla es otra cosa:
            eso se hace en Database Tables. */}
        <button onClick={() => setAdding(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: "none", background: INK, color: "#fff", cursor: "pointer" }}>
          <Plus size={12} /> Sumar compañía
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
        {" "}<strong style={{ color: TEXT2 }}>Sumar compañía</strong> trae a la vista una empresa que ya existe en <em>empresas_industrias_v2</em>.
        {" "}Las empresas se crean en <strong style={{ color: TEXT2 }}>Database Tables</strong>; una compañía <em>Sin homologar</em> aparece apenas su nombre exista ahí.
        {" "}Para cambiar el ticker de una fila que ya existe, andá a la pestaña Homologación.
      </div>

      {adding && (
        <SumarCompania
          rows={data?.rows ?? []}
          periodo={periodo}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); load(); onSourceChanged(); }}
        />
      )}
    </div>
  );
}

// ── Sumar una compañía a la vista ───────────────────────────────────────────────
// Sólo trabaja con empresas que YA existen en empresas_industrias_v2: crearlas se hace en
// Database Tables. La vista se arma con stock_selection_v1 más lo sembrado en overrides,
// así que elegir la empresa no alcanza: hay que darle historial clonado o algún dato
// inicial, o de lo contrario no aparecería nada.
//
// Los "datos iniciales" NO se escriben en stock_selection_v1 (esa la repuebla el cargador
// con createMany/skipDuplicates: una fila puesta a mano ahí BLOQUEARÍA el valor real cuando
// llegue). Van a stock_selection_override, que se aplica encima, es reversible y queda en
// la bitácora.
function SumarCompania({ rows, periodo, onClose, onSaved }: {
  rows: SsRowStatus[]; periodo: PeriodoActivo | null; onClose: () => void; onSaved: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<EmpresaAdminRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [empresa, setEmpresa] = useState<EmpresaAdminRow | null>(null);
  const [clonarDe, setClonarDe] = useState("");
  // Datos iniciales: sólo los que el usuario escriba se guardan. Vacío = lo llena el script.
  const [vals, setVals] = useState<Record<string, string>>({});
  const [openData, setOpenData] = useState(false);
  const [saving, setSaving] = useState<null | "clon" | "datos">(null);
  const [error, setError] = useState<string | null>(null);

  // Candidatas a clonar: las que tienen fundamentales cargados de verdad.
  const fuentes = useMemo(() => rows.filter((r) => r.quarters > 0).map((r) => r.company), [rows]);

  // Lo que ya está en la vista, por nombre y por ticker: las duales se muestran como una
  // sola compañía pero cada serie tiene su propia fila en la maestra.
  const enVista = useMemo(() => ({
    nombres: new Set(rows.map((r) => r.key)),
    tickers: new Set(rows.flatMap((r) => r.series.map((s) => normBBG(s.bbg))).filter(Boolean)),
  }), [rows]);
  const yaEnVista = (e: EmpresaAdminRow) =>
    enVista.nombres.has(norm(e.nombreLatam)) || enVista.nombres.has(norm(e.nombreChile)) ||
    enVista.tickers.has(normBBG(e.tickerBloomberg));

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/admin/empresas?q=${encodeURIComponent(term)}&limit=30`)
        .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Error al buscar"); return d.rows as EmpresaAdminRow[]; })
        .then((found) => { if (!cancelled) setResults(found); })
        .catch((e: Error) => { if (!cancelled) setError(e.message); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const numericos = () => Object.entries(vals)
    .map(([field, raw]) => ({ field, value: Number(String(raw).replace(/\s|,/g, "")) }))
    .filter((c) => String(vals[c.field]).trim() !== "" && Number.isFinite(c.value));

  // nombre_chile primero: es el nombre corto que manda el cargador. Si la sembrada quedara
  // con otro, al llegar sus datos reales la compañía saldría repetida.
  const nombre = empresa ? (empresa.nombreChile.trim() || empresa.nombreLatam) : "";
  const listo = !!empresa && (!!clonarDe || numericos().length > 0) && saving == null;

  const save = async () => {
    if (!listo) return;
    setError(null);
    try {
      // Va antes de los datos iniciales para que un override escrito a mano quede pisando
      // a la serie clonada y no al revés.
      if (clonarDe) {
        setSaving("clon");
        const rc = await fetch("/api/admin/ss-clone", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: clonarDe, to: nombre }),
        });
        const dc = await rc.json();
        if (!rc.ok) throw new Error(dc.error || "Falló la clonación");
      }

      // Se guardan contra el trimestre activo de la vista: un override vive por período,
      // igual que cualquier otra edición manual.
      const cells = numericos();
      if (cells.length) {
        if (!periodo) throw new Error("No hay trimestre activo para guardar los datos iniciales.");
        setSaving("datos");
        const r2 = await fetch("/api/chile/stock-selection-v1/overrides", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fiscalYear: periodo.fy, quarter: periodo.q,
            changes: cells.map((c) => ({ company: nombre, field: c.field, value: c.value })),
          }),
        });
        const d2 = await r2.json();
        if (!r2.ok) throw new Error(d2.error || "Fallaron los datos iniciales");
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message); setSaving(null);
    }
  };

  const grupos = [...new Set(OVERRIDE_FIELDS.filter((o) => o.scope !== "dual").map((o) => o.group))];

  return (
    <div onClick={onClose} className="modal-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(13,13,56,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-card" style={{ background: "#fff", borderRadius: 12, width: "min(560px, 96vw)", maxHeight: "92dvh", display: "flex", flexDirection: "column", boxShadow: "0 12px 48px rgba(13,13,56,0.35)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 16px", background: NAVY, color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Plus size={15} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>Sumar compañía a la vista</span>
          </div>
          <button onClick={onClose} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", cursor: "pointer" }}><X size={15} /></button>
        </div>

        <div style={{ overflow: "auto", flex: 1, padding: "10px 16px 14px" }}>
          <div style={{ fontSize: 11, color: TEXT2, marginBottom: 8, lineHeight: 1.5 }}>
            Elegí una empresa de <em>empresas_industrias_v2</em>. Si no está, primero creala en <strong>Database Tables</strong>.
          </div>

          {/* ── Empresa ─────────────────────────────────────────────────────── */}
          {empresa ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(32,68,220,0.06)", border: "1px solid rgba(32,68,220,0.22)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT1 }}>{nombre}</div>
                <div style={{ fontSize: 10.5, color: TEXT2, ...NUMF }}>{empresa.tickerBloomberg}</div>
              </div>
              <button onClick={() => setEmpresa(null)} disabled={saving != null}
                style={{ padding: "4px 9px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT2, cursor: "pointer" }}>
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 9px", borderRadius: 6, background: SURFACE, border: `1px solid ${BORDER}` }}>
                <Search size={12} color={TEXT3} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, ticker o ISIN…" autoFocus
                  style={{ border: "none", outline: "none", fontSize: 12, color: TEXT1, background: "transparent", width: "100%" }} />
              </div>
              {results && (
                <div style={{ marginTop: 6, maxHeight: 220, overflow: "auto", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
                  {results.map((e) => {
                    const dentro = yaEnVista(e);
                    return (
                      <button key={e.id} onClick={() => setEmpresa(e)} disabled={dentro}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 9px", background: "#fff", border: "none", borderBottom: `1px solid ${BORDER}`, textAlign: "left", cursor: dentro ? "default" : "pointer", opacity: dentro ? 0.55 : 1 }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: TEXT1 }}>{e.nombreChile.trim() || e.nombreLatam}</span>
                        <span style={{ fontSize: 10.5, color: TEXT2, whiteSpace: "nowrap", ...NUMF }}>{e.tickerBloomberg}</span>
                        {dentro && <span style={{ fontSize: 9.5, fontWeight: 700, color: TEXT3, whiteSpace: "nowrap" }}>Ya en la vista</span>}
                      </button>
                    );
                  })}
                  {results.length === 0 && !searching && (
                    <div style={{ padding: "12px 10px", fontSize: 11.5, color: TEXT2, lineHeight: 1.5 }}>
                      No está en la maestra. Creala en <strong>Database Tables</strong> y volvé.
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {empresa && (
            <>
              <div style={{ fontSize: 11, color: TEXT2, margin: "10px 0 0", lineHeight: 1.5 }}>
                Para que aparezca necesita datos: <strong>clonar un historial</strong> o <strong>cargar algún dato inicial</strong>.
                Si preferís esperar al cargador, no hace falta sumarla: se muestra sola cuando lleguen sus fundamentales.
              </div>

              {/* ── Clonar historial ───────────────────────────────────────────── */}
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
                  Copia todas las filas de <em>stock_selection_v1</em> de esa compañía bajo el nombre {nombre}. Es para
                  continuidad, por ejemplo tras un cambio de razón social. No copia proyecciones ni precios: los precios y
                  retornos salen del ticker, así que vienen solos.
                </div>
                {clonarDe && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 6, padding: "6px 8px", borderRadius: 6, background: "rgba(255,107,6,0.08)", border: `1px solid ${WARN}44`, fontSize: 10.5, color: TEXT1, lineHeight: 1.45 }}>
                    <AlertTriangle size={12} color={WARN} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      Las filas clonadas quedan marcadas y <strong>el cargador no las va a pisar</strong>. Cuando el
                      script empiece a mandar datos reales de <strong>{nombre}</strong>, borralas desde esta misma
                      pestaña con “Borrar clonadas”.
                    </span>
                  </div>
                )}
              </div>

              {/* ── Datos iniciales ────────────────────────────────────────────── */}
              <div style={{ marginTop: 10, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
                <button onClick={() => setOpenData((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 10px", background: SURFACE, border: "none", cursor: "pointer", textAlign: "left" }}>
                  {openData ? <ChevronDown size={12} color={TEXT2} /> : <ChevronRight size={12} color={TEXT2} />}
                  <span style={{ fontSize: 12, fontWeight: 700, color: TEXT1 }}>Datos iniciales</span>
                  <span style={{ fontSize: 10.5, color: TEXT3 }}>
                    {periodo ? periodo.label : "sin trimestre activo"}
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
                        No hay trimestre activo (la tabla todavía no cargó): abrí Stock Selection y volvé, o usá el clonado.
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
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "10px 16px", borderTop: `1px solid ${BORDER}`, background: SURFACE }}>
          {error && <span style={{ fontSize: 11.5, color: NEG, fontWeight: 600, marginRight: "auto", maxWidth: 300, lineHeight: 1.4 }}>{error}</span>}
          <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT2, cursor: "pointer" }}>Cancelar</button>
          <button onClick={save} disabled={!listo}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: "none", cursor: listo ? "pointer" : "default", color: "#fff", background: listo ? INK : "rgba(13,13,56,0.45)" }}>
            <Save size={13} />
            {saving === "clon" ? "Clonando historial…" : saving === "datos" ? "Guardando datos…" : "Sumar a la vista"}
          </button>
        </div>
      </div>
    </div>
  );
}
