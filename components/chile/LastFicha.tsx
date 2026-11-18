"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, RefreshCw, Trash2, X } from "lucide-react";
import { usePhone } from "@/lib/useBreakpoint";
import { PATRIA, FONT_PRIMARY, FONT_SECONDARY, TEXT } from "@/lib/patriaTheme";
import type {
  LastFichaCompany, LastFichaComment, LastFichaPayload, LastFichaRow, LastFichaSection,
} from "@/app/api/chile/last-ficha/route";

// Chile → Last Ficha. Resumen de resultados de una compañía tal como lo subió la macro
// "Send Ficha": todos los años + los últimos 5 trimestres, la Var% YoY y QoQ del trimestre
// base, y una columna de comentarios por fila. Clic en una variación = marcarla con un
// círculo y dejarle un comentario (ficha_comments, target "yoy"/"qoq").
//
// Colores: Manual PATRIA. Encabezado de grupos = Regla 1 (dark blue), subtítulo de sección =
// Regla 2 (king blue), primera columna = Regla 5, filas clave = Regla 3 (fondo claro + bold).
// Variación positiva = patria-blue, negativa = patria-pink (convención validada). El círculo
// del analista va en naranja: es la marca de "esto lo tocó una persona", igual que las
// celdas editadas a mano de Stock Selection.

const TEXT1 = PATRIA.darkBlue;
const TEXT2 = TEXT.label;
const TEXT3 = TEXT.muted;
const NM_TEXT = TEXT.disabled;
const BORDER = "rgba(13,13,56,0.09)";
const RULE = "rgba(13,13,56,0.22)";          // divisoria entre bloques de columnas
const SURFACE = "#F5F7FD";
const KEY_BG = "#F5F7FD";                    // Regla 3: filas clave
const BASE_TINT = "rgba(69,113,255,0.08)";   // columna del trimestre base
const BASE_TINT_HEAD = "#E9ECFC";            // = rgba(32,68,220,0.10) sobre blanco
const VAR_TINT = "rgba(70,232,224,0.08)";    // bloque de variaciones
const RING = PATRIA.orange;
const RING_BG = "rgba(255,107,6,0.10)";
const POS = PATRIA.blue;
const NEG = PATRIA.pink;

// Líneas que se leen primero: van en negrita sobre fondo claro.
const KEY_LINES = new Set(["Revenues", "EBITDA", "EBIT", "Controlling Net Income", "Total Net Debt", "Controlling Equity"]);

const LS_TICKER = "patria:last-ficha:ticker";

type Target = "line" | "yoy" | "qoq";
const ckey = (source: string, section: string, line: string, target: Target) => `${source}|${section}|${line}|${target}`;

// ── Formato ─────────────────────────────────────────────────────────────────────
function fmtVal(v: number | null, pct: boolean): string {
  if (v == null) return "—";
  if (pct) return (v * 100).toFixed(1) + "%";
  const a = Math.abs(v);
  if (a >= 100) return Math.round(v).toLocaleString("en-US");
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
function fmtVar(v: number | "NM" | null, pct: boolean): { text: string; color: string } {
  if (v == null) return { text: "—", color: NM_TEXT };
  if (v === "NM") return { text: "NM", color: NM_TEXT };
  const color = v > 0.0005 ? POS : v < -0.0005 ? NEG : TEXT2;
  const sign = v > 0 ? "+" : "";
  return pct
    ? { text: `${sign}${(v * 100).toFixed(1)} pp`, color }
    : { text: `${sign}${(v * 100).toFixed(1)}%`, color };
}
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y.slice(2)}`;
};
const who = (email: string | null) => (email ? email.split("@")[0] : "usuario");

// ── Componente ──────────────────────────────────────────────────────────────────
export default function LastFicha() {
  const isPhone = usePhone();
  const [companies, setCompanies] = useState<LastFichaCompany[] | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);
  const [baseKey, setBaseKey] = useState<string | null>(null); // "fy-q"; null = último
  const [data, setData] = useState<LastFichaPayload | null>(null);
  const [comments, setComments] = useState<Map<string, LastFichaComment>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // En teléfono la tabla muestra un bloque por vez (chips), como Stock Selection.
  const [phoneView, setPhoneView] = useState<"var" | "quarters" | "years">("var");
  const [editor, setEditor] = useState<{ row: LastFichaRow; section: LastFichaSection; target: Target } | null>(null);

  // Lista de compañías. Abre la última consultada por este usuario, o la ficha subida más
  // recientemente.
  useEffect(() => {
    fetch("/api/chile/last-ficha")
      .then((r) => r.json())
      .then((d: { companies?: LastFichaCompany[]; error?: string }) => {
        if (!d.companies) { setError(d.error ?? "No se pudo cargar la lista de fichas"); return; }
        setCompanies(d.companies);
        let saved: string | null = null;
        try { saved = localStorage.getItem(LS_TICKER); } catch { /* sin storage */ }
        const pick = d.companies.find((c) => c.ticker === saved)
          ?? [...d.companies].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        setTicker(pick?.ticker ?? null);
      })
      .catch(() => setError("No se pudo cargar la lista de fichas"));
  }, []);

  const load = useCallback((t: string, bk: string | null) => {
    setLoading(true); setError(null);
    const p = new URLSearchParams({ ticker: t });
    if (bk) { const [fy, q] = bk.split("-"); p.set("fy", fy); p.set("q", q); }
    fetch(`/api/chile/last-ficha?${p}`)
      .then((r) => r.json())
      .then((d: LastFichaPayload & { error?: string }) => {
        if (d.error) { setError(d.error); setData(null); return; }
        setData(d);
        setComments(new Map(d.comments.map((c) => [ckey(c.source, c.section, c.line, c.target), c])));
      })
      .catch(() => setError("No se pudo cargar la ficha"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (ticker) load(ticker, baseKey); }, [ticker, baseKey, load]);

  const chooseTicker = (t: string) => {
    setBaseKey(null); setTicker(t);
    try { localStorage.setItem(LS_TICKER, t); } catch { /* sin storage */ }
  };

  // Guarda (o borra, con texto vacío) un comentario. Devuelve false si falló.
  const saveComment = useCallback(async (section: LastFichaSection, line: string, target: Target, text: string): Promise<boolean> => {
    if (!data) return false;
    const res = await fetch("/api/chile/last-ficha/comments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: data.ticker, year: data.base.fy, quarter: data.base.q, source: section.source, section: section.section, line, target, comment: text }),
    }).catch(() => null);
    if (!res?.ok) return false;
    const d = await res.json() as { comment?: LastFichaComment; deleted?: boolean };
    setComments((prev) => {
      const next = new Map(prev);
      const k = ckey(section.source, section.section, line, target);
      if (d.comment) next.set(k, d.comment); else next.delete(k);
      return next;
    });
    return true;
  }, [data]);

  const markedCount = useMemo(() => [...comments.values()].filter((c) => c.target !== "line").length, [comments]);
  const lineCount = comments.size - markedCount;

  // ── Columnas visibles ──
  const showYears = !isPhone || phoneView === "years";
  const showQuarters = !isPhone || phoneView === "quarters";
  const showVars = !isPhone || phoneView === "var";
  const showComments = !isPhone || phoneView === "var";
  const baseIdx = data ? data.quarters.length - 1 : -1;

  const nCols = data
    ? 1 + (showYears ? data.years.length : 0) + (showQuarters ? data.quarters.length : 0) + (showVars ? 2 : 0) + (showComments ? 1 : 0)
    : 1;

  const company = companies?.find((c) => c.ticker === ticker);

  return (
    <div>
      {/* ── Encabezado y controles ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 3, height: 22, background: PATRIA.kingBlue, borderRadius: 2 }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT1, letterSpacing: "-0.02em", margin: 0, fontFamily: FONT_PRIMARY }}>
              Last Ficha{data?.name ? ` — ${data.name}` : ""}
            </h2>
          </div>
          {data && (
            <div style={{ fontSize: 11.5, color: TEXT2, marginTop: 5, marginLeft: 13, fontFamily: FONT_SECONDARY }}>
              {data.ticker} · {data.currency} millones{data.fx ? ` · FX ${data.fx.toLocaleString("en-US")}` : ""} · ficha cargada el {fmtDate(data.updatedAt)}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <label style={ctrlBox}>
            <span style={ctrlLabel}>Compañía</span>
            <select value={ticker ?? ""} onChange={(e) => chooseTicker(e.target.value)} disabled={!companies?.length} style={selectStyle}>
              {(companies ?? []).map((c) => (
                <option key={c.ticker} value={c.ticker}>{c.name ?? c.ticker}{c.lastLabel ? ` · ${c.lastLabel}` : ""}</option>
              ))}
            </select>
          </label>
          {data && (
            <label style={ctrlBox} title="Trimestre que se revisa: las Var% y los comentarios son de este trimestre">
              <span style={ctrlLabel}>Trimestre</span>
              <select value={`${data.base.fy}-${data.base.q}`} onChange={(e) => setBaseKey(e.target.value)} style={selectStyle}>
                {data.periods.map((p) => <option key={`${p.fy}-${p.q}`} value={`${p.fy}-${p.q}`}>{p.label}</option>)}
              </select>
            </label>
          )}
          {data && (
            <div style={{ ...ctrlBox, gap: 10, fontSize: 11, color: TEXT2 }} title="Comentarios de fila y variaciones marcadas con círculo en este trimestre">
              <span><b style={{ color: TEXT1 }}>{lineCount}</b> comentarios</span>
              <span><b style={{ color: RING }}>{markedCount}</b> marcadas</span>
            </div>
          )}
          {ticker && (
            <button onClick={() => load(ticker, baseKey)} disabled={loading} title="Volver a leer la ficha" style={iconBtn}>
              <RefreshCw size={13} style={loading ? { animation: "spin 0.8s linear infinite" } : undefined} />
            </button>
          )}
        </div>
      </div>

      {/* Teléfono: un bloque de columnas por vez. */}
      {isPhone && data && (
        <div className="tab-rail keep-dense" style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {([["var", `Var% ${data.base.label}`], ["quarters", "Trimestres"], ["years", "Años"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setPhoneView(k)}
              style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${PATRIA.kingBlue}`, background: phoneView === k ? PATRIA.kingBlue : "#fff", color: phoneView === k ? "#fff" : PATRIA.kingBlue }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {error && <div style={{ padding: 24, textAlign: "center", color: NEG, fontSize: 13 }}>{error}</div>}
      {!error && companies && companies.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", color: TEXT3, fontSize: 13 }}>Todavía no hay fichas cargadas. Se suben con la macro “Send Ficha”.</div>
      )}
      {!data && !error && (companies == null || loading) && (
        <div style={{ padding: 24, textAlign: "center", color: TEXT3, fontSize: 13 }}>Cargando ficha…</div>
      )}

      {data && (
        <div className="scroll-x" style={{ border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", opacity: loading ? 0.6 : 1, maxHeight: isPhone ? "75dvh" : undefined, overflowY: isPhone ? "auto" : undefined }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", fontFamily: FONT_SECONDARY, fontSize: 11 }}>
            <thead>
              {/* Fila 1 — bloques (Regla 1) */}
              <tr>
                <th style={{ ...th1, ...stickyLeft, zIndex: 3, textAlign: "left" }}>{data.currency} mn</th>
                {showYears && data.years.length > 0 && <th colSpan={data.years.length} style={{ ...th1, borderLeft: `1px solid rgba(255,255,255,0.18)` }}>Anual</th>}
                {showQuarters && <th colSpan={data.quarters.length} style={{ ...th1, background: PATRIA.kingBlue, borderLeft: `1px solid rgba(255,255,255,0.18)` }}>Últimos {data.quarters.length} trimestres</th>}
                {showVars && <th colSpan={2} style={{ ...th1, borderLeft: `1px solid rgba(255,255,255,0.18)` }}>Var% {data.base.label}</th>}
                {showComments && <th style={{ ...th1, background: PATRIA.kingBlue, borderLeft: `1px solid rgba(255,255,255,0.18)`, textAlign: "left" }}>Comentarios del analista</th>}
              </tr>
              {/* Fila 2 — etiquetas */}
              <tr>
                <th style={{ ...th2, ...stickyLeft, zIndex: 3, textAlign: "left" }}>Línea</th>
                {showYears && data.years.map((y, i) => <th key={y} style={{ ...th2, borderLeft: i === 0 ? `1px solid ${RULE}` : undefined }}>{y}</th>)}
                {showQuarters && data.quarters.map((p, i) => (
                  <th key={p.label} style={{ ...th2, borderLeft: i === 0 ? `1px solid ${RULE}` : undefined, background: i === baseIdx ? BASE_TINT_HEAD : th2.background }}>{p.label}</th>
                ))}
                {showVars && <>
                  <th style={{ ...th2, borderLeft: `1px solid ${RULE}` }} title={data.yoyLabel}>YoY</th>
                  <th style={th2} title={data.qoqLabel}>QoQ</th>
                </>}
                {showComments && <th style={{ ...th2, borderLeft: `1px solid ${RULE}`, textAlign: "left", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>Clic en una Var% para marcarla</th>}
              </tr>
            </thead>
            <tbody>
              {data.sections.map((s) => (
                <Fragment key={`${s.source}|${s.section}`}>
                  {/* Subtítulo de sección (Regla 2) */}
                  <tr>
                    <td colSpan={nCols} style={{ padding: 0, background: PATRIA.kingBlue }}>
                      <div style={{ ...stickyLeft, position: "sticky", display: "inline-block", background: PATRIA.kingBlue, color: "#fff", fontWeight: 700, fontSize: 11, padding: "5px 10px", letterSpacing: "0.02em" }}>
                        {s.source === "kpi" ? `KPIs · ${s.section}` : s.section}
                      </div>
                    </td>
                  </tr>
                  {s.rows.map((r) => {
                    const key = KEY_LINES.has(r.line) && s.source === "statement";
                    const rowBg = key ? KEY_BG : "#fff";
                    const lineC = comments.get(ckey(s.source, s.section, r.line, "line"));
                    return (
                      <tr key={r.line}>
                        <td style={{ ...td, ...stickyLeft, background: rowBg, color: PATRIA.kingBlue, fontWeight: 700, textAlign: "left", whiteSpace: isPhone ? "normal" : "nowrap", minWidth: isPhone ? 120 : 200, maxWidth: isPhone ? 150 : undefined }}>
                          {r.line}
                          {isPhone && phoneView !== "var" && lineC && <MessageSquare size={10} color={RING} style={{ marginLeft: 4, verticalAlign: "middle" }} />}
                        </td>
                        {showYears && r.annual.map((v, i) => (
                          <td key={i} style={{ ...td, background: rowBg, fontWeight: key ? 700 : 400, borderLeft: i === 0 ? `1px solid ${RULE}` : undefined }}>{fmtVal(v, r.pct)}</td>
                        ))}
                        {showQuarters && r.quarterly.map((v, i) => (
                          <td key={i} style={{ ...td, background: i === baseIdx ? BASE_TINT : rowBg, fontWeight: key || i === baseIdx ? 700 : 400, borderLeft: i === 0 ? `1px solid ${RULE}` : undefined }}>{fmtVal(v, r.pct)}</td>
                        ))}
                        {showVars && (["yoy", "qoq"] as const).map((t, i) => {
                          const v = fmtVar(r[t], r.pct);
                          const c = comments.get(ckey(s.source, s.section, r.line, t));
                          return (
                            <td key={t} style={{ ...td, background: VAR_TINT, borderLeft: i === 0 ? `1px solid ${RULE}` : undefined, padding: "2px 5px" }}>
                              <button onClick={() => setEditor({ row: r, section: s, target: t })}
                                title={c ? `${c.comment}\n— ${who(c.updatedBy)} · ${fmtDate(c.updatedAt)}` : `Marcar y comentar la Var% ${t.toUpperCase()} (${t === "yoy" ? data.yoyLabel : data.qoqLabel})`}
                                style={{
                                  font: "inherit", fontVariantNumeric: "tabular-nums", fontWeight: c ? 700 : 600, color: v.color, cursor: "pointer",
                                  background: c ? RING_BG : "transparent", border: `1.5px solid ${c ? RING : "transparent"}`, borderRadius: 999,
                                  padding: "2px 8px", minWidth: 62, textAlign: "right",
                                }}>
                                {v.text}
                              </button>
                            </td>
                          );
                        })}
                        {showComments && (
                          <td style={{ ...td, background: rowBg, borderLeft: `1px solid ${RULE}`, textAlign: "left", padding: "2px 6px", minWidth: isPhone ? 44 : 280 }}>
                            {isPhone ? (
                              <button onClick={() => setEditor({ row: r, section: s, target: "line" })} title={lineC?.comment ?? "Comentar esta línea"} style={{ ...iconBtn, width: 30, height: 28, color: lineC ? RING : TEXT3, borderColor: lineC ? RING : BORDER }}>
                                <MessageSquare size={13} />
                              </button>
                            ) : (
                              <LineComment
                                key={`${data.base.fy}-${data.base.q}-${s.section}-${r.line}`}
                                value={lineC?.comment ?? ""}
                                meta={lineC ? `${who(lineC.updatedBy)} · ${fmtDate(lineC.updatedAt)}` : null}
                                onSave={(text) => saveComment(s, r.line, "line", text)}
                              />
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <div style={{ fontSize: 10.5, color: TEXT3, marginTop: 8, lineHeight: 1.5 }}>
          YoY = {data.yoyLabel} · QoQ = {data.qoqLabel}. Montos: variación porcentual; ratios (márgenes, tasas, crecimientos): diferencia en puntos (pp).
          “NM” = base cero o cambio de signo. Los comentarios son del trimestre {data.base.label}: al elegir otro trimestre se ven los suyos.
          {company?.lastLabel && company.lastLabel !== data.base.label ? ` La ficha llega hasta ${company.lastLabel}.` : ""}
        </div>
      )}

      {editor && data && (
        <CommentEditor
          title={editor.target === "line" ? editor.row.line : `${editor.row.line} · Var% ${editor.target.toUpperCase()}`}
          subtitle={editor.target === "line"
            ? `${editor.section.section} · ${data.base.label}`
            : `${editor.target === "yoy" ? data.yoyLabel : data.qoqLabel}: ${fmtVar(editor.row[editor.target], editor.row.pct).text}`}
          initial={comments.get(ckey(editor.section.source, editor.section.section, editor.row.line, editor.target))}
          onClose={() => setEditor(null)}
          onSave={(text) => saveComment(editor.section, editor.row.line, editor.target, text)}
        />
      )}
    </div>
  );
}

// ── Comentario de fila (escritorio): se guarda al salir del campo ─────────────────
function LineComment({ value, meta, onSave }: { value: string; meta: string | null; onSave: (text: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setDraft(value); }, [value]);
  // Alto al contenido: una línea vacía, crece con el texto.
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.max(24, el.scrollHeight)}px`;
  }, [draft]);
  const commit = async () => {
    if (draft.trim() === value.trim()) return;
    setState("saving");
    setState((await onSave(draft)) ? "idle" : "error");
  };
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
      <textarea ref={ref} value={draft} rows={1} placeholder="Agregar comentario…"
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur(); }}
        style={{
          flex: 1, resize: "none", overflow: "hidden", fontFamily: FONT_SECONDARY, fontSize: 11, lineHeight: 1.4, color: TEXT1,
          padding: "3px 6px", borderRadius: 5, outline: "none",
          border: `1px solid ${state === "error" ? NEG : draft ? "rgba(255,107,6,0.45)" : "transparent"}`,
          background: draft ? "#fff" : "transparent",
        }}
        onFocus={(e) => { e.currentTarget.style.border = `1px solid ${PATRIA.kingBlue}`; }}
      />
      <span style={{ fontSize: 9.5, color: state === "error" ? NEG : TEXT3, whiteSpace: "nowrap", paddingTop: 5 }}>
        {state === "saving" ? "guardando…" : state === "error" ? "no se guardó" : meta ?? ""}
      </span>
    </div>
  );
}

// ── Editor modal (variaciones; y comentarios de fila en teléfono) ─────────────────
function CommentEditor({ title, subtitle, initial, onClose, onSave }: {
  title: string; subtitle: string; initial: LastFichaComment | undefined;
  onClose: () => void; onSave: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState(initial?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);
  const run = async (t: string) => {
    setSaving(true); setErr(false);
    const ok = await onSave(t);
    setSaving(false);
    if (ok) onClose(); else setErr(true);
  };
  return (
    <div className="modal-overlay" onClick={(e) => { if (!saving && e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(13,13,56,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }}>
      <div className="modal-card" style={{ width: 440, maxWidth: "100%", background: "#fff", borderRadius: 10, boxShadow: "0 12px 40px rgba(13,13,56,0.25)", overflow: "hidden" }}>
        <div style={{ background: PATRIA.darkBlue, color: "#fff", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_PRIMARY, fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{subtitle}</div>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Cerrar" style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}><X size={16} /></button>
        </div>
        <div style={{ padding: 14 }}>
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="¿Qué explica esta variación?"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) run(text); }}
            style={{ width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: FONT_SECONDARY, fontSize: 13, lineHeight: 1.45, color: TEXT1, padding: 9, borderRadius: 6, border: `1px solid ${BORDER}`, outline: "none" }} />
          {initial && (
            <div style={{ fontSize: 10.5, color: TEXT3, marginTop: 6 }}>Último cambio: {who(initial.updatedBy)} · {fmtDate(initial.updatedAt)}</div>
          )}
          {err && <div style={{ fontSize: 12, color: NEG, marginTop: 6, fontWeight: 600 }}>No se pudo guardar. Intentá de nuevo.</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderTop: `1px solid ${BORDER}`, background: SURFACE }}>
          {initial && (
            <button onClick={() => run("")} disabled={saving} title="Borrar el comentario (y quitar el círculo)"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: `1px solid ${NEG}`, background: "#fff", color: NEG, cursor: "pointer" }}>
              <Trash2 size={13} /> Borrar
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} disabled={saving} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT2, cursor: "pointer" }}>Cancelar</button>
          <button onClick={() => run(text)} disabled={saving || !text.trim()}
            style={{ padding: "7px 16px", borderRadius: 6, fontSize: 12.5, fontWeight: 700, border: "none", background: PATRIA.kingBlue, color: "#fff", cursor: saving || !text.trim() ? "default" : "pointer", opacity: saving || !text.trim() ? 0.6 : 1 }}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Estilos ─────────────────────────────────────────────────────────────────────
const stickyLeft: React.CSSProperties = { position: "sticky", left: 0, zIndex: 1, borderRight: `1px solid ${RULE}` };
const th1: React.CSSProperties = {
  background: PATRIA.darkBlue, color: "#fff", fontFamily: FONT_PRIMARY, fontWeight: 700, fontSize: 9.5,
  textTransform: "uppercase", letterSpacing: "0.06em", padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap",
};
const th2: React.CSSProperties = {
  background: SURFACE, color: PATRIA.kingBlue, fontWeight: 700, fontSize: 9.5, textTransform: "uppercase",
  letterSpacing: "0.05em", padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap", borderBottom: `2px solid ${PATRIA.darkBlue}`,
};
const td: React.CSSProperties = {
  padding: "4px 8px", textAlign: "right", color: TEXT1, fontVariantNumeric: "tabular-nums",
  borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap", verticalAlign: "middle",
};
const ctrlBox: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, background: SURFACE };
const ctrlLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: TEXT2 };
const selectStyle: React.CSSProperties = { padding: "3px 6px", fontSize: 12, fontFamily: FONT_SECONDARY, border: `1px solid ${BORDER}`, borderRadius: 4, background: "#fff", color: TEXT1, outline: "none", cursor: "pointer", maxWidth: 260 };
const iconBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT1, cursor: "pointer" };
