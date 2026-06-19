"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { SsV1Company, SsV1Payload, SsV1Series } from "@/app/api/chile/stock-selection-v1/route";

// ── Design tokens ────────────────────────────────────────────────────────────────
const TEXT1 = "#0F172A";
const TEXT2 = "#64748B";
const TEXT3 = "#94A3B8";
const BORDER = "rgba(15,23,42,0.08)";
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

// ── Computed value bag (USD mn) ────────────────────────────────────────────────
interface Alloc {
  dn: number | null; debtN4Usd: number | null; equityNUsd: number | null; equityN4Usd: number | null;
  minorityNUsd: number | null; ebitdaLtmUsd: number | null; ebitda26Usd: number | null; ebitda27Usd: number | null;
  utilLtmUsd: number | null; util26Usd: number | null; util27Usd: number | null; revLtmUsd: number | null;
  ebitLtmUsd: number | null; ebitdaN: number | null; ebitdaN4: number | null; utilidadN: number | null;
  utilidadN4: number | null; payout: number | null;
}

function computeV(mcap: number | null, a: Alloc): Record<string, number | null> {
  const fv = mcap != null && a.dn != null ? mcap + a.dn : null;
  const nopat = a.ebitLtmUsd != null ? a.ebitLtmUsd * (1 - 0.27) : null;
  const icN4 = a.equityN4Usd != null && a.debtN4Usd != null ? a.equityN4Usd + a.debtN4Usd : null;
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
    equityNUsd: conv(c.equityN, ss), equityN4Usd: conv(c.equityN4, ss), minorityNUsd: conv(c.minorityN, ss),
    ebitdaLtmUsd: conv(c.ebitdaLtm, ss), ebitda26Usd: conv(c.ebitda2026E, pj), ebitda27Usd: conv(c.ebitda2027E, pj),
    utilLtmUsd: conv(c.utilidadLtm, ss), util26Usd: conv(c.utilidad2026E, pj), util27Usd: conv(c.utilidad2027E, pj),
    revLtmUsd: conv(c.revenueLtm, ss), ebitLtmUsd: conv(c.ebitLtm, ss),
    ebitdaN: c.ebitdaN, ebitdaN4: c.ebitdaN4, utilidadN: c.utilidadN, utilidadN4: c.utilidadN4,
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
    { title: `EBITDA ${periodN4 ?? "n-4"} → ${periodN ?? "n"} (rep.)`, accent: "#0D9488", cols: [mnCol("ebitdaN4", "Ac-1"), mnCol("ebitdaN", "Ac"), varCol("ebitdaVar", "Var%")] },
    { title: `Utilidad ${periodN4 ?? "n-4"} → ${periodN ?? "n"} (rep.)`, accent: "#9333EA", cols: [mnCol("utilidadN4", "Ac-1"), mnCol("utilidadN", "Ac"), varCol("utilVar", "Var%")] },
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
  const [sortKey, setSortKey] = useState("mcap");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback((withPrices: boolean) => {
    if (withPrices) setPricesLoading(true); else setLoading(true);
    setError(false);
    fetch(`/api/chile/stock-selection-v1${withPrices ? "?withPrices=true" : ""}`)
      .then((r) => r.json())
      .then((d: SsV1Payload & { error?: string }) => { if (d.error) setError(true); else setData(d); })
      .catch(() => setError(true))
      .finally(() => { setLoading(false); setPricesLoading(false); });
  }, []);
  useEffect(() => { load(false); }, [load]);

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
      No se pudo cargar Stock Selection v1.
      <div><button onClick={() => load(false)} style={retryBtn}>Reintentar</button></div></div>;
  }

  const priced = data.withPrices;

  const renderCells = (r: DisplayRow) =>
    groupDefs.map((g) =>
      g.cols.map((col, i) => {
        const out = col.render(r);
        return (
          <td key={col.id}
            style={{ padding: r.kind === "series" ? "5px 10px" : "8px 10px", textAlign: col.align ?? "right", fontFamily: "JetBrains Mono, monospace", fontSize: r.kind === "series" ? 11 : 11.5, color: out.color ?? TEXT1, fontWeight: out.weight ?? 400, borderBottom: `1px solid ${BORDER}`, borderLeft: i === 0 ? `1px solid ${BORDER}` : "none", whiteSpace: "nowrap", opacity: r.kind === "series" ? 0.92 : 1 }}>
            {out.text}
          </td>
        );
      })
    );

  return (
    <div>
      {/* Header / controls */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 820 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 3, height: 22, background: BLUE, borderRadius: 2 }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT1, letterSpacing: "-0.02em", margin: 0 }}>Stock Selection v1</h2>
          </div>
          <p style={{ fontSize: 12, color: TEXT2, margin: "4px 0 0 13px", lineHeight: 1.5 }}>
            Screener recomputado desde <strong>stock_selection_v1</strong> + <strong>proyecciones_financieras</strong> + Yahoo, en <strong>USD millones</strong> (conv = ÷TC para CLP).{" "}
            Doble serie (Andina, Aguas, Embonor, Potasios, Soquimich) → filas <strong>A / B</strong> (por acción, prorateadas) + <strong>consolidada</strong> (M.Cap = Σ series).{" "}
            {data.periodN ? <>n = <strong>{data.periodN}</strong>, n-4 = <strong>{data.periodN4}</strong>. LTM = {data.ltmLabels.join(" + ")}.</> : null}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "#F8FAFF" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: TEXT2 }}>TC USD/CLP</span>
            <input type="text" inputMode="decimal" value={tcInput} onChange={(e) => setTcInput(e.target.value)} onBlur={applyTc}
              onKeyDown={(e) => { if (e.key === "Enter") applyTc(); }}
              style={{ width: 64, padding: "3px 6px", fontSize: 12, fontFamily: "JetBrains Mono, monospace", textAlign: "right", border: `1px solid ${BORDER}`, borderRadius: 5, background: "#fff", color: TEXT1, outline: "none" }} />
          </div>
          <button onClick={() => load(true)} disabled={pricesLoading}
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
              const rows = [g.cons, ...g.series];
              return rows.map((r) => {
                const isSeries = r.kind === "series";
                const bg = gi % 2 === 0 ? "#fff" : "rgba(248,250,255,0.6)";
                return (
                  <tr key={`${r.company}-${r.label || "cons"}`} style={{ background: isSeries ? "rgba(248,250,255,0.85)" : bg }}>
                    <td style={{ ...stickyTd, background: isSeries ? "#F4F8FF" : (gi % 2 === 0 ? "#fff" : "#F6F9FF"), paddingLeft: isSeries ? 26 : 12 }}>
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
                    {renderCells(r)}
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

      {/* Legend */}
      <div style={{ marginTop: 10, fontSize: 11, color: TEXT2, lineHeight: 1.6 }}>
        <div><strong>Series A/B:</strong> cada serie usa su propio precio (Yahoo) y nº de acciones → M.Cap por serie; la <strong>consolidada</strong> suma los M.Cap. Las filas A/B muestran fundamentales <strong>prorateados</strong> por % de acciones, así que sus múltiplos son por acción (P/U serie A de Andina ≈ 11,4x); la consolidada usa el M.Cap total contra el fundamental completo (P/U ≈ 12,8x).</div>
        <div><strong>Unidades:</strong> todo en USD mn vía conv() (÷TC si CLP). M.Cap usa la moneda del precio de Yahoo. <strong>Retornos:</strong> precio ajustado, acumulados. <strong>P/U:</strong> &ldquo;NM&rdquo; si utilidad ≤ 0.</div>
        <div><strong>Pol Div</strong> = <code>proyecciones_financieras.pool_div</code> (payout, en %). <strong>Div Yield 26E</strong> = payout × Utilidad 2026E / M.Cap.</div>
        <div><strong>Rec./Date/TP</strong> = <code>AnalystRecommendationHistory</code> (última por fecha), cruzado por <code>company_isins.company_name</code> → isin → <code>ticker_bloomberg</code>. TP en moneda del precio (sin TC); nombres sin mapeo en company_isins quedan en &ldquo;—&rdquo;.</div>
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
