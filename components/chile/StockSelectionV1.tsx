"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { SsV1Company, SsV1Payload, SsV1Series } from "@/app/api/chile/stock-selection-v1/route";

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
}
interface CompanyGroup { cons: DisplayRow; series: DisplayRow[] }

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

  if (!c.dual) {
    const s = c.series[0];
    const v = withPriceFields(computeV(seriesMcaps[0], whole), s);
    return {
      cons: { company: c.company, tickerBBG: c.tickerBBG, ssCurrency: ss, industria: c.industria, divLabel: c.divLabel, payout: c.payout, rec: c.rec, recDate: c.recDate, tp: c.tp, label: "", kind: "single", seriesBBG: c.tickerBBG, v },
      series: [],
    };
  }

  // Consolidada (whole, M.Cap = Σ series)
  const consV = withPriceFields(computeV(mcapConsol, whole), null);
  const cons: DisplayRow = { company: c.company, tickerBBG: c.tickerBBG, ssCurrency: ss, industria: c.industria, divLabel: c.divLabel, payout: c.payout, rec: c.rec, recDate: c.recDate, tp: c.tp, label: "", kind: "consolidated", seriesBBG: c.tickerBBG, v: consV };

  // Series A/B (prorateadas por acciones)
  const series: DisplayRow[] = c.series.map((s, i) => {
    const w = s.shares != null && c.sharesTotal ? s.shares / c.sharesTotal : 0;
    const v = withPriceFields(computeV(seriesMcaps[i], scaleAlloc(w)), s);
    return { company: c.company, tickerBBG: c.tickerBBG, ssCurrency: ss, industria: c.industria, divLabel: c.divLabel, payout: c.payout, rec: s.rec ?? null, recDate: s.recDate ?? null, tp: s.tp ?? null, label: s.label, kind: "series", seriesBBG: s.bbg, v };
  });

  return { cons, series };
}

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
  const fixedMode = sortKey === FIXED_KEY;
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

  const groups = useMemo<CompanyGroup[]>(() => {
    let list = (data?.companies ?? []).map((c) => computeGroup(c, tc));
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
  }, [data, tc, search, sector, sortKey, sortDir, colById]);

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
      { k: "Precio", v: "último precio de Yahoo (regularMarketPrice), en la moneda de cotización; cada serie con su propio ticker." },
      { k: "Retorno total", v: "se reconstruye a partir del cierre y de los dividendos pagados (cada dividendo se reinvierte al cierre previo a su ex-date). NO se usa el adjclose de Yahoo: en varias acciones chilenas sólo trae aplicado el último dividendo (BLUMAR.SN ajusta 1,7% habiendo repartido 40 CLP en 5 años), lo que subestimaba los retornos largos y los hacía no comparables entre compañías." },
      { k: "Mes · YTD · Año", f: "valor actual / valor base − 1", v: "retorno acumulado. Bases — Mes: −30 días · YTD: cierre del 31-dic previo · Año: −1 año calendario." },
      { k: "L3Y a. · L5Y a.", f: "(actual / base)^(1/n) − 1", v: "retorno total ANUALIZADO (CAGR) a 3 y 5 años calendario, que es la convención de mercado para horizontes de varios años. Ojo: no es el retorno acumulado del período." },
      { k: "Limitación", v: "el historial de dividendos de Yahoo tiene huecos en los años más antiguos de algunas acciones (p. ej. Andina figura con 3 pagos/año en 2024 donde hubo 4). Eso hace que L3Y y sobre todo L5Y queden algo SUBESTIMADOS — del orden de 1 a 4 puntos anuales en los casos detectados. Mes, YTD y Año no se ven afectados. Para cifras de 3-5 años auditables conviene contrastar contra Bloomberg." },
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
  ];

  const renderCells = (r: DisplayRow, topBorder = false) =>
    groupDefs.map((g, gIdx) =>
      visibleCols(g, expandedGroups).map((col, i) => {
        const out = col.render(r);
        return (
          <td key={col.id}
            style={{ padding: r.kind === "series" ? "3px 7px" : "5px 7px", textAlign: col.align ?? "right", fontFamily: "JetBrains Mono, monospace", fontSize: r.kind === "series" ? 10 : 10.5, color: out.color ?? TEXT1, fontWeight: out.weight ?? 400, borderBottom: `1px solid ${BORDER}`, borderTop: topBorder ? SECTION_BORDER : undefined, borderLeft: i === 0 ? `1px solid ${BORDER}` : "none", background: gIdx % 2 === 1 ? BAND : undefined, whiteSpace: "nowrap" }}>
            {out.text}
          </td>
        );
      })
    );

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
        </div>
      </div>

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
                    <td style={{ ...stickyTd, borderTop: topBorder ? SECTION_BORDER : undefined, background: bg, paddingLeft: isSeries ? 18 : 8 }}>
                      {isSeries ? (
                        <>
                          <div style={{ fontSize: 10, fontWeight: 600, color: TEXT2, whiteSpace: "nowrap" }}>
                            <span style={{ color: TEXT3 }}>↳</span> Serie {r.label}
                          </div>
                          <div style={{ fontSize: 9, color: TEXT3, fontFamily: "JetBrains Mono, monospace", whiteSpace: "nowrap" }}>{r.seriesBBG ?? "—"}</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 600, color: TEXT1, whiteSpace: "nowrap" }}>
                            {r.company}
                            {r.kind === "consolidated" && <span style={consBadge}>consol.</span>}
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

// ── Style helpers ────────────────────────────────────────────────────────────────
const stickyTh: React.CSSProperties = { position: "sticky", left: 0, padding: "4px 8px", textAlign: "left", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: NAVY_TEXT, background: NAVY, borderBottom: `2px solid ${NAVY}`, borderRight: "1px solid rgba(30,58,95,0.20)", whiteSpace: "nowrap" };
const stickyTd: React.CSSProperties = { position: "sticky", left: 0, zIndex: 10, padding: "4px 8px", borderBottom: `1px solid ${BORDER}`, borderRight: "1px solid rgba(30,58,95,0.20)", verticalAlign: "middle" };
const retryBtn: React.CSSProperties = { marginTop: 10, padding: "6px 16px", borderRadius: 6, background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT1, cursor: "pointer", fontSize: 13 };
// USD se marca algo más fuerte que CLP (es la excepción en un listado mayormente CLP).
const ccyBadge = (ccy: "CLP" | "USD"): React.CSSProperties => ({ marginLeft: 5, fontSize: 9, fontWeight: 700, color: ccy === "USD" ? TEXT1 : TEXT3, background: ccy === "USD" ? "rgba(15,23,42,0.09)" : "rgba(15,23,42,0.05)", borderRadius: 3, padding: "1px 4px" });
const consBadge: React.CSSProperties = { marginLeft: 6, fontSize: 8.5, fontWeight: 700, color: NAVY, background: "rgba(30,58,95,0.10)", borderRadius: 3, padding: "1px 5px", textTransform: "uppercase", letterSpacing: "0.04em" };
