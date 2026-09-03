"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { FONT_SECONDARY, PATRIA, TEXT, BORDER, SURFACE } from "@/lib/patriaTheme";
import type { UnmappedTicker, UnmappedDetail, UnmappedHeader } from "@/app/api/companies/unmapped/route";

const COL = "190px 150px minmax(150px,1fr) 100px";

// País y moneda que corresponden al sufijo de plaza del ticker Bloomberg. Sólo se usa
// para pre-cargar el formulario de alta — el admin puede cambiarlo. "US" no está: los
// ADR listados en Nueva York son de países distintos (BR, MX, CL, AR…) y adivinar ahí
// mete el riesgo país equivocado, así que se deja en blanco a propósito.
const PLAZA: Record<string, { country: string; moneda: string }> = {
  AR: { country: "AR", moneda: "ARS" },
  BZ: { country: "BR", moneda: "BRL" },
  CB: { country: "CO", moneda: "COP" },
  CI: { country: "CL", moneda: "CLP" },
  MM: { country: "MX", moneda: "MXN" },
  PE: { country: "PE", moneda: "PEN" },
};

/** "AMXL MM EQUITY" → { country: "MX", moneda: "MXN" }. Sufijo desconocido → vacíos. */
function plazaDefaults(ticker: string): { country: string; moneda: string } {
  const suf = ticker.split(" ")[1] ?? "";
  return PLAZA[suf] ?? { country: "", moneda: "" };
}

const inputStyle: React.CSSProperties = {
  fontSize: 11, fontFamily: FONT_SECONDARY, fontWeight: 600,
  padding: "4px 9px", borderRadius: 5,
  border: `1px solid ${BORDER.subtle}`, background: SURFACE.card,
  color: PATRIA.darkBlue, outline: "none",
};

// ── Detalle de un ticker ──────────────────────────────────────────────────────

function HeaderTable({ title, rows }: { title: string; rows: UnmappedHeader[] }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: TEXT.muted, marginBottom: 5 }}>
        {title}
      </div>
      <div style={{ border: `1px solid ${BORDER.base}`, borderRadius: 7, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "96px 1fr 74px 84px 84px", gap: "0 10px",
          padding: "5px 10px", background: SURFACE.subtle, borderBottom: `1px solid ${BORDER.subtle}`,
        }}>
          {["Fecha", "Analista", "Recc", "TP", "Moneda"].map((h) => (
            <div key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: TEXT.muted }}>
              {h}
            </div>
          ))}
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "96px 1fr 74px 84px 84px", gap: "0 10px",
            padding: "5px 10px", borderBottom: i < rows.length - 1 ? `1px solid ${BORDER.subtle}` : "none",
            fontSize: 10.5, color: PATRIA.darkBlue, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
          }}>
            <div>{r.updateDate}</div>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.analyst ?? "—"}</div>
            <div>{r.recc ?? "—"}</div>
            <div>{r.tp != null ? r.tp.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}</div>
            <div style={{ color: TEXT.muted }}>{r.currency ?? "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TickerDetail({ ticker }: { ticker: string }) {
  const [detail, setDetail] = useState<UnmappedDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/companies/unmapped?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: UnmappedDetail | null) => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 16px", color: TEXT.muted, fontSize: 11 }}>
        <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} /> Cargando detalle…
      </div>
    );
  }
  if (!detail) {
    return <div style={{ padding: "12px 16px", fontSize: 11, color: PATRIA.pink }}>No se pudo cargar el detalle.</div>;
  }

  const c = detail.consensus;

  return (
    <div style={{ padding: "12px 16px 14px", background: SURFACE.subtle, borderBottom: `1px solid ${BORDER.base}` }}>
      <HeaderTable title="Modelos de analista" rows={detail.modelHeaders} />
      <HeaderTable title="Modelos de banco"    rows={detail.bankHeaders} />

      {c.rows > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: TEXT.muted, marginBottom: 5 }}>
            Consensus estimates
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8,
            fontSize: 10.5, color: PATRIA.darkBlue, fontFamily: FONT_SECONDARY,
          }}>
            <div><span style={{ color: TEXT.muted }}>Filas: </span><strong>{c.rows.toLocaleString("en-US")}</strong></div>
            <div><span style={{ color: TEXT.muted }}>Rango: </span>{c.minDate} → {c.maxDate}</div>
            <div><span style={{ color: TEXT.muted }}>Períodos: </span>{c.periods.join(", ") || "—"}</div>
            <div style={{ gridColumn: "1 / -1" }}>
              <span style={{ color: TEXT.muted }}>Métricas: </span>{c.metrics.join(", ") || "—"}
            </div>
          </div>
        </div>
      )}

      {detail.otherData.length > 0 && (
        <div style={{
          fontSize: 10.5, color: TEXT.label, lineHeight: 1.6,
          background: SURFACE.card, border: `1px solid ${BORDER.base}`, borderRadius: 7, padding: "8px 10px",
        }}>
          <strong style={{ color: PATRIA.darkBlue }}>Este ticker también tiene series de mercado</strong> que el
          borrado <strong>no</strong> toca (no dependen de la maestra):{" "}
          <span style={{ fontFamily: FONT_SECONDARY }}>
            {detail.otherData.map((o) => `${o.table} (${o.rows.toLocaleString("en-US")})`).join(" · ")}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Alerta ────────────────────────────────────────────────────────────────────

/**
 * Alerta de admin: tickers con datos que no existen en `empresas_industrias_v2`.
 *
 * El sidebar se arma exclusivamente desde la maestra, así que estos tickers son
 * inalcanzables desde la UI aunque tengan modelos o consensus cargados. Cada fila
 * se despliega para ver qué es exactamente lo que hay cargado y decidir: crear la
 * ficha en la maestra, corregir el ticker en el origen, o borrar los datos.
 */
export default function UnmappedTickersAlert() {
  const [tickers, setTickers] = useState<UnmappedTicker[]>([]);
  const [open,     setOpen]     = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [err,      setErr]      = useState<string | null>(null);
  // Re-match: ticker con el formulario abierto + destino tipeado.
  const [reassign, setReassign] = useState<string | null>(null);
  const [target,   setTarget]   = useState("");
  const [saving,   setSaving]   = useState<string | null>(null);
  // Alta de ficha en la maestra.
  const [creating, setCreating] = useState<string | null>(null);
  const [form,     setForm]     = useState({ nombre: "", countryRisk: "", moneda: "", industriaGics: "" });
  const [gicsOptions,    setGicsOptions]    = useState<string[]>([]);
  const [countryOptions, setCountryOptions] = useState<string[]>([]);

  function load() {
    fetch("/api/companies/unmapped")
      .then((r) => (r.ok ? r.json() : { tickers: [] }))
      .then((d: { tickers?: UnmappedTicker[]; gicsOptions?: string[]; countryOptions?: string[] }) => {
        setTickers(d.tickers ?? []);
        setGicsOptions(d.gicsOptions ?? []);
        setCountryOptions(d.countryOptions ?? []);
      })
      .catch(() => setTickers([]));
  }

  useEffect(load, []);

  if (tickers.length === 0) return null;

  function payloadLabel(t: UnmappedTicker): string {
    const parts: string[] = [];
    if (t.modelRows     > 0) parts.push(`${t.modelRows} modelo${t.modelRows !== 1 ? "s" : ""}`);
    if (t.bankRows      > 0) parts.push(`${t.bankRows} modelo${t.bankRows !== 1 ? "s" : ""} banco`);
    if (t.consensusRows > 0) parts.push(`${t.consensusRows.toLocaleString("en-US")} filas consensus`);
    return parts.join(" · ");
  }

  async function remove(t: UnmappedTicker) {
    const ok = window.confirm(
      `Vas a borrar TODOS los datos cargados de ${t.ticker}:\n\n` +
      `  · ${t.modelRows} modelo(s) de analista (con sus financials y KPIs)\n` +
      `  · ${t.bankRows} modelo(s) de banco (con sus financials y KPIs)\n` +
      `  · ${t.consensusRows.toLocaleString("en-US")} filas de consensus\n\n` +
      `Esta acción no se puede deshacer. ¿Continuar?`
    );
    if (!ok) return;

    setDeleting(t.ticker); setErr(null);
    try {
      const res = await fetch(`/api/companies/unmapped?ticker=${encodeURIComponent(t.ticker)}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo eliminar.");
      setExpanded(null);
      load();
    } catch (e) {
      setErr(`${t.ticker}: ${(e as Error).message}`);
    } finally {
      setDeleting(null);
    }
  }

  /** Mueve los datos del ticker huérfano al ticker de la maestra que elija el admin. */
  async function doReassign(t: UnmappedTicker) {
    const dest = target.trim().toUpperCase().replace(/\s+/g, " ");
    if (!dest) return;

    const ok = window.confirm(
      `Vas a mover TODOS los datos de ${t.ticker} a ${dest}:\n\n` +
      `  · ${t.modelRows} modelo(s) de analista (con sus financials y KPIs)\n` +
      `  · ${t.bankRows} modelo(s) de banco (con sus financials y KPIs)\n` +
      `  · ${t.consensusRows.toLocaleString("en-US")} filas de consensus\n\n` +
      `${t.ticker} deja de existir y todo queda bajo ${dest}. ¿Continuar?`
    );
    if (!ok) return;

    setSaving(t.ticker); setErr(null);
    try {
      const res = await fetch(
        `/api/companies/unmapped?ticker=${encodeURIComponent(t.ticker)}&target=${encodeURIComponent(dest)}`,
        { method: "PATCH" }
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo re-matchear.");
      setReassign(null); setTarget(""); setExpanded(null);
      load();
    } catch (e) {
      setErr(`${t.ticker}: ${(e as Error).message}`);
    } finally {
      setSaving(null);
    }
  }

  /** Crea la ficha del ticker en la maestra: deja de ser huérfano sin mover ni borrar nada. */
  async function doCreate(t: UnmappedTicker) {
    setSaving(t.ticker); setErr(null);
    try {
      const res = await fetch(
        `/api/companies/unmapped?ticker=${encodeURIComponent(t.ticker)}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(form),
        }
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo crear la ficha.");
      setCreating(null); setExpanded(null);
      load();
    } catch (e) {
      setErr(`${t.ticker}: ${(e as Error).message}`);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{
      background: "rgba(255,107,6,0.045)",
      border: "1px solid rgba(255,107,6,0.28)",
      borderRadius: 10, overflow: "hidden", marginTop: 16,
    }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 9, width: "100%",
          padding: "9px 14px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <AlertTriangle size={14} style={{ color: PATRIA.orange, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: PATRIA.darkBlue }}>
          {tickers.length} ticker{tickers.length !== 1 ? "s" : ""} con datos fuera de empresas_industrias_v2
        </span>
        <span style={{ fontSize: 11, color: TEXT.muted, flex: 1 }}>
          Tienen modelos o consensus cargados pero no aparecen en el sidebar
        </span>
        <ChevronDown
          size={13}
          style={{ color: TEXT.muted, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        />
      </button>

      {open && (
        <div style={{ background: SURFACE.card, borderTop: "1px solid rgba(255,107,6,0.22)" }}>
          <div style={{ padding: "10px 16px", fontSize: 11, color: TEXT.label, lineHeight: 1.65, borderBottom: `1px solid ${BORDER.subtle}` }}>
            El sidebar se arma solo con tickers de <strong>empresas_industrias_v2</strong>, así que estos
            datos están cargados pero son inalcanzables. Haz clic en una fila para ver qué es exactamente.
            Después: crea la ficha en la maestra, corrige el ticker en el origen si es un typo, o borra los datos.
          </div>

          {err && (
            <div style={{ padding: "8px 16px", fontSize: 11, color: PATRIA.pink, background: "rgba(248,72,94,0.06)", borderBottom: `1px solid ${BORDER.subtle}` }}>
              {err}
            </div>
          )}

          <div style={{
            display: "grid", gridTemplateColumns: COL, gap: "0 14px", padding: "7px 16px",
            background: SURFACE.subtle, borderBottom: `1px solid ${BORDER.subtle}`,
          }}>
            {["Ticker sin ficha", "Datos cargados", "Candidato en la maestra", ""].map((h, i) => (
              <div key={i} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: TEXT.muted, textTransform: "uppercase" }}>
                {h}
              </div>
            ))}
          </div>

          {tickers.map((t) => {
            const isOpen = expanded === t.ticker;
            const busy   = deleting === t.ticker;
            return (
              <div key={t.ticker}>
                <div
                  onClick={() => setExpanded(isOpen ? null : t.ticker)}
                  style={{
                    display: "grid", gridTemplateColumns: COL, gap: "0 14px",
                    padding: "8px 16px", alignItems: "center", cursor: "pointer",
                    borderBottom: `1px solid ${BORDER.subtle}`,
                    background: isOpen ? SURFACE.hover : "transparent",
                  }}
                  onMouseEnter={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.03)"; }}
                  onMouseLeave={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                    {isOpen
                      ? <ChevronDown  size={11} style={{ color: PATRIA.orange, flexShrink: 0 }} />
                      : <ChevronRight size={11} style={{ color: TEXT.muted,   flexShrink: 0 }} />}
                    <span style={{
                      fontSize: 11, fontWeight: 700, fontFamily: FONT_SECONDARY, color: PATRIA.orange,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {t.ticker}
                    </span>
                  </div>

                  <div style={{ fontSize: 10.5, color: TEXT.label, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                    {payloadLabel(t)}
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                    {t.caseMatch ? (
                      <span
                        title={`La maestra lo tiene como "${t.caseMatch.ticker}" (${t.caseMatch.nombre}). Solo difiere en mayúsculas: hay que normalizar el ticker, no borrarlo.`}
                        style={{
                          fontSize: 10, fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue,
                          background: "rgba(32,68,220,0.06)", border: "1px solid rgba(32,68,220,0.20)",
                          borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap",
                        }}
                      >
                        {t.caseMatch.ticker} · solo difiere en casing
                      </span>
                    ) : t.suggestions.length === 0 ? (
                      <span style={{ fontSize: 10.5, color: TEXT.disabled }}>Sin candidato — falta en la maestra</span>
                    ) : t.suggestions.map((s) => (
                      <span
                        key={s.ticker}
                        title={s.nombre}
                        style={{
                          fontSize: 10, fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue,
                          background: "rgba(32,68,220,0.06)", border: "1px solid rgba(32,68,220,0.20)",
                          borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap",
                        }}
                      >
                        {s.ticker}
                      </span>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const opening = creating !== t.ticker;
                      setCreating(opening ? t.ticker : null);
                      setReassign(null);
                      setErr(null);
                      if (opening) {
                        const p = plazaDefaults(t.ticker);
                        setForm({
                          nombre: t.ticker.split(" ")[0],
                          countryRisk: p.country,
                          moneda: p.moneda,
                          industriaGics: "",
                        });
                      }
                    }}
                    disabled={busy || saving === t.ticker || t.caseMatch !== null}
                    title={t.caseMatch
                      ? `No hace falta: la maestra ya tiene "${t.caseMatch.ticker}".`
                      : `Crear la ficha de ${t.ticker} en empresas_industrias_v2`}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 26, height: 26, borderRadius: 7,
                      background: creating === t.ticker ? "rgba(21,128,61,0.16)" : "rgba(21,128,61,0.07)",
                      border: `1px solid ${t.caseMatch ? BORDER.subtle : "rgba(21,128,61,0.28)"}`,
                      color: t.caseMatch ? TEXT.disabled : "#15803D",
                      cursor: busy || t.caseMatch ? "not-allowed" : "pointer",
                    }}
                  >
                    <Plus size={13} />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const opening = reassign !== t.ticker;
                      setReassign(opening ? t.ticker : null);
                      setCreating(null);
                      // Pre-cargamos el primer candidato: en el caso típico (typo de
                      // la planilla) es el correcto y queda a un solo click.
                      setTarget(opening ? (t.suggestions[0]?.ticker ?? "") : "");
                      setErr(null);
                    }}
                    disabled={busy || saving === t.ticker || t.caseMatch !== null}
                    title={t.caseMatch
                      ? `No hace falta: la maestra ya tiene "${t.caseMatch.ticker}" y este ticker solo difiere en mayúsculas.`
                      : `Re-matchear ${t.ticker} contra un ticker de la maestra`}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 26, height: 26, borderRadius: 7,
                      background: reassign === t.ticker ? "rgba(32,68,220,0.12)" : "rgba(32,68,220,0.06)",
                      border: `1px solid ${t.caseMatch ? BORDER.subtle : "rgba(32,68,220,0.22)"}`,
                      color: t.caseMatch ? TEXT.disabled : PATRIA.kingBlue,
                      cursor: busy || t.caseMatch ? "not-allowed" : "pointer",
                    }}
                  >
                    {saving === t.ticker
                      ? <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} />
                      : <Link2   size={12} />}
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); remove(t); }}
                    disabled={busy || t.caseMatch !== null}
                    title={t.caseMatch
                      ? `No se borra: la maestra ya tiene "${t.caseMatch.ticker}" y este ticker solo difiere en mayúsculas. Es un modelo válido mal escrito — hay que normalizarlo.`
                      : `Borrar todos los datos de ${t.ticker}`}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 26, height: 26, borderRadius: 7,
                      background: t.caseMatch ? "transparent" : "rgba(248,72,94,0.06)",
                      border: `1px solid ${t.caseMatch ? BORDER.subtle : "rgba(248,72,94,0.22)"}`,
                      color: t.caseMatch ? TEXT.disabled : PATRIA.pink,
                      cursor: busy || t.caseMatch ? "not-allowed" : "pointer",
                    }}
                  >
                    {busy
                      ? <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} />
                      : <Trash2  size={12} />}
                  </button>
                  </div>
                </div>

                {/* Panel de alta: crear la ficha en la maestra. Para empresas reales que
                    nunca se cargaron (cobertura de consensus sin ficha, típico AMXL). */}
                {creating === t.ticker && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8,
                      padding: "10px 16px", background: "rgba(21,128,61,0.05)",
                      borderBottom: `1px solid ${BORDER.subtle}`,
                    }}
                  >
                    <span style={{ fontSize: 10.5, color: TEXT.label }}>
                      Crear ficha para <strong>{t.ticker}</strong>:
                    </span>

                    <input
                      value={form.nombre}
                      onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                      placeholder="Nombre"
                      spellCheck={false}
                      style={{ ...inputStyle, minWidth: 150 }}
                    />

                    <input
                      list="unmapped-countries"
                      value={form.countryRisk}
                      onChange={(e) => setForm({ ...form, countryRisk: e.target.value.toUpperCase() })}
                      placeholder="País"
                      maxLength={2}
                      spellCheck={false}
                      style={{ ...inputStyle, width: 62, textTransform: "uppercase" }}
                    />
                    <datalist id="unmapped-countries">
                      {countryOptions.map((c) => <option key={c} value={c} />)}
                    </datalist>

                    <input
                      value={form.moneda}
                      onChange={(e) => setForm({ ...form, moneda: e.target.value.toUpperCase() })}
                      placeholder="CCY"
                      maxLength={3}
                      spellCheck={false}
                      style={{ ...inputStyle, width: 66, textTransform: "uppercase" }}
                    />

                    <input
                      list="unmapped-gics"
                      value={form.industriaGics}
                      onChange={(e) => setForm({ ...form, industriaGics: e.target.value })}
                      placeholder="Industria GICS"
                      spellCheck={false}
                      style={{ ...inputStyle, minWidth: 200 }}
                    />
                    <datalist id="unmapped-gics">
                      {gicsOptions.map((g) => <option key={g} value={g} />)}
                    </datalist>

                    <button
                      onClick={() => doCreate(t)}
                      disabled={
                        saving === t.ticker ||
                        !form.nombre.trim() || !form.industriaGics.trim() ||
                        form.countryRisk.length !== 2 || form.moneda.length !== 3
                      }
                      style={{
                        fontSize: 10.5, fontWeight: 700, padding: "4px 12px", borderRadius: 5,
                        background: "#15803D", border: "none", color: PATRIA.white,
                        cursor: saving === t.ticker ? "not-allowed" : "pointer",
                        opacity: (!form.nombre.trim() || !form.industriaGics.trim() ||
                                  form.countryRisk.length !== 2 || form.moneda.length !== 3) ? 0.45 : 1,
                      }}
                    >
                      {saving === t.ticker ? "Creando…" : "Crear ficha"}
                    </button>

                    <button
                      onClick={() => setCreating(null)}
                      style={{
                        fontSize: 10.5, padding: "4px 10px", borderRadius: 5,
                        background: "transparent", border: `1px solid ${BORDER.subtle}`,
                        color: TEXT.label, cursor: "pointer",
                      }}
                    >
                      Cancelar
                    </button>

                    <span style={{ fontSize: 10, color: TEXT.muted, flexBasis: "100%" }}>
                      País y moneda vienen pre-cargados desde el sufijo de plaza del ticker.
                      ISIN, nombre_chile e industria_chile quedan vacíos — se completan después
                      desde el panel de homologación.
                    </span>
                  </div>
                )}

                {/* Panel de re-match: elegir a qué ticker de la maestra mover los datos. */}
                {reassign === t.ticker && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8,
                      padding: "10px 16px", background: "rgba(32,68,220,0.04)",
                      borderBottom: `1px solid ${BORDER.subtle}`,
                    }}
                  >
                    <span style={{ fontSize: 10.5, color: TEXT.label }}>
                      Mover los datos de <strong>{t.ticker}</strong> a:
                    </span>

                    <input
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") doReassign(t); }}
                      placeholder="TICKER BLOOMBERG"
                      spellCheck={false}
                      style={{
                        fontSize: 11, fontFamily: FONT_SECONDARY, fontWeight: 700,
                        padding: "4px 9px", borderRadius: 5, minWidth: 190,
                        border: `1px solid ${BORDER.subtle}`, background: SURFACE.card,
                        color: PATRIA.darkBlue, outline: "none", textTransform: "uppercase",
                      }}
                    />

                    {t.suggestions.map((s) => (
                      <button
                        key={s.ticker}
                        onClick={() => setTarget(s.ticker)}
                        title={s.nombre}
                        style={{
                          fontSize: 10, fontFamily: FONT_SECONDARY, cursor: "pointer",
                          color: target === s.ticker ? PATRIA.white : PATRIA.kingBlue,
                          background: target === s.ticker ? PATRIA.kingBlue : "rgba(32,68,220,0.06)",
                          border: "1px solid rgba(32,68,220,0.20)",
                          borderRadius: 4, padding: "3px 8px", whiteSpace: "nowrap",
                        }}
                      >
                        {s.ticker}
                      </button>
                    ))}

                    <button
                      onClick={() => doReassign(t)}
                      disabled={!target.trim() || saving === t.ticker}
                      style={{
                        fontSize: 10.5, fontWeight: 700, padding: "4px 12px", borderRadius: 5,
                        background: target.trim() ? PATRIA.kingBlue : "rgba(32,68,220,0.25)",
                        border: "none", color: PATRIA.white,
                        cursor: target.trim() && saving !== t.ticker ? "pointer" : "not-allowed",
                      }}
                    >
                      {saving === t.ticker ? "Moviendo…" : "Re-matchear"}
                    </button>

                    <button
                      onClick={() => { setReassign(null); setTarget(""); }}
                      style={{
                        fontSize: 10.5, padding: "4px 10px", borderRadius: 5,
                        background: "transparent", border: `1px solid ${BORDER.subtle}`,
                        color: TEXT.label, cursor: "pointer",
                      }}
                    >
                      Cancelar
                    </button>

                    <span style={{ fontSize: 10, color: TEXT.muted, flexBasis: "100%" }}>
                      El destino tiene que existir en empresas_industrias_v2. Financials y KPIs
                      viajan con el header; si el destino ya tiene un snapshot de la misma fecha,
                      la operación se rechaza sin tocar nada.
                    </span>
                  </div>
                )}

                {isOpen && <TickerDetail ticker={t.ticker} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
