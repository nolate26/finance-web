"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { SsV1Company, SsV1Payload, SsV1Series } from "@/app/api/chile/stock-selection-v1/route";

// ── Design tokens ────────────────────────────────────────────────────────────────
const TEXT1 = "#0F172A";
const TEXT2 = "#64748B";
const TEXT3 = "#94A3B8";
const BORDER = "rgba(15,23,42,0.08)";
const SECTION_BORDER = "2px solid rgba(15,23,42,0.24)"; // separador entre secciones del orden fijo
const BLUE = "#2B5CE0";
const GREEN = "#059669";
const RED = "#DC2626";
const AMBER = "#D97706";
const VIOLET = "#7C3AED";

// ── Formatters ──────────────────────────────────────────────────────────────────
const fmtMn = (v: number | null | undefined): string =>
  v == null || !isFinite(v) ? "—" : Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1);
const fmtX = (v: number | null | undefined): string =>
  v == null || !isFinite(v) || v <= 0 ? "—" : v.toFixed(1) + "x";
const fmtPrice = (v: number | null | undefined): string =>
  v == null || !isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v: number | null | undefined): { text: string; color: string } => {
  if (v == null || !isFinite(v)) return { text: "—", color: TEXT3 };
  const color = v > 0.0005 ? GREEN : v < -0.0005 ? RED : TEXT2;
  return { text: (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%", color };
};
const yld = (v: number | null | undefined): string => (v == null || !isFinite(v) ? "—" : (v * 100).toFixed(1) + "%");
const roePct = (v: number | null | undefined): string => (v == null || !isFinite(v) ? "—" : (v * 100).toFixed(1) + "%");

// ── conv() ───────────────────────────────────────────────────────────────────────
function makeConv(tc: number) {
  return (x: number | null | undefined, ccy: string | null | undefined): number | null => {
    if (x == null || !isFinite(x)) return null;
    if (ccy === "CLP") return x / tc;
    if (ccy === "USD") return x;
    return null; // moneda no soportada (ej. GBp)
  };
}
const ratio = (n: number | null, d: number | null): number | null =>
  n != null && d != null && d > 0 ? n / d : null;

// Recomendación: texto coloreado (Comprar=verde, Mantener=ámbar, Vender=rojo; free-text neutro).
const REC_STYLE: Record<string, { label: string; color: string }> = {
  comprar: { label: "Comprar", color: GREEN },
  mantener: { label: "Mantener", color: AMBER },
  vender: { label: "Vender", color: RED },
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
  const ebitdaVar = a.ebitdaN != null && a.ebitdaN4 != null && a.ebitdaN4 !== 0 ? a.ebitdaN / a.ebitdaN4 - 1 : null;
  const utilVar = a.utilidadN != null && a.utilidadN4 != null && a.utilidadN4 !== 0 ? a.utilidadN / a.utilidadN4 - 1 : null;
  const dividendos = a.payout != null && a.util26Usd != null ? Math.max(a.payout * a.util26Usd, 0) : null;
  return {
    mcap, dn: a.dn, fv,
    ebitdaN4: a.ebitdaN4, ebitdaN: a.ebitdaN, ebitdaVar,
    utilidadN4: a.utilidadN4, utilidadN: a.utilidadN, utilVar,
    ebitdaLtmUsd: a.ebitdaLtmUsd, ebitda26Usd: a.ebitda26Usd, ebitda27Usd: a.ebitda27Usd,
    fvEbitdaLtm: ratio(fv, a.ebitdaLtmUsd), fvEbitda26: ratio(fv, a.ebitda26Usd), fvEbitda27: ratio(fv, a.ebitda27Usd),
    utilLtmUsd: a.utilLtmUsd, util26Usd: a.util26Usd, util27Usd: a.util27Usd,
    puLtm: ratio(mcap, a.utilLtmUsd), pu26: ratio(mcap, a.util26Usd), pu27: ratio(mcap, a.util27Usd),
    pbv: ratio(mcap, a.equityNUsd),
    roeLtm: ratio(a.utilLtmUsd, a.equityN4Usd), roe26: ratio(a.util26Usd, a.equityNUsd),
    fvs: ratio(fv, a.revLtmUsd),
    divYield: dividendos != null && mcap != null && mcap > 0 ? dividendos / mcap : null,
    roic: ratio(nopat, icN4), fvic: ratio(fv, icN),
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
interface Group { title: string; accent: string; cols: ColDef[] }
const num = (id: string) => (r: DisplayRow) => r.v[id];

function buildGroups(periodN: string | null, periodN4: string | null): Group[] {
  const retCol = (id: string, label: string): ColDef => ({
    id, label, align: "right", sortVal: num(id),
    render: (r) => { const p = pct(r.v[id]); return { text: p.text, color: p.color, weight: 600 }; },
  });
  const mnCol = (id: string, label: string, color = "#475569"): ColDef => ({
    id, label, align: "right", sortVal: num(id), render: (r) => ({ text: fmtMn(r.v[id]), color }),
  });
  const xCol = (id: string, label: string, color = BLUE): ColDef => ({
    id, label, align: "right", sortVal: num(id), render: (r) => ({ text: fmtX(r.v[id]), color }),
  });
  const puCol = (id: string, label: string, denom: string): ColDef => ({
    id, label, align: "right", sortVal: num(id),
    render: (r) => {
      if (r.v[id] != null) return { text: fmtX(r.v[id]), color: VIOLET };
      const d = r.v[denom];
      return d != null && d <= 0 ? { text: "NM", color: TEXT3 } : { text: "—", color: TEXT3 };
    },
  });
  const varCol = (id: string, label: string): ColDef => ({
    id, label, align: "right", sortVal: num(id),
    render: (r) => { const p = pct(r.v[id]); return { text: p.text, color: p.color, weight: 600 }; },
  });

  return [
    { title: "Precios y Retornos", accent: "#0EA5E9", cols: [
      { id: "price", label: "Precio", align: "right", sortVal: num("price"), render: (r) => ({ text: fmtPrice(r.v.price), color: TEXT1, weight: 600 }) },
      retCol("retMonth", "Mes"), retCol("retYtd", "YTD"), retCol("retYear", "Año"), retCol("ret3y", "L3Y"), retCol("ret5y", "L5Y"),
    ] },
    { title: "Tamaño / EV (USD mn)", accent: "#475569", cols: [mnCol("mcap", "M.Cap"), mnCol("dn", "DN"), mnCol("fv", "FV", TEXT1)] },
    { title: `EBITDA ${periodN4 ?? "n-4"} → ${periodN ?? "n"} (USD mn)`, accent: "#0D9488", cols: [mnCol("ebitdaN4", "Ac-1"), mnCol("ebitdaN", "Ac"), varCol("ebitdaVar", "Var%")] },
    { title: `Utilidad ${periodN4 ?? "n-4"} → ${periodN ?? "n"} (USD mn)`, accent: "#9333EA", cols: [mnCol("utilidadN4", "Ac-1"), mnCol("utilidadN", "Ac"), varCol("utilVar", "Var%")] },
    { title: "EBITDA (USD mn)", accent: "#0D9488", cols: [mnCol("ebitdaLtmUsd", "LTM"), mnCol("ebitda26Usd", "2026E"), mnCol("ebitda27Usd", "2027E")] },
    { title: "FV/EBITDA", accent: BLUE, cols: [xCol("fvEbitdaLtm", "LTM"), xCol("fvEbitda26", "2026E"), xCol("fvEbitda27", "2027E")] },
    { title: "Utilidad (USD mn)", accent: "#9333EA", cols: [mnCol("utilLtmUsd", "LTM"), mnCol("util26Usd", "2026E"), mnCol("util27Usd", "2027E")] },
    { title: "P/U", accent: VIOLET, cols: [puCol("puLtm", "LTM", "utilLtmUsd"), puCol("pu26", "2026E", "util26Usd"), puCol("pu27", "2027E", "util27Usd")] },
    { title: "Otros múltiplos", accent: "#475569", cols: [
      xCol("pbv", "P/BV", "#475569"),
      { id: "roeLtm", label: "ROE LTM", align: "right", sortVal: num("roeLtm"), render: (r) => ({ text: roePct(r.v.roeLtm), color: TEXT1 }) },
      { id: "roe26", label: "ROE 26E", align: "right", sortVal: num("roe26"), render: (r) => ({ text: roePct(r.v.roe26), color: TEXT1 }) },
      xCol("fvs", "FV/S", "#475569"),
    ] },
    { title: "Dividendos", accent: AMBER, cols: [
      { id: "polDiv", label: "Pol Div", align: "right", sortVal: (r) => r.payout, render: (r) => ({ text: r.payout != null ? (r.payout * 100).toFixed(0) + "%" : "—", color: r.payout != null ? TEXT2 : TEXT3 }) },
      { id: "divYield", label: "Yield 26E", align: "right", sortVal: num("divYield"), render: (r) => ({ text: yld(r.v.divYield), color: AMBER, weight: 600 }) },
    ] },
    { title: "Retorno s/ capital", accent: "#0D9488", cols: [
      { id: "roic", label: "ROIC LTM", align: "right", sortVal: num("roic"), render: (r) => ({ text: roePct(r.v.roic), color: TEXT1 }) },
      xCol("fvic", "FV/IC", "#475569"),
    ] },
    { title: "Recomendación", accent: "#334155", cols: [
      { id: "rec", label: "Rec.", align: "left", sortVal: (r) => r.rec, render: (r) => recCell(r.rec) },
      { id: "recDate", label: "Date", align: "center", sortVal: (r) => r.recDate, render: (r) => ({ text: fmtDate(r.recDate), color: r.recDate ? TEXT2 : TEXT3 }) },
      { id: "tp", label: "TP", align: "right", sortVal: (r) => r.tp, render: (r) => ({ text: r.tp != null ? fmtPrice(r.tp) : "—", color: r.tp != null ? TEXT1 : TEXT3, weight: 600 }) },
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
  const fixedMode = sortKey === FIXED_KEY;

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
        const av = sv(a.cons), bv = sv(b.cons);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
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
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(43,92,224,0.15)", borderTopColor: BLUE }} /></div>;
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
  const methodology: { title: string; accent: string; wide?: boolean; items: MethItem[] }[] = [
    { title: "Convenciones y fuentes", accent: BLUE, wide: true, items: [
      { k: "Fuentes", v: "stock_selection_v1 (fundamentales reportados, en millones, moneda local) · proyecciones_financieras (estimaciones + payout) · empresas_industrias_v2 (homologación nombre → ticker Bloomberg / Yahoo y sector) · Yahoo Finance (precios y retornos) · AnalystRecommendationHistory (recomendaciones)." },
      { k: "Moneda", f: "USD → USD · CLP → ÷ TC", v: "todos los montos quedan en USD millones; el TC USD/CLP es editable arriba. Monedas no soportadas (p. ej. GBp) → “—”." },
      { k: "Períodos", v: `n = ${pN} (último trimestre cargado) · n-4 = ${pN4} (mismo trimestre, año previo) · LTM = suma de los últimos 4 trimestres (${ltmLbl}).` },
      { k: "Series A/B", v: "cada serie usa su propio precio y nº de acciones; las filas A/B prorratean los fundamentales por su % de acciones; la consolidada usa el fundamental completo contra el M.Cap total (Σ de las series)." },
      { k: "Orden", v: "por defecto, orden fijo por sector (los bordes separan secciones; las dobles van A → B → consolidada). Clic en una columna para reordenar; “Orden por sector” vuelve al fijo. Compañías fuera del listado → al final." },
    ] },
    { title: "Precios y retornos", accent: "#0EA5E9", items: [
      { k: "Precio", v: "último precio de Yahoo (regularMarketPrice), en la moneda de cotización; cada serie con su propio ticker." },
      { k: "Retornos", f: "precio actual / precio base − 1", v: "sobre precio ajustado (incluye dividendos y splits). Bases — Mes: −30 días · YTD: cierre del 31-dic previo · Año: −365 días · L3Y: −3 años · L5Y: −5 años." },
    ] },
    { title: "Tamaño / EV (USD mn)", accent: "#475569", items: [
      { k: "M.Cap", f: "Precio × nº de acciones", v: "convertido a USD. Doble serie: consolidada = Σ M.Cap de cada serie." },
      { k: "DN", v: "deuda neta del período n (campo debt de stock_selection_v1), → USD." },
      { k: "FV", f: "M.Cap + DN", v: "firm value (enterprise value)." },
    ] },
    { title: `EBITDA ${pN4} → ${pN} (USD mn)`, accent: "#0D9488", items: [
      { k: "Ac-1 / Ac", v: `EBITDA reportado del trimestre ${pN4} y del trimestre ${pN}, convertidos a USD (÷ TC si CLP).` },
      { k: "Var%", f: "Ac / Ac-1 − 1", v: "variación interanual (neutra al TC)." },
    ] },
    { title: `Utilidad ${pN4} → ${pN} (USD mn)`, accent: "#9333EA", items: [
      { k: "Ac-1 / Ac", v: `utilidad neta reportada del trimestre ${pN4} y del trimestre ${pN}, convertidas a USD (÷ TC si CLP).` },
      { k: "Var%", f: "Ac / Ac-1 − 1", v: "variación interanual (neutra al TC)." },
    ] },
    { title: "EBITDA (USD mn)", accent: "#0D9488", items: [
      { k: "LTM", f: "Σ EBITDA últimos 4T", v: "convertido a USD." },
      { k: "2026E / 2027E", v: "EBITDA estimado (proyecciones_financieras) para ese año calendario, → USD." },
    ] },
    { title: "FV/EBITDA", accent: BLUE, items: [
      { k: "LTM · 2026E · 2027E", f: "FV / EBITDA del período", v: "menor = más barato." },
    ] },
    { title: "Utilidad (USD mn)", accent: "#9333EA", items: [
      { k: "LTM", f: "Σ utilidad últimos 4T", v: "convertido a USD." },
      { k: "2026E / 2027E", v: "utilidad estimada (proyecciones_financieras), → USD." },
    ] },
    { title: "P/U (precio / utilidad)", accent: VIOLET, items: [
      { k: "LTM · 2026E · 2027E", f: "M.Cap / Utilidad del período", v: "“NM” cuando la utilidad del período es ≤ 0." },
    ] },
    { title: "Otros múltiplos", accent: "#475569", items: [
      { k: "P/BV", f: "M.Cap / Patrimonio (n)", v: "precio / valor libro." },
      { k: "ROE LTM", f: "Utilidad LTM / Patrimonio (n-4)", v: "sobre patrimonio inicial." },
      { k: "ROE 26E", f: "Utilidad 2026E / Patrimonio (n)" },
      { k: "FV/S", f: "FV / Ventas LTM" },
    ] },
    { title: "Dividendos", accent: AMBER, items: [
      { k: "Pol Div", v: "payout objetivo (proyecciones_financieras.pool_div), en %." },
      { k: "Yield 26E", f: "máx(payout × Utilidad 2026E, 0) / M.Cap", v: "dividendo estimado sobre el M.Cap." },
    ] },
    { title: "Retorno sobre capital", accent: "#0D9488", items: [
      { k: "ROIC LTM", f: "NOPAT / Capital invertido (n-4)", v: "NOPAT = EBIT LTM × (1 − 27%). Capital invertido (n-4) = Patrimonio + Deuda neta + Interés minoritario, todo del período n-4 y en USD." },
      { k: "FV/IC", f: "FV / Capital invertido (n)", v: "Capital invertido (n) = Patrimonio + Deuda neta + Interés minoritario del período n." },
    ] },
    { title: "Recomendación", accent: "#334155", items: [
      { k: "Rec.", v: "última recomendación del analista por fecha (Comprar / Mantener / Vender). Cruce: AnalystRecommendationHistory.company → company_isins.company_name → isin → ticker_bloomberg (cada serie por el BBG de su clase)." },
      { k: "Date", v: "fecha de esa recomendación." },
      { k: "TP", v: "precio objetivo, en la moneda de cotización (sin convertir por TC)." },
    ] },
  ];

  const renderCells = (r: DisplayRow, topBorder = false) =>
    groupDefs.map((g) =>
      g.cols.map((col, i) => {
        const out = col.render(r);
        return (
          <td key={col.id}
            style={{ padding: r.kind === "series" ? "5px 10px" : "8px 10px", textAlign: col.align ?? "right", fontFamily: "JetBrains Mono, monospace", fontSize: r.kind === "series" ? 11 : 11.5, color: out.color ?? TEXT1, fontWeight: out.weight ?? 400, borderBottom: `1px solid ${BORDER}`, borderTop: topBorder ? SECTION_BORDER : undefined, borderLeft: i === 0 ? `1px solid ${BORDER}` : "none", whiteSpace: "nowrap", opacity: r.kind === "series" ? 0.92 : 1 }}>
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
            <div style={{ width: 3, height: 22, background: BLUE, borderRadius: 2 }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT1, letterSpacing: "-0.02em", margin: 0 }}>Stock Selection</h2>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "#F8FAFF" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: TEXT2 }}>Período</span>
            <select value={activeKey} onChange={(e) => changePeriod(e.target.value)} disabled={loading || pricesLoading}
              style={{ padding: "3px 6px", fontSize: 12, fontFamily: "JetBrains Mono, monospace", border: `1px solid ${BORDER}`, borderRadius: 5, background: "#fff", color: TEXT1, outline: "none", cursor: "pointer" }}>
              {data.periods.map((p) => <option key={`${p.fy}-${p.q}`} value={`${p.fy}-${p.q}`}>{p.label}</option>)}
            </select>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "#F8FAFF" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: TEXT2 }}>TC USD/CLP</span>
            <input type="text" inputMode="decimal" value={tcInput} onChange={(e) => setTcInput(e.target.value)} onBlur={applyTc}
              onKeyDown={(e) => { if (e.key === "Enter") applyTc(); }}
              style={{ width: 64, padding: "3px 6px", fontSize: 12, fontFamily: "JetBrains Mono, monospace", textAlign: "right", border: `1px solid ${BORDER}`, borderRadius: 5, background: "#fff", color: TEXT1, outline: "none" }} />
          </div>
          <button onClick={() => load(true, selPeriod)} disabled={pricesLoading}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: pricesLoading ? "default" : "pointer", color: "#fff", background: BLUE, border: "none", opacity: pricesLoading ? 0.7 : 1, boxShadow: "0 1px 3px rgba(43,92,224,0.30)" }}>
            <RefreshCw size={13} style={pricesLoading ? { animation: "spin 0.8s linear infinite" } : undefined} />
            {pricesLoading ? "Trayendo…" : priced ? "Actualizar precios" : "Traer precios (Yahoo)"}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresa / ticker…"
          style={{ flex: "1 1 200px", minWidth: 160, padding: "7px 12px", borderRadius: 7, background: "#F8FAFF", border: `1px solid ${BORDER}`, color: TEXT1, fontSize: 13, outline: "none" }} />
        <select value={sector} onChange={(e) => setSector(e.target.value)}
          style={{ padding: "7px 12px", borderRadius: 7, background: "#F8FAFF", border: `1px solid ${BORDER}`, color: sector === "all" ? TEXT2 : TEXT1, fontSize: 13, cursor: "pointer", outline: "none", minWidth: 160 }}>
          <option value="all">Todas las industrias</option>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => setSortKey(FIXED_KEY)} title="Volver al orden fijo por sector"
          style={{ padding: "7px 12px", borderRadius: 7, border: `1px solid ${fixedMode ? BLUE : BORDER}`, background: fixedMode ? "rgba(43,92,224,0.08)" : "#F8FAFF", color: fixedMode ? BLUE : TEXT2, fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none", whiteSpace: "nowrap" }}>
          Orden por sector
        </button>
        <span style={{ fontSize: 11, color: TEXT3, fontFamily: "JetBrains Mono, monospace" }}>{groups.length} empresas · {totalRows} filas</span>
      </div>

      {!priced && (
        <div style={{ fontSize: 11.5, color: TEXT2, marginBottom: 10 }}>
          Apretá <strong>Traer precios (Yahoo)</strong> para llenar Precio, retornos, M.Cap, FV y los múltiplos que dependen del precio (incluye precios por serie A/B).
        </div>
      )}

      {/* Tabla */}
      <div style={{ overflowX: "auto", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 1600 }}>
          <thead>
            <tr style={{ background: "#F0F4FA" }}>
              <th style={{ ...stickyTh, top: 0, zIndex: 6 }} rowSpan={2}>Empresa</th>
              {groupDefs.map((g) => (
                <th key={g.title} colSpan={g.cols.length}
                  style={{ padding: "6px 10px", textAlign: "center", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: g.accent, borderBottom: `1px solid ${BORDER}`, borderLeft: `1px solid ${BORDER}`, whiteSpace: "nowrap", background: "#F0F4FA" }}>
                  {g.title}
                </th>
              ))}
            </tr>
            <tr style={{ background: "#F0F4FA" }}>
              {groupDefs.map((g) =>
                g.cols.map((col, i) => {
                  const active = sortKey === col.id;
                  return (
                    <th key={col.id} onClick={() => col.sortVal && sortBy(col.id)}
                      style={{ padding: "7px 10px", textAlign: col.align ?? "right", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: active ? BLUE : TEXT2, borderBottom: `1px solid ${BORDER}`, borderLeft: i === 0 ? `1px solid ${BORDER}` : "none", whiteSpace: "nowrap", cursor: col.sortVal ? "pointer" : "default", userSelect: "none", background: "#F0F4FA" }}>
                      {col.label}{col.sortVal && <span style={{ fontSize: 9, opacity: active ? 1 : 0.35, marginLeft: 2 }}>{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>}
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
                const bg = gi % 2 === 0 ? "#fff" : "rgba(248,250,255,0.6)";
                return (
                  <tr key={`${r.company}-${r.label || "cons"}`} style={{ background: isSeries ? "rgba(248,250,255,0.85)" : bg }}>
                    <td style={{ ...stickyTd, borderTop: topBorder ? SECTION_BORDER : undefined, background: isSeries ? "#F4F8FF" : (gi % 2 === 0 ? "#fff" : "#F6F9FF"), paddingLeft: isSeries ? 26 : 12 }}>
                      {isSeries ? (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 600, color: TEXT2, whiteSpace: "nowrap" }}>
                            <span style={{ color: TEXT3 }}>↳</span> Serie {r.label}
                          </div>
                          <div style={{ fontSize: 9.5, color: TEXT3, fontFamily: "JetBrains Mono, monospace", whiteSpace: "nowrap" }}>{r.seriesBBG ?? "—"}</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontWeight: 600, color: TEXT1, whiteSpace: "nowrap" }}>
                            {r.company}
                            {r.kind === "consolidated" && <span style={consBadge}>consol.</span>}
                          </div>
                          <div style={{ fontSize: 10, color: TEXT3, fontFamily: "JetBrains Mono, monospace", whiteSpace: "nowrap" }}>
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
              <tr><td colSpan={1 + allCols.length} style={{ textAlign: "center", padding: 32, color: TEXT3, fontSize: 13 }}>Sin empresas para los filtros actuales.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Metodología */}
      <div style={{ marginTop: 16 }}>
        <button onClick={() => setShowMethod((s) => !s)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "#F8FAFF", color: TEXT1, fontSize: 12.5, fontWeight: 700, cursor: "pointer", outline: "none" }}>
          Metodología — cómo se calcula cada valor
          <span style={{ fontSize: 10, color: TEXT2 }}>{showMethod ? "▴" : "▾"}</span>
        </button>
        {showMethod && (
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
            {methodology.map((sec) => (
              <div key={sec.title}
                style={{ gridColumn: sec.wide ? "1 / -1" : undefined, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "11px 13px", background: "#FBFCFF" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                  <span style={{ width: 3, height: 13, borderRadius: 2, background: sec.accent }} />
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: sec.accent }}>{sec.title}</span>
                </div>
                {sec.items.map((it, idx) => (
                  <div key={idx} style={{ fontSize: 11.5, color: TEXT2, lineHeight: 1.55, marginTop: idx === 0 ? 0 : 6 }}>
                    <span style={{ fontWeight: 700, color: TEXT1 }}>{it.k}</span>
                    {it.f && <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: BLUE, background: "rgba(43,92,224,0.07)", borderRadius: 4, padding: "1px 5px", margin: "0 5px", whiteSpace: "nowrap" }}>{it.f}</span>}
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
const stickyTh: React.CSSProperties = { position: "sticky", left: 0, padding: "7px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: TEXT2, background: "#F0F4FA", borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`, whiteSpace: "nowrap" };
const stickyTd: React.CSSProperties = { position: "sticky", left: 0, zIndex: 1, padding: "8px 12px", borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`, verticalAlign: "middle" };
const retryBtn: React.CSSProperties = { marginTop: 10, padding: "6px 16px", borderRadius: 6, background: "rgba(43,92,224,0.08)", border: "1px solid rgba(43,92,224,0.20)", color: BLUE, cursor: "pointer", fontSize: 13 };
const ccyBadge = (ccy: "CLP" | "USD"): React.CSSProperties => ({ marginLeft: 5, fontSize: 9, fontWeight: 700, color: ccy === "USD" ? "#B45309" : TEXT3, background: ccy === "USD" ? "rgba(180,83,9,0.12)" : "rgba(100,116,139,0.10)", borderRadius: 4, padding: "1px 4px" });
const consBadge: React.CSSProperties = { marginLeft: 6, fontSize: 8.5, fontWeight: 700, color: BLUE, background: "rgba(43,92,224,0.10)", borderRadius: 4, padding: "1px 5px", textTransform: "uppercase", letterSpacing: "0.04em" };
