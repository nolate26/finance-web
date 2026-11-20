"use client";

import React from "react";
import {
  buildFcff, computeModelDcf, dcfYears,
  type DcfResult, type DcfYearInput, type FcffField, type FcffLine, type FcffOverrides, type FcffYearInput,
} from "@/lib/modelDcf";
import { NumInput, Field, LinkBtn, without } from "@/components/deep-dive/ModelIrrPanel";
import { PATRIA, FONT_PRIMARY, FONT_SECONDARY, TEXT, BORDER } from "@/lib/patriaTheme";

// Cómo se arma el DCF (ver lib/modelDcf):
//   fcff → FCFF desde el EBIT a WACC; EV − deuda neta − minoritarios (empresas)
//   ddm  → dividendos + recompras a Ke; ya es patrimonio (bancos)
export type DcfMode = "fcff" | "ddm";

// ── Supuestos editables (los fija el explorer; el panel sólo los muestra/edita) ──
export interface DcfInputs {
  rate:            number;                  // WACC (fcff) o Ke (ddm), decimal
  growth:          number;                  // g de la perpetuidad, decimal
  rateStep:        number;                  // paso de la sensibilidad de la tasa
  growthStep:      number;                  // paso de la sensibilidad de g
  includeCurrent:  boolean;                 // sumar el año en curso como primer flujo
  flowOverrides:   Record<number, number>;  // [ddm]  año → flujo editado
  fcffOverrides:   FcffOverrides;           // [fcff] drivers editados por año
  terminalFlow:    number | null;           // flujo terminal editado; null = el sugerido
  bridgeOverrides: Record<string, number>;  // partida del puente (EV → patrimonio) editada
}

export interface DcfBridgeItem {
  key:   string;
  label: string;
  value: number | null;   // del modelo; se RESTA del EV
}

/** Todo lo que no es supuesto: datos del modelo, flujo terminal sugerido, puente y precio. */
export interface DcfContext {
  currentYear:    number;
  /** [fcff] Serie completa del modelo (históricos + proyectados), en orden. */
  fcffSeries?:    FcffYearInput[];
  /** [ddm] Flujos proyectados (dividendos + recompras). */
  years?:         DcfYearInput[];
  /** Flujo terminal sugerido para un g dado; `lastFlow` = flujo del último año (con ediciones). */
  terminalFor:    (g: number, lastFlow: number) => number | null;
  terminalSource: string;
  /** Partidas del puente al cierre del año base (deuda neta, minoritarios). Vacío en bancos. */
  bridgeFor:      (baseYear: number) => DcfBridgeItem[];
  refMcap:        number | null;
  refPrice:       number | null;
}

export interface DcfRun extends DcfResult {
  baseYear:    number;
  lines:       FcffLine[];        // [fcff] toda la serie
  bridgeItems: DcfBridgeItem[];
}

/** Corre el DCF con los supuestos del panel (tasa y g sobreescribibles para la sensibilidad). */
export function runDcf(ctx: DcfContext, i: DcfInputs, rate = i.rate, growth = i.growth): DcfRun {
  const keep  = (year: number) => i.includeCurrent || year !== ctx.currentYear;
  const lines = ctx.fcffSeries ? buildFcff(ctx.fcffSeries, i.fcffOverrides) : [];
  const years = ctx.fcffSeries
    ? dcfYears(lines.filter(l => l.isEst && keep(l.year)).map(l => ({ year: l.year, flow: l.fcff })))
    : dcfYears((ctx.years ?? []).filter(y => keep(y.year)));

  const baseYear    = (years[0]?.year ?? ctx.currentYear + 1) - 1;
  const bridgeItems = ctx.bridgeFor(baseYear);
  const last        = years.at(-1);
  // En fcff las ediciones ya vienen dentro del flujo; en ddm se editan los flujos directo.
  const flowOv      = ctx.fcffSeries ? undefined : i.flowOverrides;
  const lastFlow    = last ? flowOv?.[last.year] ?? last.flow ?? 0 : 0;

  const result = computeModelDcf(years, {
    rate, growth, baseYear,
    flowOverrides: flowOv,
    terminalFlow:  i.terminalFlow ?? ctx.terminalFor(growth, lastFlow),
    bridge:        bridgeItems.reduce((s, b) => s + (i.bridgeOverrides[b.key] ?? b.value ?? 0), 0),
    refMcap:       ctx.refMcap,
    refPrice:      ctx.refPrice,
  });
  return { ...result, baseYear, lines, bridgeItems };
}

interface Props {
  mode:      DcfMode;
  inputs:    DcfInputs;
  defaults:  { rate: number; growth: number };
  ctx:       DcfContext;
  result:    DcfRun;
  onChange:  (patch: Partial<DcfInputs>) => void;
  onReset:   () => void;
  ccyLabel:  string;
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
  PV:   "rgba(13,13,56,0.06)",
};
const MONO: React.CSSProperties = { fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" };

// Formato de planilla: negativos entre paréntesis.
const fmtAcc   = (v: number | null) => v === null ? "—"
  : v < 0 ? `(${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })})`
  : v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtInt   = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 0 }));
const fmtPrice = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 }));
const fmtPct   = (v: number | null, signed = false) =>
  v === null ? "—" : `${signed && v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
const fmtX     = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}x`);

// Color de un precio implícito contra el precio actual.
function upsideTone(u: number | null): { color: string; bg: string } {
  if (u === null) return { color: C.TXT2, bg: "transparent" };
  return u >= 0 ? { color: C.POS, bg: "rgba(0,30,175,0.10)" } : { color: C.NEG, bg: "rgba(248,72,94,0.10)" };
}

// Fila de la tabla de flujos: una celda por columna (año).
interface GridRow {
  label:  string;
  cell:   (col: number) => React.ReactNode;
  look?:  "main" | "sub" | "total" | "pv" | "ref";
  indent?: boolean;
}

export default function ModelDcfPanel({ mode, inputs, defaults, ctx, result, onChange, onReset, ccyLabel }: Props) {
  const rateLabel = mode === "fcff" ? "WACC" : "Ke";
  const tone      = upsideTone(result.upside);
  const flowYears = new Set(result.flows.map(f => f.year));
  const flowOf    = new Map(result.flows.map(f => [f.year, f]));
  const lastYear  = result.flows.at(-1)?.year;
  const lastFlow  = result.flows.at(-1)?.flow ?? 0;
  const suggestedTerminal = ctx.terminalFor(inputs.growth, lastFlow);
  const hasCurrent = mode === "fcff"
    ? !!ctx.fcffSeries?.some(y => y.isEst && y.year === ctx.currentYear)
    : !!ctx.years?.some(y => y.year === ctx.currentYear);

  // Columnas: hasta 3 años reales de referencia + el año en curso (si quedó fuera) + años de flujo.
  const lineOf  = new Map(result.lines.map(l => [l.year, l]));
  const cols: number[] = mode === "fcff"
    ? [
        ...result.lines.filter(l => !l.isEst).slice(-3).map(l => l.year),
        ...result.lines.filter(l => l.isEst && (flowYears.has(l.year) || l.year === ctx.currentYear)).map(l => l.year),
      ]
    : [...(hasCurrent && !inputs.includeCurrent ? [ctx.currentYear] : []), ...result.flows.map(f => f.year)];
  cols.sort((a, b) => a - b);

  // Sensibilidad: tasa (filas) × g (columnas), base ± 1 y 2 pasos → precio implícito.
  const steps   = [-2, -1, 0, 1, 2];
  const rates   = steps.map(k => inputs.rate + k * inputs.rateStep).filter(r => r > 0);
  const growths = steps.map(k => inputs.growth + k * inputs.growthStep);

  // ── Celdas editables ──────────────────────────────────────────────────────────
  const setFcff = (f: FcffField, year: number, v: number | null) => {
    const cur  = { ...(inputs.fcffOverrides[f] ?? {}) };
    if (v === null) delete cur[year]; else cur[year] = v;
    onChange({ fcffOverrides: { ...inputs.fcffOverrides, [f]: cur } });
  };
  const editAbs = (f: FcffField, year: number, value: number | null, edited?: boolean) => (
    <NumInput value={value} decimals={0} step={1} width={74} compact edited={edited}
      onCommit={v => setFcff(f, year, v)} onClear={() => setFcff(f, year, null)} />
  );
  const editPct = (f: FcffField, year: number, value: number | null, edited?: boolean) => (
    <NumInput value={value === null ? null : value * 100} decimals={1} step={0.1} width={62} compact edited={edited}
      onCommit={v => setFcff(f, year, v / 100)} onClear={() => setFcff(f, year, null)} suffix="%" />
  );
  const isFlow = (y: number) => flowYears.has(y);
  const L = (y: number) => lineOf.get(y)!;

  // ── Filas ─────────────────────────────────────────────────────────────────────
  const rows: GridRow[] = mode === "fcff" ? [
    { label: "Net Revenue", cell: y => isFlow(y) ? editAbs("revenue", y, L(y).revenue, L(y).edited.revenue) : fmtAcc(L(y).revenue) },
    { label: "EBIT (pre FV)", look: "main", cell: y => fmtAcc(L(y).ebit) },
    { label: "EBIT Mg", look: "sub", indent: true, cell: y => isFlow(y) ? editPct("ebitMg", y, L(y).ebitMg, L(y).edited.ebitMg) : fmtPct(L(y).ebitMg) },
    { label: "Tax Rate", look: "sub", cell: y => isFlow(y) ? editPct("taxRate", y, L(y).taxRate, L(y).edited.taxRate) : fmtPct(L(y).taxRate) },
    { label: "NOPAT = EBIT × (1 − t)", look: "main", cell: y => fmtAcc(L(y).nopat) },
    { label: "(+) D&A", cell: y => fmtAcc(L(y).da) },
    { label: "% Net Revenue", look: "sub", indent: true, cell: y => isFlow(y) ? editPct("daPct", y, L(y).daPct, L(y).edited.daPct) : fmtPct(L(y).daPct) },
    { label: "(−) Capex", cell: y => fmtAcc(L(y).capex) },
    { label: "% Net Revenue", look: "sub", indent: true, cell: y => isFlow(y) ? editPct("capexPct", y, L(y).capexPct, L(y).edited.capexPct) : fmtPct(L(y).capexPct) },
    { label: "x D&A", look: "sub", indent: true, cell: y => fmtX(L(y).capexDa) },
    { label: "(−) Var WK", cell: y => isFlow(y) ? editAbs("dwc", y, L(y).dwc, L(y).edited.dwc) : fmtAcc(L(y).dwc) },
    { label: "FCFF", look: "total", cell: y => isFlow(y) ? fmtAcc(L(y).fcff) : "—" },
    { label: "Perpetuity", look: "total", cell: y => y === lastYear ? fmtAcc(result.tv) : "" },
    { label: "FCFF PV", look: "pv", cell: y => isFlow(y) ? fmtAcc(flowOf.get(y)!.pv) : "—" },
    { label: "Perpetuity PV", look: "pv", cell: y => y === lastYear ? fmtAcc(result.pvTv) : "" },
    { label: "EBITDA", look: "ref", cell: y => fmtAcc(L(y).ebitda) },
    { label: "Margin", look: "sub", indent: true, cell: y => fmtPct(L(y).ebitdaMg) },
    { label: "Net Debt", look: "ref", cell: y => fmtAcc(L(y).netDebt) },
    { label: "Leverage", look: "sub", indent: true, cell: y => fmtX(L(y).leverage) },
  ] : [
    { label: "Dividend + Buyback", look: "main", cell: y => {
      const f = flowOf.get(y);
      return f ? (
        <NumInput value={f.flow} decimals={0} step={1} width={84} compact edited={f.edited}
          onCommit={v => onChange({ flowOverrides: { ...inputs.flowOverrides, [y]: v } })}
          onClear={() => onChange({ flowOverrides: without(inputs.flowOverrides, y) })} />
      ) : "—";
    } },
    { label: "Factor de descuento", look: "sub", cell: y => flowOf.get(y)?.df.toFixed(3) ?? "—" },
    { label: "Perpetuity", look: "total", cell: y => y === lastYear ? fmtAcc(result.tv) : "" },
    { label: "Flujo PV", look: "pv", cell: y => { const f = flowOf.get(y); return f ? fmtAcc(f.pv) : "—"; } },
    { label: "Perpetuity PV", look: "pv", cell: y => y === lastYear ? fmtAcc(result.pvTv) : "" },
  ];

  const th: React.CSSProperties = {
    padding: "5px 8px", background: C.HDR, color: PATRIA.white, fontSize: 12, fontWeight: 700,
    textAlign: "center", ...MONO, whiteSpace: "nowrap",
  };
  const tdBase: React.CSSProperties = {
    padding: "3px 6px", fontSize: 12.5, textAlign: "center", borderBottom: `1px solid ${C.BDR}`,
    color: C.TXT, fontWeight: 600, whiteSpace: "nowrap", ...MONO,
  };
  const rowStyle = (look: GridRow["look"]): { lbl: React.CSSProperties; td: React.CSSProperties } => {
    switch (look) {
      case "main":  return { lbl: { fontWeight: 800, color: C.TXT }, td: { fontWeight: 800 } };
      case "sub":   return { lbl: { fontStyle: "italic", fontWeight: 400, color: C.TXT2 }, td: { fontStyle: "italic", fontWeight: 400, color: C.TXT2 } };
      case "total": return { lbl: { fontWeight: 800, color: C.TXT, borderTop: `2px solid ${C.HDR}` }, td: { fontWeight: 800, borderTop: `2px solid ${C.HDR}` } };
      case "pv":    return { lbl: { fontWeight: 800, color: PATRIA.white, background: C.SUB }, td: { fontWeight: 800, color: PATRIA.white, background: C.SUB } };
      case "ref":   return { lbl: { fontWeight: 800, color: C.TXT, background: C.PV }, td: { fontWeight: 800, background: C.PV } };
      default:      return { lbl: { fontWeight: 600, color: C.TXT }, td: {} };
    }
  };

  const editedCount =
    Object.values(inputs.fcffOverrides).reduce((s, m) => s + Object.keys(m ?? {}).length, 0)
    + Object.keys(inputs.flowOverrides).length
    + Object.keys(inputs.bridgeOverrides).length + (inputs.terminalFlow !== null ? 1 : 0);

  // Puente valor → precio. Las partidas (deuda neta, minoritarios) son editables.
  const bridgeRows: { label: string; value: React.ReactNode; strong?: boolean }[] = [
    { label: `PV de los flujos (${result.flows.length} años)`, value: fmtInt(result.pvFlows) },
    { label: `PV de la perpetuidad${result.tvShare !== null ? ` (${fmtPct(result.tvShare)} del total)` : ""}`, value: fmtInt(result.pvTv) },
    { label: mode === "fcff" ? "Enterprise Value" : "Valor del patrimonio", value: fmtInt(result.ev), strong: true },
    ...result.bridgeItems.map(b => ({
      label: `− ${b.label}`,
      value: (
        <NumInput value={inputs.bridgeOverrides[b.key] ?? b.value} decimals={0} step={1} width={110} compact
          edited={inputs.bridgeOverrides[b.key] !== undefined}
          onCommit={v => onChange({ bridgeOverrides: { ...inputs.bridgeOverrides, [b.key]: v } })}
          onClear={() => { const next = { ...inputs.bridgeOverrides }; delete next[b.key]; onChange({ bridgeOverrides: next }); }} />
      ),
    })),
    ...(result.bridgeItems.length ? [{ label: "Patrimonio", value: fmtInt(result.equity), strong: true }] : []),
    { label: "Market cap actual", value: fmtInt(ctx.refMcap) },
    { label: "Precio implícito (LCCY)", value: fmtPrice(result.price), strong: true },
    { label: "Precio actual (LCCY)", value: fmtPrice(ctx.refPrice) },
  ];

  return (
    <div style={{ border: `1px solid ${C.BDR}`, borderRadius: 10, overflow: "hidden", background: PATRIA.white }}>
      {/* Banda de título */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap",
        padding: "8px 14px", background: C.HDR, color: PATRIA.white,
      }}>
        <span style={{ fontFamily: FONT_PRIMARY, fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          DCF automático · {mode === "fcff" ? "FCFF a WACC" : "Dividendos + recompras a Ke (DDM)"} · {result.flows.length} años + perpetuidad
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
            <Field label={mode === "fcff" ? "WACC" : "Costo de capital (Ke)"} hint={
              Math.abs(inputs.rate - defaults.rate) > 1e-9
                ? <>Base {fmtPct(defaults.rate)} · <LinkBtn onClick={() => onChange({ rate: defaults.rate })}>usar</LinkBtn></>
                : "Nominal, en la moneda del modelo"
            }>
              <NumInput value={inputs.rate * 100} onCommit={v => onChange({ rate: v / 100 })} suffix="%" decimals={1} step={0.5} min={0.1} />
            </Field>

            <Field label="Crecimiento perpetuidad (g)" hint={
              Math.abs(inputs.growth - defaults.growth) > 1e-9
                ? <>Base {fmtPct(defaults.growth)} · <LinkBtn onClick={() => onChange({ growth: defaults.growth })}>usar</LinkBtn></>
                : "Desde el último año proyectado"
            }>
              <NumInput value={inputs.growth * 100} onCommit={v => onChange({ growth: v / 100 })} suffix="%" decimals={1} step={0.5} />
            </Field>

            <Field label={`Flujo terminal (${lastYear ?? "—"}E)`} hint={
              inputs.terminalFlow !== null
                ? <>Sugerido {fmtInt(suggestedTerminal)} · <LinkBtn onClick={() => onChange({ terminalFlow: null })}>usar</LinkBtn></>
                : ctx.terminalSource
            }>
              <NumInput value={inputs.terminalFlow ?? suggestedTerminal} decimals={0} step={1} width={110}
                edited={inputs.terminalFlow !== null}
                onCommit={v => onChange({ terminalFlow: v })}
                onClear={() => onChange({ terminalFlow: null })} />
            </Field>

            {hasCurrent && (
              <Field label="Año en curso" hint={`Valoración al 31-dic-${result.baseYear}`}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: C.TXT, padding: "5px 0" }}>
                  <input type="checkbox" checked={inputs.includeCurrent}
                    onChange={e => onChange({ includeCurrent: e.target.checked })} />
                  Incluir {ctx.currentYear}E como flujo
                </span>
              </Field>
            )}

            <Field label={`Paso sensibilidad ${rateLabel}`} hint="Filas: base ± 1 y 2 pasos">
              <NumInput value={inputs.rateStep * 100} onCommit={v => onChange({ rateStep: v / 100 })} suffix="pp" decimals={1} step={0.25} min={0.1} />
            </Field>

            <Field label="Paso sensibilidad g" hint="Columnas: base ± 1 y 2 pasos">
              <NumInput value={inputs.growthStep * 100} onCommit={v => onChange({ growthStep: v / 100 })} suffix="pp" decimals={1} step={0.25} min={0.1} />
            </Field>
          </div>

          {/* Resultado */}
          <div style={{
            minWidth: 190, padding: "12px 16px", borderRadius: 8, background: C.SOFT,
            border: `1px solid ${C.BDR}`, display: "flex", flexDirection: "column", gap: 6,
          }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.TXT2, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Precio DCF (LCCY)
            </span>
            <span style={{ fontSize: 30, fontWeight: 800, color: C.TXT, lineHeight: 1.1, ...MONO }}>
              {fmtPrice(result.price)}
            </span>
            {result.upside !== null && (
              <span style={{ alignSelf: "flex-start", padding: "1px 8px", borderRadius: 4, fontSize: 12, fontWeight: 800, color: tone.color, background: tone.bg, ...MONO }}>
                {fmtPct(result.upside, true)} vs {fmtPrice(ctx.refPrice)}
              </span>
            )}
            {result.tvShare !== null && (
              <span style={{ fontSize: 11.5, color: C.TXT2, ...MONO }}>Perpetuidad = {fmtPct(result.tvShare)} del valor</span>
            )}
            {result.issue && <span style={{ fontSize: 11.5, color: C.NEG }}>{result.issue}</span>}
          </div>
        </div>

        {/* ── Tabla de flujos (estilo planilla) ── */}
        {cols.length > 0 && (
          <div className="scroll-x">
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 120 + cols.length * 86 }}>
              <thead>
                {/* Período de descuento: año − año base (1, 2, 3…), sólo en los años de flujo. */}
                <tr>
                  <th style={{ ...th, background: C.SOFT, color: C.TXT2, textAlign: "left", fontWeight: 600, fontSize: 11 }}>Período</th>
                  {cols.map(y => (
                    <th key={y} style={{ ...th, background: C.SOFT, color: C.SUB, fontSize: 11.5 }}>
                      {flowOf.get(y)?.period.toFixed(1) ?? "—"}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th style={{ ...th, textAlign: "left", fontFamily: FONT_PRIMARY, letterSpacing: "0.06em" }}>DCF{ccyLabel}</th>
                  {cols.map(y => (
                    <th key={y} style={{ ...th, color: y >= ctx.currentYear ? "#FFE14D" : PATRIA.white }}>{y}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const s = rowStyle(r.look);
                  return (
                    <tr key={idx}>
                      <td style={{ ...tdBase, textAlign: "left", fontFamily: FONT_SECONDARY, paddingLeft: r.indent ? 22 : 8, ...s.lbl }}>
                        {r.label}
                      </td>
                      {cols.map(y => (
                        <td key={y} style={{ ...tdBase, ...s.td, background: s.td.background ?? (isFlow(y) && !r.look ? C.EST : undefined) }}>
                          {r.cell(y)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ margin: "6px 0 0", fontSize: 11, color: C.TXT2 }}>
              {mode === "fcff"
                ? "Editables en los años de flujo: Net Revenue, EBIT Mg, Tax Rate, D&A y Capex (% del revenue) y Var WK. "
                : "Los flujos son editables. "}
              Vaciar una celda vuelve al valor del modelo.
              {editedCount > 0 && <> · <b style={{ color: C.SUB }}>{editedCount} valor{editedCount === 1 ? "" : "es"} editado{editedCount === 1 ? "" : "s"}</b></>}
            </p>
          </div>
        )}

        {/* ── Puente valor → precio + sensibilidad ── */}
        <div className="g-stack-md" style={{ display: "grid", gridTemplateColumns: "minmax(0,340px) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr><th colSpan={2} style={{ ...th, textAlign: "left", fontFamily: FONT_PRIMARY, letterSpacing: "0.06em" }}>DEL VALOR AL PRECIO{ccyLabel}</th></tr>
            </thead>
            <tbody>
              {bridgeRows.map(r => (
                <tr key={r.label}>
                  <td style={{ ...tdBase, textAlign: "left", fontFamily: FONT_SECONDARY, fontWeight: r.strong ? 800 : 400, color: r.strong ? C.SUB : C.TXT, background: r.strong ? C.SOFT : undefined }}>{r.label}</td>
                  <td style={{ ...tdBase, textAlign: "right", fontWeight: r.strong ? 800 : 600, background: r.strong ? C.SOFT : undefined }}>{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {rates.length > 0 && (
            <div className="scroll-x">
              <table style={{ borderCollapse: "collapse", minWidth: 380 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left", fontFamily: FONT_PRIMARY, letterSpacing: "0.06em" }}>{rateLabel} \ g</th>
                    {growths.map((g, j) => <th key={j} style={th}>{fmtPct(g)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r, i) => (
                    <tr key={i}>
                      <td style={{ ...tdBase, textAlign: "left", fontWeight: 700, color: C.SUB, background: Math.abs(r - inputs.rate) < 1e-9 ? C.SOFT : undefined }}>{fmtPct(r)}</td>
                      {growths.map((g, j) => {
                        const isBase = Math.abs(r - inputs.rate) < 1e-9 && Math.abs(g - inputs.growth) < 1e-9;
                        const res    = r > g ? runDcf(ctx, inputs, r, g) : null;
                        const t      = upsideTone(res?.upside ?? null);
                        return (
                          <td key={j} style={{
                            ...tdBase, borderLeft: `1px solid ${C.BDR}`, color: t.color, background: t.bg, fontWeight: isBase ? 800 : 600,
                            outline: isBase ? `2px solid ${C.HDR}` : undefined, outlineOffset: -2,
                          }}>
                            {res ? fmtPrice(res.price) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ margin: "6px 0 0", fontSize: 11, color: C.TXT2 }}>Precio implícito (LCCY). Azul = sobre el precio actual; rosado = bajo.</p>
            </div>
          )}
        </div>

        <p style={{ margin: 0, fontSize: 11.5, color: C.TXT2, lineHeight: 1.5 }}>
          {mode === "fcff"
            ? <>FCFF = EBIT × (1 − t) + D&A − Capex − Var WK, descontado al WACC; perpetuidad = FCFF terminal × (1 + g) / (WACC − g).
                Al EV se le resta la deuda neta y los minoritarios al cierre del año base.</>
            : <>Se descuentan los dividendos + recompras al Ke; perpetuidad = flujo terminal × (1 + g) / (Ke − g). El flujo terminal
                sugerido es Net Income × (1 − g / ROE): lo que el banco puede repartir y aun así crecer su patrimonio a g.</>}
          {" "}Se valora al 31-dic-{result.baseYear} y cada año se descuenta por su período (año − {result.baseYear}).
          El precio sale de patrimonio / market cap actual × precio actual, en la misma escala del modelo.
        </p>
      </div>
    </div>
  );
}
