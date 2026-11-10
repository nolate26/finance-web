"use client";

import React, { useEffect, useState } from "react";
import { computeModelIrr, type IrrResult, type IrrYearInput } from "@/lib/modelIrr";
import { PATRIA, FONT_PRIMARY, FONT_SECONDARY, TEXT, BORDER } from "@/lib/patriaTheme";

// ── Supuestos editables (los fija ModelExplorer; el panel sólo los muestra/edita) ──
export interface IrrInputs {
  horizon:         number;          // años de flujo
  exitPe:          number;          // P/E de salida objetivo
  entryPrice:      number | null;   // precio de entrada (LCCY); null = sin precio
  includeBuybacks: boolean;
  ke:              number;          // costo de capital de referencia (decimal)
  peStep:          number;          // paso de la sensibilidad de P/E (x)
}

export interface IrrDefaults {
  exitPe:       number;
  exitPeSource: string;             // de dónde salió el P/E por defecto
  entryPrice:   number | null;
  entryLabel:   string;             // "Mercado" | "Modelo"
}

interface Props {
  inputs:     IrrInputs;
  defaults:   IrrDefaults;
  onChange:   (patch: Partial<IrrInputs>) => void;
  onReset:    () => void;
  result:     IrrResult;
  years:      IrrYearInput[];       // años proyectados utilizables (irrYears)
  refPrice:   number | null;        // precio que hay detrás del market cap de entrada
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

const fmtAbs = (v: number) => {
  const a = Math.abs(v);
  if (a < 10) return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (a < 50) return v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
};
const fmtPct = (v: number | null) => (v === null ? "—" : (v * 100).toFixed(1) + "%");
const fmtX   = (v: number) => v.toFixed(1) + "x";

// Color de una TIR contra el Ke de referencia.
function irrTone(v: number | null, ke: number): { color: string; bg: string } {
  if (v === null) return { color: C.TXT2, bg: "transparent" };
  if (v >= ke) return { color: C.POS, bg: "rgba(0,30,175,0.10)" };
  return { color: C.NEG, bg: "rgba(248,72,94,0.10)" };
}

// Input numérico con borrador local: deja tipear libremente ("12," / "") y sólo
// confirma al salir o con Enter. Acepta coma decimal.
function NumInput({ value, onCommit, suffix, step = 0.1, min, width = 84 }: {
  value: number | null; onCommit: (v: number) => void; suffix?: string; step?: number; min?: number; width?: number;
}) {
  const shown = value === null ? "" : String(+value.toFixed(4));
  const [draft, setDraft] = useState(shown);
  useEffect(() => { setDraft(shown); }, [shown]);

  const commit = () => {
    const v = parseFloat(draft.replace(",", "."));
    if (isFinite(v) && (min === undefined || v >= min)) onCommit(v);
    else setDraft(shown);
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <input
        type="number" inputMode="decimal" step={step}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={{
          width, padding: "5px 8px", borderRadius: 5,
          border: `1px solid ${C.BDR}`, background: PATRIA.white, color: C.TXT,
          fontSize: 13, fontWeight: 700, textAlign: "right", ...MONO,
        }}
      />
      {suffix && <span style={{ fontSize: 12, color: C.TXT2 }}>{suffix}</span>}
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: C.TXT2, letterSpacing: "0.02em" }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: C.TXT2 }}>{hint}</span>}
    </label>
  );
}

function LinkBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      background: "none", border: "none", padding: 0, cursor: "pointer",
      color: C.SUB, fontSize: 11, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2,
    }}>{children}</button>
  );
}

export default function ModelIrrPanel({ inputs, defaults, onChange, onReset, result, years, refPrice, ccyLabel }: Props) {
  const maxH   = years.length;
  const entryScale = inputs.entryPrice !== null && refPrice ? inputs.entryPrice / refPrice : 1;
  const spread = result.irr !== null ? result.irr - inputs.ke : null;
  const tone   = irrTone(result.irr, inputs.ke);

  // Sensibilidad: P/E de salida (filas, base ± paso) × horizonte (columnas).
  const peRows = [-2, -1, 0, 1, 2]
    .map(k => ({ k, pe: inputs.exitPe + k * inputs.peStep }))
    .filter(r => r.pe > 0);
  const horizons = Array.from({ length: maxH }, (_, i) => i + 1);
  const sens = (pe: number, h: number) =>
    computeModelIrr(years, { horizon: h, exitPe: pe, entryScale, includeBuybacks: inputs.includeBuybacks }).irr;

  const th: React.CSSProperties = {
    padding: "6px 10px", background: C.HDR, color: PATRIA.white, fontSize: 12, fontWeight: 700,
    textAlign: "center", ...MONO, whiteSpace: "nowrap",
  };
  const tdLbl: React.CSSProperties = {
    padding: "5px 10px", fontSize: 13, fontWeight: 700, color: C.SUB, fontFamily: FONT_SECONDARY,
    borderBottom: `1px solid ${C.BDR}`, whiteSpace: "nowrap", textAlign: "left",
  };
  const td: React.CSSProperties = {
    padding: "5px 10px", fontSize: 13, textAlign: "center", borderBottom: `1px solid ${C.BDR}`,
    borderLeft: `1px solid ${C.BDR}`, color: C.TXT, fontWeight: 600, ...MONO,
  };

  return (
    <div style={{ border: `1px solid ${C.BDR}`, borderRadius: 10, overflow: "hidden", background: PATRIA.white }}>
      {/* Banda de título */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap",
        padding: "8px 14px", background: C.HDR, color: PATRIA.white,
      }}>
        <span style={{ fontFamily: FONT_PRIMARY, fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          TIR automática · Flujos totales al accionista
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
                value={Math.min(inputs.horizon, maxH)}
                onChange={e => onChange({ horizon: Number(e.target.value) })}
                style={{ width: 120, padding: "5px 8px", borderRadius: 5, border: `1px solid ${C.BDR}`, fontSize: 13, fontWeight: 700, color: C.TXT, ...MONO }}
              >
                {horizons.map(h => <option key={h} value={h}>{h} año{h === 1 ? "" : "s"} ({years[h - 1].year})</option>)}
              </select>
            </Field>

            <Field label="P/E de salida" hint={
              Math.abs(inputs.exitPe - defaults.exitPe) > 1e-9
                ? <>Sugerido {fmtX(defaults.exitPe)} · <LinkBtn onClick={() => onChange({ exitPe: defaults.exitPe })}>usar</LinkBtn></>
                : <>Sugerido: {defaults.exitPeSource}</>
            }>
              <NumInput value={inputs.exitPe} onCommit={v => onChange({ exitPe: v })} suffix="x" min={0.1} />
            </Field>

            <Field label="Precio de entrada" hint={
              defaults.entryPrice !== null && inputs.entryPrice !== defaults.entryPrice
                ? <>{defaults.entryLabel} {fmtAbs(defaults.entryPrice)} · <LinkBtn onClick={() => onChange({ entryPrice: defaults.entryPrice })}>usar</LinkBtn></>
                : <>{defaults.entryLabel} (LCCY)</>
            }>
              <NumInput value={inputs.entryPrice} onCommit={v => onChange({ entryPrice: v })} min={0.0001} width={100} />
            </Field>

            <Field label="Costo de capital (Ke)" hint="Referencia para colorear la TIR">
              <NumInput value={+(inputs.ke * 100).toFixed(4)} onCommit={v => onChange({ ke: v / 100 })} suffix="%" step={0.5} />
            </Field>

            <Field label="Paso sensibilidad P/E" hint="Filas: base ± 1 y 2 pasos">
              <NumInput value={inputs.peStep} onCommit={v => onChange({ peStep: v })} suffix="x" step={0.5} min={0.1} />
            </Field>

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
              TIR implícita · {Math.min(inputs.horizon, maxH)}A
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

        {/* ── Flujos ── */}
        {result.flows.length > 0 && (
          <div className="scroll-x">
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left", fontFamily: FONT_PRIMARY, letterSpacing: "0.06em" }}>
                    FLUJOS{ccyLabel}
                  </th>
                  {result.flows.map(f => (
                    <th key={f.t} style={{ ...th, color: f.t === 0 ? PATRIA.white : "#FFBB8D" }}>
                      {f.t === 0 ? "Hoy" : `${f.year}E`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdLbl}>Entrada (Market Cap a precio de entrada)</td>
                  {result.flows.map(f => <td key={f.t} style={td}>{f.t === 0 ? fmtAbs(f.total) : "—"}</td>)}
                </tr>
                <tr>
                  <td style={tdLbl}>{inputs.includeBuybacks ? "Dividend + Buyback" : "Dividends"}</td>
                  {result.flows.map(f => <td key={f.t} style={{ ...td, background: f.t ? C.EST : undefined }}>{f.t === 0 ? "—" : fmtAbs(f.dividend)}</td>)}
                </tr>
                <tr>
                  <td style={{ ...tdLbl, fontWeight: 400, color: C.TXT }}>
                    Valor de salida (Net Income × {fmtX(inputs.exitPe)})
                  </td>
                  {result.flows.map(f => <td key={f.t} style={{ ...td, background: f.t ? C.EST : undefined, fontWeight: 400 }}>{f.exit ? fmtAbs(f.exit) : "—"}</td>)}
                </tr>
                <tr>
                  <td style={{ ...tdLbl, color: C.TXT, background: C.SOFT }}>Flujo total</td>
                  {result.flows.map(f => (
                    <td key={f.t} style={{ ...td, background: C.SOFT, fontWeight: 800, color: f.total < 0 ? C.NEG : C.TXT }}>
                      {fmtAbs(f.total)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ── Sensibilidad ── */}
        {horizons.length > 0 && peRows.length > 0 && (
          <div className="scroll-x">
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 360 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left", fontFamily: FONT_PRIMARY, letterSpacing: "0.06em" }}>
                    SENSIBILIDAD · P/E SALIDA \ HORIZONTE
                  </th>
                  {horizons.map(h => <th key={h} style={th}>{h}A ({years[h - 1].year}E)</th>)}
                </tr>
              </thead>
              <tbody>
                {peRows.map(({ k, pe }) => (
                  <tr key={k}>
                    <td style={{ ...tdLbl, background: k === 0 ? C.SOFT : undefined }}>
                      {fmtX(pe)} {k === 0 ? <span style={{ fontWeight: 400, color: C.TXT2 }}>(base)</span>
                        : <span style={{ fontWeight: 400, color: C.TXT2 }}>({k > 0 ? "+" : "−"}{fmtX(Math.abs(k * inputs.peStep))})</span>}
                    </td>
                    {horizons.map(h => {
                      const v = sens(pe, h);
                      const t = irrTone(v, inputs.ke);
                      const isBase = k === 0 && h === Math.min(inputs.horizon, maxH);
                      return (
                        <td key={h} style={{
                          ...td, color: t.color, background: t.bg,
                          fontWeight: isBase ? 800 : 600,
                          outline: isBase ? `2px solid ${C.HDR}` : undefined, outlineOffset: -2,
                        }}>
                          {fmtPct(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ margin: 0, fontSize: 11.5, color: C.TXT2, lineHeight: 1.5 }}>
          Año 0 = hoy, al precio de entrada. Los flujos parten en el primer año proyectado del modelo:
          dividendos de cada año y, en el último, dividendo + Net Income del año × P/E de salida.
          Se calcula sobre agregados (market cap efectivo, dividendos y Net Income en la escala del modelo),
          que con acciones constantes da la misma TIR que por acción y respeta la conversión de moneda y las
          series dual-class. Azul = TIR ≥ Ke; rosado = TIR &lt; Ke.
        </p>
      </div>
    </div>
  );
}
