"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shield, Search, Save, RotateCcw, Activity, Link2, ChevronDown, ChevronRight, Zap, AlertTriangle, Check, RefreshCw, Rows3, Trash2, Wallet, ListOrdered, Copy } from "lucide-react";
import { PATRIA, FONT_SECONDARY, TEXT } from "@/lib/patriaTheme";
import type { EmpresaAdminRow } from "@/app/api/admin/empresas/route";
import type { VerifyResult } from "@/app/api/admin/empresas/verify/route";
import type { ChangeLogRow } from "@/app/api/admin/changes/route";
import SsV1FilasTab, { type PeriodoActivo } from "./SsV1FilasTab";
import SsV1CarterasTab from "./SsV1CarterasTab";
import SsV1OrdenTab from "./SsV1OrdenTab";

// ── Panel de administración de Stock Selection ──────────────────────────────────
// Sección sólo-admin que va arriba de la tabla. Cuatro pestañas:
//   · Homologación — editar los tickers de empresas_industrias_v2, que es la tabla que
//     decide qué empresas entran a la vista y con qué símbolo se les pide precio a Yahoo.
//     Todo símbolo se puede PROBAR contra Yahoo antes de guardarlo.
//   · Filas — qué compañías se ven en la tabla y por qué las que no se ven no se ven.
//     Ocultar/mostrar, y crear la homologación que le falta a las que se caen en silencio.
//   · Carteras — carga del Excel mensual de posiciones de los fondos, con preview previo:
//     el cruce es por ticker, así que un ticker mal escrito no falla ruidosamente y hay
//     que poder verlo ANTES de escribir.
//   · Bitácora — todo cambio hecho desde la web (tickers y overrides de valores), con
//     valor anterior y posterior, quién y cuándo.
// La API ya exige rol admin; el gate del cliente es sólo para no mostrar la UI.

// Tokens — Manual de Identidad PATRIA
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

const fmtNum = (v: number | null): string =>
  v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

const fmtWhen = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Nombres legibles para la bitácora (la tabla guarda las claves crudas).
const ENTITY_LABEL: Record<string, string> = {
  empresas_industrias_v2: "Homologación",
  stock_selection_override: "Valor (override)",
  index_membership: "Índices",
};
const FIELD_LABEL: Record<string, string> = {
  yahooFinanceTicker: "Ticker Yahoo",
  tickerBloomberg: "Ticker Bloomberg",
};

type Tab = "filas" | "homologacion" | "orden" | "carteras" | "bitacora";
interface Draft { yahooFinanceTicker: string; tickerBloomberg: string }

export default function SsV1AdminPanel({ onSourceChanged, periodo }: { onSourceChanged: () => void; periodo: PeriodoActivo | null }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("filas");
  return (
    <div style={{ border: `1px solid ${open ? "rgba(13,13,56,0.22)" : BORDER}`, borderRadius: 8, marginBottom: 12, background: "#fff", overflow: "hidden" }}>
      {/* Barra: sólo esto se ve con el panel cerrado */}
      <div onClick={() => setOpen((o) => !o)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); } }}
        style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", background: NAVY, color: "#fff", cursor: "pointer", userSelect: "none" }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Shield size={14} />
        <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.02em" }}>Administración</span>
        <span style={{ fontSize: 10.5, opacity: 0.7 }}>filas visibles · tickers · carteras · bitácora de cambios</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", background: "rgba(255,255,255,0.14)", borderRadius: 3, padding: "2px 6px" }}>
          sólo admin
        </span>
      </div>

      {open && (
        <>
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${BORDER}`, background: SURFACE }}>
            <TabBtn active={tab === "filas"} onClick={() => setTab("filas")} icon={<Rows3 size={13} />} label="Filas del Stock Selection" />
            <TabBtn active={tab === "homologacion"} onClick={() => setTab("homologacion")} icon={<Link2 size={13} />} label="Homologación / Tickers" />
            <TabBtn active={tab === "orden"} onClick={() => setTab("orden")} icon={<ListOrdered size={13} />} label="Orden y secciones" />
            <TabBtn active={tab === "carteras"} onClick={() => setTab("carteras")} icon={<Wallet size={13} />} label="Carteras" />
            <TabBtn active={tab === "bitacora"} onClick={() => setTab("bitacora")} icon={<Activity size={13} />} label="Registro de cambios" />
          </div>
          {tab === "filas" ? <SsV1FilasTab onSourceChanged={onSourceChanged} periodo={periodo} />
            : tab === "homologacion" ? <HomologacionTab onSourceChanged={onSourceChanged} />
            : tab === "orden" ? <SsV1OrdenTab onSourceChanged={onSourceChanged} />
            : tab === "carteras" ? <SsV1CarterasTab onSourceChanged={onSourceChanged} />
            : <BitacoraTab onSourceChanged={onSourceChanged} />}
        </>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 12, fontWeight: 700, border: "none", borderBottom: `2px solid ${active ? INK : "transparent"}`, background: active ? "#fff" : "transparent", color: active ? INK : TEXT2, cursor: "pointer" }}>
      {icon} {label}
    </button>
  );
}

// ── Pestaña 1 — Homologación / tickers ──────────────────────────────────────────
function HomologacionTab({ onSourceChanged }: { onSourceChanged: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<EmpresaAdminRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlySs, setOnlySs] = useState(false);

  const [cloning, setCloning] = useState<EmpresaAdminRow | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [checks, setChecks] = useState<Record<number, VerifyResult>>({});
  const [busy, setBusy] = useState<Record<number, "verify" | "save">>({});
  const [rowMsg, setRowMsg] = useState<Record<number, { text: string; ok: boolean }>>({});

  const reqId = useRef(0);
  const load = useCallback((term: string) => {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    fetch(`/api/admin/empresas?q=${encodeURIComponent(term)}&limit=80`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Error al cargar"); return d; })
      .then((d: { rows: EmpresaAdminRow[]; truncated: boolean }) => {
        if (id !== reqId.current) return; // llegó una respuesta vieja
        setRows(d.rows); setTruncated(d.truncated); setLoading(false);
      })
      .catch((e: Error) => { if (id === reqId.current) { setError(e.message); setLoading(false); } });
  }, []);

  // Búsqueda con debounce: la tabla tiene ~680 filas y se teclea rápido.
  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  const dropKey = <T,>(id: number) => (p: Record<number, T>): Record<number, T> => { const n = { ...p }; delete n[id]; return n; };

  const draftOf = (r: EmpresaAdminRow): Draft =>
    drafts[r.id] ?? { yahooFinanceTicker: r.yahooFinanceTicker ?? "", tickerBloomberg: r.tickerBloomberg };
  // Al tipear se descartan el mensaje y la verificación: un ✓ viejo pegado a un símbolo
  // que ya cambiaste es peor que no mostrar nada — invita a guardar sin haber probado.
  const setDraft = (id: number, patch: Partial<Draft>, base: Draft) => {
    setDrafts((p) => ({ ...p, [id]: { ...base, ...patch } }));
    setRowMsg(dropKey<{ text: string; ok: boolean }>(id));
    if (patch.yahooFinanceTicker !== undefined) setChecks(dropKey<VerifyResult>(id));
  };
  const dirtyOf = (r: EmpresaAdminRow): boolean => {
    const d = draftOf(r);
    return d.yahooFinanceTicker.trim() !== (r.yahooFinanceTicker ?? "").trim() || d.tickerBloomberg.trim() !== r.tickerBloomberg.trim();
  };

  const verify = (r: EmpresaAdminRow) => {
    const t = draftOf(r).yahooFinanceTicker.trim();
    if (!t) { setRowMsg((p) => ({ ...p, [r.id]: { text: "Sin ticker Yahoo que probar", ok: false } })); return; }
    setBusy((p) => ({ ...p, [r.id]: "verify" })); setRowMsg(dropKey<{ text: string; ok: boolean }>(r.id));
    fetch(`/api/admin/empresas/verify?ticker=${encodeURIComponent(t)}`)
      .then(async (res) => { const d = await res.json(); if (!res.ok) throw new Error(d.error || "Error al verificar"); return d as VerifyResult; })
      .then((d) => { setChecks((p) => ({ ...p, [r.id]: d })); })
      .catch((e: Error) => setRowMsg((p) => ({ ...p, [r.id]: { text: e.message, ok: false } })))
      .finally(() => setBusy(dropKey<"verify" | "save">(r.id)));
  };

  const save = (r: EmpresaAdminRow) => {
    const d = draftOf(r);
    const changes: Record<string, string | null> = {};
    if (d.yahooFinanceTicker.trim() !== (r.yahooFinanceTicker ?? "").trim()) changes.yahooFinanceTicker = d.yahooFinanceTicker.trim() || null;
    if (d.tickerBloomberg.trim() !== r.tickerBloomberg.trim()) changes.tickerBloomberg = d.tickerBloomberg.trim();
    if (!Object.keys(changes).length) return;

    setBusy((p) => ({ ...p, [r.id]: "save" }));
    fetch("/api/admin/empresas", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, changes }),
    })
      .then(async (res) => { const j = await res.json(); if (!res.ok) throw new Error(j.error || "Error al guardar"); return j as { row: EmpresaAdminRow } })
      .then((j) => {
        // Fila actualizada en su lugar: no se recarga la lista para no perder la búsqueda.
        setRows((prev) => prev?.map((x) => (x.id === r.id ? { ...x, ...j.row } : x)) ?? prev);
        setDrafts(dropKey<Draft>(r.id));
        setRowMsg((p) => ({ ...p, [r.id]: { text: "Guardado", ok: true } }));
        onSourceChanged(); // recarga Stock Selection con el ticker nuevo
      })
      .catch((e: Error) => setRowMsg((p) => ({ ...p, [r.id]: { text: e.message, ok: false } })))
      .finally(() => setBusy(dropKey<"verify" | "save">(r.id)));
  };

  // Borrado destructivo: se confirma con el nombre a la vista y queda en la bitacora con
  // todos los valores, que es lo unico que permite recrear la fila despues.
  const remove = (r: EmpresaAdminRow) => {
    if (!window.confirm(`Borrar la fila de homologacion de "${r.nombreLatam}" (${r.tickerBloomberg})?

Si esta compania esta en Stock Selection va a desaparecer de la vista.
Para solo sacarla de la tabla, usa Ocultar en la pestana Filas.`)) return;
    setBusy((p) => ({ ...p, [r.id]: "save" }));
    fetch(`/api/admin/empresas?id=${r.id}`, { method: "DELETE" })
      .then(async (res) => { const j = await res.json(); if (!res.ok) throw new Error(j.error || "Error al borrar"); })
      .then(() => {
        setRows((prev) => prev?.filter((x) => x.id !== r.id) ?? prev);
        onSourceChanged();
      })
      .catch((e: Error) => setRowMsg((p) => ({ ...p, [r.id]: { text: e.message, ok: false } })))
      .finally(() => setBusy(dropKey<"verify" | "save">(r.id)));
  };

  const shown = useMemo(() => (onlySs ? (rows ?? []).filter((r) => r.inStockSelection) : rows ?? []), [rows, onlySs]);
  const patched = useMemo(() => (rows ?? []).filter((r) => r.codePatch).length, [rows]);

  const th: React.CSSProperties = { padding: "6px 8px", textAlign: "left", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fff", background: NAVY, whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 2 };
  const td: React.CSSProperties = { padding: "5px 8px", borderBottom: `1px solid ${BORDER}`, fontSize: 11, color: TEXT1, verticalAlign: "middle" };
  const inp = (dirty: boolean): React.CSSProperties => ({
    width: "100%", minWidth: 118, padding: "4px 7px", fontSize: 11.5, ...NUMF, borderRadius: 5,
    border: `1px solid ${dirty ? WARN : BORDER}`, background: dirty ? "rgba(255,107,6,0.08)" : "#fff", color: TEXT1, outline: "none",
  });

  return (
    <div style={{ padding: "10px 12px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "1 1 220px", minWidth: 180, padding: "6px 10px", borderRadius: 6, background: SURFACE, border: `1px solid ${BORDER}` }}>
          <Search size={13} color={TEXT3} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, ISIN o ticker…"
            style={{ border: "none", outline: "none", fontSize: 12.5, color: TEXT1, background: "transparent", width: "100%" }} />
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: TEXT2, cursor: "pointer" }}>
          <input type="checkbox" checked={onlySs} onChange={(e) => setOnlySs(e.target.checked)} />
          Sólo las que están en Stock Selection
        </label>
        <div style={{ flex: 1 }} />
        {patched > 0 && (
          <span title="Filas cuyo ticker está siendo corregido por el parche en código (lib/yahooTickerFixes)"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: WARN, background: "rgba(255,107,6,0.12)", border: `1px solid ${WARN}`, borderRadius: 4, padding: "2px 7px" }}>
            <Zap size={11} /> {patched} con parche en código
          </span>
        )}
        <span style={{ fontSize: 11, color: TEXT3, ...NUMF }}>{shown.length} filas{truncated ? " (recortado)" : ""}</span>
        <button onClick={() => load(q.trim())} title="Recargar" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", color: NAVY, cursor: "pointer" }}>
          <RefreshCw size={13} style={loading ? { animation: "spin 0.8s linear infinite" } : undefined} />
        </button>
      </div>

      {error && <div style={{ fontSize: 12, color: NEG, fontWeight: 600, marginBottom: 8 }}>{error}</div>}

      <div style={{ overflow: "auto", maxHeight: 380, border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>Empresa</th>
              <th style={th}>Industria</th>
              <th style={th}>ISIN</th>
              <th style={{ ...th, width: 170 }}>Ticker Bloomberg</th>
              <th style={{ ...th, width: 170 }}>Ticker Yahoo</th>
              <th style={{ ...th, width: 230 }}>Verificación</th>
              <th style={{ ...th, width: 96, textAlign: "right" }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const d = draftOf(r), dirty = dirtyOf(r), b = busy[r.id], msg = rowMsg[r.id], chk = checks[r.id];
              const yDirty = d.yahooFinanceTicker.trim() !== (r.yahooFinanceTicker ?? "").trim();
              const bDirty = d.tickerBloomberg.trim() !== r.tickerBloomberg.trim();
              return (
                <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : ZEBRA }}>
                  <td style={{ ...td, maxWidth: 220 }}>
                    <div style={{ fontWeight: 600, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
                      {r.nombreLatam}
                      {r.inStockSelection && (
                        <span title="Esta fila alimenta la tabla de Stock Selection"
                          style={{ fontSize: 8.5, fontWeight: 700, color: INK, background: "rgba(32,68,220,0.10)", borderRadius: 3, padding: "1px 4px", letterSpacing: "0.04em" }}>SS</span>
                      )}
                    </div>
                    <div style={{ fontSize: 9.5, color: TEXT3, whiteSpace: "nowrap" }}>{r.nombreChile}</div>
                    {/* Homologada pero sin datos: no aparece en Stock Selection porque la vista
                        se arma desde stock_selection_v1. Clonar el historial de otra compañía es
                        la forma de arrancarla sin esperar al cargador. */}
                    {!r.inStockSelection && (
                      <button onClick={() => setCloning(r)}
                        title="Esta empresa está homologada pero no tiene datos, así que todavía no se ve en la tabla. Cloná el historial de otra compañía para que aparezca."
                        style={{ marginTop: 3, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 700, color: INK, background: "transparent", border: `1px solid ${INK}66`, borderRadius: 4, padding: "1px 6px", cursor: "pointer" }}>
                        <Copy size={9} /> Clonar historial
                      </button>
                    )}
                  </td>
                  <td style={{ ...td, fontSize: 10, color: TEXT2, maxWidth: 150 }}>{r.industriaChile || "—"}</td>
                  <td style={{ ...td, ...NUMF, fontSize: 10, color: TEXT2, whiteSpace: "nowrap" }}>{r.isin || "—"}</td>
                  <td style={td}>
                    <input value={d.tickerBloomberg} onChange={(e) => setDraft(r.id, { tickerBloomberg: e.target.value }, d)} style={inp(bDirty)} />
                  </td>
                  <td style={td}>
                    <input value={d.yahooFinanceTicker} onChange={(e) => setDraft(r.id, { yahooFinanceTicker: e.target.value }, d)} placeholder="— sin ticker —" style={inp(yDirty)} />
                    {r.codePatch && (
                      <button onClick={() => setDraft(r.id, { yahooFinanceTicker: r.codePatch as string }, d)}
                        title={`El código está reemplazando este símbolo por ${r.codePatch} en cada consulta. Guardá el corregido en la base para que el parche deje de hacer falta.`}
                        style={{ marginTop: 3, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 700, color: WARN, background: "transparent", border: `1px solid ${WARN}`, borderRadius: 4, padding: "1px 5px", cursor: "pointer" }}>
                        <Zap size={9} /> parche → {r.codePatch}
                      </button>
                    )}
                  </td>
                  <td style={{ ...td, fontSize: 10 }}>
                    {b === "verify" ? (
                      <span style={{ color: TEXT2 }}>Consultando Yahoo…</span>
                    ) : chk ? (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                        {chk.ok ? <Check size={12} color={POS} style={{ marginTop: 1, flexShrink: 0 }} /> : <AlertTriangle size={12} color={NEG} style={{ marginTop: 1, flexShrink: 0 }} />}
                        <div>
                          <div style={{ color: chk.ok ? TEXT1 : NEG, fontWeight: 600 }}>
                            {chk.ok ? `${chk.name ?? chk.effective}` : "No resuelve"}
                          </div>
                          <div style={{ color: TEXT2, ...NUMF }}>
                            {chk.ok
                              ? `${fmtNum(chk.price ?? chk.lastClose)} ${chk.currency ?? ""} · ${chk.points} cierres${chk.lastDate ? ` · al ${chk.lastDate}` : ""}`
                              : chk.error}
                          </div>
                          {chk.ok && chk.error && <div style={{ color: WARN, fontWeight: 600 }}>{chk.error}</div>}
                        </div>
                      </div>
                    ) : msg ? (
                      <span style={{ color: msg.ok ? POS : NEG, fontWeight: 600 }}>{msg.text}</span>
                    ) : (
                      <span style={{ color: TEXT3 }}>sin probar</span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button onClick={() => verify(r)} disabled={!!b} title="Probar el ticker Yahoo contra la API antes de guardar"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 25, height: 25, borderRadius: 5, border: `1px solid ${BORDER}`, background: "#fff", color: INK, cursor: b ? "default" : "pointer", marginRight: 4 }}>
                      <Zap size={12} />
                    </button>
                    <button onClick={() => { setDrafts(dropKey<Draft>(r.id)); setChecks(dropKey<VerifyResult>(r.id)); }} disabled={!dirty}
                      title="Descartar la edición local (no toca la base)"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 25, height: 25, borderRadius: 5, border: `1px solid ${BORDER}`, background: "#fff", color: dirty ? WARN : TEXT3, cursor: dirty ? "pointer" : "default", marginRight: 4 }}>
                      <RotateCcw size={12} />
                    </button>
                    <button onClick={() => save(r)} disabled={!dirty || !!b} title="Guardar en empresas_industrias_v2"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 25, height: 25, borderRadius: 5, border: "none", background: dirty ? INK : "rgba(13,13,56,0.18)", color: "#fff", cursor: dirty && !b ? "pointer" : "default" }}>
                      <Save size={12} />
                    </button>
                    <button onClick={() => remove(r)} disabled={!!b}
                      title="Borrar esta fila de homologacion. Para sacar una compania de la VISTA usa Ocultar en la pestana Filas, que no pierde datos."
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 25, height: 25, borderRadius: 5, border: `1px solid ${BORDER}`, background: "#fff", color: NEG, cursor: b ? "default" : "pointer", marginLeft: 4 }}>
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && shown.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 26, textAlign: "center", color: TEXT3, fontSize: 12.5 }}>
                Sin filas para {q ? `“${q}”` : "los filtros actuales"}.
              </td></tr>
            )}
            {loading && rows === null && (
              <tr><td colSpan={7} style={{ padding: 26, textAlign: "center", color: TEXT3, fontSize: 12.5 }}>Cargando…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 10.5, color: TEXT3, marginTop: 8, lineHeight: 1.55 }}>
        Se edita <strong style={{ color: TEXT2 }}>empresas_industrias_v2</strong> directamente y cada cambio queda en la bitácora (con el valor anterior, para poder revertirlo).
        El <strong style={{ color: TEXT2 }}>ticker Yahoo</strong> es el que trae precio y retornos; el <strong style={{ color: TEXT2 }}>Bloomberg</strong> es la llave que cruza la recomendación del analista.
        Probá con <Zap size={10} style={{ display: "inline", verticalAlign: "-1px" }} /> antes de guardar: un símbolo deslistado deja la fila sin precio y no avisa.
        Ojo — el cargador que puebla esta tabla puede volver a pisar el valor; esta corrección es sobre la base, no sobre el cargador.
      </div>

      {cloning && (
        <ClonarHistorial
          destino={cloning}
          onClose={() => setCloning(null)}
          onDone={() => { setCloning(null); load(q.trim()); onSourceChanged(); }}
        />
      )}
    </div>
  );
}

// ── Clonar historial hacia una empresa ya homologada ────────────────────────────
// El alta de empresa ofrece clonar al crearla, pero una empresa creada antes (o creada sin
// clonar) quedaba sin ninguna forma de conseguir historia: no aparece en la pestaña Filas
// justamente porque no tiene filas en stock_selection_v1. Este diálogo cierra ese circuito.
function ClonarHistorial({ destino, onClose, onDone }: {
  destino: EmpresaAdminRow; onClose: () => void; onDone: () => void;
}) {
  const [fuentes, setFuentes] = useState<string[] | null>(null);
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/ss-rows")
      .then((r) => r.json())
      .then((d: { rows?: { company: string; quarters: number }[] }) =>
        setFuentes((d.rows ?? []).filter((r) => r.quarters > 0).map((r) => r.company).sort((a, b) => a.localeCompare(b, "es"))))
      .catch(() => setFuentes([]));
  }, []);

  const clonar = () => {
    if (!from || busy) return;
    setBusy(true); setError(null);
    fetch("/api/admin/ss-clone", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: destino.nombreLatam }),
    })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "No se pudo clonar"); return d as { copiadas: number; omitidas: number; desde: string | null; hasta: string | null }; })
      .then((d) => {
        setHecho(`${d.copiadas} filas copiadas${d.desde ? ` · ${d.desde} → ${d.hasta}` : ""}${d.omitidas ? ` · ${d.omitidas} omitidas (ya existían)` : ""}.`);
        setTimeout(onDone, 1200);
      })
      .catch((e: Error) => { setError(e.message); setBusy(false); });
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(13,13,56,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "min(470px, 96vw)", boxShadow: "0 12px 48px rgba(13,13,56,0.35)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "13px 16px", background: NAVY, color: "#fff" }}>
          <Copy size={15} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>Clonar historial → {destino.nombreLatam}</span>
        </div>
        <div style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 11.5, color: TEXT2, lineHeight: 1.5, marginBottom: 10 }}>
            Copia todas las filas de <em>stock_selection_v1</em> de la compañía que elijas bajo el nombre{" "}
            <strong style={{ color: TEXT1 }}>{destino.nombreLatam}</strong>, así arranca con su serie de fundamentales
            y múltiplos en vez de estar vacía. No pisa nada que ya exista en el destino.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: TEXT1 }}>Clonar desde</span>
            <select value={from} onChange={(e) => setFrom(e.target.value)} disabled={!fuentes || busy}
              style={{ width: 230, padding: "6px 8px", fontSize: 12, borderRadius: 6, border: `1px solid ${from ? INK : BORDER}`, background: "#fff", color: TEXT1, outline: "none" }}>
              <option value="">{fuentes ? "— elegí una compañía —" : "cargando…"}</option>
              {(fuentes ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {from && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 10, padding: "7px 9px", borderRadius: 6, background: "rgba(255,107,6,0.08)", border: `1px solid ${WARN}44`, fontSize: 10.5, color: TEXT1, lineHeight: 1.45 }}>
              <AlertTriangle size={12} color={WARN} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Las filas quedan marcadas como clonadas y <strong>el cargador no las va a pisar</strong>. Cuando el
                script empiece a mandar datos reales de {destino.nombreLatam}, borralas con “Borrar clonadas” en la
                pestaña Filas.
              </span>
            </div>
          )}
          {error && <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 11.5, color: NEG, fontWeight: 600 }}><AlertTriangle size={13} /> {error}</div>}
          {hecho && <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 11.5, color: POS, fontWeight: 600 }}><Check size={13} /> {hecho}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "10px 16px", borderTop: `1px solid ${BORDER}`, background: SURFACE }}>
          <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT2, cursor: "pointer" }}>Cerrar</button>
          <button onClick={clonar} disabled={!from || busy || !!hecho}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: "none", color: "#fff", background: from && !busy && !hecho ? INK : "rgba(13,13,56,0.35)", cursor: from && !busy && !hecho ? "pointer" : "default" }}>
            {busy ? <RefreshCw size={13} style={{ animation: "spin 0.8s linear infinite" }} /> : <Copy size={13} />}
            {busy ? "Clonando…" : "Clonar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pestaña 2 — Bitácora ────────────────────────────────────────────────────────
function BitacoraTab({ onSourceChanged }: { onSourceChanged: () => void }) {
  const [rows, setRows] = useState<ChangeLogRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [reverting, setReverting] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetch(`/api/admin/changes?limit=200${filter ? `&entity=${encodeURIComponent(filter)}` : ""}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Error al cargar"); return d; })
      .then((d: { rows: ChangeLogRow[]; unavailable?: string }) => { setRows(d.rows); setUnavailable(d.unavailable ?? null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filter]);
  useEffect(load, [load]);

  // Revertir: se vuelve a escribir el valor anterior por la misma vía que lo cambió, así
  // queda una línea nueva en la bitácora (nunca se borra historial).
  const revert = (r: ChangeLogRow) => {
    if (r.entity !== "empresas_industrias_v2") return;
    const id = parseInt(r.entityKey, 10);
    if (!Number.isFinite(id)) return;
    if (!window.confirm(`Revertir ${FIELD_LABEL[r.field] ?? r.field} de ${r.label ?? "la fila"} a “${r.oldValue ?? "(vacío)"}”?`)) return;
    setReverting(r.id);
    fetch("/api/admin/empresas", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, changes: { [r.field]: r.oldValue } }),
    })
      .then(async (res) => { const j = await res.json(); if (!res.ok) throw new Error(j.error || "No se pudo revertir"); })
      .then(() => { load(); onSourceChanged(); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setReverting(null));
  };

  const th: React.CSSProperties = { padding: "6px 8px", textAlign: "left", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fff", background: NAVY, whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 2 };
  const td: React.CSSProperties = { padding: "5px 8px", borderBottom: `1px solid ${BORDER}`, fontSize: 11, color: TEXT1, verticalAlign: "top" };

  return (
    <div style={{ padding: "10px 12px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 6, background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT1, fontSize: 12, cursor: "pointer", outline: "none" }}>
          <option value="">Todos los cambios</option>
          <option value="empresas_industrias_v2">Homologación / tickers</option>
          <option value="stock_selection_override">Valores (overrides)</option>
        </select>
        <div style={{ flex: 1 }} />
        {error && <span style={{ fontSize: 12, color: NEG, fontWeight: 600 }}>{error}</span>}
        <span style={{ fontSize: 11, color: TEXT3, ...NUMF }}>{rows?.length ?? 0} registros</span>
        <button onClick={load} title="Recargar" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", color: NAVY, cursor: "pointer" }}>
          <RefreshCw size={13} style={loading ? { animation: "spin 0.8s linear infinite" } : undefined} />
        </button>
      </div>

      {unavailable && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: WARN, background: "rgba(255,107,6,0.10)", border: `1px solid ${WARN}`, borderRadius: 6, padding: "7px 10px", marginBottom: 8 }}>
          <AlertTriangle size={13} /> {unavailable}
        </div>
      )}

      <div style={{ overflow: "auto", maxHeight: 380, border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>Cuándo</th>
              <th style={th}>Quién</th>
              <th style={th}>Qué</th>
              <th style={th}>Registro</th>
              <th style={th}>Campo</th>
              <th style={th}>Antes</th>
              <th style={th}>Después</th>
              <th style={{ ...th, textAlign: "right" }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : ZEBRA }}>
                <td style={{ ...td, ...NUMF, fontSize: 10, color: TEXT2, whiteSpace: "nowrap" }}>{fmtWhen(r.editedAt)}</td>
                <td style={{ ...td, fontSize: 10, color: TEXT2, whiteSpace: "nowrap" }}>{r.editedBy ?? "—"}</td>
                <td style={{ ...td, fontSize: 10, whiteSpace: "nowrap" }}>
                  <span style={{ fontWeight: 700, color: r.entity === "empresas_industrias_v2" ? INK : WARN }}>
                    {ENTITY_LABEL[r.entity] ?? r.entity}
                  </span>
                </td>
                <td style={{ ...td, maxWidth: 190 }}>
                  <div style={{ fontWeight: 600, fontSize: 10.5 }}>{r.label ?? r.entityKey}</div>
                  {r.context && <div style={{ fontSize: 9.5, color: TEXT3, ...NUMF }}>{r.context}</div>}
                </td>
                <td style={{ ...td, fontSize: 10, color: TEXT2, whiteSpace: "nowrap" }}>{FIELD_LABEL[r.field] ?? r.field}</td>
                <td style={{ ...td, ...NUMF, fontSize: 10.5, color: TEXT3, textDecoration: "line-through", whiteSpace: "nowrap" }}>
                  {r.oldValue ?? (r.entity === "stock_selection_override" ? "(base)" : "—")}
                </td>
                <td style={{ ...td, ...NUMF, fontSize: 10.5, fontWeight: 700, color: r.newValue == null ? TEXT3 : TEXT1, whiteSpace: "nowrap" }}>
                  {r.newValue ?? (r.entity === "stock_selection_override" ? "(vuelve al base)" : "—")}
                </td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  {r.entity === "empresas_industrias_v2" ? (
                    <button onClick={() => revert(r)} disabled={reverting === r.id}
                      title={`Volver a “${r.oldValue ?? "(vacío)"}”`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", fontSize: 10, fontWeight: 700, borderRadius: 5, border: `1px solid ${BORDER}`, background: "#fff", color: reverting === r.id ? TEXT3 : NAVY, cursor: reverting === r.id ? "default" : "pointer" }}>
                      <RotateCcw size={10} /> Revertir
                    </button>
                  ) : (
                    <span style={{ fontSize: 9.5, color: TEXT3 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && (rows?.length ?? 0) === 0 && !unavailable && (
              <tr><td colSpan={8} style={{ padding: 26, textAlign: "center", color: TEXT3, fontSize: 12.5 }}>Todavía no hay cambios registrados.</td></tr>
            )}
            {loading && rows === null && (
              <tr><td colSpan={8} style={{ padding: 26, textAlign: "center", color: TEXT3, fontSize: 12.5 }}>Cargando…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 10.5, color: TEXT3, marginTop: 8, lineHeight: 1.55 }}>
        La bitácora es <strong style={{ color: TEXT2 }}>append-only</strong>: revertir escribe una línea nueva, nunca borra la anterior.
        En los overrides de valores, <em>Antes = «(base)»</em> significa que la celda no tenía edición previa y mostraba el dato de la fuente.
      </div>
    </div>
  );
}
