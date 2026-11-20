"use client";

import React, { useEffect, useState } from "react";
import { computeModelIrr, theoreticalPbv, type IrrResult, type IrrYearInput } from "@/lib/modelIrr";
import { PATRIA, FONT_PRIMARY, FONT_SECONDARY, TEXT, BORDER } from "@/lib/patriaTheme";

// Cómo se arma el valor de salida:
//   pe  → Net Income × P/E de salida (empresas)
//   pbv → Controlling Equity × P/BV teórico = (ROE − g) / (Ke − g) (bancos)
export type IrrMode = "pe" | "pbv";

// ── Supuestos editables (los fija el explorer; el panel sólo los muestra/edita) ──
export interface IrrInputs {
  horizon:         number;                  // años de flujo
  exitPe:          number;                  // [pe]  P/E de salida objetivo
  sustRoe:         number;                  // [pbv] ROE sostenible (decimal)
  growth:          number;                  // [pbv] crecimiento de largo plazo g (decimal)
  entryPrice:      number | null;           // precio de entrada (LCCY); null = sin precio
  includeBuybacks: boolean;
  ke:              number;                  // costo de capital (decimal): referencia y, en pbv, tasa del múltiplo
  peStep:          number;                  // [pe]  paso de la sensibilidad de P/E (x)
  roeStep:         number;                  // [pbv] paso de la sensibilidad de ROE (decimal)
  divOverrides:    Record<number, number>;  // año → flujo al accionista editado en la tabla
  baseOverrides:   Record<number, number>;  // año → base de salida editada en la tabla
}

export interface IrrDefaults {
  exitPe:       number;
  exitPeSource: string;             // de dónde salió el P/E por defecto
  sustRoe:      number;
  roeSource:    string;             // de dónde salió el ROE por defecto
  entryPrice:   number | null;
  entryLabel:   string;             // "Mercado" | "Modelo"
}

/** Múltiplo de salida según el modo (null si el P/BV teórico no está definido: Ke ≤ g). */
export function exitMultipleOf(mode: IrrMode, i: IrrInputs, roe = i.sustRoe): number | null {
  return mode === "pe" ? i.exitPe : theoreticalPbv(roe, i.growth, i.ke);
}

interface Props {
  mode:       IrrMode;
  baseLabel:  string;               // "Net Income" | "Controlling Equity"
  inputs:     IrrInputs;
  defaults:   IrrDefaults;
  onChange:   (patch: Partial<IrrInputs>) => void;
  onReset:    () => void;
  result:     IrrResult;
  years:      IrrYearInput[];       // años proyectados utilizables (irrYears)
  refPrice:   number | null;        // precio que hay detrás del market cap de entrada
  asOf:       Date;
  ccyLabel:   string;
}

const C = {
  HDR:  PATRIA.darkBlue,
  SUB:  PATRIA.kingBlue,
  TXT:  PATRIA.darkBlue,
  TXT2: TEXT.label,
  BDR:  BORDER.base,
  POS:  PATRIA.blue,
  NEG:  PATRIA.pink,
  SOFT: "#F5F7FD",
  EST:  "rgba(255,107,6,0.06)",
};
const MONO: React.CSSProperties = { fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" };

const fmtInt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtPct = (v: number | null) => (v === null ? "—" : (v * 100).toFixed(1) + "%");
const fmtX   = (v: number) => v.toFixed(1) + "x";
const fmtDmy = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}-${m}-${y}`; };

// Color de una TIR contra el Ke de referencia.
function irrTone(v: number | null, ke: number): { color: string; bg: string } {
  if (v === null) return { color: C.TXT2, bg: "transparent" };
  if (v >= ke) return { color: C.POS, bg: "rgba(0,30,175,0.10)" };
  return { color: C.NEG, bg: "rgba(248,72,94,0.10)" };
}

// Input numérico con borrador local: deja tipear libremente y sólo confirma al salir o
// con Enter. Muestra `decimals` decimales; si el texto no cambió no confirma nada (así
// redondear la vista no pisa el valor exacto). Vacío → onClear (vuelve al valor del modelo).
export function NumInput({ value, onCommit, onClear, suffix, decimals = 1, step, min, width = 84, compact = false, edited = false }: {
  value: number | null; onCommit: (v: number) => void; onClear?: () => void;
  suffix?: string; decimals?: number; step?: number; min?: number; width?: number | string;
  compact?: boolean; edited?: boolean;
}) {
  const shown = value === null ? "" : value.toFixed(decimals);
  const [draft, setDraft] = useState(shown);
  useEffect(() => { setDraft(shown); }, [shown]);

  const commit = () => {
    if (draft === shown) return;
    if (draft.trim() === "" && onClear) { onClear(); return; }
    const v = parseFloat(draft.replace(",", "."));
    if (isFinite(v) && (min === undefined || v >= min)) onCommit(v);
    else setDraft(shown);
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <input
        type="number" inputMode="decimal" step={step ?? Math.pow(10, -decimals)}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={{
          width, padding: compact ? "3px 6px" : "5px 8px", borderRadius: 5,
          border: `1px solid ${edited ? C.SUB : C.BDR}`,
          background: edited ? "rgba(32,68,220,0.06)" : PATRIA.white,
          color: edited ? C.SUB : C.TXT,
          fontSize: 13, fontWeight: 700, textAlign: "right", ...MONO,
        }}
      />
      {suffix && <span style={{ fontSize: 12, color: C.TXT2 }}>{suffix}</span>}
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: C.TXT2, letterSpacing: "0.02em" }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: C.TXT2 }}>{hint}</span>}
    </label>
  );
}

export function LinkBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      background: "none", border: "none", padding: 0, cursor: "pointer",
      color: C.SUB, fontSize: 11, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2,
    }}>{children}</button>
  );
}

// Quita un año de un mapa de overrides (vaciar la celda = volver al valor del modelo).
export const without = (m: Record<number, number>, year: number) => {
  const next = { ...m };
  delete next[year];
  return next;
};

export default function ModelIrrPanel({ mode, baseLabel, inputs, defaults, onChange, onReset, result, years, refPrice, asOf, ccyLabel }: Props) {
  const maxH       = years.length;
  const horizon    = Math.min(inputs.horizon, maxH);
  const entryScale = inputs.entryPrice !== null && refPrice ? inputs.entryPrice / refPrice : 1;
  const spread     = result.irr !== null ? result.irr - inputs.ke : null;
  const tone       = irrTone(result.irr, inputs.ke);
  const horizons   = Array.from({ length: maxH }, (_, i) => i + 1);
  const multiple   = exitMultipleOf(mode, inputs);
  const multLabel  = mode === "pe" ? "P/E" : "P/BV";

  // Sensibilidad en el horizonte elegido: P/E de salida (pe) o ROE sostenible (pbv),
  // base ± 1 y 2 pasos.
  const sensRows = [-2, -1, 0, 1, 2]
    .map(k => {
      if (mode === "pe") {
        const pe = inputs.exitPe + k * inputs.peStep;
        return { k, label: fmtX(pe), delta: fmtX(Math.abs(k * inputs.peStep)), mult: pe > 0 ? pe : null };
      }
      const roe = inputs.sustRoe + k * inputs.roeStep;
      return {
        k, label: `${(roe * 100).toFixed(1)}%`, delta: `${(Math.abs(k * inputs.roeStep) * 100).toFixed(1)}pp`,
        mult: exitMultipleOf(mode, inputs, roe),
      };
    })
    .filter(r => r.mult !== null && r.mult > 0);
  const sens = (mult: number) => computeModelIrr(years, {
    horizon, exitMultiple: mult, entryScale, includeBuybacks: inputs.includeBuybacks, asOf,
    divOverrides: inputs.divOverrides, baseOverrides: inputs.baseOverrides,
  }).irr;

  // Editar la entrada (market cap) equivale a mover el precio de entrada.
  const setEntryMcap = (v: number) => {
    if (result.baseMcap && refPrice) onChange({ entryPrice: refPrice * v / result.baseMcap });
  };

  const th: React.CSSProperties = {
    padding: "5px 10px", background: C.HDR, color: PATRIA.white, fontSize: 12, fontWeight: 700,
    textAlign: "center", ...MONO, whiteSpace: "nowrap",
  };
  const tdLbl: React.CSSProperties = {
    padding: "5px 10px", fontSize: 13, fontWeight: 700, color: C.SUB, fontFamily: FONT_SECONDARY,
    borderBottom: `1px solid ${C.BDR}`, whiteSpace: "nowrap", textAlign: "left",
  };
  const td: React.CSSProperties = {
    padding: "4px 8px", fontSize: 13, textAlign: "center", borderBottom: `1px solid ${C.BDR}`,
    borderLeft: `1px solid ${C.BDR}`, color: C.TXT, fontWeight: 600, ...MONO,
  };
  const editedCount = Object.keys(inputs.divOverrides).length + Object.keys(inputs.baseOverrides).length;

  return (
    <div style={{ border: `1px solid ${C.BDR}`, borderRadius: 10, overflow: "hidden", background: PATRIA.white }}>
      {/* Banda de título */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap",
        padding: "8px 14px", background: C.HDR, color: PATRIA.white,
      }}>
        <span style={{ fontFamily: FONT_PRIMARY, fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          TIR automática (XIRR) · Flujos totales al accionista · {mode === "pe" ? "salida por P/E" : "salida por P/BV teórico"}
        </span>
        <button type="button" onClick={onReset} style={{
          background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.3)", color: PATRIA.white,
          borderRadius: 5, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
        }}>
          Restablecer supuestos
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "14px 14px 12px" }}>
        {/* ── Supuestos + resultado ── */}
        <div className="g-stack-md" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 16, alignItems: "start" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14 }}>
            <Field label="Horizonte" hint={`Hasta ${maxH} año${maxH === 1 ? "" : "s"} proyectado${maxH === 1 ? "" : "s"} en el modelo`}>
              <select
                value={horizon}
                onChange={e => onChange({ horizon: Number(e.target.value) })}
                style={{ width: 130, padding: "5px 8px", borderRadius: 5, border: `1px solid ${C.BDR}`, fontSize: 13, fontWeight: 700, color: C.TXT, ...MONO }}
              >
                {horizons.map(h => <option key={h} value={h}>{h} año{h === 1 ? "" : "s"} ({years[h - 1].year})</option>)}
              </select>
            </Field>

            {mode === "pe" ? (
              <Field label="P/E de salida" hint={
                Math.abs(inputs.exitPe - defaults.exitPe) > 1e-9
                  ? <>Sugerido {fmtX(defaults.exitPe)} · <LinkBtn onClick={() => onChange({ exitPe: defaults.exitPe })}>usar</LinkBtn></>
                  : <>Sugerido: {defaults.exitPeSource}</>
              }>
                <NumInput value={inputs.exitPe} onCommit={v => onChange({ exitPe: v })} suffix="x" decimals={1} min={0.1} />
              </Field>
            ) : (
              <>
                <Field label="ROE sostenible" hint={
                  Math.abs(inputs.sustRoe - defaults.sustRoe) > 1e-9
                    ? <>Sugerido {fmtPct(defaults.sustRoe)} · <LinkBtn onClick={() => onChange({ sustRoe: defaults.sustRoe })}>usar</LinkBtn></>
                    : <>Sugerido: {defaults.roeSource}</>
                }>
                  <NumInput value={inputs.sustRoe * 100} onCommit={v => onChange({ sustRoe: v / 100 })} suffix="%" decimals={1} step={0.5} />
                </Field>
                <Field label="Crecimiento largo plazo (g)" hint="Nominal, en la moneda del modelo">
                  <NumInput value={inputs.growth * 100} onCommit={v => onChange({ growth: v / 100 })} suffix="%" decimals={1} step={0.5} />
                </Field>
                <Field label="P/BV teórico de salida" hint="(ROE − g) / (Ke − g)">
                  <span style={{ fontSize: 15, fontWeight: 800, color: multiple !== null ? C.TXT : C.NEG, padding: "4px 0", ...MONO }}>
                    {multiple !== null ? fmtX(multiple) : "Ke ≤ g"}
                  </span>
                </Field>
              </>
            )}

            <Field label="Precio de entrada" hint={
              defaults.entryPrice !== null && inputs.entryPrice !== defaults.entryPrice
                ? <>{defaults.entryLabel} {fmtInt(defaults.entryPrice)} · <LinkBtn onClick={() => onChange({ entryPrice: defaults.entryPrice })}>usar</LinkBtn></>
                : <>{defaults.entryLabel} (LCCY)</>
            }>
              <NumInput value={inputs.entryPrice} onCommit={v => onChange({ entryPrice: v })} decimals={0} step={1} min={0.0001} width={100} />
            </Field>

            <Field label="Costo de capital (Ke)" hint={mode === "pe" ? "Referencia para colorear la TIR" : "Tasa del P/BV teórico y referencia de la TIR"}>
              <NumInput value={inputs.ke * 100} onCommit={v => onChange({ ke: v / 100 })} suffix="%" decimals={1} step={0.5} />
            </Field>

            {mode === "pe" ? (
              <Field label="Paso sensibilidad P/E" hint="Filas: base ± 1 y 2 pasos">
                <NumInput value={inputs.peStep} onCommit={v => onChange({ peStep: v })} suffix="x" decimals={1} step={0.5} min={0.1} />
              </Field>
            ) : (
              <Field label="Paso sensibilidad ROE" hint="Filas: base ± 1 y 2 pasos">
                <NumInput value={inputs.roeStep * 100} onCommit={v => onChange({ roeStep: v / 100 })} suffix="pp" decimals={1} step={0.5} min={0.1} />
              </Field>
            )}

            <Field label="Flujos al accionista">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: C.TXT, padding: "5px 0" }}>
                <input type="checkbox" checked={inputs.includeBuybacks}
                  onChange={e => onChange({ includeBuybacks: e.target.checked })} />
                Incluir recompras
              </span>
            </Field>
          </div>

          {/* Resultado */}
          <div style={{
            minWidth: 190, padding: "12px 16px", borderRadius: 8, background: C.SOFT,
            border: `1px solid ${C.BDR}`, display: "flex", flexDirection: "column", gap: 6,
          }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.TXT2, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              TIR implícita · {horizon}A
            </span>
            <span style={{ fontSize: 30, fontWeight: 800, color: tone.color, lineHeight: 1.1, ...MONO }}>
              {fmtPct(result.irr)}
            </span>
            {spread !== null && (
              <span style={{ fontSize: 12, fontWeight: 700, color: tone.color, ...MONO }}>
                {spread >= 0 ? "+" : ""}{(spread * 100).toFixed(1)} pp vs Ke {fmtPct(inputs.ke)}
              </span>
            )}
            {result.issue && <span style={{ fontSize: 11.5, color: C.NEG }}>{result.issue}</span>}
          </div>
        </div>

        {/* ── Flujos (editables) + sensibilidad ── */}
        <div className="g-stack-md" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 16, alignItems: "start" }}>
          {result.flows.length > 0 && (
            <div className="scroll-x">
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 460 }}>
                <thead>
                  {/* Días desde hoy: lo que usa el descuento (días / 365). */}
                  <tr>
                    <th style={{ ...th, background: C.SUB, fontSize: 11, textAlign: "left", fontWeight: 600 }}>Días desde hoy</th>
                    {result.flows.map(f => (
                      <th key={f.t} style={{ ...th, background: C.SUB, fontSize: 11, fontWeight: 600 }}>
                        {f.days} d <span style={{ opacity: 0.75 }}>· {(f.days / 365).toFixed(2)}a</span>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th style={{ ...th, textAlign: "left", fontFamily: FONT_PRIMARY, letterSpacing: "0.06em" }}>
                      FLUJOS{ccyLabel}
                    </th>
                    {result.flows.map(f => (
                      <th key={f.t} style={{ ...th, color: f.t === 0 ? PATRIA.white : "#FFBB8D" }}>
                        {f.t === 0 ? `Hoy ${fmtDmy(f.date)}` : `${f.year}E`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={tdLbl}>Entrada (Market Cap a precio de entrada)</td>
                    {result.flows.map(f => (
                      <td key={f.t} style={td}>
                        {f.t === 0 && result.entry !== null
                          ? <NumInput value={result.entry} onCommit={setEntryMcap} decimals={0} step={1} min={0.0001}
                              width={96} compact edited={inputs.entryPrice !== defaults.entryPrice} />
                          : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLbl}>{inputs.includeBuybacks ? "Dividend + Buyback" : "Dividends"}</td>
                    {result.flows.map(f => (
                      <td key={f.t} style={{ ...td, background: f.t ? C.EST : undefined }}>
                        {f.t === 0 ? "—" : (
                          <NumInput value={f.dividend} decimals={0} step={1} width={96} compact edited={f.divEdited}
                            onCommit={v => onChange({ divOverrides: { ...inputs.divOverrides, [f.year!]: v } })}
                            onClear={() => onChange({ divOverrides: without(inputs.divOverrides, f.year!) })} />
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLbl}>{baseLabel}</td>
                    {result.flows.map(f => (
                      <td key={f.t} style={{ ...td, background: f.t ? C.EST : undefined }}>
                        {f.t === 0 ? "—" : (
                          <NumInput value={f.exitBase} decimals={0} step={1} width={96} compact edited={f.baseEdited}
                            onCommit={v => onChange({ baseOverrides: { ...inputs.baseOverrides, [f.year!]: v } })}
                            onClear={() => onChange({ baseOverrides: without(inputs.baseOverrides, f.year!) })} />
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ ...tdLbl, fontWeight: 400, color: C.TXT }}>
                      Valor de salida ({baseLabel} × {multiple !== null ? `${multLabel} ${fmtX(multiple)}` : multLabel})
                    </td>
                    {result.flows.map(f => (
                      <td key={f.t} style={{ ...td, background: f.t ? C.EST : undefined, fontWeight: 400 }}>
                        {f.exit ? fmtInt(f.exit) : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ ...tdLbl, color: C.TXT, background: C.SOFT }}>Flujo total</td>
                    {result.flows.map(f => (
                      <td key={f.t} style={{ ...td, background: C.SOFT, fontWeight: 800, color: f.total < 0 ? C.NEG : C.TXT }}>
                        {fmtInt(f.total)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              <p style={{ margin: "6px 0 0", fontSize: 11, color: C.TXT2 }}>
                Las celdas son editables; vaciar una vuelve al valor del modelo.
                {editedCount > 0 && <> · <b style={{ color: C.SUB }}>{editedCount} celda{editedCount === 1 ? "" : "s"} editada{editedCount === 1 ? "" : "s"}</b></>}
              </p>
            </div>
          )}

          {/* Sensibilidad: una sola columna, el horizonte elegido */}
          {horizon > 0 && sensRows.length > 0 && (
            <table style={{ borderCollapse: "collapse", minWidth: 220 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left", fontFamily: FONT_PRIMARY, letterSpacing: "0.06em" }}>
                    {mode === "pe" ? "P/E SALIDA" : "ROE SOSTENIBLE"}
                  </th>
                  {mode === "pbv" && <th style={th}>P/BV</th>}
                  <th style={th}>TIR {horizon}A ({years[horizon - 1].year}E)</th>
                </tr>
              </thead>
              <tbody>
                {sensRows.map(({ k, label, delta, mult }) => {
                  const v = sens(mult!);
                  const t = irrTone(v, inputs.ke);
                  return (
                    <tr key={k}>
                      <td style={{ ...tdLbl, background: k === 0 ? C.SOFT : undefined }}>
                        {label}{" "}
                        <span style={{ fontWeight: 400, color: C.TXT2 }}>
                          {k === 0 ? "(base)" : `(${k > 0 ? "+" : "−"}${delta})`}
                        </span>
                      </td>
                      {mode === "pbv" && <td style={{ ...td, background: k === 0 ? C.SOFT : undefined }}>{fmtX(mult!)}</td>}
                      <td style={{
                        ...td, color: t.color, background: t.bg,
                        fontWeight: k === 0 ? 800 : 600,
                        outline: k === 0 ? `2px solid ${C.HDR}` : undefined, outlineOffset: -2,
                      }}>
                        {fmtPct(v)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ margin: 0, fontSize: 11.5, color: C.TXT2, lineHeight: 1.5 }}>
          XIRR: cada flujo se descuenta por (días desde hoy / 365), con los flujos de cada año al 31-dic.
          Hoy se paga el market cap al precio de entrada; cada año se cobran dividendos
          {inputs.includeBuybacks ? " + recompras" : ""} y, en el último, además {mode === "pe"
            ? "Net Income × P/E de salida"
            : "Controlling Equity × P/BV teórico, con P/BV = (ROE sostenible − g) / (Ke − g): un banco que gana su costo de capital (ROE = Ke) sale a 1x libro"}.
          Se calcula sobre agregados (market cap efectivo, dividendos y {baseLabel} en la escala del modelo),
          que con acciones constantes da la misma TIR que por acción. Azul = TIR ≥ Ke; rosado = TIR &lt; Ke.
        </p>
      </div>
    </div>
  );
}
