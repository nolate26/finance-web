"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PATRIA, FONT_PRIMARY, FONT_SECONDARY } from "@/lib/patriaTheme";
import type { ColDef, Group, CompanyGroup, DisplayRow, IndexAggRow, FundAggRow } from "./StockSelectionV1";

// ── Hoja imprimible de Stock Selection ──────────────────────────────────────────
// Legal apaisado, dos planas: la primera con una parte de las compañías, la segunda con
// el resto más los índices y los fondos. Se dispara con window.print(): el navegador
// ofrece "Guardar como PDF", que es el PDF que se pide.
//
// Se monta por portal directo en <body> para poder esconder TODO lo demás con una regla
// `body > *:not(#ss-print)`. En pantalla no se ve nunca (display:none); sólo existe en
// @media print. Reusa las mismas filas y definiciones de columna que la tabla, así que lo
// que se imprime es exactamente lo que está en pantalla, con sus grupos desplegados o no.

export interface PrintMeta {
  cartera: string | null;   // YYYY-MM-DD de la foto de carteras
  precios: string | null;   // YYYY-MM-DD del snapshot de retornos (total return último)
  periodo: string;          // "1Q26"
  tc: number;
}

export interface PrintColGroup { id: string; title: string; cols: ColDef[]; tint?: string }

export interface PrintProps {
  meta: PrintMeta;
  cols: PrintColGroup[];             // columnas de compañías, ya filtradas por lo visible
  page1: CompanyGroup[];
  page2: CompanyGroup[];
  sectionIdx: (name: string) => number;
  fixedMode: boolean;
  aggCols: PrintColGroup[];          // columnas de la tabla de índices / fondos
  indices: IndexAggRow[];
  fondos: FundAggRow[];
  aggRow: (name: string, v: Record<string, number | null>) => DisplayRow;
}

const INK = PATRIA.darkBlue;
const RULE = "rgba(13,13,56,0.28)";
const RULE_SOFT = "rgba(13,13,56,0.12)";

/** "2026-09-01" → "01-09-2026". */
const fmtDMY = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}-${m}-${y}` : iso;
};

// Capacidad de una plana en "unidades de fila" a escala 1, MEDIDA en Chrome headless con
// esta misma hoja de estilos (legal apaisado, márgenes 8/9 mm): 54 filas de compañía en
// la plana 1; en la 2, 35 filas más 14 agregadas más título, encabezado y pie. Se deja en
// 52 —una fila de margen— porque el corte tiene ±1 de fuzz y pasarse cuesta una tercera
// hoja con dos filas. Si alguna plana supera esto se aplica `zoom` (Chrome lo respeta al
// imprimir) hasta que quepa. Con el universo actual (~104 filas + 14 agregadas) sale ≈ 0,84.
const CAPACIDAD = 52;
const ZOOM_MIN = 0.7; // más chico que esto ya no se lee: mejor que salga en tres planas

export default function SsV1PrintView(p: PrintProps) {
  // El portal necesita el DOM: en SSR no hay body.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const rowsOf = (gs: CompanyGroup[]) => gs.reduce((n, g) => n + 1 + g.series.length, 0);
  const aggUnits = p.indices.length + p.fondos.length;
  const units1 = rowsOf(p.page1);
  // Plana 2: filas + el pie de fuentes (≈2 filas) + el bloque agregado con su título y su
  // doble encabezado (≈3 filas) si lo hay.
  const units2 = rowsOf(p.page2) + 2 + (aggUnits ? aggUnits + 3 : 0);
  const zoom = Math.max(ZOOM_MIN, Math.min(1, CAPACIDAD / Math.max(units1, units2, 1)));

  const header = (g: PrintColGroup[], firstLabel: string) => (
    <thead>
      <tr>
        <th rowSpan={2} className="pr-th pr-th-left">{firstLabel}</th>
        {g.map((grp) => (
          <th key={grp.id} colSpan={grp.cols.length} className="pr-th pr-th-group">{grp.title}</th>
        ))}
      </tr>
      <tr>
        {g.map((grp) => grp.cols.map((c, i) => (
          <th key={c.id} className={`pr-th pr-th-col${i === 0 ? " pr-first" : ""}`} style={{ textAlign: c.align ?? "right" }}>{c.label}</th>
        )))}
      </tr>
    </thead>
  );

  const cells = (r: DisplayRow, g: PrintColGroup[]) =>
    g.map((grp) => grp.cols.map((c, i) => {
      const out = c.render(r);
      return (
        <td key={c.id} className={`pr-td${i === 0 ? " pr-first" : ""}`}
          style={{ textAlign: c.align ?? "right", color: out.color ?? INK, fontWeight: out.weight && out.weight >= 700 ? 700 : 400 }}>
          {out.text}
        </td>
      );
    }));

  const companyRows = (groups: CompanyGroup[]) =>
    groups.map((g, gi) => {
      const rows = [g.cons, ...g.series];
      const sectionStart = p.fixedMode && gi > 0 && p.sectionIdx(g.cons.company) !== p.sectionIdx(groups[gi - 1].cons.company);
      return rows.map((r, ri) => {
        const isSeries = r.kind === "series";
        return (
          <tr key={`${r.company}-${r.label || "c"}`} className={`pr-tr${isSeries ? " pr-series" : ""}${sectionStart && ri === 0 ? " pr-section" : ""}`}>
            <td className="pr-td pr-td-left">
              {isSeries ? (
                <span className="pr-serie">↳ Serie {r.label} <span className="pr-tk">{r.seriesBBG ?? ""}</span></span>
              ) : (
                <span className="pr-name">{r.company}{r.kind === "consolidated" ? <span className="pr-badge">consol.</span> : null} <span className="pr-tk">{r.tickerBBG ?? ""}</span></span>
              )}
            </td>
            {cells(r, p.cols)}
          </tr>
        );
      });
    });

  return createPortal(
    <div id="ss-print">
      <style>{`
        #ss-print { display: none; }
        @media print {
          @page { size: legal landscape; margin: 8mm 9mm; }
          html, body { background: #fff !important; }
          body > *:not(#ss-print) { display: none !important; }
          #ss-print { display: block !important; color: ${INK}; font-family: ${FONT_PRIMARY}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .pr-page { page-break-after: always; break-after: page; zoom: ${zoom}; }
          .pr-page:last-child { page-break-after: auto; break-after: auto; }
          .pr-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12pt; margin-bottom: 4pt; padding-bottom: 3pt; border-bottom: 1.5pt solid ${INK}; }
          .pr-meta { font-size: 7.5pt; line-height: 1.3; font-family: ${FONT_SECONDARY}; font-variant-numeric: tabular-nums; }
          .pr-meta b { font-weight: 700; }
          .pr-meta-mini { font-size: 6.5pt; color: rgba(13,13,56,0.7); font-family: ${FONT_SECONDARY}; font-variant-numeric: tabular-nums; }
          .pr-title { font-size: 10.5pt; font-weight: 700; letter-spacing: -0.01em; }
          .pr-sub { font-size: 6.5pt; color: rgba(13,13,56,0.6); }
          table.pr { border-collapse: collapse; width: 100%; table-layout: auto; }
          .pr-th { font-size: 5.3pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 1.2pt 2.2pt; white-space: nowrap; line-height: 1.15; }
          .pr-th-group { background: ${INK}; color: #fff; text-align: center; border-left: 0.5pt solid rgba(255,255,255,0.25); }
          .pr-th-left { background: ${INK}; color: #fff; text-align: left; vertical-align: bottom; min-width: 88pt; }
          .pr-th-col { color: ${INK}; background: #EEF1FA; border-bottom: 1pt solid ${INK}; }
          .pr-th-col.pr-first { border-left: 0.5pt solid ${RULE}; }
          .pr-td { font-size: 5.9pt; font-family: ${FONT_SECONDARY}; font-variant-numeric: tabular-nums; padding: 0.7pt 2.2pt; white-space: nowrap; border-bottom: 0.35pt solid ${RULE_SOFT}; line-height: 1.15; }
          .pr-td.pr-first { border-left: 0.5pt solid ${RULE_SOFT}; }
          .pr-td-left { font-family: ${FONT_PRIMARY}; text-align: left; }
          .pr-name { font-size: 6.2pt; font-weight: 700; }
          .pr-tk { font-family: ${FONT_SECONDARY}; font-weight: 400; font-size: 5pt; color: rgba(13,13,56,0.55); margin-left: 3pt; }
          .pr-badge { font-size: 4.6pt; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: ${PATRIA.kingBlue}; margin-left: 3pt; }
          .pr-serie { font-size: 5.5pt; color: rgba(13,13,56,0.7); padding-left: 7pt; }
          .pr-series .pr-td { font-size: 5.5pt; color: rgba(13,13,56,0.72); background: #F7F8FC; }
          .pr-section .pr-td { border-top: 1.3pt solid ${RULE}; }
          .pr-agg-title { font-size: 7.5pt; font-weight: 700; margin: 5pt 0 2.5pt; display: flex; align-items: center; gap: 5pt; }
          .pr-agg-title::before { content: ""; width: 2.5pt; height: 8.5pt; background: ${INK}; border-radius: 1pt; }
          .pr-agg .pr-td { background: rgba(70,232,224,0.09); }
          .pr-agg .pr-fondo .pr-td { background: rgba(0,30,175,0.06); }
          .pr-agg .pr-fondo-first .pr-td { border-top: 1.3pt solid ${PATRIA.blue}; }
          .pr-agg-name { font-size: 6.2pt; font-weight: 700; }
          .pr-agg-n { font-family: ${FONT_SECONDARY}; font-size: 5pt; color: rgba(13,13,56,0.55); margin-left: 3pt; }
          .pr-foot { margin-top: 3pt; font-size: 5.4pt; color: rgba(13,13,56,0.55); font-family: ${FONT_SECONDARY}; }
          tr { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

      {/* ── Plana 1 ─────────────────────────────────────────────────────── */}
      <section className="pr-page">
        <div className="pr-head">
          <div className="pr-meta">
            <div><b>Fecha del cierre de la cartera:</b> {fmtDMY(p.meta.cartera)}</div>
            <div><b>Precios (total return último):</b> {fmtDMY(p.meta.precios)}</div>
            <div><b>Resultados:</b> {p.meta.periodo}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="pr-title">Stock Selection · Chile</div>
            <div className="pr-sub">USD mn · TC USD/CLP {p.meta.tc.toLocaleString("es-CL")} · plana 1 de 2</div>
          </div>
        </div>
        <table className="pr">
          {header(p.cols, "Empresa")}
          <tbody>{companyRows(p.page1)}</tbody>
        </table>
      </section>

      {/* ── Plana 2 ─────────────────────────────────────────────────────── */}
      <section className="pr-page">
        <div className="pr-head">
          <div className="pr-meta-mini">
            Cartera al {fmtDMY(p.meta.cartera)} · Precios al {fmtDMY(p.meta.precios)} · Resultados {p.meta.periodo}
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="pr-title">Stock Selection · Chile</div>
            <div className="pr-sub">USD mn · TC USD/CLP {p.meta.tc.toLocaleString("es-CL")} · plana 2 de 2</div>
          </div>
        </div>
        {p.page2.length > 0 && (
          <table className="pr">
            {header(p.cols, "Empresa")}
            <tbody>{companyRows(p.page2)}</tbody>
          </table>
        )}

        {(p.indices.length > 0 || p.fondos.length > 0) && (
          <>
            <div className="pr-agg-title">Índices y fondos — sumaproducto</div>
            <table className="pr pr-agg">
              {header(p.aggCols, "Índice / Fondo")}
              <tbody>
                {p.indices.map((a) => (
                  <tr key={`i-${a.index}`} className="pr-tr">
                    <td className="pr-td pr-td-left"><span className="pr-agg-name">{a.index}</span><span className="pr-agg-n">{a.count}</span></td>
                    {cells(p.aggRow(a.index, a.v), p.aggCols)}
                  </tr>
                ))}
                {p.fondos.map((f, i) => (
                  <tr key={`f-${f.fondo}`} className={`pr-tr pr-fondo${i === 0 ? " pr-fondo-first" : ""}`}>
                    <td className="pr-td pr-td-left"><span className="pr-agg-name" style={{ color: PATRIA.blue }}>{f.fondo}</span><span className="pr-agg-n">{f.count}</span></td>
                    {cells(p.aggRow(f.fondo, f.v), p.aggCols)}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="pr-foot">
          Fundamentales: stock_selection_v1 (millones, moneda local → USD al TC indicado) · Proyecciones: proyecciones_financieras ·
          Precios: Yahoo Finance · Retornos: Bloomberg (total return, dividendos brutos) · Índices y fondos = Σ (M.Cap y fundamentales × peso); los múltiplos salen de esas sumas.
          {" "}Columnas impresas = las visibles en pantalla al momento de imprimir.
        </div>
      </section>
    </div>,
    document.body,
  );
}
