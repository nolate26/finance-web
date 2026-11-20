"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, MessageSquare, MessageSquareText, RefreshCw, Search, Trash2, X } from "lucide-react";
import type { FichaRow as FichaDoc } from "@/app/api/fichas/route";
import { usePhone } from "@/lib/useBreakpoint";
import { PATRIA, FONT_PRIMARY, FONT_SECONDARY, TEXT } from "@/lib/patriaTheme";
import type {
  LastFichaCompany, LastFichaComment, LastFichaFmt, LastFichaPayload, LastFichaRow,
} from "@/app/api/chile/last-ficha/route";

// Chile → Last Ficha. La ficha de una compañía con el formato de la hoja "Send Ficha":
// por sección una barra oscura con las etiquetas de columnas, y los bloques Años + LTM |
// últimos 5 trimestres | Var% YoY y QoQ del trimestre base | comentario del analista,
// separados por una columna en blanco. Las filas y los ratios calculados vienen armados
// desde la API (plantilla en app/api/chile/last-ficha/route.ts).
//
// Por defecto se ven los últimos 3 años (botón para ver todos). Clic en CUALQUIER valor
// (año, LTM, trimestre o variación) = marcarlo con un círculo y dejarle un comentario
// (ficha_comments: target "A2025" / "ltm" / "Q2026-3" / "yoy" / "qoq").
//
// Arriba de la tabla va la ficha PDF de Presentations (comentario del quarter + PDF), la
// misma que se sube en Presentations → Fichas. Se abre en una compañía con
// ?tab=last-ficha&ticker=… (mini botón de Stock Selection) vía `initialTicker`.
//
// Colores: Manual PATRIA, mapeando los de la planilla — barra de sección = dark blue, sub-
// líneas = sky blue suave, bandas CFO/CFI/CFF = sky blue. Variación positiva = patria-blue,
// negativa = patria-pink (convención validada). El círculo del analista va en naranja: es la
// marca de "esto lo tocó una persona", igual que las celdas editadas de Stock Selection.

const TEXT1 = PATRIA.darkBlue;
const TEXT2 = TEXT.label;
const TEXT3 = TEXT.muted;
const NM_TEXT = TEXT.disabled;
const BORDER = "rgba(13,13,56,0.09)";
const SURFACE = "#F5F7FD";
const TINT = "#E1E9FF";                      // sub-líneas y subtítulos de KPIs (celeste de la hoja) = sky blue 24% sobre blanco; opaco por la columna fija
const BAND = PATRIA.skyBlue;                 // CFO / CFI / CFF
const RULE_LINE = `1px solid ${PATRIA.darkBlue}`; // raya de subtotal
const RING = PATRIA.orange;
const RING_BG = "rgba(255,107,6,0.10)";
const POS = PATRIA.blue;
const NEG = PATRIA.pink;
const GAP_W = 14;                            // columna en blanco entre bloques

// Años que se ven de entrada; el resto con el botón "Ver N años".
const DEFAULT_YEARS = 3;

const LS_TICKER = "patria:last-ficha:ticker";

const ckey = (source: string, section: string, line: string, target: string) => `${source}|${section}|${line}|${target}`;
const yearTarget = (y: number) => `A${y}`;
const quarterTarget = (fy: number, q: number) => `Q${fy}-${q}`;
const qHead = (fy: number, q: number) => `${q}Q ${fy}`;

// ── Formato (igual que la hoja) ─────────────────────────────────────────────────
// Montos enteros con separador de miles, negativos entre paréntesis, cero = "-".
function fmtVal(v: number | null, fmt: LastFichaFmt): string {
  if (v == null) return "";
  if (fmt === "pct") return (v * 100).toFixed(1) + "%";
  if (fmt === "x") return v.toFixed(1) + "x";
  const a = Math.abs(v);
  if (a < 0.0005) return "-";
  const s = fmt === "dec" && a < 1000
    ? a.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : Math.round(a).toLocaleString("en-US");
  return v < 0 ? `(${s})` : s;
}
function fmtVar(v: number | "NM" | null, fmt: LastFichaFmt): { text: string; color: string } {
  if (v == null) return { text: "", color: NM_TEXT };
  if (v === "NM") return { text: "NM", color: NM_TEXT };
  const color = v > 0.0005 ? POS : v < -0.0005 ? NEG : TEXT2;
  const sign = v > 0 ? "+" : "";
  if (fmt === "pct") return { text: `${sign}${(v * 100).toFixed(1)} pp`, color };
  if (fmt === "x") return { text: `${sign}${v.toFixed(1)}x`, color };
  return { text: `${(v * 100).toFixed(1)}%`, color };
}
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y.slice(2)}`;
};
const who = (email: string | null) => (email ? email.split("@")[0] : "usuario");

// Celda que se está comentando en el editor modal.
interface EditTarget {
  row: LastFichaRow;
  target: string;
  label: string;   // "2025" · "3Q26" · "Var% YoY (3Q26 vs 3Q25)" · "Comentario de la línea"
  value: string;   // el valor tal como se ve en la celda
}

// ── Componente ──────────────────────────────────────────────────────────────────
export default function LastFicha({ initialTicker = null }: { initialTicker?: string | null }) {
  const isPhone = usePhone();
  const [companies, setCompanies] = useState<LastFichaCompany[] | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);
  const [baseKey, setBaseKey] = useState<string | null>(null); // "fy-q"; null = último
  const [data, setData] = useState<LastFichaPayload | null>(null);
  const [comments, setComments] = useState<Map<string, LastFichaComment>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allYears, setAllYears] = useState(false);
  // Fichas en CLP: se ven en USD (FX de la última subida); el botón vuelve a CLP.
  const [local, setLocal] = useState(false);
  // En teléfono la tabla muestra un bloque por vez (chips), como Stock Selection.
  const [phoneView, setPhoneView] = useState<"var" | "quarters" | "years">("var");
  const [editor, setEditor] = useState<EditTarget | null>(null);
  const [linkMiss, setLinkMiss] = useState<string | null>(null); // ticker del link sin ficha cargada

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
        // Prioridad: la compañía del link, la última consultada, la ficha más nueva.
        const wanted = initialTicker?.trim().toUpperCase().replace(/\s+/g, " ");
        const linked = wanted ? d.companies.find((c) => c.ticker === wanted) : undefined;
        if (wanted && !linked) setLinkMiss(wanted);
        const pick = linked
          ?? d.companies.find((c) => c.ticker === saved)
          ?? [...d.companies].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        if (linked) { try { localStorage.setItem(LS_TICKER, linked.ticker); } catch { /* sin storage */ } }
        setTicker(pick?.ticker ?? null);
      })
      .catch(() => setError("No se pudo cargar la lista de fichas"));
  }, [initialTicker]);

  // Ficha PDF de Presentations (comentario + PDF) de la compañía abierta.
  const [docs, setDocs] = useState<FichaDoc[] | null>(null);
  useEffect(() => {
    if (!data?.ticker) return;
    setDocs(null);
    fetch(`/api/fichas?ticker=${encodeURIComponent(data.ticker)}`)
      .then((r) => r.json())
      .then((d: { fichas?: FichaDoc[] }) => setDocs(d.fichas ?? []))
      .catch(() => setDocs([]));
  }, [data?.ticker]);

  const load = useCallback((t: string, bk: string | null, loc: boolean) => {
    setLoading(true); setError(null);
    const p = new URLSearchParams({ ticker: t });
    if (bk) { const [fy, q] = bk.split("-"); p.set("fy", fy); p.set("q", q); }
    if (loc) p.set("ccy", "local");
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

  useEffect(() => { if (ticker) load(ticker, baseKey, local); }, [ticker, baseKey, local, load]);

  const chooseTicker = (t: string) => {
    setBaseKey(null); setTicker(t);
    try { localStorage.setItem(LS_TICKER, t); } catch { /* sin storage */ }
  };

  // Guarda (o borra, con texto vacío) un comentario. Devuelve false si falló.
  const saveComment = useCallback(async (row: LastFichaRow, target: string, text: string): Promise<boolean> => {
    if (!data) return false;
    const res = await fetch("/api/chile/last-ficha/comments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: data.ticker, year: data.base.fy, quarter: data.base.q, source: row.source, section: row.section, line: row.line, target, comment: text }),
    }).catch(() => null);
    if (!res?.ok) return false;
    const d = await res.json() as { comment?: LastFichaComment; deleted?: boolean };
    setComments((prev) => {
      const next = new Map(prev);
      const k = ckey(row.source, row.section, row.line, target);
      if (d.comment) next.set(k, d.comment); else next.delete(k);
      return next;
    });
    return true;
  }, [data]);

  const markedCount = useMemo(() => [...comments.values()].filter((c) => c.target !== "line").length, [comments]);
  const lineCount = comments.size - markedCount;

  // ── Columnas visibles ──
  const years = useMemo(() => {
    if (!data) return [] as { y: number; i: number }[];
    const all = data.years.map((y, i) => ({ y, i }));
    return allYears ? all : all.slice(-DEFAULT_YEARS);
  }, [data, allYears]);
  const canToggleYears = !!data && data.years.length > DEFAULT_YEARS;

  const showYears = !isPhone || phoneView === "years";
  const showQuarters = !isPhone || phoneView === "quarters";
  const showVars = !isPhone || phoneView === "var";
  const showComments = !isPhone || phoneView === "var";
  const showLtm = !!data?.ltmLabel && showYears;
  const showYtd = !!data?.ytd && showYears;
  const gaps = !isPhone; // columnas en blanco entre bloques (en teléfono se ve un bloque solo)

  const company = companies?.find((c) => c.ticker === ticker);

  // Bloques de columnas en orden; cada uno sabe pintar su encabezado y sus celdas.
  type Block = { key: string; width: number };
  const blocks: Block[] = data ? [
    ...(showYears ? [{ key: "years", width: years.length + (showLtm ? 1 : 0) }] : []),
    ...(showYtd ? [{ key: "ytd", width: 2 }] : []), // isla propia, separada del LTM

    ...(showQuarters ? [{ key: "quarters", width: data.quarters.length }] : []),
    ...(showVars ? [{ key: "vars", width: 2 }] : []),
    ...(showComments ? [{ key: "comments", width: 1 }] : []),
  ] : [];

  // Valor clickeable: abre el editor y, si tiene comentario, queda encerrado en un círculo.
  const markable = (r: LastFichaRow, target: string, label: string, text: string, color: string) => {
    if (!text) return null;
    const c = comments.get(ckey(r.source, r.section, r.line, target));
    return (
      <button onClick={() => setEditor({ row: r, target, label, value: text })}
        title={c ? `${c.comment}\n— ${who(c.updatedBy)} · ${fmtDate(c.updatedAt)}` : `Marcar y comentar ${r.line} · ${label}`}
        style={{
          font: "inherit", fontVariantNumeric: "tabular-nums", fontWeight: c ? 700 : "inherit", color, cursor: "pointer",
          background: c ? RING_BG : "transparent", border: `1.5px solid ${c ? RING : "transparent"}`, borderRadius: 999,
          padding: "0 6px", margin: "0 -6px", whiteSpace: "nowrap",
        }}>
        {text}
      </button>
    );
  };

  const gapCell = (k: string) => gaps ? <td key={k} style={{ width: GAP_W, minWidth: GAP_W, padding: 0, background: "#fff" }} /> : null;
  const gapHead = (k: string) => gaps ? <th key={k} style={{ width: GAP_W, minWidth: GAP_W, padding: 0, background: "#fff" }} /> : null;

  // Barra oscura de sección: título + etiquetas de todas las columnas (como la hoja).
  const sectionBar = (title: string) => data && (
    <tr>
      <th style={{ ...bar, ...stickyLeft, zIndex: 3, textAlign: "left" }}>{title}</th>
      {blocks.map((b, bi) => (
        <Fragment key={b.key}>
          {bi > 0 && gapHead(`g${b.key}`)}
          {b.key === "years" && <>
            {years.map(({ y }) => <th key={y} style={bar}>{y}</th>)}
            {showLtm && <th style={bar} title={`Últimos 12 meses a ${data.ltmLabel}`}>LTM</th>}
          </>}
          {b.key === "ytd" && <>
            <th style={bar} title="Acumulado n-1: mismo período del año anterior">{data.ytd!.prev}</th>
            <th style={bar} title="Acumulado del año">{data.ytd!.cur}</th>
          </>}
          {b.key === "quarters" && data.quarters.map((p) => <th key={p.label} style={bar}>{qHead(p.fy, p.q)}</th>)}
          {b.key === "vars" && <>
            <th style={bar} title={data.yoyLabel}>YoY</th>
            <th style={bar} title={data.qoqLabel}>QoQ</th>
          </>}
          {b.key === "comments" && <th style={{ ...bar, width: isPhone ? undefined : "30%" }}>Comment</th>}
        </Fragment>
      ))}
    </tr>
  );

  // Fila de una sola banda (subtítulo de KPIs): el color cubre los bloques, no los huecos.
  const bandRow = (label: string, bg: string) => (
    <tr>
      <td style={{ ...td, ...stickyLeft, background: bg, fontWeight: 700, textAlign: "left" }}>{label}</td>
      {blocks.map((b, bi) => (
        <Fragment key={b.key}>
          {bi > 0 && gapCell(`g${b.key}`)}
          <td colSpan={b.width} style={{ ...td, background: bg }} />
        </Fragment>
      ))}
    </tr>
  );

  const valueRow = (r: LastFichaRow, rk: string) => {
    if (r.kind === "blank") return <tr key={rk}><td colSpan={99} style={{ height: 14 }} /></tr>;
    const bg = r.band ? BAND : r.indent && r.source === "statement" ? TINT : "#fff";
    const bt = r.borderTop ? RULE_LINE : undefined;
    const bb = r.borderBottom ? RULE_LINE : undefined;
    const cell: React.CSSProperties = { ...td, background: bg, borderTop: bt, borderBottom: bb ?? td.borderBottom, fontWeight: r.bold || r.band ? 700 : 400, textAlign: r.fmt === "x" ? "center" : "right" };
    const lineC = comments.get(ckey(r.source, r.section, r.line, "line"));
    const col = (v: number | null) => (v == null ? NM_TEXT : TEXT1);
    return (
      <tr key={rk}>
        <td style={{ ...cell, ...stickyLeft, textAlign: "left", paddingLeft: r.indent ? 22 : 6, whiteSpace: isPhone ? "normal" : "nowrap", minWidth: isPhone ? 120 : 210, maxWidth: isPhone ? 150 : undefined }}
          title={r.computed ? "Calculado a partir de las líneas de la ficha" : undefined}>
          {r.line}
          {isPhone && phoneView !== "var" && lineC && <MessageSquare size={10} color={RING} style={{ marginLeft: 4, verticalAlign: "middle" }} />}
        </td>
        {blocks.map((b, bi) => (
          <Fragment key={b.key}>
            {bi > 0 && gapCell(`g${b.key}`)}
            {b.key === "years" && <>
              {years.map(({ y, i }) => (
                <td key={y} style={cell}>{markable(r, yearTarget(y), String(y), fmtVal(r.annual[i], r.fmt), col(r.annual[i]))}</td>
              ))}
              {showLtm && <td style={cell}>{markable(r, "ltm", `LTM ${data!.ltmLabel}`, fmtVal(r.ltm, r.fmt), col(r.ltm))}</td>}
            </>}
            {b.key === "ytd" && <>
              <td style={cell}>{markable(r, "ytdp", `Acumulado ${data!.ytd!.prev}`, fmtVal(r.ytdPrev, r.fmt), col(r.ytdPrev))}</td>
              <td style={cell}>{markable(r, "ytd", `Acumulado ${data!.ytd!.cur}`, fmtVal(r.ytd, r.fmt), col(r.ytd))}</td>
            </>}
            {b.key === "quarters" && data!.quarters.map((p, i) => (
              <td key={p.label} style={cell}>{markable(r, quarterTarget(p.fy, p.q), p.label, fmtVal(r.quarterly[i], r.fmt), col(r.quarterly[i]))}</td>
            ))}
            {b.key === "vars" && (["yoy", "qoq"] as const).map((t) => {
              const v = fmtVar(r[t], r.fmt);
              return (
                <td key={t} style={{ ...cell, textAlign: "center" }}>
                  {markable(r, t, `Var% ${t.toUpperCase()} (${t === "yoy" ? data!.yoyLabel : data!.qoqLabel})`, v.text, v.color)}
                </td>
              );
            })}
            {b.key === "comments" && (
              <td style={{ ...cell, textAlign: "left", padding: "1px 6px", minWidth: isPhone ? 44 : 360, whiteSpace: "normal", fontWeight: 400 }}>
                {isPhone ? (
                  <button onClick={() => setEditor({ row: r, target: "line", label: "Comentario de la línea", value: "" })}
                    title={lineC?.comment ?? "Comentar esta línea"} style={{ ...iconBtn, width: 30, height: 26, color: lineC ? RING : TEXT3, borderColor: lineC ? RING : BORDER }}>
                    <MessageSquare size={13} />
                  </button>
                ) : (
                  <LineComment
                    key={`${data!.base.fy}-${data!.base.q}-${r.section}-${r.line}`}
                    value={lineC?.comment ?? ""}
                    meta={lineC ? `${who(lineC.updatedBy)} · ${fmtDate(lineC.updatedAt)}` : null}
                    onSave={(text) => saveComment(r, "line", text)}
                  />
                )}
              </td>
            )}
          </Fragment>
        ))}
      </tr>
    );
  };

  return (
    <div>
      {/* ── Encabezado (nombre + FX, como la hoja) y controles ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 28, minWidth: 0, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT1, letterSpacing: "-0.02em", margin: 0, fontFamily: FONT_PRIMARY }}>
              {data?.name ?? data?.ticker ?? "Last Ficha"}
            </h2>
            {data && (
              <div style={{ fontSize: 11.5, color: TEXT2, marginTop: 3, fontFamily: FONT_SECONDARY }}>
                {data.ticker} · {data.currency} millones{data.converted ? ` (convertido desde ${data.reportedCurrency} con el FX de la última subida)` : ""} · ficha cargada el {fmtDate(data.updatedAt)}
              </div>
            )}
          </div>
          {data?.fx != null && (
            <div style={{ fontFamily: FONT_SECONDARY }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: TEXT1, marginBottom: 3 }}>FX (if is chilean ficha in CLP expr. In USD)</div>
              <div style={{ display: "inline-block", minWidth: 70, padding: "3px 10px", textAlign: "center", fontSize: 12, fontWeight: 700, color: PATRIA.blue, background: "rgba(255,187,141,0.35)", border: `1.5px solid ${PATRIA.darkBlue}` }}>
                {data.fx.toLocaleString("en-US")}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <CompanyPicker companies={companies ?? []} value={ticker} onChange={chooseTicker} />
          {data && (
            <label style={ctrlBox} title="Trimestre que se revisa: las Var% y los comentarios son de este trimestre">
              <span style={ctrlLabel}>Trimestre</span>
              <select value={`${data.base.fy}-${data.base.q}`} onChange={(e) => setBaseKey(e.target.value)} style={selectStyle}>
                {data.periods.map((p) => <option key={`${p.fy}-${p.q}`} value={`${p.fy}-${p.q}`}>{p.label}</option>)}
              </select>
            </label>
          )}
          {data?.reportedCurrency === "CLP" && (
            <div style={{ ...ctrlBox, padding: 2, gap: 0 }} title="Fichas en CLP: montos en USD con el FX de la última subida, o en CLP como vienen">
              {([false, true] as const).map((loc) => (
                <button key={String(loc)} onClick={() => setLocal(loc)}
                  style={{ padding: "3px 10px", fontSize: 11.5, fontWeight: 700, border: "none", borderRadius: 4, cursor: "pointer", background: local === loc ? PATRIA.kingBlue : "transparent", color: local === loc ? "#fff" : TEXT2 }}>
                  {loc ? "CLP" : "USD"}
                </button>
              ))}
            </div>
          )}
          {canToggleYears && (
            <button onClick={() => setAllYears((v) => !v)} style={{ ...ctrlBox, cursor: "pointer", fontSize: 11.5, fontWeight: 700, color: PATRIA.kingBlue }}
              title={allYears ? `Volver a los últimos ${DEFAULT_YEARS} años` : `Ver los ${data!.years.length} años de la ficha`}>
              {allYears ? `Ver ${DEFAULT_YEARS} años` : `Ver ${data!.years.length} años`}
            </button>
          )}
          {data && (
            <div style={{ ...ctrlBox, gap: 10, fontSize: 11, color: TEXT2 }} title="Comentarios de fila y celdas marcadas con círculo en este trimestre">
              <span><b style={{ color: TEXT1 }}>{lineCount}</b> comentarios</span>
              <span><b style={{ color: RING }}>{markedCount}</b> marcadas</span>
            </div>
          )}
          {ticker && (
            <button onClick={() => load(ticker, baseKey, local)} disabled={loading} title="Volver a leer la ficha" style={iconBtn}>
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

      {linkMiss && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", marginBottom: 10, borderRadius: 6, fontSize: 12, color: TEXT1, background: "rgba(255,107,6,0.08)", border: "1px solid rgba(255,107,6,0.28)" }}>
          {linkMiss} todavía no tiene ficha cargada (se sube con la macro “Send Ficha”); se muestra otra compañía.
          <button onClick={() => setLinkMiss(null)} aria-label="Cerrar" style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: TEXT3 }}><X size={13} /></button>
        </div>
      )}

      {/* Ficha PDF de Presentations: comentario del quarter + PDF. */}
      {data && docs && <FichaDocPanel docs={docs} baseLabel={data.base.label} />}

      {error && <div style={{ padding: 24, textAlign: "center", color: NEG, fontSize: 13 }}>{error}</div>}
      {!error && companies && companies.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", color: TEXT3, fontSize: 13 }}>Todavía no hay fichas cargadas. Se suben con la macro “Send Ficha”.</div>
      )}
      {!data && !error && (companies == null || loading) && (
        <div style={{ padding: 24, textAlign: "center", color: TEXT3, fontSize: 13 }}>Cargando ficha…</div>
      )}

      {data && (
        <div className="scroll-x" style={{ background: "#fff", opacity: loading ? 0.6 : 1, maxHeight: isPhone ? "75dvh" : undefined, overflowY: isPhone ? "auto" : undefined }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", fontFamily: FONT_SECONDARY, fontSize: 11, color: TEXT1 }}>
            <tbody>
              {data.sections.map((s, si) => {
                const prev = data.sections[si - 1];
                const newBlock = s.source !== "kpi" || prev?.source !== "kpi"; // los KPIs comparten una sola barra
                return (
                  <Fragment key={`${s.source}|${s.section}`}>
                    {newBlock && si > 0 && <tr><td colSpan={99} style={{ height: 18 }} /></tr>}
                    {newBlock && sectionBar(s.title)}
                    {s.source === "kpi" && bandRow(s.section, TINT)}
                    {s.rows.map((r, ri) => valueRow(r, `${ri}|${r.line}`))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <div style={{ fontSize: 10.5, color: TEXT3, marginTop: 8, lineHeight: 1.5 }}>
          YoY = {data.yoyLabel} · QoQ = {data.qoqLabel}. Montos: variación porcentual; ratios y múltiplos: diferencia (pp / x). “NM” = base cero o cambio de signo.
          {data.ltmLabel ? ` LTM a ${data.ltmLabel}.` : ""}{data.ytd ? ` Acumulados: ${data.ytd.prev} y ${data.ytd.cur}.` : ""}
          {data.converted ? ` Montos en USD = ${data.reportedCurrency} ÷ ${data.fx?.toLocaleString("en-US")}; ratios y KPIs como vienen en la hoja.` : ""} Márgenes, Net Debt / EBITDA, Net Debt / Equity, ROE y ROIC se calculan a partir de las líneas de la ficha.
          Los comentarios y las marcas son del trimestre {data.base.label}: al elegir otro trimestre se ven los suyos.
          {company?.lastLabel && company.lastLabel !== data.base.label ? ` La ficha llega hasta ${company.lastLabel}.` : ""}
        </div>
      )}

      {editor && data && (
        <CommentEditor
          title={editor.target === "line" ? editor.row.line : `${editor.row.line} · ${editor.label}`}
          subtitle={editor.target === "line" ? `${editor.row.section} · ${data.base.label}` : `${editor.row.section} · valor: ${editor.value}`}
          placeholder={editor.target === "line" ? "Comentario sobre esta línea…" : "¿Qué explica este número?"}
          initial={comments.get(ckey(editor.row.source, editor.row.section, editor.row.line, editor.target))}
          onClose={() => setEditor(null)}
          onSave={(text) => saveComment(editor.row, editor.target, text)}
        />
      )}
    </div>
  );
}

// ── Ficha PDF de Presentations ──────────────────────────────────────────────────
// La ficha individual (hay una viva por ticker: subir otra la reemplaza) con su comentario
// del quarter y el PDF; debajo, las multi-empresa que incluyen a la compañía. El
// comentario se recorta a unas líneas con "Ver todo" para no empujar la tabla.
const CLAMP_PX = 118;

function FichaDocPanel({ docs, baseLabel }: { docs: FichaDoc[]; baseLabel: string }) {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const main = docs.find((d) => !d.multi) ?? null;
  const multis = docs.filter((d) => d.multi);
  const text = main?.description?.trim() ?? "";
  useEffect(() => {
    const el = textRef.current;
    setOverflows(!!el && el.scrollHeight > CLAMP_PX + 4);
  }, [text]);

  if (!main && multis.length === 0) {
    return (
      <div style={{ fontSize: 11.5, color: TEXT3, marginBottom: 12 }}>
        Sin ficha PDF en Presentations para esta compañía (se sube en Presentations → Fichas).
      </div>
    );
  }
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderLeft: `3px solid ${PATRIA.orange}`, borderRadius: 8, background: "#fff", marginBottom: 14, overflow: "hidden" }}>
      {main && <>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 12px", background: SURFACE, borderBottom: text ? `1px solid ${BORDER}` : undefined }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#C25205", background: "rgba(255,107,6,0.10)", border: "1px solid rgba(255,107,6,0.28)", borderRadius: 5, padding: "2px 7px" }}>
            <MessageSquareText size={11} /> Earnings comment
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: TEXT1, background: "rgba(13,13,56,0.06)", border: "1px solid rgba(13,13,56,0.14)", borderRadius: 5, padding: "1px 7px", fontFamily: FONT_SECONDARY }}>{main.quarter_label}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: TEXT1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 200px" }}>{main.title}</span>
          {main.quarter_label !== baseLabel && (
            <span style={{ fontSize: 10.5, color: PATRIA.orange, fontWeight: 600 }} title="La ficha PDF es de otro trimestre que el que se está revisando">
              ≠ trimestre {baseLabel}
            </span>
          )}
          <span style={{ fontSize: 10.5, color: TEXT3, fontFamily: FONT_SECONDARY }}>subida el {fmtDate(main.created_at)}</span>
          <PdfButton href={main.file_url} />
        </div>
        {text && (
          <div style={{ padding: "10px 14px" }}>
            <p ref={textRef} style={{ margin: 0, fontFamily: FONT_SECONDARY, fontSize: 12.5, lineHeight: 1.6, color: TEXT1, whiteSpace: "pre-wrap", maxHeight: open ? undefined : CLAMP_PX, overflow: "hidden", position: "relative" }}>
              {text}
            </p>
            {(overflows || open) && (
              <button onClick={() => setOpen((v) => !v)} style={{ marginTop: 6, background: "none", border: "none", padding: 0, fontSize: 11.5, fontWeight: 700, color: PATRIA.kingBlue, cursor: "pointer" }}>
                {open ? "Ver menos" : "Ver todo el comentario"}
              </button>
            )}
          </div>
        )}
      </>}
      {multis.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "7px 12px", borderTop: main ? `1px solid ${BORDER}` : undefined, fontSize: 11.5, color: TEXT2 }}>
          <span style={{ fontWeight: 700 }}>También en fichas multi-empresa:</span>
          {multis.map((m) => (
            <a key={m.id} href={m.file_url} target="_blank" rel="noopener noreferrer" title={m.description ?? m.title}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, color: PATRIA.kingBlue, fontWeight: 600, textDecoration: "none" }}>
              <Download size={11} /> {m.title} · {m.quarter_label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function PdfButton({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px", borderRadius: 6, fontSize: 11.5, fontWeight: 700, color: PATRIA.kingBlue, background: "rgba(32,68,220,0.08)", border: "1px solid rgba(32,68,220,0.22)", textDecoration: "none", whiteSpace: "nowrap" }}>
      <Download size={12} /> PDF
    </a>
  );
}

// ── Buscador de compañías ───────────────────────────────────────────────────────
// Filtra por nombre o ticker mientras se escribe; flechas + Enter para elegir.
function CompanyPicker({ companies, value, onChange }: {
  companies: LastFichaCompany[]; value: string | null; onChange: (ticker: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = companies.find((c) => c.ticker === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => (c.name ?? "").toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q));
  }, [companies, query]);

  useEffect(() => { setHi(0); }, [query, open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (t: string) => { onChange(t); setOpen(false); setQuery(""); inputRef.current?.blur(); };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <div style={{ ...ctrlBox, padding: "3px 8px", minWidth: 250 }}>
        <Search size={13} color={TEXT3} />
        <input ref={inputRef} value={open ? query : current ? `${current.name ?? current.ticker}` : ""}
          placeholder={open ? "Buscar compañía o ticker…" : "Compañía"}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Enter" && matches[hi]) pick(matches[hi].ticker);
            else if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
          }}
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 12, fontFamily: FONT_SECONDARY, color: TEXT1, fontWeight: open ? 400 : 700 }} />
        {!open && current?.lastLabel && <span style={{ fontSize: 10, color: TEXT3, fontFamily: FONT_SECONDARY }}>{current.lastLabel}</span>}
        <ChevronDown size={13} color={TEXT3} />
      </div>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, left: 0, zIndex: 40, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(13,13,56,0.16)", maxHeight: 320, overflowY: "auto", minWidth: 250 }}>
          {matches.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12, color: TEXT3 }}>Sin resultados</div>}
          {matches.map((c, i) => (
            <button key={c.ticker} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c.ticker)} onMouseEnter={() => setHi(i)}
              style={{ display: "flex", alignItems: "baseline", gap: 8, width: "100%", textAlign: "left", padding: "7px 12px", border: "none", cursor: "pointer", background: i === hi ? SURFACE : "#fff", borderLeft: `3px solid ${c.ticker === value ? PATRIA.kingBlue : "transparent"}` }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: TEXT1 }}>{c.name ?? c.ticker}</span>
              <span style={{ fontSize: 10, color: TEXT3, fontFamily: FONT_SECONDARY, whiteSpace: "nowrap" }}>{c.ticker}{c.lastLabel ? ` · ${c.lastLabel}` : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Comentario de fila (escritorio): se guarda al salir del campo ─────────────────
function LineComment({ value, meta, onSave }: { value: string; meta: string | null; onSave: (text: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setDraft(value); }, [value]);
  // Alto al contenido: una línea vacía, crece con el texto.
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.max(20, el.scrollHeight)}px`;
  }, [draft]);
  const commit = async () => {
    setFocused(false);
    if (draft.trim() === value.trim()) return;
    setState("saving");
    setState((await onSave(draft)) ? "idle" : "error");
  };
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
      <textarea ref={ref} value={draft} rows={1} placeholder={focused ? "Agregar comentario…" : ""}
        onChange={(e) => setDraft(e.target.value)} onFocus={() => setFocused(true)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur(); }}
        style={{
          flex: 1, resize: "none", overflow: "hidden", fontFamily: FONT_SECONDARY, fontSize: 11, lineHeight: 1.35, color: TEXT1,
          padding: "1px 5px", borderRadius: 4, outline: "none",
          border: `1px solid ${state === "error" ? NEG : focused ? PATRIA.kingBlue : draft ? "rgba(255,107,6,0.45)" : "transparent"}`,
          background: draft || focused ? "#fff" : "transparent",
        }}
      />
      {(state !== "idle" || meta) && (
        <span style={{ fontSize: 9.5, color: state === "error" ? NEG : TEXT3, whiteSpace: "nowrap", paddingTop: 3 }}>
          {state === "saving" ? "guardando…" : state === "error" ? "no se guardó" : meta}
        </span>
      )}
    </div>
  );
}

// ── Editor modal (celdas marcadas; y comentarios de fila en teléfono) ─────────────
function CommentEditor({ title, subtitle, placeholder, initial, onClose, onSave }: {
  title: string; subtitle: string; placeholder: string; initial: LastFichaComment | undefined;
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
      <div className="modal-card" style={{ width: 480, maxWidth: "100%", background: "#fff", borderRadius: 10, boxShadow: "0 12px 40px rgba(13,13,56,0.25)", overflow: "hidden" }}>
        <div style={{ background: PATRIA.darkBlue, color: "#fff", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_PRIMARY, fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{subtitle}</div>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Cerrar" style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}><X size={16} /></button>
        </div>
        <div style={{ padding: 14 }}>
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={placeholder}
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
const stickyLeft: React.CSSProperties = { position: "sticky", left: 0, zIndex: 1 };
// Barra de sección (la franja oscura de la hoja): título a la izquierda, etiquetas centradas.
const bar: React.CSSProperties = {
  background: PATRIA.darkBlue, color: "#fff", fontFamily: FONT_SECONDARY, fontWeight: 700, fontSize: 10.5,
  padding: "3px 8px", textAlign: "center", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "1px 8px", lineHeight: 1.35, textAlign: "right", color: TEXT1, fontVariantNumeric: "tabular-nums",
  borderBottom: "1px solid transparent", whiteSpace: "nowrap", verticalAlign: "middle",
};
const ctrlBox: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, background: SURFACE };
const ctrlLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: TEXT2 };
const selectStyle: React.CSSProperties = { padding: "3px 6px", fontSize: 12, fontFamily: FONT_SECONDARY, border: `1px solid ${BORDER}`, borderRadius: 4, background: "#fff", color: TEXT1, outline: "none", cursor: "pointer", maxWidth: 260 };
const iconBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT1, cursor: "pointer" };
