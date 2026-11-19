"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, FileSpreadsheet, RefreshCw, Search, Trash2, X, XCircle } from "lucide-react";
import { PATRIA, FONT_PRIMARY, FONT_SECONDARY, TEXT } from "@/lib/patriaTheme";
import type { FichaAdminRow } from "@/app/api/admin/fichas/route";

// Admin Issues → Fichas. Una fila por ticker que subió la macro "Send Ficha", con su
// diagnóstico (ver app/api/admin/fichas/route.ts), y un botón para borrar TODO lo de ese
// ticker: el caso típico es una ficha subida con el ticker mal escrito, que queda huérfana.
// Borrar pide escribir el ticker: no se puede deshacer.

const TEXT1 = PATRIA.darkBlue;
const TEXT2 = TEXT.label;
const TEXT3 = TEXT.muted;
const BORDER = "rgba(13,13,56,0.09)";
const SURFACE = "#F5F7FD";
const NEG = PATRIA.pink;
const WARN = PATRIA.orange;

const STATUS = {
  error: { label: "Error", color: NEG, bg: "rgba(248,72,94,0.10)", icon: XCircle },
  warn:  { label: "Revisar", color: WARN, bg: "rgba(255,107,6,0.10)", icon: AlertTriangle },
  ok:    { label: "OK", color: PATRIA.blue, bg: "rgba(0,30,175,0.07)", icon: Check },
} as const;

const fmtWhen = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function FichasAdminPanel() {
  const [rows, setRows] = useState<FichaAdminRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [deleting, setDeleting] = useState<FichaAdminRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetch("/api/admin/fichas")
      .then((r) => r.json())
      .then((d: { rows?: FichaAdminRow[]; error?: string }) => { if (d.rows) setRows(d.rows); else setError(d.error ?? "No se pudo cargar"); })
      .catch(() => setError("No se pudo cargar"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) =>
      (!onlyIssues || r.status !== "ok") &&
      (!s || r.ticker.toLowerCase().includes(s) || (r.name ?? "").toLowerCase().includes(s)));
  }, [rows, q, onlyIssues]);

  const counts = useMemo(() => {
    const c = { ok: 0, warn: 0, error: 0 };
    for (const r of rows ?? []) c[r.status]++;
    return c;
  }, [rows]);

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", background: PATRIA.darkBlue, color: "#fff", flexWrap: "wrap" }}>
        <FileSpreadsheet size={14} />
        <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.02em" }}>Fichas cargadas</span>
        <span style={{ fontSize: 10.5, opacity: 0.7 }}>lo que subió la macro “Send Ficha”, por ticker · borrar un ticker mal subido</span>
      </div>

      {/* Controles */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${BORDER}`, background: SURFACE, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", minWidth: 220 }}>
          <Search size={13} color={TEXT3} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ticker o compañía…"
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 12, fontFamily: FONT_SECONDARY, color: TEXT1 }} />
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: TEXT2, cursor: "pointer" }}>
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Sólo con problemas
        </label>
        <div style={{ flex: 1 }} />
        {rows && (["error", "warn", "ok"] as const).map((k) => (
          <span key={k} style={{ fontSize: 11.5, fontWeight: 700, color: STATUS[k].color }}>{counts[k]} {STATUS[k].label.toLowerCase()}</span>
        ))}
        <button onClick={load} disabled={loading} title="Volver a leer" style={iconBtn}>
          <RefreshCw size={13} style={loading ? { animation: "spin 0.8s linear infinite" } : undefined} />
        </button>
      </div>

      {notice && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 12, color: PATRIA.blue, background: "rgba(0,30,175,0.06)", borderBottom: `1px solid ${BORDER}` }}>
          <Check size={13} /> {notice}
          <button onClick={() => setNotice(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: TEXT3 }}><X size={13} /></button>
        </div>
      )}
      {error && <div style={{ padding: 20, textAlign: "center", color: NEG, fontSize: 13 }}>{error}</div>}
      {!rows && !error && <div style={{ padding: 20, textAlign: "center", color: TEXT3, fontSize: 13 }}>Cargando…</div>}
      {rows && rows.length === 0 && <div style={{ padding: 20, textAlign: "center", color: TEXT3, fontSize: 13 }}>No hay fichas cargadas.</div>}

      {rows && rows.length > 0 && (
        <div className="scroll-x">
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT_SECONDARY, fontSize: 12 }}>
            <thead>
              <tr>
                <th style={th}>Estado</th>
                <th style={{ ...th, textAlign: "left" }}>Ticker</th>
                <th style={{ ...th, textAlign: "left" }} className="hide-phone">Compañía (maestra)</th>
                <th style={th} className="hide-phone">Moneda · FX</th>
                <th style={th} className="hide-phone">Años</th>
                <th style={th}>Último Q</th>
                <th style={th} className="hide-phone">LTM</th>
                <th style={th} className="hide-phone">Líneas · KPIs · Coment.</th>
                <th style={th} className="hide-phone">Última carga</th>
                <th style={{ ...th, textAlign: "left", minWidth: 260 }} className="hide-phone">Problemas</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const st = STATUS[r.status];
                const Icon = st.icon;
                return (
                  <tr key={r.ticker} style={{ background: i % 2 ? SURFACE : "#fff" }}>
                    <td style={{ ...td, textAlign: "center" }}>
                      <span title={r.issues.join("\n") || "Sin problemas"} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, color: st.color, background: st.bg }}>
                        <Icon size={11} /> {st.label}
                      </span>
                    </td>
                    <td style={{ ...td, fontWeight: 700, color: PATRIA.kingBlue, whiteSpace: "nowrap" }}>
                      {r.ticker}
                      {/* En teléfono los datos de las columnas ocultas van bajo el ticker. */}
                      <div className="phone-only" style={{ fontWeight: 400, fontSize: 11, color: TEXT2, whiteSpace: "normal" }}>
                        {r.name ?? "No está en la maestra"}
                        {r.issues.map((x) => <div key={x} style={{ color: st.color }}>· {x}</div>)}
                      </div>
                    </td>
                    <td style={{ ...td, color: r.name ? TEXT1 : NEG, fontStyle: r.name ? undefined : "italic" }} className="hide-phone">{r.name ?? "no está"}</td>
                    <td style={{ ...td, textAlign: "center", whiteSpace: "nowrap" }} className="hide-phone">{r.currency ?? "—"}{r.fx != null ? ` · ${r.fx.toLocaleString("en-US")}` : ""}</td>
                    <td style={{ ...td, textAlign: "center", whiteSpace: "nowrap" }} className="hide-phone">{r.yearMin != null ? `${r.yearMin}–${r.yearMax}` : "—"}</td>
                    <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>{r.lastQuarter ?? "—"}</td>
                    <td style={{ ...td, textAlign: "center" }} className="hide-phone">{r.ltm ?? "—"}</td>
                    <td style={{ ...td, textAlign: "center", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }} className="hide-phone">{r.statements.toLocaleString("en-US")} · {r.kpis.toLocaleString("en-US")} · {r.comments}</td>
                    <td style={{ ...td, textAlign: "center", whiteSpace: "nowrap" }} className="hide-phone">{fmtWhen(r.updatedAt)}</td>
                    <td style={{ ...td, fontSize: 11.5 }} className="hide-phone">
                      {r.issues.length === 0 ? <span style={{ color: TEXT3 }}>—</span> : r.issues.map((x) => <div key={x} style={{ color: x === r.issues[0] && r.status === "error" ? NEG : TEXT1 }}>· {x}</div>)}
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <button onClick={() => setDeleting(r)} title={`Borrar todo lo cargado con ${r.ticker}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, fontSize: 11.5, fontWeight: 600, border: `1px solid ${NEG}`, background: "#fff", color: NEG, cursor: "pointer", whiteSpace: "nowrap" }}>
                        <Trash2 size={12} /> Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={11} style={{ padding: 16, textAlign: "center", color: TEXT3 }}>Nada coincide con el filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {deleting && (
        <DeleteModal row={deleting} onClose={() => setDeleting(null)}
          onDeleted={(msg) => { setDeleting(null); setNotice(msg); load(); }} />
      )}
    </div>
  );
}

// Confirmación: hay que escribir el ticker tal cual. Borra statements, KPIs y comentarios.
function DeleteModal({ row, onClose, onDeleted }: { row: FichaAdminRow; onClose: () => void; onDeleted: (msg: string) => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = typed.trim() === row.ticker;
  const run = async () => {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/admin/fichas?ticker=${encodeURIComponent(row.ticker)}`, { method: "DELETE" }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) { setErr(d.error ?? "No se pudo borrar"); return; }
    onDeleted(`Se borró ${row.ticker}: ${d.statements} líneas, ${d.kpis} KPIs y ${d.comments} comentarios.`);
  };
  return (
    <div className="modal-overlay" onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(13,13,56,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="modal-card" style={{ width: 460, maxWidth: "100%", background: "#fff", borderRadius: 10, boxShadow: "0 12px 40px rgba(13,13,56,0.25)", overflow: "hidden" }}>
        <div style={{ background: PATRIA.darkBlue, color: "#fff", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
          <Trash2 size={15} />
          <div style={{ flex: 1, fontFamily: FONT_PRIMARY, fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>Eliminar ficha</div>
          <button onClick={onClose} disabled={busy} aria-label="Cerrar" style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer" }}><X size={16} /></button>
        </div>
        <div style={{ padding: 14, fontSize: 12.5, color: TEXT1, lineHeight: 1.5 }}>
          Se borra <b>todo</b> lo cargado con <b style={{ color: PATRIA.kingBlue }}>{row.ticker}</b>{row.name ? ` (${row.name})` : ""}:
          <ul style={{ margin: "6px 0 10px 18px", padding: 0 }}>
            <li>{row.statements.toLocaleString("en-US")} valores de estados financieros</li>
            <li>{row.kpis.toLocaleString("en-US")} valores de KPIs</li>
            <li>{row.comments} comentarios de Last Ficha</li>
          </ul>
          No se puede deshacer; para recuperarla hay que volver a subirla con la macro. Escribí el ticker para confirmar:
          <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={row.ticker}
            onKeyDown={(e) => { if (e.key === "Enter" && ok && !busy) run(); }}
            style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 8, padding: "7px 9px", fontSize: 13, fontFamily: FONT_SECONDARY, border: `1px solid ${ok ? NEG : BORDER}`, borderRadius: 6, outline: "none" }} />
          {err && <div style={{ color: NEG, fontWeight: 600, marginTop: 8 }}>{err}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 14px", borderTop: `1px solid ${BORDER}`, background: SURFACE }}>
          <button onClick={onClose} disabled={busy} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT2, cursor: "pointer" }}>Cancelar</button>
          <button onClick={run} disabled={!ok || busy}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 6, fontSize: 12.5, fontWeight: 700, border: "none", background: NEG, color: "#fff", cursor: ok && !busy ? "pointer" : "default", opacity: ok && !busy ? 1 : 0.5 }}>
            <Trash2 size={13} /> {busy ? "Borrando…" : "Eliminar todo"}
          </button>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  background: SURFACE, color: PATRIA.kingBlue, fontWeight: 700, fontSize: 10, textTransform: "uppercase",
  letterSpacing: "0.05em", padding: "7px 10px", textAlign: "center", whiteSpace: "nowrap", borderBottom: `2px solid ${PATRIA.darkBlue}`,
};
const td: React.CSSProperties = { padding: "6px 10px", borderBottom: `1px solid ${BORDER}`, color: TEXT1, verticalAlign: "top" };
const iconBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT1, cursor: "pointer" };
