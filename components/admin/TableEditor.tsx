"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, RefreshCw, Plus, Save, X, Trash2, Pencil, KeyRound, ChevronLeft, ChevronRight,
  AlertTriangle, Check, Star, Database, Lock,
} from "lucide-react";
import { PATRIA, TEXT, BORDER, SURFACE, FONT_SECONDARY } from "@/lib/patriaTheme";
import type { TableInfo, TableMeta, Row } from "@/lib/adminTables";

// Editor genérico de tablas de la base (Admin Issues → Database Tables).
// Cualquier tabla de `public` salvo las de autenticación. Las filas se editan de a una:
// clic en una celda abre la fila en modo edición, Guardar escribe sólo las celdas que
// cambiaron. Cada cambio queda en la bitácora (admin_change_log, entity "db:<tabla>").

// Tablas que el equipo toca seguido, en orden de importancia. Van como accesos directos.
const KEY_TABLES: { name: string; note: string }[] = [
  { name: "empresas_industrias_v2", note: "Homologación maestra: nombres, tickers Bloomberg/Yahoo, ISIN, industria, país" },
  { name: "company_isins",          note: "ISIN por compañía" },
  { name: "index_membership",       note: "Pertenencia a índices (IPSA, IGPA…)" },
  { name: "carteras",               note: "Posiciones de los fondos por mes" },
  { name: "model_headers",          note: "Header de los modelos (rec, TP, analista, moneda)" },
  { name: "bank_headers",           note: "Header de los modelos de bancos" },
  { name: "top_picks",              note: "Top Picks por período" },
  { name: "ticker_return_snapshot", note: "Retornos Bloomberg del Stock Selection" },
  { name: "estimates_hidden",       note: "Compañías ocultas en Analyst Estimates" },
  { name: "analyst_links",          note: "Useful Links de Chile y LatAm" },
];

const PAGE = 100;

const NUMF: React.CSSProperties = { fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" };

const isNumeric = (type: string) => /^(integer|bigint|smallint|double|real|numeric)/.test(type);

const btn = (primary = false, color: string = PATRIA.darkBlue): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 7,
  fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
  border: primary ? "none" : `1px solid ${BORDER.base}`,
  background: primary ? PATRIA.kingBlue : "#fff", color: primary ? "#fff" : color,
});

const iconBtn = (color: string, on = true): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 25, height: 25, borderRadius: 5, border: `1px solid ${BORDER.base}`,
  background: "#fff", color: on ? color : TEXT.disabled, cursor: on ? "pointer" : "default",
});

interface Page { meta: TableMeta; rows: Row[]; total: number; offset: number }

export default function TableEditor() {
  const [tables, setTables] = useState<TableInfo[] | null>(null);
  const [table, setTable] = useState("empresas_industrias_v2");
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" } | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Fila en edición: índice en `rows` + draft de valores. Una a la vez.
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<Row>({});
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/tables")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })
      .then((d: { tables: TableInfo[] }) => setTables(d.tables))
      .catch((e: Error) => setError(e.message));
  }, []);

  const reqId = useRef(0);
  const load = useCallback(() => {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    const p = new URLSearchParams({ table, offset: String(offset), limit: String(PAGE) });
    if (q.trim()) p.set("q", q.trim());
    if (sort) { p.set("sort", sort.col); p.set("dir", sort.dir); }
    fetch(`/api/admin/tables?${p}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Error al cargar"); return d; })
      .then((d: Page) => { if (id === reqId.current) setPage(d); })
      .catch((e: Error) => { if (id === reqId.current) { setError(e.message); setPage(null); } })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [table, offset, q, sort]);

  // Búsqueda con debounce; cambiar de tabla/orden/página recarga al tiro.
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  function pickTable(name: string) {
    if (name === table) return;
    setTable(name); setOffset(0); setQ(""); setSort(null);
    setEditIdx(null); setAdding(false); setNotice(null); setPage(null);
  }

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3500);
  }

  const meta = page?.meta ?? null;
  const editable = !!meta?.editable;

  function startEdit(i: number) {
    if (!editable || busy) return;
    setAdding(false);
    setEditIdx(i);
    setDraft({ ...page!.rows[i] });
  }

  const keyOf = (row: Row): Row => Object.fromEntries(meta!.pk.map((k) => [k, row[k]]));

  async function call(method: "PATCH" | "POST" | "DELETE", body: object) {
    const res = await fetch("/api/admin/tables", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table, ...body }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Error");
    return d as { row?: Row };
  }

  async function saveEdit() {
    if (editIdx === null || !page) return;
    const orig = page.rows[editIdx];
    const changes = Object.fromEntries(
      Object.entries(draft).filter(([k, v]) => (v ?? "") !== (orig[k] ?? "")),
    );
    if (Object.keys(changes).length === 0) { setEditIdx(null); return; }
    setBusy(true); setError(null);
    try {
      const d = await call("PATCH", { key: keyOf(orig), changes });
      setPage((p) => p && { ...p, rows: p.rows.map((r, i) => (i === editIdx && d.row ? d.row : r)) });
      setEditIdx(null);
      flash(`Guardado · ${Object.keys(changes).join(", ")}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveNew() {
    setBusy(true); setError(null);
    try {
      await call("POST", { values: draft });
      setAdding(false);
      flash("Fila creada");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: Row) {
    const label = meta!.pk.map((k) => `${k}=${row[k]}`).join(", ");
    if (!window.confirm(`Borrar la fila ${label} de ${table}?\n\nQueda en la bitácora con todos sus valores, pero no hay deshacer automático.`)) return;
    setBusy(true); setError(null);
    try {
      await call("DELETE", { key: keyOf(row) });
      setEditIdx(null);
      flash("Fila borrada");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tableNames = useMemo(() => new Set((tables ?? []).map((t) => t.name)), [tables]);
  const keyTables = KEY_TABLES.filter((k) => !tables || tableNames.has(k.name));
  const activeNote = KEY_TABLES.find((k) => k.name === table)?.note;

  const th: React.CSSProperties = {
    padding: "6px 9px", textAlign: "left", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em",
    color: "#fff", background: PATRIA.darkBlue, whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 2,
    cursor: "pointer", userSelect: "none",
  };
  const td: React.CSSProperties = {
    padding: "4px 9px", borderBottom: `1px solid ${BORDER.subtle}`, fontSize: 11.5, color: TEXT.body,
    verticalAlign: "middle", whiteSpace: "nowrap", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis",
  };
  const cellInput = (dirty: boolean, numeric: boolean): React.CSSProperties => ({
    width: "100%", minWidth: numeric ? 80 : 130, padding: "3px 6px", fontSize: 11.5, borderRadius: 4,
    border: `1px solid ${dirty ? PATRIA.orange : BORDER.base}`, background: dirty ? "rgba(255,107,6,0.08)" : "#fff",
    color: TEXT.body, outline: "none", textAlign: numeric ? "right" : "left", ...(numeric ? NUMF : {}),
  });

  const total = page?.total ?? 0;
  const from = total ? offset + 1 : 0;
  const to = Math.min(offset + PAGE, total);

  return (
    <div>
      {/* ── Selector de tabla ─────────────────────────────────────────────── */}
      <div className="card" style={{ padding: "12px 14px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Database size={14} style={{ color: PATRIA.kingBlue }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: TEXT.body }}>Tabla</span>
          <select value={table} onChange={(e) => pickTable(e.target.value)}
            style={{ padding: "6px 9px", fontSize: 12.5, borderRadius: 7, border: `1px solid ${BORDER.base}`, background: SURFACE.subtle, color: TEXT.body, outline: "none", cursor: "pointer", maxWidth: "100%", ...NUMF }}>
            {!tables && <option value={table}>{table}</option>}
            {tables && (
              <>
                <optgroup label="Tablas clave">
                  {keyTables.map((k) => <option key={k.name} value={k.name}>{k.name}</option>)}
                </optgroup>
                <optgroup label="Todas">
                  {tables.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}{t.rowsEstimate != null ? `  (~${t.rowsEstimate.toLocaleString("en-US")})` : ""}
                    </option>
                  ))}
                </optgroup>
              </>
            )}
          </select>
          {activeNote && <span style={{ fontSize: 11, color: TEXT.label }}>{activeNote}</span>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {keyTables.map((k, i) => {
            const on = k.name === table;
            return (
              <button key={k.name} onClick={() => pickTable(k.name)} title={k.note}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6,
                  fontSize: 11, fontWeight: on ? 700 : 600, cursor: "pointer", ...NUMF,
                  border: `1px solid ${on ? "rgba(32,68,220,0.35)" : BORDER.base}`,
                  background: on ? "rgba(32,68,220,0.10)" : "#fff",
                  color: on ? PATRIA.blue : TEXT.label,
                }}>
                {i === 0 && <Star size={10} />} {k.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "1 1 240px", minWidth: 180, maxWidth: 420, padding: "6px 10px", borderRadius: 7, background: "#fff", border: `1px solid ${BORDER.base}` }}>
          <Search size={13} color={TEXT.muted} />
          <input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="Buscar en cualquier columna…"
            style={{ border: "none", outline: "none", fontSize: 12.5, color: TEXT.body, background: "transparent", width: "100%" }} />
          {q && <button onClick={() => setQ("")} style={{ display: "flex", border: "none", background: "transparent", color: TEXT.muted, cursor: "pointer", padding: 0 }}><X size={13} /></button>}
        </div>
        <span style={{ fontSize: 11.5, color: TEXT.label, ...NUMF }}>
          {page ? `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} de ${total.toLocaleString("en-US")}` : ""}
        </span>
        <button onClick={() => setOffset(Math.max(offset - PAGE, 0))} disabled={offset === 0} style={iconBtn(PATRIA.darkBlue, offset > 0)}><ChevronLeft size={14} /></button>
        <button onClick={() => setOffset(offset + PAGE)} disabled={to >= total} style={iconBtn(PATRIA.darkBlue, to < total)}><ChevronRight size={14} /></button>
        <button onClick={load} title="Recargar" style={iconBtn(PATRIA.darkBlue)}>
          <RefreshCw size={13} style={loading ? { animation: "spin 0.8s linear infinite" } : undefined} />
        </button>
        <div style={{ flex: 1 }} />
        {editable && !adding && (
          <button onClick={() => { setAdding(true); setEditIdx(null); setDraft({}); }} style={btn(true)}>
            <Plus size={13} /> Nueva fila
          </button>
        )}
      </div>

      {meta && !meta.editable && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, padding: "7px 11px", borderRadius: 7, fontSize: 11.5, color: TEXT.label, background: SURFACE.subtle, border: `1px solid ${BORDER.base}` }}>
          <Lock size={12} /> {meta.readonlyReason}
        </div>
      )}
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, padding: "7px 11px", borderRadius: 7, fontSize: 12, color: PATRIA.pink, background: "rgba(248,72,94,0.06)", border: "1px solid rgba(248,72,94,0.20)" }}>
          <AlertTriangle size={13} /> {error}
          <button onClick={() => setError(null)} style={{ marginLeft: "auto", display: "flex", border: "none", background: "transparent", color: PATRIA.pink, cursor: "pointer" }}><X size={13} /></button>
        </div>
      )}
      {notice && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, padding: "7px 11px", borderRadius: 7, fontSize: 12, color: PATRIA.blue, background: "rgba(0,30,175,0.06)", border: "1px solid rgba(0,30,175,0.18)" }}>
          <Check size={13} /> {notice}
        </div>
      )}

      {/* ── Grilla ────────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: "68dvh" }}>
        {!meta ? (
          <div style={{ padding: 40, textAlign: "center", color: TEXT.muted, fontSize: 12.5 }}>{loading ? "Cargando…" : "Sin datos"}</div>
        ) : (
          <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
            <thead>
              <tr>
                {editable && <th style={{ ...th, cursor: "default", width: 92, position: "sticky", left: 0, zIndex: 3 }}>Acción</th>}
                {meta.columns.map((c) => {
                  const sorted = sort?.col === c.name;
                  return (
                    <th key={c.name} title={`${c.type}${c.nullable ? "" : " · NOT NULL"}${c.hasDefault ? " · con default" : ""}`}
                      onClick={() => { setOffset(0); setSort(sorted && sort!.dir === "asc" ? { col: c.name, dir: "desc" } : { col: c.name, dir: "asc" }); }}
                      style={{ ...th, textAlign: isNumeric(c.type) ? "right" : "left" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {c.pk && <KeyRound size={10} style={{ color: PATRIA.lightOrange }} />}
                        {c.name}
                        <span style={{ opacity: sorted ? 1 : 0.35, fontSize: 8 }}>{sorted ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                      </span>
                      <div style={{ fontSize: 8.5, fontWeight: 500, opacity: 0.6, letterSpacing: 0, marginTop: 1 }}>{c.type}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* Alta */}
              {adding && (
                <tr style={{ background: "rgba(32,68,220,0.05)" }}>
                  <td style={{ ...td, position: "sticky", left: 0, background: "#EEF2FD", zIndex: 1 }}>
                    <button onClick={saveNew} disabled={busy} title="Crear fila" style={{ ...iconBtn("#fff"), background: PATRIA.kingBlue, border: "none", marginRight: 4 }}><Save size={12} /></button>
                    <button onClick={() => setAdding(false)} title="Cancelar" style={iconBtn(TEXT.label)}><X size={12} /></button>
                  </td>
                  {meta.columns.map((c) => (
                    <td key={c.name} style={{ ...td, maxWidth: "none" }}>
                      <input value={draft[c.name] ?? ""} onChange={(e) => setDraft({ ...draft, [c.name]: e.target.value })}
                        placeholder={c.hasDefault ? "auto" : c.nullable ? "" : "obligatorio"}
                        onKeyDown={(e) => { if (e.key === "Enter") saveNew(); if (e.key === "Escape") setAdding(false); }}
                        style={cellInput(!!draft[c.name], isNumeric(c.type))} />
                    </td>
                  ))}
                </tr>
              )}

              {page!.rows.map((r, i) => {
                const editing = editIdx === i;
                const bg = editing ? "#FFF8F2" : i % 2 === 0 ? "#fff" : SURFACE.subtle;
                return (
                  <tr key={meta.pk.length ? meta.pk.map((k) => r[k]).join("|") : i} style={{ background: bg }}>
                    {editable && (
                      <td style={{ ...td, position: "sticky", left: 0, background: bg, zIndex: 1 }}>
                        {editing ? (
                          <>
                            <button onClick={saveEdit} disabled={busy} title="Guardar (Enter)" style={{ ...iconBtn("#fff"), background: PATRIA.kingBlue, border: "none", marginRight: 4 }}><Save size={12} /></button>
                            <button onClick={() => setEditIdx(null)} title="Descartar (Esc)" style={{ ...iconBtn(TEXT.label), marginRight: 4 }}><X size={12} /></button>
                          </>
                        ) : (
                          <button onClick={() => startEdit(i)} title="Editar fila" style={{ ...iconBtn(PATRIA.kingBlue), marginRight: 4 }}><Pencil size={12} /></button>
                        )}
                        <button onClick={() => remove(r)} disabled={busy} title="Borrar fila" style={iconBtn(PATRIA.pink, !busy)}><Trash2 size={12} /></button>
                      </td>
                    )}
                    {meta.columns.map((c) => {
                      const num = isNumeric(c.type);
                      if (editing) {
                        const dirty = (draft[c.name] ?? "") !== (r[c.name] ?? "");
                        return (
                          <td key={c.name} style={{ ...td, maxWidth: "none" }}>
                            <input value={draft[c.name] ?? ""} onChange={(e) => setDraft({ ...draft, [c.name]: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditIdx(null); }}
                              title={c.pk ? "Llave primaria: cambiarla re-identifica la fila" : undefined}
                              style={cellInput(dirty, num)} />
                          </td>
                        );
                      }
                      const v = r[c.name];
                      return (
                        <td key={c.name} onDoubleClick={() => startEdit(i)} title={v ?? "NULL"}
                          style={{ ...td, textAlign: num ? "right" : "left", ...(num ? NUMF : {}), color: v == null || v === "" ? TEXT.disabled : TEXT.body, fontWeight: c.pk ? 700 : 400 }}>
                          {v == null ? "NULL" : v === "" ? "''" : v}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {page!.rows.length === 0 && !adding && (
                <tr><td colSpan={meta.columns.length + (editable ? 1 : 0)} style={{ padding: 30, textAlign: "center", color: TEXT.muted, fontSize: 12.5 }}>
                  {q ? `Sin filas que contengan “${q}”.` : "La tabla está vacía."}
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ fontSize: 10.5, color: TEXT.muted, marginTop: 8, lineHeight: 1.55 }}>
        Doble clic o <Pencil size={10} style={{ display: "inline", verticalAlign: "-1px" }} /> para editar una fila; Enter guarda, Esc descarta. Una celda vacía se guarda como NULL (o '' si la columna de texto es obligatoria).
        Cada cambio queda en el <strong style={{ color: TEXT.label }}>Registro de cambios</strong> con el valor anterior.
        Ojo: si un script de carga vuelve a escribir la tabla, puede pisar la corrección — esto corrige la base, no el cargador.
      </div>
    </div>
  );
}
