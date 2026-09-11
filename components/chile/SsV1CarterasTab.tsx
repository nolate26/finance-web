"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, FileSpreadsheet, AlertTriangle, Check, X, RefreshCw, Copy, Wallet } from "lucide-react";
import { PATRIA, FONT_SECONDARY, TEXT } from "@/lib/patriaTheme";
import type { CarteraUploadResult, CarteraIssue } from "@/app/api/chile/carteras/upload/route";
import type { CarterasPayload } from "@/app/api/chile/carteras/route";

// ── Pestaña "Carteras" ──────────────────────────────────────────────────────────
// Carga del Excel mensual de posiciones. Dos pasos a propósito: primero un PREVIEW que
// no escribe nada y lista los tickers que no cruzan, después la confirmación. El preview
// es el punto del módulo: el cruce es sólo por ticker, así que un ticker mal escrito no
// falla ruidosamente — la posición simplemente no aparecería en el fondo. Acá se ve antes.

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

const PROBLEM_META: Record<CarteraIssue["problem"], { label: string; hint: string; color: string }> = {
  "sin-ticker":   { label: "Sin ticker",      hint: "La columna B viene vacía. El cruce es por ticker, así que la fila no entra.", color: NEG },
  "sin-match":    { label: "Ticker no existe", hint: "Ese ticker no corresponde a ninguna fila de Stock Selection. Suele ser el sufijo (CC vs CI) o un ticker viejo.", color: NEG },
  "sin-acciones": { label: "Sin nº de acciones", hint: "La compañía existe pero no tiene acciones cargadas en Stock Selection: sin denominador no hay ponderador.", color: WARN },
};

const fmtMn = (v: number): string => v.toLocaleString("es-CL", { maximumFractionDigits: 3 });
const fmtDate = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : iso;
};
/** "2026-09-01" → "2026-09", que es lo que espera <input type="month">. */
const toMonth = (iso: string): string => iso.slice(0, 7);
const thisMonth = (): string => new Date().toISOString().slice(0, 7);

export default function SsV1CarterasTab({ onSourceChanged }: { onSourceChanged: () => void }) {
  const [current, setCurrent] = useState<CarterasPayload | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [asOf, setAsOf] = useState<string>(thisMonth());
  const [preview, setPreview] = useState<CarteraUploadResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const loadCurrent = useCallback(() => {
    fetch("/api/chile/carteras")
      .then((r) => r.json())
      .then((d: CarterasPayload) => setCurrent(d))
      .catch(() => {/* sin foto cargada todavía */});
  }, []);
  useEffect(loadCurrent, [loadCurrent]);

  const send = useCallback((f: File, month: string, confirm: boolean) => {
    setBusy(confirm ? "confirm" : "preview");
    setError(null);
    if (!confirm) { setPreview(null); setDone(null); }
    const fd = new FormData();
    fd.append("file", f);
    fd.append("asOf", `${month}-01`);
    if (confirm) fd.append("confirm", "true");
    fetch("/api/chile/carteras/upload", { method: "POST", body: fd })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "No se pudo procesar el archivo");
        return d as CarteraUploadResult;
      })
      .then((d) => {
        setPreview(d);
        if (d.confirmed) {
          setDone(`${d.escritas ?? 0} posiciones guardadas para ${fmtDate(d.asOf)}.`);
          setFile(null);
          loadCurrent();
          onSourceChanged();
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(null));
  }, [loadCurrent, onSourceChanged]);

  const take = (f: File | null | undefined) => {
    if (!f) return;
    if (!/\.xlsx?$/i.test(f.name)) { setError("El archivo tiene que ser .xlsx"); return; }
    setFile(f);
    send(f, asOf, false);
  };

  const copyIssues = () => {
    if (!preview) return;
    const tsv = ["Nombre\tTicker en el Excel\tProblema\tFondos con posición",
      ...preview.issues.map((i) =>
        [i.company, i.tickerRaw, PROBLEM_META[i.problem].label,
         i.posiciones.map((p) => `${p.fondo}=${fmtMn(p.shares)}`).join(" ")].join("\t"))].join("\n");
    navigator.clipboard?.writeText(tsv).then(() => setDone("Lista copiada al portapapeles."), () => {});
  };

  const th: React.CSSProperties = { padding: "6px 8px", textAlign: "left", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fff", background: NAVY, whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "5px 8px", borderBottom: `1px solid ${BORDER}`, fontSize: 11, color: TEXT1, verticalAlign: "middle" };

  // Las que se llevan una posición puesta van primero: son las que hay que arreglar hoy.
  const issues = [...(preview?.issues ?? [])].sort((a, b) => b.posiciones.length - a.posiciones.length);
  // Cambios de estructura respecto de la foto vigente. La lista de fondos es dinámica, así
  // que un fondo nuevo o uno que dejó de venir son hechos normales — pero conviene verlos.
  const vigentes = current?.fondos ?? [];
  const nuevos = (preview?.fondos ?? []).filter((f) => vigentes.length > 0 && !vigentes.includes(f));
  const salieron = vigentes.filter((f) => preview && !preview.fondos.includes(f));

  return (
    <div style={{ padding: "10px 12px 12px" }}>

      {/* ── Estado actual ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 10, padding: "7px 11px", borderRadius: 7, background: SURFACE, border: `1px solid ${BORDER}` }}>
        <Wallet size={13} color={INK} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: TEXT1 }}>Cartera vigente</span>
        {current?.asOf ? (
          <>
            <span style={{ ...NUMF, fontSize: 11.5, color: INK, fontWeight: 700 }}>{fmtDate(current.asOf)}</span>
            <span style={{ fontSize: 11, color: TEXT2 }}>
              {current.fondos.length} fondos · <span style={NUMF}>{Object.keys(current.holdings).length}</span> posiciones
            </span>
            {current.source && <span style={{ fontSize: 10.5, color: TEXT3 }}>desde {current.source}</span>}
          </>
        ) : (
          <span style={{ fontSize: 11, color: TEXT3 }}>Todavía no hay ninguna cartera cargada.</span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={loadCurrent} title="Recargar"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", color: NAVY, cursor: "pointer" }}>
          <RefreshCw size={12} />
        </button>
      </div>

      {/* ── Zona de carga ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files?.[0]); }}
          onClick={() => inputRef.current?.click()}
          role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
          style={{
            flex: "1 1 320px", minHeight: 92, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5,
            padding: "14px 16px", borderRadius: 9, cursor: "pointer", textAlign: "center",
            border: `1.5px dashed ${drag ? INK : "rgba(13,13,56,0.20)"}`,
            background: drag ? "rgba(32,68,220,0.06)" : "#fff", transition: "background 0.12s, border-color 0.12s",
          }}>
          {busy === "preview" ? <RefreshCw size={17} color={INK} style={{ animation: "spin 0.8s linear infinite" }} />
            : file ? <FileSpreadsheet size={17} color={INK} />
            : <Upload size={17} color={TEXT3} />}
          <span style={{ fontSize: 12, fontWeight: 700, color: file ? INK : TEXT1 }}>
            {busy === "preview" ? "Leyendo el archivo…" : file ? file.name : "Arrastrá el Excel de carteras acá"}
          </span>
          <span style={{ fontSize: 10.5, color: TEXT3, maxWidth: 380 }}>
            .xlsx con Nombre en A, Ticker en B y un fondo por columna desde la C. Acciones en millones, series A/B por separado y sin la fila que las suma.
            Los fondos salen del encabezado: agregá o sacá columnas y la tabla se adapta sola.
          </span>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" hidden
            onChange={(e) => { take(e.target.files?.[0]); e.currentTarget.value = ""; }} />
        </div>

        <div style={{ flex: "0 0 180px", display: "flex", flexDirection: "column", gap: 6, justifyContent: "center", padding: "0 4px" }}>
          <label style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: TEXT3 }}>Mes de la foto</label>
          <input type="month" value={asOf}
            onChange={(e) => { setAsOf(e.target.value); if (file) send(file, e.target.value, false); }}
            style={{ ...NUMF, padding: "6px 9px", borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT1, fontSize: 12, outline: "none" }} />
          <span style={{ fontSize: 10, color: TEXT3, lineHeight: 1.4 }}>
            La carga <strong>reemplaza</strong> la foto completa de este mes.
          </span>
        </div>
      </div>

      {/* ── Mensajes ────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9, padding: "7px 11px", borderRadius: 7, background: "rgba(248,72,94,0.08)", border: `1px solid ${NEG}44`, color: NEG, fontSize: 11.5 }}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}
      {done && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9, padding: "7px 11px", borderRadius: 7, background: "rgba(0,30,175,0.07)", border: `1px solid ${POS}44`, color: POS, fontSize: 11.5 }}>
          <Check size={13} /> {done}
        </div>
      )}

      {/* ── Preview ─────────────────────────────────────────────────────────── */}
      {preview && !preview.confirmed && (
        <div style={{ marginTop: 12, border: `1px solid ${BORDER}`, borderRadius: 9, overflow: "hidden", background: "#fff" }}>

          {/* Resumen */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "9px 12px", background: SURFACE, borderBottom: `1px solid ${BORDER}` }}>
            <Stat label="Filas" value={preview.filas} />
            <Stat label="Cruzan" value={preview.cruzan} color={POS} />
            <Stat label="No cruzan" value={preview.issues.length} color={preview.issues.length ? WARN : TEXT2} />
            <Stat label="Fondos" value={preview.fondos.length} />
            <span style={{ fontSize: 11, color: TEXT2 }}>
              Hoja <strong>{preview.sheet}</strong> · <strong style={{ color: INK }}>{preview.fondos.join(" · ")}</strong>
            </span>
          </div>

          {/* Los fondos salen del encabezado del archivo, sin lista fija: conviene que se
              vea qué detectó antes de escribir, sobre todo si cambió la estructura. */}
          {nuevos.length > 0 && (
            <Warn color={INK} text={`Fondos que no estaban en la cartera vigente y se van a crear: ${nuevos.join(", ")}.`} />
          )}
          {salieron.length > 0 && (
            <Warn text={`Fondos de la cartera vigente que este archivo ya no trae: ${salieron.join(", ")}. No se van a ver en la tabla de este mes.`} />
          )}
          {preview.columnasIgnoradas.length > 0 && (
            <Warn text={`Columnas del encabezado que no se tomaron como fondo porque no tienen ningún número debajo: ${preview.columnasIgnoradas.join(", ")}.`} />
          )}

          {/* La alerta que importa: posiciones que se perderían */}
          {preview.issuesConPosicion > 0 && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px", background: "rgba(248,72,94,0.07)", borderBottom: `1px solid ${NEG}33` }}>
              <AlertTriangle size={14} color={NEG} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 11.5, color: TEXT1, lineHeight: 1.5 }}>
                <strong style={{ color: NEG }}>
                  {preview.issuesConPosicion} {preview.issuesConPosicion === 1 ? "fila con posición no cruza" : "filas con posición no cruzan"}
                </strong>{" "}
                — si confirmás así, esas posiciones <strong>no</strong> van a entrar al cálculo de sus fondos. Corregí el ticker en el Excel y volvé a subirlo.
              </div>
            </div>
          )}
          {preview.duplicados.length > 0 && (
            <Warn text={`Ticker repetido en el archivo (gana la última fila): ${preview.duplicados.join(", ")}`} />
          )}
          {preview.colisiones.length > 0 && (
            <Warn text={`Estos tickers apuntan a dos filas distintas de la tabla — la homologación está rota: ${preview.colisiones.join(", ")}`} />
          )}

          {/* Tabla de tickers que fallaron */}
          {issues.length > 0 && (
            <div style={{ maxHeight: 280, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...th, position: "sticky", top: 0, zIndex: 2 }}>Nombre</th>
                    <th style={{ ...th, position: "sticky", top: 0, zIndex: 2 }}>Ticker en el Excel</th>
                    <th style={{ ...th, position: "sticky", top: 0, zIndex: 2 }}>Problema</th>
                    <th style={{ ...th, position: "sticky", top: 0, zIndex: 2 }}>Fondos con posición</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((i, n) => {
                    const meta = PROBLEM_META[i.problem];
                    const pierde = i.posiciones.length > 0;
                    return (
                      <tr key={`${i.company}-${i.tickerRaw}-${n}`} style={{ background: pierde ? "rgba(248,72,94,0.05)" : n % 2 ? SURFACE : "#fff" }}>
                        <td style={{ ...td, fontWeight: 700 }}>{i.company || <span style={{ color: TEXT3 }}>—</span>}</td>
                        <td style={{ ...td, ...NUMF, color: i.tickerRaw ? TEXT1 : TEXT3 }}>{i.tickerRaw || "(vacío)"}</td>
                        <td style={td}>
                          <span title={meta.hint}
                            style={{ display: "inline-block", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: meta.color, background: `${meta.color}18`, border: `1px solid ${meta.color}55`, borderRadius: 4, padding: "1px 6px", cursor: "help" }}>
                            {meta.label}
                          </span>
                        </td>
                        <td style={{ ...td, ...NUMF, fontSize: 10.5, color: pierde ? NEG : TEXT3, fontWeight: pierde ? 700 : 400 }}>
                          {pierde ? i.posiciones.map((p) => `${p.fondo} ${fmtMn(p.shares)}`).join("  ·  ") : "sin posición"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Resumen por fondo */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "9px 12px", borderTop: `1px solid ${BORDER}` }}>
            {preview.resumen.map((r) => (
              <div key={r.fondo} style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "4px 9px", borderRadius: 6, background: SURFACE, border: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: TEXT1 }}>{r.fondo}</span>
                <span style={{ ...NUMF, fontSize: 11, color: POS }}>{r.empresas}</span>
                {r.empresasPerdidas > 0 && (
                  <span style={{ ...NUMF, fontSize: 10, fontWeight: 700, color: NEG }} title="posiciones que no cruzan">−{r.empresasPerdidas}</span>
                )}
              </div>
            ))}
          </div>

          {/* Acciones */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderTop: `1px solid ${BORDER}`, background: SURFACE }}>
            <button onClick={() => file && send(file, asOf, true)} disabled={busy != null || !file}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: "none", background: busy ? TEXT3 : INK, color: "#fff", fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer" }}>
              {busy === "confirm" ? <RefreshCw size={13} style={{ animation: "spin 0.8s linear infinite" }} /> : <Check size={13} />}
              Confirmar carga de {fmtDate(preview.asOf)}
            </button>
            <button onClick={() => { setPreview(null); setFile(null); }}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 7, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT2, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              <X size={13} /> Cancelar
            </button>
            {issues.length > 0 && (
              <button onClick={copyIssues}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 7, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT2, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <Copy size={12} /> Copiar los que fallan
              </button>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: TEXT3 }}>Nada se guardó todavía.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color = TEXT1 }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
      <span style={{ ...NUMF, fontSize: 15, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: TEXT3 }}>{label}</span>
    </div>
  );
}

function Warn({ text, color = WARN }: { text: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", background: `${color}12`, borderBottom: `1px solid ${color}33`, fontSize: 11.5, color: TEXT1, lineHeight: 1.5 }}>
      <AlertTriangle size={13} color={color} style={{ flexShrink: 0, marginTop: 2 }} /> {text}
    </div>
  );
}
