/**
 * Métricas DERIVADAS de los modelos de analista para Extract Data: márgenes,
 * crecimientos, retornos, múltiplos y yields — lo que el deep-dive arma encima de los
 * financials crudos (ModelExplorer / BankModelExplorer).
 *
 * Las fórmulas replican las filas "derived" de esos explorers, y el market cap y los
 * múltiplos de mercado salen de lib/modelMultiples (la implementación única que comparten
 * deep-dive y Estimates), así que un P/E descargado es el mismo número que se ve en pantalla:
 *   · años estimados (year ≥ año actual) usan el precio vivo de price_range_52w;
 *   · años históricos, el precio / market cap que dejó el analista.
 *
 * Cada métrica recibe el año, el anterior y el siguiente del MISMO snapshot (crecimientos,
 * ROE sobre patrimonio inicial, PEG), por eso la API calcula sobre todos los años del modelo
 * y recién después recorta al rango pedido.
 */

import type { ModelKind } from "@/lib/extractMetrics";
import {
  companyEffMarketCap, bankEffMarketCap, companyEv, companyEvEbitda, companyPe, bankPe,
  type LiveQuote,
} from "@/lib/modelMultiples";

type Fin = Record<string, unknown>;

export interface DerivedCtx {
  kind:    ModelKind;
  cur:     Fin;
  prev:    Fin | null;
  next:    Fin | null;
  /** Market cap en la escala de los financials (vivo en años estimados). */
  mcap:    number | null;
}

const num = (row: Fin | null, field: string): number | null => {
  const v = row?.[field];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

// Campo por concepto: mismo mapeo empresa/banco que el catálogo crudo.
const FIELD = {
  revenue:  { company: "revenue",       bank: "revenue" },
  ni:       { company: "netIncome",     bank: "controllingNetIncome" },
  eps:      { company: "eps",           bank: "eps" },
  ctrlEq:   { company: "controllingEq", bank: "controllingEquity" },
  tanEq:    { company: "tangibleEq",    bank: "tangibleEquity" },
  dividend: { company: "dividend",      bank: "dividend" },
  buybacks: { company: "buybacks",      bank: "buybacks" },
} as const;

const get = (c: DerivedCtx, row: Fin | null, concept: keyof typeof FIELD) =>
  num(row, FIELD[concept][c.kind]);

// División con la semántica de cada explorer:
//  · empresa (sdiv): null si numerador o denominador es null/0.
//  · banco (divz):   null sólo con null o denominador 0.
function div(c: DerivedCtx, a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  if (c.kind === "company" && a === 0) return null;
  return a / b;
}
const grow = (cur: number | null, prev: number | null) =>
  cur === null || prev === null || prev === 0 ? null : cur / prev - 1;
const abs = (v: number | null) => (v === null ? null : Math.abs(v));
const nopat = (ebit: number | null, tax: number | null) =>
  ebit === null || tax === null ? null : ebit * (1 - tax);

function pe(c: DerivedCtx): number | null {
  const ni = get(c, c.cur, "ni");
  return c.kind === "company" ? companyPe(c.mcap, ni) : bankPe(c.mcap, ni);
}

/** id → fórmula. Las ids son las del catálogo (lib/extractMetrics, `derived: true`). */
export const DERIVED_FORMULAS: Record<string, (c: DerivedCtx) => number | null> = {
  // ── Growth & Margins ──────────────────────────────────────────────────────
  rev_growth:     (c) => grow(get(c, c.cur, "revenue"), get(c, c.prev, "revenue")),
  ebitda_growth:  (c) => grow(num(c.cur, "ebitda"), num(c.prev, "ebitda")),
  ni_growth:      (c) => grow(get(c, c.cur, "ni"), get(c, c.prev, "ni")),
  eps_growth:     (c) => grow(get(c, c.cur, "eps"), get(c, c.prev, "eps")),
  ebit_margin:    (c) => div(c, num(c.cur, "ebit"), get(c, c.cur, "revenue")),
  ebitda_margin:  (c) => div(c, num(c.cur, "ebitda"), get(c, c.cur, "revenue")),
  net_margin:     (c) => div(c, get(c, c.cur, "ni"), get(c, c.cur, "revenue")),
  capex_revenue:  (c) => div(c, abs(num(c.cur, "capex")), get(c, c.cur, "revenue")),
  nd_ebitda:      (c) => div(c, num(c.cur, "netDebt"), num(c.cur, "ebitda")),
  wk_change:      (c) => {
    const a = num(c.cur, "workingCapital"), b = num(c.prev, "workingCapital");
    return a === null || b === null ? null : a - b;
  },

  // ── Bank ratios ───────────────────────────────────────────────────────────
  nii_share:         (c) => div(c, num(c.cur, "netInterestIncome"), num(c.cur, "revenue")),
  fee_share:         (c) => div(c, num(c.cur, "netFeeIncome"), num(c.cur, "revenue")),
  loans_deposits:    (c) => div(c, num(c.cur, "grossLoans"), num(c.cur, "totalDeposits")),
  deposits_funding:  (c) => div(c, num(c.cur, "totalDeposits"), num(c.cur, "totalFunding")),
  assets_equity:     (c) => div(c, num(c.cur, "totalAssets"), num(c.cur, "controllingEquity")),

  // ── Returns (sobre el patrimonio / capital del año anterior) ──────────────
  roe:            (c) => div(c, get(c, c.cur, "ni"), get(c, c.prev, "ctrlEq")),
  roe_tangible:   (c) => div(c, get(c, c.cur, "ni"), get(c, c.prev, "tanEq")),
  roic:           (c) => {
    const p = c.prev; if (!p) return null;
    const nd = num(p, "netDebt"), mi = num(p, "minorities"), eq = num(p, "controllingEq");
    const ic = nd !== null && mi !== null && eq !== null ? nd + mi + eq : null;
    return div(c, nopat(num(c.cur, "ebit"), num(c.cur, "taxRate")), ic);
  },
  roic_operating: (c) => {
    const p = c.prev; if (!p) return null;
    const wk = num(p, "workingCapital"), ppe = num(p, "ppe");
    const ic = wk !== null && ppe !== null ? wk + ppe : null;
    return div(c, nopat(num(c.cur, "ebit"), num(c.cur, "taxRate")), ic);
  },
  payout_calc:    (c) => {
    const d = num(c.cur, "dividend"), niPrev = get(c, c.prev, "ni");
    return d !== null && niPrev ? Math.abs(d) / niPrev : null;
  },

  // ── Multiples & Yields (precio vivo en años estimados) ────────────────────
  eff_market_cap: (c) => c.mcap,
  ev:             (c) => companyEv(c.mcap, num(c.cur, "netDebt")),
  ev_ebitda:      (c) => companyEvEbitda(c.mcap, num(c.cur, "netDebt"), num(c.cur, "ebitda")),
  pe:             (c) => pe(c),
  pbv:            (c) => div(c, c.mcap, get(c, c.cur, "ctrlEq")),
  ptbv:           (c) => div(c, c.mcap, get(c, c.cur, "tanEq")),
  peg:            (c) => {
    const p = pe(c), g = grow(get(c, c.next, "eps"), get(c, c.cur, "eps"));
    return p === null || g === null || g === 0 ? null : p / (g * 100);
  },
  fcf_yield:      (c) => div(c, num(c.cur, "fcf"), c.mcap),
  fcfe_yield:     (c) => div(c, num(c.cur, "fcfe"), c.mcap),
  div_yield:      (c) => div(c, abs(get(c, c.cur, "dividend")), c.mcap),
  bb_yield:       (c) => div(c, abs(get(c, c.cur, "buybacks")), c.mcap),
  total_yield:    (c) => {
    const d = get(c, c.cur, "dividend"), b = get(c, c.cur, "buybacks");
    if (d === null && b === null) return null;
    return div(c, Math.abs(d ?? 0) + Math.abs(b ?? 0), c.mcap);
  },
};

/** Market cap efectivo de una fila: mismas reglas que el deep-dive. */
export function effectiveMarketCap(
  kind: ModelKind, fin: Fin, year: number, live: LiveQuote | null, hasSeries: boolean,
): number | null {
  const isEst = year >= new Date().getFullYear();
  if (kind === "company") {
    return companyEffMarketCap(
      {
        sharePrice: num(fin, "sharePrice"), sharesOut: num(fin, "sharesOut"),
        marketCap:  num(fin, "marketCap"),  fxEop:     num(fin, "fxEop"),
      },
      isEst ? live : null,
      hasSeries,
    );
  }
  return bankEffMarketCap(
    { sharePrice: num(fin, "sharePrice"), shares: num(fin, "shares"), marketCap: num(fin, "marketCap") },
    isEst && live ? live.price : null,
  );
}
