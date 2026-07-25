"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, LayoutGrid, X, Check, Plus, Save, Search, Pencil, RotateCcw } from "lucide-react";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { OVERRIDE_FIELDS, FIELD_AFFECTS } from "@/lib/ssOverrideFields";
import type { SsV1Company, SsV1Payload, SsV1Series, IndexLevel } from "@/app/api/chile/stock-selection-v1/route";
import type { IndexMembershipPayload } from "@/app/api/chile/index-membership/route";

// Amarillo para celdas editadas por admin (override) y sus dependientes.
const EDIT_BG = "rgba(250,204,21,0.30)";
const EDIT_BORDER = "#CA8A04";
// Columnas afectadas (a pintar) dada la lista de campos overrideados de una compañía.
const affectedCols = (overrides: string[] | undefined): Set<string> => {
  const s = new Set<string>();
  for (const f of overrides ?? []) for (const c of FIELD_AFFECTS[f] ?? []) s.add(c);
  return s;
};

// ── Design tokens ────────────────────────────────────────────────────────────────
// Paleta sobria (grises pizarra). El único color con significado es verde/rojo en
// variaciones y retornos; el resto de la tabla es monocromo para que se lea como
// una planilla institucional y no como un semáforo.
const TEXT1 = "#0F172A";
const TEXT2 = "#475569";
const TEXT3 = "#94A3B8";
const BORDER = "rgba(15,23,42,0.09)";
const SECTION_BORDER = "2px solid rgba(15,23,42,0.22)"; // separador entre secciones del orden fijo
const NAVY = "#1E3A5F";      // azul marino: encabezado y acentos del chrome
const NAVY_BAND = "#27496E"; // banda alterna por grupo, fila 1 del encabezado
const NAVY_TEXT = "#E8EEF5"; // texto sobre marino
const HEAD2_BG = "#D7E2EF";  // fila 2 del encabezado (etiquetas de columna)
const HEAD2_BAND = "#CBD9EA";
const HEAD2_TEXT = "#15304F";
const INK = NAVY;            // acento del chrome (botones, barras)
const SURFACE = "#F8FAFC";   // fondo de controles
const ZEBRA = "#FAFBFC";     // fila par
const BAND = "rgba(30,58,95,0.030)"; // banda alterna por grupo de columnas
const POS = "#15803D";
const NEG = "#B91C1C";
const NUM = "#334155";       // números neutros
const NM_TEXT = "#A8B2C1";   // "NM" / "—"
// Tabla de índices (sumaproducto): tono teal para distinguirla de la de empresas.
const IDX_HEAD = "#1F5B57";
const IDX_HEAD_BAND = "#276B66";
const IDX_HEAD_TEXT = "#E9F3F2";
const IDX_TINT = "#F0F6F5";   // fondo de la tabla de índices
const IDX_ZEBRA = "#E7F0EF";  // fila alterna

// ── Formatters ──────────────────────────────────────────────────────────────────
// Sentinela para "no significativo": múltiplos y variaciones sobre bases ≤ 0.
const NM = Number.NEGATIVE_INFINITY;
const isNM = (v: number | null | undefined): boolean => v != null && !isFinite(v);

const fmtMn = (v: number | null | undefined): string =>
  v == null ? "—" : !isFinite(v) ? "NM" : Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1);
const fmtX = (v: number | null | undefined): string =>
  v == null ? "—" : !isFinite(v) || v <= 0 ? "NM" : v.toFixed(1) + "x";
const fmtPrice = (v: number | null | undefined): string =>
  v == null || !isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v: number | null | undefined): { text: string; color: string } => {
  if (v == null) return { text: "—", color: NM_TEXT };
  if (!isFinite(v)) return { text: "NM", color: NM_TEXT };
  const color = v > 0.0005 ? POS : v < -0.0005 ? NEG : TEXT2;
  return { text: (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%", color };
};
const yld = (v: number | null | undefined): string => (v == null || !isFinite(v) ? "—" : (v * 100).toFixed(1) + "%");
const roePct = (v: number | null | undefined): string =>
  v == null ? "—" : !isFinite(v) ? "NM" : (v * 100).toFixed(1) + "%";

// ── conv() ───────────────────────────────────────────────────────────────────────
function makeConv(tc: number) {
  return (x: number | null | undefined, ccy: string | null | undefined): number | null => {
    if (x == null || !isFinite(x)) return null;
    if (ccy === "CLP") return x / tc;
    if (ccy === "USD") return x;
    return null; // moneda no soportada (ej. GBp)
  };
}
// Múltiplo (P/U, FV/EBITDA, P/BV…): sólo tiene sentido con numerador y denominador
// positivos. Con utilidad/EBITDA/patrimonio negativo → NM (y ojo: dos negativos darían
// un múltiplo positivo engañoso, por eso se chequean ambos lados).
const mult = (n: number | null, d: number | null): number | null =>
  n == null || d == null ? null : n <= 0 || d <= 0 ? NM : n / d;
// Tasa (ROE, ROIC): NM con base ≤ 0 (patrimonio / capital invertido negativo) y
// también con numerador negativo — un ROE negativo no se compara contra el resto
// de la tabla, así que se marca NM igual que los múltiplos.
const rate = (n: number | null, d: number | null): number | null =>
  n == null || d == null ? null : d <= 0 || n < 0 ? NM : n / d;
// Variación a/a: NM si la base es ≤ 0 o si el período actual es negativo.
const varOf = (cur: number | null, base: number | null): number | null =>
  cur == null || base == null ? null : base <= 0 || cur < 0 ? NM : cur / base - 1;

// Recomendación: texto coloreado (Comprar=verde, Mantener=ámbar, Vender=rojo; free-text neutro).
const REC_STYLE: Record<string, { label: string; color: string }> = {
  comprar: { label: "Comprar", color: POS },
  mantener: { label: "Mantener", color: "#A16207" },
  vender: { label: "Vender", color: NEG },
};
const recCell = (rec: string | null): { text: string; color: string; weight?: number } => {
  if (!rec) return { text: "—", color: TEXT3 };
  const m = REC_STYLE[rec.toLowerCase().trim()];
  return m ? { text: m.label, color: m.color, weight: 700 } : { text: rec, color: TEXT2 };
};
const fmtDate = (d: string | null): string => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y.slice(2)}` : d;
};

// ── Orden fijo por sector ──────────────────────────────────────────────────────
// Cada sub-array es una SECCIÓN; entre secciones se dibuja un borde. Se machea por
// nombre de compañía (stock_selection_v1.company, normalizado → case-insensitive).
// Las dobles (Andina, Embonor, Soquimich, Aguas, Potasios) se ubican por su nombre
// base y se muestran A → B → consolidada. Compañías no listadas → sección "Otros" al final.
const normName = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const FIXED_SECTIONS: string[][] = [
  ["CAP", "Cintac"],
  ["Provida", "Habitat", "AFPCapital", "Cuprum"],
  ["Watts", "Carozzi"],
  ["Bsantander", "Chile", "BCI", "Itaucl", "Nubank"],
  ["ILC", "Bicecorp", "Banvida"],
  ["Andina", "CCU", "Embonor"],
  ["Cencosud", "Falabella", "Mercado Libre", "SMU", "Ripley", "Nuevapolar", "Hites", "Forus", "Tricot"],
  ["Mallplaza", "Cencoshopp", "Parauco"],
  ["Quinenco", "SK", "Cristales", "Elecmetal"],
  ["Salfacorp", "Besalco", "EISA"],
  ["Socovesa", "Paz", "Manquehue", "Ingevec", "Moller", "Enjoy"],
  ["EnelAM", "EnelChile", "EnelGxCh", "Colbun", "ECL", "Pehuenche", "Edelpa"],
  ["Enaex"],
  ["Copec", "CMPC", "Masisa"],
  ["Antarchile", "Almendral", "Minera", "IAM", "Naviera", "Vapores", "Invercap", "Nortegran", "Oro Blanco", "Potasios"],
  ["Molymet"],
  ["Pucobre", "Soquimich", "Soquicom"],
  ["MultiX", "Salmocam", "Camanchaca", "Blumar"],
  ["Las Condes", "Indisa"],
  ["Gasco", "Aguas", "Lipigas"],
  ["Sonda"],
  ["Entel"],
  ["LTM", "SMSAAM", "Ventanas", "Fepasa"],
  ["ConchaToro", "VSPT", "Santa Rita"],
];
const FIXED_ORDER = new Map<string, number>();   // norm(name) → posición global
const FIXED_SECTION = new Map<string, number>(); // norm(name) → índice de sección
FIXED_SECTIONS.forEach((sec, si) =>
  sec.forEach((nm) => { FIXED_ORDER.set(normName(nm), FIXED_ORDER.size); FIXED_SECTION.set(normName(nm), si); }),
);
const OTHERS_SECTION = FIXED_SECTIONS.length;
const orderIdx = (name: string): number => FIXED_ORDER.get(normName(name)) ?? 1e6; // no listadas → al final (orden estable = alfabético)
const sectionIdx = (name: string): number => FIXED_SECTION.get(normName(name)) ?? OTHERS_SECTION;
const FIXED_KEY = "__order__";

// ── Computed value bag (USD mn) ────────────────────────────────────────────────
interface Alloc {
  dn: number | null; debtN4Usd: number | null; equityNUsd: number | null; equityN4Usd: number | null;
  minorityNUsd: number | null; minorityN4Usd: number | null;
  ebitdaLtmUsd: number | null; ebitda26Usd: number | null; ebitda27Usd: number | null;
  utilLtmUsd: number | null; util26Usd: number | null; util27Usd: number | null; revLtmUsd: number | null;
  ebitLtmUsd: number | null; ebitdaN: number | null; ebitdaN4: number | null; utilidadN: number | null;
  utilidadN4: number | null; payout: number | null;
}

function computeV(mcap: number | null, a: Alloc): Record<string, number | null> {
  const fv = mcap != null && a.dn != null ? mcap + a.dn : null;
  const nopat = a.ebitLtmUsd != null ? a.ebitLtmUsd * (1 - 0.27) : null;
  const icN4 = a.equityN4Usd != null && a.debtN4Usd != null ? a.equityN4Usd + a.debtN4Usd + (a.minorityN4Usd ?? 0) : null;
  const icN = a.dn != null && a.equityNUsd != null ? a.dn + a.equityNUsd + (a.minorityNUsd ?? 0) : null;
  const dividendos = a.payout != null && a.util26Usd != null ? Math.max(a.payout * a.util26Usd, 0) : null;
  return {
    mcap, dn: a.dn, fv,
    ebitdaN4: a.ebitdaN4, ebitdaN: a.ebitdaN, ebitdaVar: varOf(a.ebitdaN, a.ebitdaN4),
    utilidadN4: a.utilidadN4, utilidadN: a.utilidadN, utilVar: varOf(a.utilidadN, a.utilidadN4),
    ebitdaLtmUsd: a.ebitdaLtmUsd, ebitda26Usd: a.ebitda26Usd, ebitda27Usd: a.ebitda27Usd,
    fvEbitdaLtm: mult(fv, a.ebitdaLtmUsd), fvEbitda26: mult(fv, a.ebitda26Usd), fvEbitda27: mult(fv, a.ebitda27Usd),
    utilLtmUsd: a.utilLtmUsd, util26Usd: a.util26Usd, util27Usd: a.util27Usd,
    puLtm: mult(mcap, a.utilLtmUsd), pu26: mult(mcap, a.util26Usd), pu27: mult(mcap, a.util27Usd),
    pbv: mult(mcap, a.equityNUsd),
    roeLtm: rate(a.utilLtmUsd, a.equityN4Usd), roe26: rate(a.util26Usd, a.equityNUsd),
    fvs: mult(fv, a.revLtmUsd),
    divYield: dividendos != null && mcap != null && mcap > 0 ? dividendos / mcap : null,
    roic: rate(nopat, icN4), fvic: mult(fv, icN),
  };
}

// ── Display rows ────────────────────────────────────────────────────────────────
interface DisplayRow {
  company: string; tickerBBG: string | null; ssCurrency: "CLP" | "USD"; industria: string | null;
  divLabel: string | null;
  payout: number | null;    // pool_div (payout) de proyecciones_financieras, decimal 0..1
  rec: string | null;       // recomendación (AnalystRecommendationHistory)
  recDate: string | null;   // YYYY-MM-DD
  tp: number | null;        // target price, moneda del listado (sin conv)
  label: string;            // "" consolidada/single · "A"/"B" serie
  kind: "single" | "consolidated" | "series";
  seriesBBG: string | null;
  v: Record<string, number | null>;
  overrides?: string[];     // campos con override de admin (para pintar)
}
// Unidad agregable para el sumaproducto por índice: los primitivos aditivos (Alloc en
// USD mn) + su M.Cap + su dividendo estimado. `key` = nombre normalizado (single/consol
// por nombre base; series por "nombre-a"/"nombre-b").
const RET_FIELDS = ["retMonth", "retYtd", "retYear", "ret3y", "ret5y"] as const;
interface AggUnit { alloc: Alloc; mcap: number | null; dividendos: number | null }
interface UnitEntry { key: string; u: AggUnit }
interface CompanyGroup { cons: DisplayRow; series: DisplayRow[]; units: UnitEntry[] }

const dividendosOf = (a: Alloc): number | null =>
  a.payout != null && a.util26Usd != null ? Math.max(a.payout * a.util26Usd, 0) : null;

function mcapOf(s: SsV1Series, tc: number): number | null {
  if (s.price == null || s.shares == null) return null;
  const raw = s.price * s.shares;
  return s.currency === "CLP" ? raw / tc : s.currency === "USD" ? raw : null;
}

function computeGroup(c: SsV1Company, tc: number): CompanyGroup {
  const conv = makeConv(tc);
  const ss = c.ssCurrency, pj = c.projCurrency;

  const whole: Alloc = {
    dn: conv(c.debtN, ss), debtN4Usd: conv(c.debtN4, ss),
    equityNUsd: conv(c.equityN, ss), equityN4Usd: conv(c.equityN4, ss),
    minorityNUsd: conv(c.minorityN, ss), minorityN4Usd: conv(c.minorityN4, ss),
    ebitdaLtmUsd: conv(c.ebitdaLtm, ss), ebitda26Usd: conv(c.ebitda2026E, pj), ebitda27Usd: conv(c.ebitda2027E, pj),
    utilLtmUsd: conv(c.utilidadLtm, ss), util26Usd: conv(c.utilidad2026E, pj), util27Usd: conv(c.utilidad2027E, pj),
    revLtmUsd: conv(c.revenueLtm, ss), ebitLtmUsd: conv(c.ebitLtm, ss),
    ebitdaN: conv(c.ebitdaN, ss), ebitdaN4: conv(c.ebitdaN4, ss),
    utilidadN: conv(c.utilidadN, ss), utilidadN4: conv(c.utilidadN4, ss),
    payout: c.payout,
  };
  const scaleAlloc = (w: number): Alloc => {
    const out = {} as Alloc;
    (Object.keys(whole) as (keyof Alloc)[]).forEach((k) => {
      out[k] = k === "payout" ? whole[k] : whole[k] == null ? null : (whole[k] as number) * w;
    });
    return out;
  };

  const seriesMcaps = c.series.map((s) => mcapOf(s, tc));
  const mcapConsol = seriesMcaps.some((m) => m != null) ? seriesMcaps.reduce((a: number, m) => a + (m ?? 0), 0) : null;

  const withPriceFields = (v: Record<string, number | null>, s: SsV1Series | null): Record<string, number | null> => ({
    ...v,
    price: s?.price ?? null,
    retMonth: s?.retMonth ?? null, retYtd: s?.retYtd ?? null, retYear: s?.retYear ?? null,
    ret3y: s?.ret3y ?? null, ret5y: s?.ret5y ?? null,
  });

  const base = normName(c.company);

  const ovr = c.overrides;
  if (!c.dual) {
    const s = c.series[0];
    const v = withPriceFields(computeV(seriesMcaps[0], whole), s);
    return {
      cons: { company: c.company, tickerBBG: c.tickerBBG, ssCurrency: ss, industria: c.industria, divLabel: c.divLabel, payout: c.payout, rec: c.rec, recDate: c.recDate, tp: c.tp, label: "", kind: "single", seriesBBG: c.tickerBBG, v, overrides: ovr },
      series: [],
      units: [{ key: base, u: { alloc: whole, mcap: seriesMcaps[0], dividendos: dividendosOf(whole) } }],
    };
  }

  // Consolidada (whole, M.Cap = Σ series)
  const consV = withPriceFields(computeV(mcapConsol, whole), null);
  const cons: DisplayRow = { company: c.company, tickerBBG: c.tickerBBG, ssCurrency: ss, industria: c.industria, divLabel: c.divLabel, payout: c.payout, rec: c.rec, recDate: c.recDate, tp: c.tp, label: "", kind: "consolidated", seriesBBG: c.tickerBBG, v: consV, overrides: ovr };

  // Series A/B (prorateadas por acciones). Cada serie es también una unidad agregable.
  const seriesUnits: UnitEntry[] = [];
  const series: DisplayRow[] = c.series.map((s, i) => {
    const w = s.shares != null && c.sharesTotal ? s.shares / c.sharesTotal : 0;
    const sAlloc = scaleAlloc(w);
    const v = withPriceFields(computeV(seriesMcaps[i], sAlloc), s);
    seriesUnits.push({ key: `${base}-${s.label.toLowerCase()}`, u: { alloc: sAlloc, mcap: seriesMcaps[i], dividendos: dividendosOf(sAlloc) } });
    return { company: c.company, tickerBBG: c.tickerBBG, ssCurrency: ss, industria: c.industria, divLabel: c.divLabel, payout: c.payout, rec: s.rec ?? null, recDate: s.recDate ?? null, tp: s.tp ?? null, label: s.label, kind: "series", seriesBBG: s.bbg, v, overrides: ovr };
  });

  // Unidades: consolidada (por nombre base) + cada serie (nombre-a / nombre-b).
  const units: UnitEntry[] = [{ key: base, u: { alloc: whole, mcap: mcapConsol, dividendos: dividendosOf(whole) } }, ...seriesUnits];

  return { cons, series, units };
}

// ── Agregación por índice (sumaproducto) ────────────────────────────────────────
// Cada índice = "compañía consolidada" = Σ (unidad × peso) de sus miembros. Se suman
// los primitivos aditivos (Alloc, M.Cap, dividendos) y los múltiplos salen de esas sumas
// con el mismo computeV que usa cada fila. Alias sqm→soquimich para machear los nombres
// de index_membership con las unidades de Stock Selection.
const ALLOC_SUM_FIELDS: (keyof Alloc)[] = [
  "dn", "debtN4Usd", "equityNUsd", "equityN4Usd", "minorityNUsd", "minorityN4Usd",
  "ebitdaLtmUsd", "ebitda26Usd", "ebitda27Usd", "utilLtmUsd", "util26Usd", "util27Usd",
  "revLtmUsd", "ebitLtmUsd", "ebitdaN", "ebitdaN4", "utilidadN", "utilidadN4",
];
const emptyAlloc = (): Alloc => {
  const a = { payout: null } as Alloc;
  for (const f of ALLOC_SUM_FIELDS) a[f] = null;
  return a;
};
const addAlloc = (target: Alloc, src: Alloc, w: number): void => {
  for (const f of ALLOC_SUM_FIELDS) {
    const add = src[f] != null ? (src[f] as number) * w : 0;
    if (add !== 0 || target[f] != null) target[f] = (target[f] ?? 0) + add;
  }
};
const UNIT_ALIAS: Record<string, string> = { sqm: "soquimich" };
const toUnitKey = (imCompany: string): string => {
  let k = normName(imCompany);
  for (const a in UNIT_ALIAS) if (k === a || k.startsWith(a + "-")) k = UNIT_ALIAS[a] + k.slice(a.length);
  return k;
};

interface IndexAggRow { index: string; count: number; v: Record<string, number | null> }

function computeIndexAggregates(
  membership: IndexMembershipPayload | null,
  unitMap: Map<string, AggUnit>,
  indexLevels?: Record<string, IndexLevel>,
): IndexAggRow[] {
  if (!membership) return [];
  interface Acc { alloc: Alloc; mcap: number | null; div: number; count: number }
  const acc = new Map<string, Acc>();
  for (const key of Object.keys(membership.weights)) {
    let parsed: [string, string];
    try { parsed = JSON.parse(key) as [string, string]; } catch { continue; }
    const [idx, co] = parsed;
    const w = membership.weights[key];
    if (!(w > 0)) continue;
    const unit = unitMap.get(toUnitKey(co));
    if (!unit) continue;
    let a = acc.get(idx);
    if (!a) { a = { alloc: emptyAlloc(), mcap: null, div: 0, count: 0 }; acc.set(idx, a); }
    addAlloc(a.alloc, unit.alloc, w);
    if (unit.mcap != null) a.mcap = (a.mcap ?? 0) + unit.mcap * w;
    if (unit.dividendos != null) a.div += unit.dividendos * w;
    a.count++;
  }
  return membership.indices.map((idx) => {
    const a = acc.get(idx);
    const lvl = indexLevels?.[idx];
    if (!a) return { index: idx, count: 0, v: {} };
    const v = computeV(a.mcap, a.alloc);
    v.divYield = a.mcap != null && a.mcap > 0 ? a.div / a.mcap : null; // payout no agrega; se usa Σdividendos
    // Precio y crecimientos: nivel real del índice + retornos con la metodología de las
    // compañías (sólo IPSA/IGPA los tienen; el resto queda en blanco). NO se aproximan.
    v.price = lvl?.price ?? null;
    for (const f of RET_FIELDS) v[f] = lvl?.[f] ?? null;
    return { index: idx, count: a.count, v };
  });
}

// Grupos de columnas de la tabla de índices: las mismas que la de empresas salvo
// Recomendación (no agrega). "Precio" queda "—" (un índice no tiene precio único); los
// retornos van ponderados por M.Cap. Se reusan las definiciones de columnas de buildGroups.
const IDX_GROUP_IDS = ["precRet", "size", "ebitdaRep", "utilRep", "ebitdaUsd", "fvEbitda", "utilUsd", "pu", "otros", "div", "roicG"];

// ── Column model ─────────────────────────────────────────────────────────────────
interface ColDef {
  id: string; label: string;
  render: (r: DisplayRow) => { text: string; color?: string; weight?: number };
  sortVal?: (r: DisplayRow) => number | string | null;
  align?: "left" | "right" | "center";
}
interface Group { id: string; title: string; hint?: string; cols: ColDef[]; collapsible?: boolean; primary?: string }
const num = (id: string) => (r: DisplayRow) => r.v[id];
// columnas visibles de un grupo: si es colapsable y está cerrado → solo la "primary" (o la 1ª)
const visibleCols = (g: Group, expanded: Set<string>): ColDef[] =>
  g.collapsible && !expanded.has(g.id)
    ? [g.cols.find((c) => c.id === g.primary) ?? g.cols[0]]
    : g.cols;

function buildGroups(periodN: string | null, periodN4: string | null): Group[] {
  // Retornos y variaciones: único lugar donde se usa color (verde/rojo).
  const retCol = (id: string, label: string): ColDef => ({
    id, label, align: "right", sortVal: num(id),
    render: (r) => { const p = pct(r.v[id]); return { text: p.text, color: p.color, weight: 600 }; },
  });
  const mnCol = (id: string, label: string, color = NUM): ColDef => ({
    id, label, align: "right", sortVal: num(id),
    render: (r) => ({ text: fmtMn(r.v[id]), color: r.v[id] == null || isNM(r.v[id]) ? NM_TEXT : color }),
  });
  // Múltiplos: monocromo. fmtX ya devuelve "NM" para valores no positivos.
  const xCol = (id: string, label: string, color = TEXT1): ColDef => ({
    id, label, align: "right", sortVal: num(id),
    render: (r) => ({ text: fmtX(r.v[id]), color: r.v[id] == null || isNM(r.v[id]) || (r.v[id] as number) <= 0 ? NM_TEXT : color }),
  });
  const pctCol = (id: string, label: string): ColDef => ({
    id, label, align: "right", sortVal: num(id),
    render: (r) => ({ text: roePct(r.v[id]), color: r.v[id] == null || isNM(r.v[id]) ? NM_TEXT : TEXT1 }),
  });

  return [
    { id: "precRet", title: "Precios y Retornos", hint: "Retorno total (con dividendos reinvertidos). L3Y y L5Y anualizados.", cols: [
      { id: "price", label: "Precio", align: "right", sortVal: num("price"), render: (r) => ({ text: fmtPrice(r.v.price), color: TEXT1, weight: 600 }) },
      retCol("retMonth", "Mes"), retCol("retYtd", "YTD"), retCol("retYear", "Año"), retCol("ret3y", "L3Y a."), retCol("ret5y", "L5Y a."),
    ] },
    { id: "size", title: "Tamaño / EV", hint: "M.Cap, deuda neta y firm value — USD mn", cols: [mnCol("mcap", "M.Cap"), mnCol("dn", "DN"), mnCol("fv", "FV", TEXT1)] },
    { id: "ebitdaRep", title: "EBITDA a/a", hint: `EBITDA reportado, trimestre ${periodN4 ?? "n-4"} → ${periodN ?? "n"} — USD mn`, collapsible: true, primary: "ebitdaVar", cols: [mnCol("ebitdaN4", "Ac-1"), mnCol("ebitdaN", "Ac"), retCol("ebitdaVar", "Var%")] },
    { id: "utilRep", title: "Utilidad a/a", hint: `Utilidad reportada, trimestre ${periodN4 ?? "n-4"} → ${periodN ?? "n"} — USD mn`, collapsible: true, primary: "utilVar", cols: [mnCol("utilidadN4", "Ac-1"), mnCol("utilidadN", "Ac"), retCol("utilVar", "Var%")] },
    { id: "ebitdaUsd", title: "EBITDA", hint: "EBITDA LTM y estimado 2026E / 2027E — USD mn", collapsible: true, primary: "ebitdaLtmUsd", cols: [mnCol("ebitdaLtmUsd", "LTM"), mnCol("ebitda26Usd", "2026E"), mnCol("ebitda27Usd", "2027E")] },
    { id: "fvEbitda", title: "FV/EBITDA", collapsible: true, primary: "fvEbitda26", cols: [xCol("fvEbitdaLtm", "LTM"), xCol("fvEbitda26", "2026E"), xCol("fvEbitda27", "2027E")] },
    { id: "utilUsd", title: "Utilidad", hint: "Utilidad LTM y estimada 2026E / 2027E — USD mn", collapsible: true, primary: "utilLtmUsd", cols: [mnCol("utilLtmUsd", "LTM"), mnCol("util26Usd", "2026E"), mnCol("util27Usd", "2027E")] },
    { id: "pu", title: "P/U", collapsible: true, primary: "pu26", cols: [xCol("puLtm", "LTM"), xCol("pu26", "2026E"), xCol("pu27", "2027E")] },
    { id: "otros", title: "Otros", hint: "Otros múltiplos: P/BV · ROE · FV/S", collapsible: true, primary: "pbv", cols: [
      xCol("pbv", "P/BV"), pctCol("roeLtm", "ROE LTM"), pctCol("roe26", "ROE 26E"), xCol("fvs", "FV/S"),
    ] },
    { id: "div", title: "Dividendos", collapsible: true, primary: "divYield", cols: [
      { id: "polDiv", label: "Pol Div", align: "right", sortVal: (r) => r.payout, render: (r) => ({ text: r.payout != null ? (r.payout * 100).toFixed(0) + "%" : "—", color: r.payout != null ? NUM : NM_TEXT }) },
      { id: "divYield", label: "Yield 26E", align: "right", sortVal: num("divYield"), render: (r) => ({ text: yld(r.v.divYield), color: r.v.divYield == null ? NM_TEXT : TEXT1, weight: 600 }) },
    ] },
    { id: "roicG", title: "ROIC", hint: "Retorno sobre capital: ROIC LTM y FV/IC", collapsible: true, primary: "roic", cols: [
      pctCol("roic", "ROIC LTM"), xCol("fvic", "FV/IC"),
    ] },
    { id: "rec", title: "Recomendación", collapsible: true, primary: "rec", cols: [
      { id: "rec", label: "Rec.", align: "left", sortVal: (r) => r.rec, render: (r) => recCell(r.rec) },
      { id: "recDate", label: "Date", align: "center", sortVal: (r) => r.recDate, render: (r) => ({ text: fmtDate(r.recDate), color: r.recDate ? TEXT2 : NM_TEXT }) },
      { id: "tp", label: "TP", align: "right", sortVal: (r) => r.tp, render: (r) => ({ text: r.tp != null ? fmtPrice(r.tp) : "—", color: r.tp != null ? TEXT1 : NM_TEXT, weight: 600 }) },
    ] },
  ];
}

// ── Component ────────────────────────────────────────────────────────────────────
export default function StockSelectionV1() {
  const [data, setData] = useState<SsV1Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [tc, setTc] = useState(900);
  const [tcInput, setTcInput] = useState("900");
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("all");
  const [sortKey, setSortKey] = useState(FIXED_KEY);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showMethod, setShowMethod] = useState(true);
  const [selPeriod, setSelPeriod] = useState<string | null>(null); // "fy-q"; null = más reciente
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["fvEbitda", "pu"])); // grupos colapsables abiertos (los múltiplos clave parten desplegados)
  const [showIndexEditor, setShowIndexEditor] = useState(false); // editor de membresía de índices (solo admin)
  const [membership, setMembership] = useState<IndexMembershipPayload | null>(null); // matriz índice↔empresa (para el sumaproducto)
  const [editMode, setEditMode] = useState(false); // modo edición de valores (solo admin)
  const [editCompany, setEditCompany] = useState<SsV1Company | null>(null); // compañía con panel de edición abierto
  const isAdmin = useIsAdmin();
  const fixedMode = sortKey === FIXED_KEY;

  const loadMembership = useCallback(() => {
    fetch("/api/chile/index-membership")
      .then((r) => r.json())
      .then((d: IndexMembershipPayload & { error?: string }) => { if (!d.error) setMembership(d); })
      .catch(() => {/* la tabla de índices simplemente no se muestra */});
  }, []);
  useEffect(() => { loadMembership(); }, [loadMembership]);
  // Alto real de la 1ª fila del encabezado → es el `top` de la 2ª, para que ambas
  // queden fijas al hacer scroll (se mide porque depende de la fuente del navegador).
  const headRowRef = useRef<HTMLTableRowElement | null>(null);
  const [headRowH, setHeadRowH] = useState(22);
  useLayoutEffect(() => {
    const el = headRowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setHeadRowH(el.getBoundingClientRect().height));
    ro.observe(el);
    setHeadRowH(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, []);
  // Igual que headRowH, pero para la tabla de índices (su encabezado tiene otro alto).
  const idxHeadRef = useRef<HTMLTableRowElement | null>(null);
  const [idxHeadTop, setIdxHeadTop] = useState(24);
  useLayoutEffect(() => {
    const el = idxHeadRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setIdxHeadTop(el.getBoundingClientRect().height));
    ro.observe(el);
    setIdxHeadTop(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, [membership]); // se remide cuando la tabla de índices aparece
  const toggleGroup = (id: string) =>
    setExpandedGroups((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const load = useCallback((withPrices: boolean, periodKey: string | null) => {
    if (withPrices) setPricesLoading(true); else setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    if (withPrices) params.set("withPrices", "true");
    if (periodKey) { const [fy, q] = periodKey.split("-"); params.set("fy", fy); params.set("q", q); }
    const qs = params.toString();
    fetch(`/api/chile/stock-selection-v1${qs ? `?${qs}` : ""}`)
      .then((r) => r.json())
      .then((d: SsV1Payload & { error?: string }) => { if (d.error) setError(true); else setData(d); })
      .catch(() => setError(true))
      .finally(() => { setLoading(false); setPricesLoading(false); });
  }, []);
  useEffect(() => { load(false, null); }, [load]);

  const changePeriod = (key: string) => { setSelPeriod(key); load(data?.withPrices ?? false, key); };

  const groupDefs = useMemo(() => buildGroups(data?.periodN ?? null, data?.periodN4 ?? null), [data]);
  const allCols = useMemo(() => groupDefs.flatMap((g) => g.cols), [groupDefs]);
  const colById = useMemo(() => new Map(allCols.map((c) => [c.id, c])), [allCols]);

  const sectors = useMemo(() => {
    const s = new Set<string>();
    for (const c of data?.companies ?? []) if (c.industria) s.add(c.industria);
    return Array.from(s).sort();
  }, [data]);

  // Se computa una sola vez el universo completo (sin filtrar); de ahí salen tanto las
  // filas mostradas (groups) como las unidades para el sumaproducto (unitMap).
  const allComputed = useMemo<CompanyGroup[]>(() => (data?.companies ?? []).map((c) => computeGroup(c, tc)), [data, tc]);
  const unitMap = useMemo(() => {
    const m = new Map<string, AggUnit>();
    for (const g of allComputed) for (const e of g.units) m.set(e.key, e.u);
    return m;
  }, [allComputed]);
  const indexAggregates = useMemo(() => computeIndexAggregates(membership, unitMap, data?.indexLevels), [membership, unitMap, data]);
  const companyByName = useMemo(() => {
    const m = new Map<string, SsV1Company>();
    for (const c of data?.companies ?? []) m.set(normName(c.company), c);
    return m;
  }, [data]);

  const groups = useMemo<CompanyGroup[]>(() => {
    let list = [...allComputed];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((g) => g.cons.company.toLowerCase().includes(q) || (g.cons.tickerBBG ?? "").toLowerCase().includes(q));
    }
    if (sector !== "all") list = list.filter((g) => g.cons.industria === sector);
    if (sortKey === FIXED_KEY) {
      list.sort((a, b) => orderIdx(a.cons.company) - orderIdx(b.cons.company)); // sort estable → no listadas quedan alfabéticas
    } else {
      const col = colById.get(sortKey);
      const sv = col?.sortVal ?? ((r: DisplayRow) => r.v[sortKey] ?? null);
      list.sort((a, b) => {
        // NM (sentinela no finito) ordena junto a los vacíos: siempre al final.
        const nil = (x: number | string | null | undefined) => x == null || (typeof x === "number" && !isFinite(x));
        const av = sv(a.cons), bv = sv(b.cons);
        if (nil(av) && nil(bv)) return 0;
        if (nil(av)) return 1;
        if (nil(bv)) return -1;
        const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : (av as number) - (bv as number);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [allComputed, search, sector, sortKey, sortDir, colById]);

  const totalRows = useMemo(() => groups.reduce((n, g) => n + 1 + g.series.length, 0), [groups]);

  const applyTc = () => {
    const v = parseFloat(tcInput.replace(",", "."));
    if (isFinite(v) && v > 0) setTc(v); else setTcInput(String(tc));
  };
  const sortBy = (id: string) => {
    if (id === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(id); setSortDir("desc"); }
  };

  if (loading) {
    return <div className="flex items-center justify-center" style={{ padding: 60 }}>
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(15,23,42,0.12)", borderTopColor: INK }} /></div>;
  }
  if (error || !data) {
    return <div style={{ textAlign: "center", padding: 40, color: TEXT3, fontSize: 13 }}>
      No se pudo cargar Stock Selection.
      <div><button onClick={() => load(false, selPeriod)} style={retryBtn}>Reintentar</button></div></div>;
  }

  const priced = data.withPrices;
  const activeKey = selPeriod ?? `${data.selFy}-${data.selQ}`; // período n activo en el selector

  // ── Metodología (una tarjeta por grupo de columnas) ──────────────────────────
  const pN = data.periodN ?? "n", pN4 = data.periodN4 ?? "n-4", ltmLbl = data.ltmLabels.join(" + ");
  type MethItem = { k: string; f?: string; v?: string };
  const methodology: { title: string; wide?: boolean; items: MethItem[] }[] = [
    { title: "Convenciones y fuentes", wide: true, items: [
      { k: "“NM” vs “—”", v: "“—” = dato no disponible. “NM” = no significativo: múltiplos con numerador o denominador ≤ 0 (utilidad, EBITDA, patrimonio o capital invertido negativo), ROE / ROIC negativos o sobre base ≤ 0, y variaciones a/a sobre base ≤ 0 o con período actual negativo. Las filas con NM se ordenan al final." },
      { k: "Fuentes", v: "stock_selection_v1 (fundamentales reportados, en millones, moneda local) · proyecciones_financieras (estimaciones + payout) · empresas_industrias_v2 (homologación nombre → ticker Bloomberg / Yahoo y sector) · Yahoo Finance (precios y retornos) · AnalystRecommendationHistory (recomendaciones)." },
      { k: "Moneda", f: "USD → USD · CLP → ÷ TC", v: "todos los montos quedan en USD millones; el TC USD/CLP es editable arriba. Monedas no soportadas (p. ej. GBp) → “—”." },
      { k: "Períodos", v: `n = ${pN} (último trimestre cargado) · n-4 = ${pN4} (mismo trimestre, año previo) · LTM = suma de los últimos 4 trimestres (${ltmLbl}).` },
      { k: "Series A/B", v: "cada serie usa su propio precio y nº de acciones; las filas A/B prorratean los fundamentales por su % de acciones; la consolidada usa el fundamental completo contra el M.Cap total (Σ de las series)." },
      { k: "Orden", v: "por defecto, orden fijo por sector (los bordes separan secciones; las dobles van A → B → consolidada). Clic en una columna para reordenar; “Orden por sector” vuelve al fijo. Compañías fuera del listado → al final." },
    ] },
    { title: "Precios y retornos", items: [
      { k: "Precio", v: "regularMarketPrice de Yahoo, en la moneda de cotización y con el ticker propio de cada serie. Se valida contra el último cierre: si difiere más de 15% se usa el cierre, porque en papeles sin volumen Yahoo devuelve ahí un precio indicativo irreal (AFP Capital informaba 310 contra un cierre de 247,5 tras 14 ruedas sin operar)." },
      { k: "Retorno total", v: "se reconstruye a partir del cierre y de los dividendos pagados (cada dividendo se reinvierte al cierre previo a su ex-date). NO se usa el adjclose de Yahoo: en varias acciones chilenas sólo trae aplicado el último dividendo (BLUMAR.SN ajusta 1,7% habiendo repartido 40 CLP en 5 años), lo que subestimaba los retornos largos y los hacía no comparables entre compañías." },
      { k: "Mes · YTD · Año", f: "valor actual / valor base − 1", v: "retorno acumulado. Bases — Mes: −30 días · YTD: cierre del 31-dic previo · Año: −1 año calendario." },
      { k: "L3Y a. · L5Y a.", f: "(actual / base)^(1/n) − 1", v: "retorno total ANUALIZADO (CAGR) a 3 y 5 años calendario, que es la convención de mercado para horizontes de varios años. Ojo: no es el retorno acumulado del período." },
      { k: "Control de dividendos", v: "se descarta el dividendo que supera el precio de la acción: es imposible y delata un dato corrupto de Yahoo (Soquicom traía 23.842 CLP sobre un precio de 408, que disparaba el YTD a +5.608%). El mayor dividendo legítimo del universo es Colbún con 42,6% del precio." },
      { k: "Precisión", v: "contrastado contra una fuente externa sobre 88 papeles: el desvío mediano es de 0,03 pp en Mes, 0,13 en Año, 0,39 en L3Y y 0,63 en L5Y. La cola que queda viene de huecos en el historial de dividendos de Yahoo (a Andina le falta 1 pago de 4 en varios años), por lo que L3Y y L5Y quedan levemente SUBESTIMADOS — la mediana del sesgo es −0,2 pp en L3Y y −0,4 pp en L5Y, con casos puntuales de 5 a 7 pp. Para cifras auditables a 3-5 años conviene contrastar contra Bloomberg." },
    ] },
    { title: "Tamaño / EV (USD mn)", items: [
      { k: "M.Cap", f: "Precio × nº de acciones", v: "convertido a USD. Doble serie: consolidada = Σ M.Cap de cada serie." },
      { k: "DN", v: "deuda neta del período n (campo debt de stock_selection_v1), → USD." },
      { k: "FV", f: "M.Cap + DN", v: "firm value (enterprise value)." },
    ] },
    { title: `EBITDA Y/Y — ${pN4} → ${pN} (USD mn)`, items: [
      { k: "Ac-1 / Ac", v: `EBITDA reportado del trimestre ${pN4} y del trimestre ${pN}, convertidos a USD (÷ TC si CLP).` },
      { k: "Var%", f: "Ac / Ac-1 − 1", v: "variación interanual (neutra al TC). “NM” si la base es ≤ 0 o si el período actual es negativo: el % no tiene sentido económico." },
    ] },
    { title: `Utilidad Y/Y — ${pN4} → ${pN} (USD mn)`, items: [
      { k: "Ac-1 / Ac", v: `utilidad neta reportada del trimestre ${pN4} y del trimestre ${pN}, convertidas a USD (÷ TC si CLP).` },
      { k: "Var%", f: "Ac / Ac-1 − 1", v: "variación interanual (neutra al TC). “NM” si la base es ≤ 0 o si el período actual es negativo: el % no tiene sentido económico." },
    ] },
    { title: "EBITDA (USD mn)", items: [
      { k: "LTM", f: "Σ EBITDA últimos 4T", v: "convertido a USD." },
      { k: "2026E / 2027E", v: "EBITDA estimado (proyecciones_financieras) para ese año calendario, → USD." },
    ] },
    { title: "FV/EBITDA", items: [
      { k: "LTM · 2026E · 2027E", f: "FV / EBITDA del período", v: "menor = más barato." },
    ] },
    { title: "Utilidad (USD mn)", items: [
      { k: "LTM", f: "Σ utilidad últimos 4T", v: "convertido a USD." },
      { k: "2026E / 2027E", v: "utilidad estimada (proyecciones_financieras), → USD." },
    ] },
    { title: "P/U (precio / utilidad)", items: [
      { k: "LTM · 2026E · 2027E", f: "M.Cap / Utilidad del período", v: "“NM” cuando la utilidad del período es ≤ 0." },
    ] },
    { title: "Múltiplos negativos", items: [
      { k: "Criterio", v: "todo múltiplo (P/U, FV/EBITDA, P/BV, FV/S, FV/IC) exige numerador y denominador positivos. Con ambos negativos el cociente daría un múltiplo positivo engañoso, así que también se marca “NM”." },
      { k: "ROE / ROIC", v: "“NM” tanto si la base (patrimonio o capital invertido) es ≤ 0 como si el resultado es negativo: un retorno negativo sobre capital no se compara con el resto de la tabla." },
    ] },
    { title: "Otros múltiplos", items: [
      { k: "P/BV", f: "M.Cap / Patrimonio (n)", v: "precio / valor libro." },
      { k: "ROE LTM", f: "Utilidad LTM / Patrimonio (n-4)", v: "sobre patrimonio inicial." },
      { k: "ROE 26E", f: "Utilidad 2026E / Patrimonio (n)" },
      { k: "FV/S", f: "FV / Ventas LTM" },
    ] },
    { title: "Dividendos", items: [
      { k: "Pol Div", v: "payout objetivo (proyecciones_financieras.pool_div), en %." },
      { k: "Yield 26E", f: "máx(payout × Utilidad 2026E, 0) / M.Cap", v: "dividendo estimado sobre el M.Cap." },
    ] },
    { title: "ROIC — retorno sobre capital", items: [
      { k: "ROIC LTM", f: "NOPAT / Capital invertido (n-4)", v: "NOPAT = EBIT LTM × (1 − 27%). Capital invertido (n-4) = Patrimonio + Deuda neta + Interés minoritario, todo del período n-4 y en USD." },
      { k: "FV/IC", f: "FV / Capital invertido (n)", v: "Capital invertido (n) = Patrimonio + Deuda neta + Interés minoritario del período n." },
    ] },
    { title: "Recomendación", items: [
      { k: "Rec.", v: "última recomendación del analista por fecha (Comprar / Mantener / Vender). Cruce: AnalystRecommendationHistory.company → company_isins.company_name → isin → ticker_bloomberg (cada serie por el BBG de su clase)." },
      { k: "Date", v: "fecha de esa recomendación." },
      { k: "TP", v: "precio objetivo, en la moneda de cotización (sin convertir por TC)." },
    ] },
    { title: "Cobertura del universo y datos de mercado", wide: true, items: [
      { k: "Qué empresas aparecen", v: "una compañía sólo se muestra si su nombre en stock_selection_v1 homologa a un ticker Yahoo vivo (vía empresas_industrias_v2, con fallback por ISIN en company_isins). Si el nombre no homologa o el ticker está deslistado, la fila se descarta sin aviso. De las 98 compañías de la tabla, 6 no resolvían; ver detalle abajo." },
      { k: "Tickers corregidos (jul-2026)", v: "empresas_industrias_v2 / company_isins traían símbolos Yahoo deslistados que dejaban la fila sin precio. Corregidos y verificados contra el precio de referencia: Bicecorp → BICE.SN · Cencosud Shopping → CENCOMALLS.SN · Concha y Toro → CONCHATORO.SN · Itaú Chile → ITAUCL.SN · MultiX → MULTI-X.SN · La Polar → ABC.SN · Oro Blanco → ORO-BLANCO.SN · Clínica Las Condes → LAS-CONDES.SN · Viña Santa Rita → SANTA-RITA.SN · Potasios A/B → POTASIOS-A/B.SN · Cementos (Bío Bío) → CEM.SN." },
      { k: "Excluidas a propósito / pendientes", v: "Grupo Security: deslistada (fusión con Bicecorp, 2024). AES Andes (ex AES Gener): tiene ticker vivo (AESANDES.SN) pero le falta la fila de homologación en empresas_industrias_v2, por eso no aparece. Pampa Calichera y Nitratos: sin ticker Yahoo vivo (probablemente deslistadas / muy ilíquidas). “HF”: nombre sin identificar. Estas 5 no se muestran hasta cargar su homologación." },
      { k: "Advertencia de fuente", v: "estos tickers los escribe el proceso que puebla empresas_industrias_v2 / company_isins; si ese cargador no se corrige en origen, volverá a romperlos. La corrección de acá es sobre la base, no sobre el cargador." },
    ] },
  ];

  const renderCells = (r: DisplayRow, topBorder = false) => {
    const aff = r.overrides?.length ? affectedCols(r.overrides) : null;
    return groupDefs.map((g, gIdx) =>
      visibleCols(g, expandedGroups).map((col, i) => {
        const out = col.render(r);
        const edited = aff?.has(col.id);
        return (
          <td key={col.id}
            style={{ padding: r.kind === "series" ? "3px 7px" : "5px 7px", textAlign: col.align ?? "right", fontFamily: "JetBrains Mono, monospace", fontSize: r.kind === "series" ? 10 : 10.5, color: out.color ?? TEXT1, fontWeight: edited ? 700 : out.weight ?? 400, borderBottom: `1px solid ${BORDER}`, borderTop: topBorder ? SECTION_BORDER : undefined, borderLeft: i === 0 ? `1px solid ${BORDER}` : "none", background: edited ? EDIT_BG : gIdx % 2 === 1 ? BAND : undefined, boxShadow: edited ? `inset 0 0 0 1px ${EDIT_BORDER}55` : undefined, whiteSpace: "nowrap" }}>
            {out.text}
          </td>
        );
      }),
    );
  };

  return (
    <div>
      {/* Header / controls */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 3, height: 22, background: INK, borderRadius: 2 }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT1, letterSpacing: "-0.02em", margin: 0 }}>Stock Selection</h2>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, background: SURFACE }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: TEXT2 }}>Período</span>
            <select value={activeKey} onChange={(e) => changePeriod(e.target.value)} disabled={loading || pricesLoading}
              style={{ padding: "3px 6px", fontSize: 12, fontFamily: "JetBrains Mono, monospace", border: `1px solid ${BORDER}`, borderRadius: 4, background: "#fff", color: TEXT1, outline: "none", cursor: "pointer" }}>
              {data.periods.map((p) => <option key={`${p.fy}-${p.q}`} value={`${p.fy}-${p.q}`}>{p.label}</option>)}
            </select>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, background: SURFACE }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: TEXT2 }}>TC USD/CLP</span>
            <input type="text" inputMode="decimal" value={tcInput} onChange={(e) => setTcInput(e.target.value)} onBlur={applyTc}
              onKeyDown={(e) => { if (e.key === "Enter") applyTc(); }}
              style={{ width: 64, padding: "3px 6px", fontSize: 12, fontFamily: "JetBrains Mono, monospace", textAlign: "right", border: `1px solid ${BORDER}`, borderRadius: 4, background: "#fff", color: TEXT1, outline: "none" }} />
          </div>
          <button onClick={() => load(true, selPeriod)} disabled={pricesLoading}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: pricesLoading ? "default" : "pointer", color: "#fff", background: INK, border: "none", opacity: pricesLoading ? 0.7 : 1 }}>
            <RefreshCw size={13} style={pricesLoading ? { animation: "spin 0.8s linear infinite" } : undefined} />
            {pricesLoading ? "Trayendo…" : priced ? "Actualizar precios" : "Traer precios (Yahoo)"}
          </button>
          {isAdmin && (
            <button onClick={() => setShowIndexEditor(true)} title="Editar la pertenencia de cada empresa a los índices (admin)"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", color: NAVY, background: "#fff", border: `1px solid ${NAVY}` }}>
              <LayoutGrid size={13} /> Índices
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setEditMode((e) => !e)} title="Editar valores de las compañías (override de admin). Clic en el nombre de una empresa para abrir su panel."
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", color: editMode ? "#fff" : EDIT_BORDER, background: editMode ? EDIT_BORDER : "#fff", border: `1px solid ${EDIT_BORDER}` }}>
              <Pencil size={13} /> {editMode ? "Editando valores" : "Editar valores"}
            </button>
          )}
        </div>
      </div>

      {isAdmin && editCompany && (
        <SsV1OverrideEditor company={editCompany} fy={data.selFy} q={data.selQ}
          onClose={() => setEditCompany(null)}
          onSaved={() => { setEditCompany(null); load(priced, selPeriod); }} />
      )}

      {isAdmin && showIndexEditor && <IndexMembershipEditor onClose={() => setShowIndexEditor(false)} onSaved={loadMembership} />}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresa / ticker…"
          style={{ flex: "1 1 200px", minWidth: 160, padding: "7px 12px", borderRadius: 6, background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT1, fontSize: 13, outline: "none" }} />
        <select value={sector} onChange={(e) => setSector(e.target.value)}
          style={{ padding: "7px 12px", borderRadius: 6, background: SURFACE, border: `1px solid ${BORDER}`, color: sector === "all" ? TEXT2 : TEXT1, fontSize: 13, cursor: "pointer", outline: "none", minWidth: 160 }}>
          <option value="all">Todas las industrias</option>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => setSortKey(FIXED_KEY)} title="Volver al orden fijo por sector"
          style={{ padding: "7px 12px", borderRadius: 6, border: `1px solid ${fixedMode ? "rgba(15,23,42,0.30)" : BORDER}`, background: fixedMode ? "rgba(15,23,42,0.06)" : SURFACE, color: fixedMode ? TEXT1 : TEXT2, fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none", whiteSpace: "nowrap" }}>
          Orden por sector
        </button>
        <span style={{ fontSize: 11, color: TEXT3, fontFamily: "JetBrains Mono, monospace" }}>{groups.length} empresas · {totalRows} filas</span>
      </div>

      {!priced && (
        <div style={{ fontSize: 11.5, color: TEXT2, marginBottom: 10 }}>
          Apretá <strong>Traer precios (Yahoo)</strong> para llenar Precio, retornos, M.Cap, FV y los múltiplos que dependen del precio (incluye precios por serie A/B).
        </div>
      )}

      <div style={{ fontSize: 10.5, color: TEXT3, marginBottom: 6 }}>
        Montos en USD mn (÷ TC si es CLP) · Retornos = retorno total; <strong style={{ color: TEXT2 }}>L3Y y L5Y anualizados</strong> · <strong style={{ color: TEXT2 }}>NM</strong> = no significativo · Los grupos con <span style={{ color: TEXT2, fontWeight: 700 }}>▸</span> muestran 1 columna — clic en el encabezado para desplegar el resto.
      </div>

      {/* Tabla — el contenedor tiene alto acotado y scroll propio: así el encabezado
          (2 filas) queda fijo arriba y la columna Empresa fija a la izquierda. */}
      <div style={{ overflow: "auto", maxHeight: "calc(100vh - 230px)", minHeight: 320, border: "1px solid rgba(30,58,95,0.18)", borderRadius: 8, background: "#fff" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 11, width: "100%" }}>
          <thead>
            <tr ref={headRowRef}>
              <th style={{ ...stickyTh, top: 0, zIndex: 40 }} rowSpan={2}>Empresa</th>
              {groupDefs.map((g, gIdx) => {
                const open = !g.collapsible || expandedGroups.has(g.id);
                return (
                  <th key={g.id} colSpan={visibleCols(g, expandedGroups).length}
                    onClick={() => g.collapsible && toggleGroup(g.id)}
                    title={[g.hint, g.collapsible ? (open ? "Clic para contraer" : "Clic para desplegar") : null].filter(Boolean).join(" · ") || undefined}
                    style={{ position: "sticky", top: 0, zIndex: 30, padding: "5px 7px", textAlign: "center", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: NAVY_TEXT, borderLeft: "1px solid rgba(255,255,255,0.14)", whiteSpace: "nowrap", background: gIdx % 2 === 1 ? NAVY_BAND : NAVY, cursor: g.collapsible ? "pointer" : "default", userSelect: "none" }}>
                    {g.collapsible && <span style={{ fontSize: 8, marginRight: 3, opacity: 0.7 }}>{open ? "▾" : "▸"}</span>}
                    {g.title}
                  </th>
                );
              })}
            </tr>
            <tr>
              {groupDefs.map((g, gIdx) =>
                visibleCols(g, expandedGroups).map((col, i) => {
                  const active = sortKey === col.id;
                  return (
                    <th key={col.id} onClick={() => col.sortVal && sortBy(col.id)}
                      style={{ position: "sticky", top: headRowH, zIndex: 30, padding: "5px 7px", textAlign: col.align ?? "right", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: active ? "#fff" : HEAD2_TEXT, borderBottom: `2px solid ${NAVY}`, borderLeft: i === 0 ? "1px solid rgba(30,58,95,0.22)" : "none", whiteSpace: "nowrap", cursor: col.sortVal ? "pointer" : "default", userSelect: "none", background: active ? NAVY_BAND : gIdx % 2 === 1 ? HEAD2_BAND : HEAD2_BG }}>
                      {col.label}{col.sortVal && <span style={{ fontSize: 8, opacity: active ? 1 : 0.45, marginLeft: 3 }}>{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>}
                    </th>
                  );
                })
              )}
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => {
              const rows = [...g.series, g.cons]; // series A/B primero, consolidada/single al final
              const sectionStart = fixedMode && gi > 0 && sectionIdx(g.cons.company) !== sectionIdx(groups[gi - 1].cons.company);
              return rows.map((r, ri) => {
                const isSeries = r.kind === "series";
                const topBorder = sectionStart && ri === 0;
                const bg = isSeries ? "#F4F6F9" : gi % 2 === 0 ? "#fff" : ZEBRA;
                return (
                  <tr key={`${r.company}-${r.label || "cons"}`} style={{ background: bg }}>
                    <td onClick={editMode && !isSeries ? () => { const c = companyByName.get(normName(r.company)); if (c) setEditCompany(c); } : undefined}
                      title={editMode && !isSeries ? "Editar valores de esta compañía" : undefined}
                      style={{ ...stickyTd, borderTop: topBorder ? SECTION_BORDER : undefined, background: editMode && !isSeries ? "rgba(250,204,21,0.10)" : bg, paddingLeft: isSeries ? 18 : 8, cursor: editMode && !isSeries ? "pointer" : undefined }}>
                      {isSeries ? (
                        <>
                          <div style={{ fontSize: 10, fontWeight: 600, color: TEXT2, whiteSpace: "nowrap" }}>
                            <span style={{ color: TEXT3 }}>↳</span> Serie {r.label}
                          </div>
                          <div style={{ fontSize: 9, color: TEXT3, fontFamily: "JetBrains Mono, monospace", whiteSpace: "nowrap" }}>{r.seriesBBG ?? "—"}</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 600, color: TEXT1, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
                            {editMode && <Pencil size={11} color={EDIT_BORDER} />}
                            {r.company}
                            {r.kind === "consolidated" && <span style={consBadge}>consol.</span>}
                            {r.overrides?.length ? <span style={editedBadge}>{r.overrides.length} ed.</span> : null}
                          </div>
                          <div style={{ fontSize: 9, color: TEXT3, fontFamily: "JetBrains Mono, monospace", whiteSpace: "nowrap" }}>
                            {r.tickerBBG ?? "—"}<span style={ccyBadge(r.ssCurrency)}>{r.ssCurrency}</span>
                          </div>
                        </>
                      )}
                    </td>
                    {renderCells(r, topBorder)}
                  </tr>
                );
              });
            })}
            {groups.length === 0 && (
              <tr><td colSpan={1 + groupDefs.reduce((n, g) => n + visibleCols(g, expandedGroups).length, 0)} style={{ textAlign: "center", padding: 32, color: TEXT3, fontSize: 13 }}>Sin empresas para los filtros actuales.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sumaproducto por índice — tabla aparte, tono teal */}
      {membership && indexAggregates.length > 0 && (() => {
        const idxGroupDefs = groupDefs.filter((g) => IDX_GROUP_IDS.includes(g.id));
        // Mismo formato que compañías, TODAS las columnas (sin respetar el colapso), salvo
        // Pol Div (dentro de "div") y el grupo Recomendación (Rec/Date/TP, ya excluido).
        const idxCols = (g: Group): ColDef[] => (g.id === "div" ? g.cols.filter((c) => c.id !== "polDiv") : g.cols);
        const idxRow = (agg: (typeof indexAggregates)[number]): DisplayRow => ({
          company: agg.index, tickerBBG: null, ssCurrency: "USD", industria: null, divLabel: null,
          payout: null, rec: null, recDate: null, tp: null, label: "", kind: "single", seriesBBG: null, v: agg.v,
        });
        return (
          <div style={{ marginTop: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 3, height: 18, background: IDX_HEAD, borderRadius: 2 }} />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: IDX_HEAD, letterSpacing: "-0.01em", margin: 0 }}>Índices — sumaproducto de sus miembros</h3>
              <span style={{ fontSize: 10.5, color: TEXT3 }}>
                Cada índice = Σ (M.Cap y fundamentales × peso); los múltiplos salen de esas sumas. Precio y retornos: nivel real y crecimientos del índice (solo IPSA/IGPA); el resto en blanco. {priced ? "" : "Traé precios para llenar."}
              </span>
            </div>
            <div style={{ overflow: "auto", maxHeight: "60vh", border: `1px solid ${IDX_HEAD}33`, borderRadius: 8, background: IDX_TINT }}>
              <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 11, width: "100%" }}>
                <thead>
                  <tr ref={idxHeadRef}>
                    <th style={{ position: "sticky", left: 0, top: 0, zIndex: 5, textAlign: "left", padding: "5px 10px", background: IDX_HEAD, color: IDX_HEAD_TEXT, fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }} rowSpan={2}>Índice</th>
                    {idxGroupDefs.map((g, gi) => (
                      <th key={g.id} colSpan={idxCols(g).length}
                        style={{ position: "sticky", top: 0, zIndex: 4, padding: "5px 7px", textAlign: "center", fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: IDX_HEAD_TEXT, background: gi % 2 === 1 ? IDX_HEAD_BAND : IDX_HEAD, borderLeft: "1px solid rgba(255,255,255,0.12)", whiteSpace: "nowrap" }}>
                        {g.title}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {idxGroupDefs.map((g, gi) =>
                      idxCols(g).map((col, i) => (
                        <th key={col.id} style={{ position: "sticky", top: idxHeadTop, zIndex: 4, padding: "4px 7px", textAlign: col.align ?? "right", fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: IDX_HEAD, background: gi % 2 === 1 ? IDX_ZEBRA : IDX_TINT, borderBottom: `2px solid ${IDX_HEAD}`, borderLeft: i === 0 ? `1px solid ${IDX_HEAD}22` : "none", whiteSpace: "nowrap" }}>
                          {col.label}
                        </th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {indexAggregates.map((agg, ri) => {
                    const r = idxRow(agg);
                    const bg = ri % 2 === 0 ? IDX_TINT : IDX_ZEBRA;
                    return (
                      <tr key={agg.index} style={{ background: bg }}>
                        <td style={{ position: "sticky", left: 0, zIndex: 2, background: bg, padding: "5px 10px", borderRight: `1px solid ${IDX_HEAD}22`, borderBottom: `1px solid ${IDX_HEAD}18`, whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: IDX_HEAD }}>{agg.index}</span>
                          <span style={{ fontSize: 9, color: TEXT3, marginLeft: 6, fontFamily: "JetBrains Mono, monospace" }}>{agg.count}</span>
                        </td>
                        {idxGroupDefs.map((g, gi) =>
                          idxCols(g).map((col, i) => {
                            const out = col.render(r);
                            return (
                              <td key={col.id} style={{ padding: "5px 7px", textAlign: col.align ?? "right", fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: out.color ?? TEXT1, fontWeight: out.weight ?? 400, borderBottom: `1px solid ${IDX_HEAD}18`, borderLeft: i === 0 ? `1px solid ${IDX_HEAD}18` : "none", background: gi % 2 === 1 ? "rgba(31,91,87,0.04)" : undefined, whiteSpace: "nowrap" }}>
                                {out.text}
                              </td>
                            );
                          }),
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Metodología */}
      <div style={{ marginTop: 16 }}>
        <button onClick={() => setShowMethod((s) => !s)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT1, fontSize: 12.5, fontWeight: 700, cursor: "pointer", outline: "none" }}>
          Metodología — cómo se calcula cada valor
          <span style={{ fontSize: 10, color: TEXT2 }}>{showMethod ? "▴" : "▾"}</span>
        </button>
        {showMethod && (
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
            {methodology.map((sec) => (
              <div key={sec.title}
                style={{ gridColumn: sec.wide ? "1 / -1" : undefined, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 13px", background: SURFACE }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                  <span style={{ width: 3, height: 13, borderRadius: 2, background: NAVY }} />
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: NAVY }}>{sec.title}</span>
                </div>
                {sec.items.map((it, idx) => (
                  <div key={idx} style={{ fontSize: 11.5, color: TEXT2, lineHeight: 1.55, marginTop: idx === 0 ? 0 : 6 }}>
                    <span style={{ fontWeight: 700, color: TEXT1 }}>{it.k}</span>
                    {it.f && <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: NAVY, background: "rgba(30,58,95,0.08)", borderRadius: 3, padding: "1px 5px", margin: "0 5px", whiteSpace: "nowrap" }}>{it.f}</span>}
                    {it.v && <span>{it.f ? "" : " — "}{it.v}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Editor de membresía de índices (solo admin) ─────────────────────────────────
// Matriz editable: columnas = fondos/índices, filas = compañías, celda = pertenece (1)
// o no (0). Los cambios se acumulan localmente y se persisten en batch con "Guardar".
// La tabla index_membership es sparse: marcar crea la fila (weight 1), desmarcar la borra.
const memberKeyC = (indexName: string, company: string) => JSON.stringify([indexName, company]);

function IndexMembershipEditor({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const [data, setData] = useState<IndexMembershipPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [members, setMembers] = useState<Set<string>>(new Set());
  const [orig, setOrig] = useState<Set<string>>(new Set());
  const [extraCompanies, setExtraCompanies] = useState<string[]>([]);
  const [extraIndices, setExtraIndices] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newIndex, setNewIndex] = useState("");

  const load = useCallback(() => {
    setLoading(true); setError(null); // savedMsg se preserva: tras guardar, load() refresca sin borrar el aviso
    fetch("/api/chile/index-membership")
      .then((r) => r.json())
      .then((d: IndexMembershipPayload & { error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setData(d);
        setMembers(new Set(d.members)); setOrig(new Set(d.members));
        setExtraCompanies([]); setExtraIndices([]);
      })
      .catch(() => setError("No se pudo cargar la membresía."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const indices = useMemo(() => [...(data?.indices ?? []), ...extraIndices], [data, extraIndices]);
  const companies = useMemo(
    () => [...(data?.companies ?? []), ...extraCompanies].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })),
    [data, extraCompanies],
  );
  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? companies.filter((c) => c.toLowerCase().includes(q)) : companies;
  }, [companies, search]);

  const toggle = (i: string, c: string) => {
    const k = memberKeyC(i, c);
    setMembers((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
    setSavedMsg(null);
  };

  // Diff completo (working vs original) → sólo las celdas que cambiaron.
  const changes = useMemo(() => {
    const out: { indexName: string; company: string; member: boolean }[] = [];
    for (const c of companies) for (const i of indices) {
      const k = memberKeyC(i, c), now = members.has(k), was = orig.has(k);
      if (now !== was) out.push({ indexName: i, company: c, member: now });
    }
    return out;
  }, [companies, indices, members, orig]);

  const memberCount = (i: string) => companies.reduce((n, c) => n + (members.has(memberKeyC(i, c)) ? 1 : 0), 0);

  const save = () => {
    if (!changes.length || saving) return;
    setSaving(true); setError(null); setSavedMsg(null);
    fetch("/api/chile/index-membership", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }),
    })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Error al guardar"); return d as { applied: number }; })
      .then((d) => { setSavedMsg(`Guardado: ${d.applied} ${d.applied === 1 ? "cambio" : "cambios"}.`); load(); onSaved?.(); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setSaving(false));
  };

  const addCompany = () => {
    const c = newCompany.trim(); if (!c) return;
    const exists = companies.some((x) => x.toLowerCase() === c.toLowerCase());
    if (!exists) setExtraCompanies((p) => [...p, c]);
    setNewCompany(""); setSearch(c);
  };
  const addIndex = () => {
    const i = newIndex.trim(); if (!i) return;
    if (!indices.some((x) => x.toLowerCase() === i.toLowerCase())) setExtraIndices((p) => [...p, i]);
    setNewIndex("");
  };

  const tryClose = () => {
    if (changes.length && !window.confirm(`Hay ${changes.length} cambios sin guardar. ¿Cerrar y descartarlos?`)) return;
    onClose();
  };

  const stickyLeft: React.CSSProperties = { position: "sticky", left: 0, zIndex: 2, background: "#fff", borderRight: `1px solid ${BORDER}` };

  return (
    <div onClick={tryClose}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 12, width: "min(1100px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 48px rgba(15,23,42,0.35)", overflow: "hidden" }}>
        {/* Encabezado */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 16px", background: NAVY, color: NAVY_TEXT }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <LayoutGrid size={16} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>Membresía de índices</span>
            <span style={{ fontSize: 11, opacity: 0.75 }}>{indices.length} fondos · {companies.length} empresas</span>
          </div>
          <button onClick={tryClose} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: NAVY_TEXT, cursor: "pointer" }}>
            <X size={15} />
          </button>
        </div>

        {/* Controles */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 16px", borderBottom: `1px solid ${BORDER}`, background: SURFACE }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "1 1 200px", minWidth: 160, padding: "6px 10px", borderRadius: 6, background: "#fff", border: `1px solid ${BORDER}` }}>
            <Search size={13} color={TEXT3} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresa…"
              style={{ border: "none", outline: "none", fontSize: 13, color: TEXT1, background: "transparent", width: "100%" }} />
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input value={newCompany} onChange={(e) => setNewCompany(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCompany(); }} placeholder="+ empresa"
              style={{ width: 130, padding: "6px 8px", fontSize: 12, borderRadius: 6, border: `1px solid ${BORDER}`, outline: "none", color: TEXT1, background: "#fff" }} />
            <button onClick={addCompany} title="Agregar empresa (fila)" style={miniBtn}><Plus size={14} /></button>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input value={newIndex} onChange={(e) => setNewIndex(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addIndex(); }} placeholder="+ índice"
              style={{ width: 100, padding: "6px 8px", fontSize: 12, borderRadius: 6, border: `1px solid ${BORDER}`, outline: "none", color: TEXT1, background: "#fff" }} />
            <button onClick={addIndex} title="Agregar índice (columna)" style={miniBtn}><Plus size={14} /></button>
          </div>
          <div style={{ flex: 1 }} />
          {savedMsg && <span style={{ fontSize: 12, color: POS, fontWeight: 600 }}>{savedMsg}</span>}
          {error && <span style={{ fontSize: 12, color: NEG, fontWeight: 600 }}>{error}</span>}
          <span style={{ fontSize: 12, color: changes.length ? AMBER_INK : TEXT3, fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>
            {changes.length ? `${changes.length} sin guardar` : "sin cambios"}
          </span>
          <button onClick={save} disabled={!changes.length || saving}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: "none", cursor: changes.length && !saving ? "pointer" : "default", color: "#fff", background: changes.length ? NAVY : "#94A3B8", opacity: saving ? 0.7 : 1 }}>
            <Save size={13} /> {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>

        {/* Matriz */}
        <div style={{ overflow: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: "center", color: TEXT3, fontSize: 13 }}>Cargando…</div>
          ) : !data ? (
            <div style={{ padding: 48, textAlign: "center", color: NEG, fontSize: 13 }}>{error ?? "No se pudo cargar."}</div>
          ) : (
            <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 11, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ ...stickyLeft, top: 0, zIndex: 4, textAlign: "left", padding: "7px 10px", background: NAVY, color: NAVY_TEXT, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Empresa
                  </th>
                  {indices.map((i) => (
                    <th key={i} title={i} style={{ position: "sticky", top: 0, zIndex: 3, padding: "7px 6px", background: NAVY, color: NAVY_TEXT, fontSize: 9.5, fontWeight: 700, textAlign: "center", whiteSpace: "nowrap", borderLeft: "1px solid rgba(255,255,255,0.12)" }}>
                      <div>{i}</div>
                      <div style={{ fontSize: 8.5, opacity: 0.6, fontWeight: 600 }}>{memberCount(i)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((c, ri) => (
                  <tr key={c} style={{ background: ri % 2 === 0 ? "#fff" : ZEBRA }}>
                    <td style={{ ...stickyLeft, background: ri % 2 === 0 ? "#fff" : ZEBRA, padding: "4px 10px", fontSize: 11, fontWeight: 600, color: TEXT1, whiteSpace: "nowrap", borderBottom: `1px solid ${BORDER}` }}>
                      {c}
                    </td>
                    {indices.map((i) => {
                      const k = memberKeyC(i, c), on = members.has(k), dirty = on !== orig.has(k);
                      return (
                        <td key={i} style={{ padding: 0, textAlign: "center", borderLeft: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, background: dirty ? "rgba(217,119,6,0.10)" : undefined }}>
                          <button onClick={() => toggle(i, c)} title={`${c} · ${i} → ${on ? "quitar" : "agregar"}`}
                            style={{ width: "100%", height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", cursor: "pointer" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 17, height: 17, borderRadius: 4, border: on ? `1px solid ${NAVY}` : `1px solid ${BORDER}`, background: on ? NAVY : "#fff", color: "#fff" }}>
                              {on && <Check size={12} strokeWidth={3} />}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {filteredCompanies.length === 0 && (
                  <tr><td colSpan={1 + indices.length} style={{ padding: 28, textAlign: "center", color: TEXT3, fontSize: 13 }}>Sin empresas para “{search}”.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pie */}
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${BORDER}`, background: SURFACE, fontSize: 10.5, color: TEXT3 }}>
          Celda marcada = pertenece al índice. Los cambios (resaltados) se guardan recién al apretar <strong style={{ color: TEXT2 }}>Guardar</strong>. Marcar una empresa nueva en algún índice la crea en la tabla.
        </div>
      </div>
    </div>
  );
}

// ── Panel de edición de valores de una compañía (solo admin) ────────────────────
// Override sobre los inputs del modelo (acciones, deuda, EBITDA, …) para el período
// activo. Vacío = revertir al valor base. Al guardar, la vista recomputa y pinta de
// amarillo lo editado y lo que depende.
const curFieldValue = (co: SsV1Company, key: string): number | null => {
  if (key === "sharesTotal") return co.sharesTotal;
  if (key === "sharesA") return co.series[0]?.shares ?? null;
  if (key === "sharesB") return co.series[1]?.shares ?? null;
  return (co as unknown as Record<string, number | null>)[key] ?? null;
};
const numStr = (n: number | null | undefined): string => (n == null ? "" : String(n));

function SsV1OverrideEditor({ company, fy, q, onClose, onSaved }: { company: SsV1Company; fy: number; q: number; onClose: () => void; onSaved: () => void }) {
  const fields = useMemo(
    () => OVERRIDE_FIELDS.filter((f) => f.scope === "both" || (f.scope === "single" && !company.dual) || (f.scope === "dual" && company.dual)),
    [company],
  );
  const overridden = useMemo(() => new Set(company.overrides ?? []), [company]);
  // Valor "actual" = base salvo override; para overrideados, base viene aparte en baseValues.
  const initial = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of fields) m[f.key] = numStr(curFieldValue(company, f.key));
    return m;
  }, [fields, company]);
  const [edits, setEdits] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changes = useMemo(() => {
    const out: { company: string; field: string; value: number | null }[] = [];
    for (const f of fields) {
      const cur = (edits[f.key] ?? "").trim(), init = (initial[f.key] ?? "").trim();
      if (cur === init) continue;
      if (cur === "") { out.push({ company: company.company, field: f.key, value: null }); continue; }
      const v = Number(cur.replace(",", "."));
      if (Number.isFinite(v)) out.push({ company: company.company, field: f.key, value: v });
    }
    return out;
  }, [edits, initial, fields, company]);

  const save = () => {
    if (!changes.length || saving) return;
    setSaving(true); setError(null);
    fetch("/api/chile/stock-selection-v1/overrides", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscalYear: fy, quarter: q, changes }),
    })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Error al guardar"); return d; })
      .then(() => onSaved())
      .catch((e: Error) => { setError(e.message); setSaving(false); });
  };

  // Agrupar por f.group manteniendo el orden.
  const groupsOrder: string[] = [];
  const byGroup = new Map<string, typeof fields>();
  for (const f of fields) { if (!byGroup.has(f.group)) { byGroup.set(f.group, []); groupsOrder.push(f.group); } byGroup.get(f.group)!.push(f); }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "min(560px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 48px rgba(15,23,42,0.35)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 16px", background: EDIT_BORDER, color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Pencil size={15} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>Editar valores · {company.company}</span>
            <span style={{ fontSize: 11, opacity: 0.85 }}>{fy} Q{q} · {company.ssCurrency} mn</span>
          </div>
          <button onClick={onClose} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", cursor: "pointer" }}><X size={15} /></button>
        </div>

        <div style={{ overflow: "auto", flex: 1, padding: "8px 16px 14px" }}>
          {groupsOrder.map((gname) => (
            <div key={gname} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: TEXT2, marginBottom: 4 }}>{gname}</div>
              {byGroup.get(gname)!.map((f) => {
                const isOv = overridden.has(f.key);
                const baseVal = isOv ? company.baseValues?.[f.key] ?? null : curFieldValue(company, f.key);
                return (
                  <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                    <div style={{ flex: 1, fontSize: 12, color: TEXT1 }}>
                      {f.label}
                      <span style={{ fontSize: 10, color: TEXT3, marginLeft: 6 }}>base {baseVal == null ? "—" : baseVal.toLocaleString("en-US")}</span>
                    </div>
                    <input value={edits[f.key] ?? ""} inputMode="decimal"
                      onChange={(e) => setEdits((p) => ({ ...p, [f.key]: e.target.value }))}
                      placeholder="—"
                      style={{ width: 120, padding: "5px 8px", fontSize: 12, fontFamily: "JetBrains Mono, monospace", textAlign: "right", borderRadius: 6, border: `1px solid ${isOv ? EDIT_BORDER : BORDER}`, background: isOv ? EDIT_BG : "#fff", color: TEXT1, outline: "none" }} />
                    <button onClick={() => setEdits((p) => ({ ...p, [f.key]: "" }))} title="Revertir al valor base"
                      disabled={(edits[f.key] ?? "") === ""}
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", color: (edits[f.key] ?? "") === "" ? TEXT3 : EDIT_BORDER, cursor: (edits[f.key] ?? "") === "" ? "default" : "pointer" }}>
                      <RotateCcw size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: TEXT3, marginTop: 12, lineHeight: 1.5 }}>
            Valores en la moneda reportada (millones), igual que el dato base. Vaciar un campo = revertir al valor base. Los cambios no tocan la tabla fuente; viven en una capa de overrides por período.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "10px 16px", borderTop: `1px solid ${BORDER}`, background: SURFACE }}>
          {error && <span style={{ fontSize: 12, color: NEG, fontWeight: 600, marginRight: "auto" }}>{error}</span>}
          <span style={{ fontSize: 12, color: changes.length ? EDIT_BORDER : TEXT3, fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>{changes.length ? `${changes.length} sin guardar` : "sin cambios"}</span>
          <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT2, cursor: "pointer" }}>Cancelar</button>
          <button onClick={save} disabled={!changes.length || saving}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: "none", cursor: changes.length && !saving ? "pointer" : "default", color: "#fff", background: changes.length ? EDIT_BORDER : "#94A3B8", opacity: saving ? 0.7 : 1 }}>
            <Save size={13} /> {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Style helpers ────────────────────────────────────────────────────────────────
const AMBER_INK = "#B45309"; // acento ámbar para "cambios sin guardar"
const miniBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", color: NAVY, cursor: "pointer" };
const stickyTh: React.CSSProperties = { position: "sticky", left: 0, padding: "4px 8px", textAlign: "left", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: NAVY_TEXT, background: NAVY, borderBottom: `2px solid ${NAVY}`, borderRight: "1px solid rgba(30,58,95,0.20)", whiteSpace: "nowrap" };
const stickyTd: React.CSSProperties = { position: "sticky", left: 0, zIndex: 10, padding: "4px 8px", borderBottom: `1px solid ${BORDER}`, borderRight: "1px solid rgba(30,58,95,0.20)", verticalAlign: "middle" };
const retryBtn: React.CSSProperties = { marginTop: 10, padding: "6px 16px", borderRadius: 6, background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT1, cursor: "pointer", fontSize: 13 };
// USD se marca algo más fuerte que CLP (es la excepción en un listado mayormente CLP).
const ccyBadge = (ccy: "CLP" | "USD"): React.CSSProperties => ({ marginLeft: 5, fontSize: 9, fontWeight: 700, color: ccy === "USD" ? TEXT1 : TEXT3, background: ccy === "USD" ? "rgba(15,23,42,0.09)" : "rgba(15,23,42,0.05)", borderRadius: 3, padding: "1px 4px" });
const consBadge: React.CSSProperties = { marginLeft: 6, fontSize: 8.5, fontWeight: 700, color: NAVY, background: "rgba(30,58,95,0.10)", borderRadius: 3, padding: "1px 5px", textTransform: "uppercase", letterSpacing: "0.04em" };
const editedBadge: React.CSSProperties = { marginLeft: 6, fontSize: 8.5, fontWeight: 700, color: "#854D0E", background: "rgba(250,204,21,0.35)", borderRadius: 3, padding: "1px 5px", letterSpacing: "0.02em" };
