"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { usePhone } from "@/lib/useBreakpoint";
import { PATRIA, FONT_PRIMARY, FONT_SECONDARY, TEXT } from "@/lib/patriaTheme";
import { normName, buildOrder, type OrdenPayload } from "@/lib/chileCompanyOrder";
import { buildUnitByTicker, makeConv, mcapOf, toUnitKey } from "./StockSelectionV1";
import type { SsV1Company, SsV1Payload } from "@/app/api/chile/stock-selection-v1/route";
import type { IndexMembershipPayload } from "@/app/api/chile/index-membership/route";
import type { CarterasPayload } from "@/app/api/chile/carteras/route";
import type { ResumenCompany, ResumenFlow, ResumenPayload } from "@/app/api/chile/resumen-resultados/route";

// Chile → Resumen de Resultados. La foto de la temporada de resultados: entran sólo las
// compañías que ya subieron su ficha del trimestre vigente (el más reciente de todas las
// fichas); cuando la primera sube el trimestre siguiente, la vista se reinicia con ella.
//
// Fuentes:
//   · Flujos (Ventas, EBIT, EBITDA, Utilidad, Capex): /api/chile/resumen-resultados, desde
//     ficha_statements.
//   · M.Cap, deuda neta, patrimonio, proyecciones 2026E/27E y payout: la misma carga de Stock
//     Selection para ese trimestre (así un override de admin vale igual en las dos vistas).
//   · Índices y fondos: index_membership y las carteras, con el mismo cruce por unidad que
//     Stock Selection (series A/B incluidas). Suman SÓLO a los miembros que ya reportaron.
//
// Agregados = ratio de sumas, nunca promedio de ratios. Cada ratio aparea numerador y
// denominador por compañía: una compañía entra a un ratio sólo si tiene los dos términos (sin
// proyección 2027E no infla el M.Cap del FV/EBITDA 27E, sin LTM-1 no sesga la Var%).

const TEXT1 = PATRIA.darkBlue;
const TEXT2 = TEXT.label;
const TEXT3 = TEXT.muted;
const NM_TEXT = TEXT.disabled;
const BORDER = "rgba(13,13,56,0.09)";
const SURFACE = "#F5F7FD";
const POS = PATRIA.blue;
const NEG = PATRIA.pink;
const GAP_W = 14;
// Bandas por sección (como la hoja: un bloque de industria celeste, el siguiente blanco).
// Opacas porque la columna de compañías es sticky.
const SEC_BAND = "#EEF2FD";
const IDX_BG = "#E1E9FF";
const FUND_BG = "#F4F6FC";
const GROUP_BG = "#F8D3DA"; // grupos propios (Bancos): patria-pink al ~22% sobre blanco, como el rojizo de la hoja

// Grupos fijos que no son índice ni cartera: suma simple (peso 1) de las compañías, por ticker
// Bloomberg de Stock Selection.
const CUSTOM_GROUPS: { name: string; tickers: string[] }[] = [
  { name: "Bancos", tickers: ["CHILE CI", "BSAN CI", "BCI CI", "ITAUCL CI"] }, // Banco de Chile, Santander Chile, BCI, Itaú
];

// ── Aritmética (mismas reglas que Stock Selection) ──────────────────────────────
const NM = Number.NEGATIVE_INFINITY;
const mult = (n: number, d: number) => (n <= 0 || d <= 0 ? NM : n / d);
const rate = (n: number, d: number) => (d <= 0 || n < 0 ? NM : n / d);
const varOf = (cur: number, base: number) => (base <= 0 || cur < 0 ? NM : cur / base - 1);
const share = (n: number, d: number) => (d <= 0 ? NM : n / d);

type Bag = Record<string, number | null>;
type Kind = "var" | "mult" | "rate" | "share";
// Ratios: id ← numerador / denominador (claves del Bag de la unidad).
const RATIOS: { id: string; kind: Kind; n: string; d: string }[] = [
  { id: "revVar",    kind: "var",   n: "rev1",     d: "rev0" },
  { id: "ebitVar",   kind: "var",   n: "ebit1",    d: "ebit0" },
  { id: "ebitdaVar", kind: "var",   n: "ebitda1",  d: "ebitda0" },
  { id: "niVar",     kind: "var",   n: "ni1",      d: "ni0" },
  { id: "mg0",       kind: "share", n: "ebitda0",  d: "rev0" },
  { id: "mg1",       kind: "share", n: "ebitda1",  d: "rev1" },
  { id: "fvEbLtm",   kind: "mult",  n: "fv",       d: "ebitda1" },
  { id: "fvEb26",    kind: "mult",  n: "fv",       d: "ebitda26" },
  { id: "fvEb27",    kind: "mult",  n: "fv",       d: "ebitda27" },
  { id: "puLtm",     kind: "mult",  n: "mcap",     d: "ni1" },
  { id: "pu26",      kind: "mult",  n: "mcap",     d: "ni26" },
  { id: "pu27",      kind: "mult",  n: "mcap",     d: "ni27" },
  { id: "fvs",       kind: "mult",  n: "fv",       d: "rev1" },
  { id: "fvic",      kind: "mult",  n: "fv",       d: "icN" },
  { id: "pbv",       kind: "mult",  n: "mcap",     d: "eq" },
  { id: "roeLtm",    kind: "rate",  n: "ni1",      d: "eqPrev" },
  { id: "roe26",     kind: "rate",  n: "ni26",     d: "eq" },
  { id: "roicLtm",   kind: "rate",  n: "nopatLtm", d: "icPrev" },
  { id: "roic26",    kind: "rate",  n: "nopat26",  d: "icN" },
  { id: "divYield",  kind: "share", n: "div26",    d: "mcap" },
];
const DEFAULT_TAX = 0.27; // el de Stock Selection, si la ficha no trae "Tax Rate for ROIC"

// Par de períodos que comparan las columnas de Resultados en cada sub-pestaña.
const PERIOD_PAIR: Record<SubTab, [keyof ResumenFlow, keyof ResumenFlow]> = {
  ltm: ["ltmPrev", "ltm"],
  acum: ["ytdPrev", "ytd"],
  trim: ["qPrev", "q"],
};

/**
 * Primitivos aditivos de una compañía, en USD mn (a nivel compañía, sin prorratear).
 * rev0/rev1… son el par de la sub-pestaña (LTM, acumulado o trimestre); la valorización
 * (sólo en LTM) usa siempre el LTM.
 */
function amountsOf(r: ResumenCompany, c: SsV1Company | null, ebitRaw: ResumenPayload["modelEbit"][string] | undefined, tc: number, sub: SubTab): Bag {
  const conv = makeConv(tc);
  const ccy = r.currency, ss = c?.ssCurrency ?? ccy, pj = c?.projCurrency ?? null;
  const F = r.flows;
  const [k0, k1] = PERIOD_PAIR[sub];
  const tax = r.taxRate != null && r.taxRate >= 0 && r.taxRate < 1 ? r.taxRate : DEFAULT_TAX;
  const ebitLtm = conv(F.ebit.ltm, ccy);
  const ebit26 = ebitRaw?.y26 != null && c?.modelScale != null ? conv(ebitRaw.y26 * c.modelScale, pj) : null;
  const ni26 = conv(c?.utilidad2026E, pj);
  return {
    rev0: conv(F.revenue[k0], ccy),   rev1: conv(F.revenue[k1], ccy),
    ebit0: conv(F.ebit[k0], ccy),     ebit1: conv(F.ebit[k1], ccy),
    ebitda0: conv(F.ebitda[k0], ccy), ebitda1: conv(F.ebitda[k1], ccy),
    ni0: conv(F.utilidad[k0], ccy),   ni1: conv(F.utilidad[k1], ccy),
    capex0: conv(F.capex[k0], ccy),   capex1: conv(F.capex[k1], ccy),
    dn: conv(c?.debtN, ss),       dnPrev: conv(c?.debtN4, ss),
    eq: conv(c?.equityN, ss),     eqPrev: conv(c?.equityN4, ss),
    mi: conv(c?.minorityN, ss),   miPrev: conv(c?.minorityN4, ss),
    ebitda26: conv(c?.ebitda2026E, pj), ebitda27: conv(c?.ebitda2027E, pj),
    ni26, ni27: conv(c?.utilidad2027E, pj),
    nopatLtm: ebitLtm != null ? ebitLtm * (1 - tax) : null,
    nopat26: ebit26 != null ? ebit26 * (1 - tax) : null,
    div26: c?.payout != null && ni26 != null ? Math.max(c.payout * ni26, 0) : null,
  };
}

/** Unidad agregable: montos + M.Cap + FV / capital invertido + los pares de cada ratio. */
function makeUnit(a: Bag, mcap: number | null, w = 1): Bag {
  const u: Bag = { mcap };
  for (const k in a) u[k] = a[k] == null ? null : (a[k] as number) * w;
  u.fv = mcap != null && u.dn != null ? mcap + u.dn : null;
  u.icN = u.eq != null && u.dn != null ? u.eq + (u.mi ?? 0) + u.dn : null;
  u.icPrev = u.eqPrev != null && u.dnPrev != null ? u.eqPrev + (u.miPrev ?? 0) + u.dnPrev : null;
  for (const r of RATIOS) {
    const n = u[r.n], d = u[r.d];
    if (n != null && d != null) { u[`${r.id}#n`] = n; u[`${r.id}#d`] = d; }
  }
  return u;
}
const addInto = (t: Bag, u: Bag, w: number) => {
  for (const k in u) { const v = u[k]; if (v != null) t[k] = (t[k] ?? 0) + v * w; }
};
/** Valores a mostrar: los montos tal cual + cada ratio desde su par (sumado, si es agregado). */
function finish(u: Bag): Bag {
  const out: Bag = { ...u };
  for (const r of RATIOS) {
    const n = u[`${r.id}#n`], d = u[`${r.id}#d`];
    out[r.id] = n == null || d == null ? null
      : r.kind === "var" ? varOf(n, d) : r.kind === "mult" ? mult(n, d) : r.kind === "rate" ? rate(n, d) : share(n, d);
  }
  return out;
}

// ── Columnas ────────────────────────────────────────────────────────────────────
type Fmt = "mn" | "var" | "pct" | "x";
interface Col { id: string; label: string; fmt: Fmt; title?: string }
interface Grp { id: string; title: string; cols: Col[] }
type View = "res" | "val";

function groupsFor(view: View, p: ResumenPayload, sub: SubTab): Grp[] {
  const L = p.labels;
  // Etiquetas del par de la sub-pestaña, como en cada hoja: LTM-1/LTM · Ac-1/Ac · 3Q25/3Q26.
  const [h0, h1, t0, t1] =
    sub === "acum" ? ["Ac-1", "Ac", L.ytdPrev, L.ytd]
    : sub === "trim" ? [L.qPrev, L.q, L.qPrev, L.q]
    : ["LTM-1", "LTM", L.ltmPrev, L.ltm];
  const pair = (id0: string, id1: string, idVar?: string): Col[] => [
    { id: id0, label: h0, fmt: "mn", title: t0 },
    { id: id1, label: h1, fmt: "mn", title: t1 },
    ...(idVar ? [{ id: idVar, label: "Var%", fmt: "var" as const, title: `${t1} vs ${t0}` }] : []),
  ];
  if (view === "res" || sub !== "ltm") return [
    { id: "ventas", title: "Ventas", cols: pair("rev0", "rev1", "revVar") },
    { id: "ebit", title: "EBIT", cols: pair("ebit0", "ebit1", "ebitVar") },
    { id: "ebitda", title: "EBITDA", cols: [
      { id: "ebitda0", label: h0, fmt: "mn", title: t0 },
      { id: "mg0", label: "mg", fmt: "pct", title: `Margen EBITDA ${t0}` },
      { id: "ebitda1", label: h1, fmt: "mn", title: t1 },
      { id: "mg1", label: "mg", fmt: "pct", title: `Margen EBITDA ${t1}` },
      { id: "ebitdaVar", label: "Var%", fmt: "var", title: `${t1} vs ${t0}` },
    ] },
    { id: "util", title: "Utilidad", cols: pair("ni0", "ni1", "niVar") },
    { id: "capex", title: "Capex", cols: pair("capex0", "capex1") },
  ];
  const tri = (pre: string, fmt: Fmt, ids: [string, string, string]): Col[] => [
    { id: ids[0], label: "LTM", fmt, title: `${pre} ${L.ltm}` },
    { id: ids[1], label: "2026E", fmt, title: `${pre} 2026E (modelo del analista)` },
    { id: ids[2], label: "2027E", fmt, title: `${pre} 2027E (modelo del analista)` },
  ];
  return [
    { id: "size", title: "Tamaño", cols: [
      { id: "mcap", label: "MKT Cap", fmt: "mn", title: "Precio × acciones (Yahoo, en vivo)" },
      { id: "dn", label: `DN ${L.q}`, fmt: "mn", title: `Deuda neta (Total Net Debt) a ${p.label}` },
      { id: "fv", label: "FV", fmt: "mn", title: "Firm value = MKT Cap + DN" },
    ] },
    { id: "ebitdaE", title: "EBITDA", cols: tri("EBITDA", "mn", ["ebitda1", "ebitda26", "ebitda27"]) },
    { id: "utilE", title: "Utilidad", cols: tri("Utilidad", "mn", ["ni1", "ni26", "ni27"]) },
    { id: "fvEb", title: "FV/EBITDA", cols: tri("FV/EBITDA", "x", ["fvEbLtm", "fvEb26", "fvEb27"]) },
    { id: "pu", title: "P/U", cols: tri("P/U", "x", ["puLtm", "pu26", "pu27"]) },
    { id: "mult", title: "Múltiplos LTM", cols: [
      { id: "fvs", label: "FV/S", fmt: "x", title: `FV / Ventas ${L.ltm}` },
      { id: "fvic", label: "FV/IC", fmt: "x", title: `FV / capital invertido a ${p.label} (patrimonio + minoritarios + DN)` },
      { id: "pbv", label: "P/BV", fmt: "x", title: `MKT Cap / patrimonio controlador a ${p.label}` },
    ] },
    { id: "rent", title: "Rentabilidad", cols: [
      { id: "roeLtm", label: `ROE ${L.q}`, fmt: "pct", title: `Utilidad ${L.ltm} / patrimonio a ${L.qPrev}` },
      { id: "roe26", label: "ROE 2026E", fmt: "pct", title: `Utilidad 2026E / patrimonio a ${L.q}` },
      { id: "roicLtm", label: `ROIC ${L.q}`, fmt: "pct", title: `EBIT ${L.ltm} × (1 − tasa) / capital invertido a ${L.qPrev}` },
      { id: "roic26", label: "ROIC 2026E", fmt: "pct", title: `EBIT 2026E × (1 − tasa) / capital invertido a ${L.q}` },
      { id: "divYield", label: "Div Yield 2026E", fmt: "pct", title: "Payout del modelo × utilidad 2026E / MKT Cap" },
    ] },
  ];
}

function fmtCell(v: number | null | undefined, fmt: Fmt): { text: string; color: string } {
  if (v == null) return { text: "", color: NM_TEXT };
  if (!isFinite(v)) return { text: "NM", color: NM_TEXT };
  if (fmt === "var") return { text: `${(v * 100).toFixed(1)}%`, color: v > 0.0005 ? POS : v < -0.0005 ? NEG : TEXT2 };
  if (fmt === "pct") return { text: `${(v * 100).toFixed(1)}%`, color: TEXT1 };
  if (fmt === "x") return { text: `${v.toFixed(1)}x`, color: TEXT1 };
  const a = Math.abs(v);
  return { text: a >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1), color: TEXT1 };
}

const fullBBG = (t: string) => (/\bEQUITY$/i.test(t.trim()) ? t.trim() : `${t.trim()} EQUITY`);

interface CoRow { key: string; name: string; industria: string | null; section: number; href: string; v: Bag }
interface AggRow { key: string; name: string; kind: "index" | "fund" | "group"; have: number; total: number; v: Bag }

type SubTab = "ltm" | "acum" | "trim";
const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "ltm", label: "LTM" },
  { key: "acum", label: "Acumulado" },
  { key: "trim", label: "Trimestre" },
];

export default function ResumenResultados() {
  const isPhone = usePhone();
  const [sub, setSub] = useState<SubTab>("ltm");
  const [view, setView] = useState<View>("res");
  const [phoneGrp, setPhoneGrp] = useState<string | null>(null);
  const [res, setRes] = useState<ResumenPayload | null>(null);
  const [ss, setSs] = useState<SsV1Payload | null>(null);
  const [membership, setMembership] = useState<IndexMembershipPayload | null>(null);
  const [carteras, setCarteras] = useState<CarterasPayload | null>(null);
  const [orden, setOrden] = useState<OrdenPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tc, setTc] = useState(900);
  const [tcInput, setTcInput] = useState("900");
  const tcTouched = useRef(false);
  const reqId = useRef(0);

  // Resumen → Stock Selection de ese trimestre (rápido, sin precios) → con precios de Yahoo.
  // Los flujos se ven de inmediato; M.Cap y múltiplos llegan con la segunda carga.
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    try {
      const rr: ResumenPayload & { error?: string } = await fetch("/api/chile/resumen-resultados").then((r) => r.json());
      if (rr.error) throw new Error(rr.error);
      if (id !== reqId.current) return;
      setRes(rr);
      if (!tcTouched.current && rr.fx) { setTc(rr.fx); setTcInput(String(rr.fx)); }
      if (!rr.companies.length) return;
      const qs = `fy=${rr.fy}&q=${rr.q}`;
      const base: SsV1Payload & { error?: string } = await fetch(`/api/chile/stock-selection-v1?${qs}`).then((r) => r.json());
      if (id !== reqId.current) return;
      if (!base.error) setSs(base);
      setLoading(false);
      setPricing(true);
      const priced: SsV1Payload & { error?: string } = await fetch(`/api/chile/stock-selection-v1?${qs}&withPrices=true`).then((r) => r.json());
      if (id === reqId.current && !priced.error) setSs(priced);
    } catch (e) {
      if (id === reqId.current) setError(`No se pudo cargar el resumen (${String(e instanceof Error ? e.message : e)}).`);
    } finally {
      if (id === reqId.current) { setLoading(false); setPricing(false); }
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    fetch("/api/chile/index-membership").then((r) => r.json()).then((d) => { if (!d.error) setMembership(d); }).catch(() => {});
    fetch("/api/chile/carteras").then((r) => r.json()).then((d) => { if (!d.error) setCarteras(d); }).catch(() => {});
    fetch("/api/chile/orden").then((r) => r.json()).then((d) => { if (!d.error) setOrden(d); }).catch(() => {});
  }, []);
  const ord = useMemo(() => buildOrder(orden), [orden]);

  const ssByFicha = useMemo(() => {
    const m = new Map<string, SsV1Company>();
    for (const c of ss?.companies ?? []) if (c.fichaTicker) m.set(c.fichaTicker, c);
    return m;
  }, [ss]);

  // Filas de compañías + unidades agregables (compañía y cada serie A/B).
  const { rows, unitMap } = useMemo(() => {
    const rows: CoRow[] = [];
    const unitMap = new Map<string, Bag>();
    if (!res) return { rows, unitMap };
    for (const r of res.companies) {
      const c = ssByFicha.get(r.ticker) ?? null;
      const a = amountsOf(r, c, c?.modelTicker ? res.modelEbit[c.modelTicker] : undefined, tc, sub);
      const seriesMcaps = c ? c.series.map((s) => mcapOf(s, tc)) : [];
      const mcap = seriesMcaps.some((m) => m != null) ? seriesMcaps.reduce((acc: number, m) => acc + (m ?? 0), 0) : null;
      const whole = makeUnit(a, mcap);
      const name = c?.company ?? r.ticker;
      rows.push({
        key: r.ticker, name, industria: c?.industria ?? null,
        section: c ? ord.sectionIdx(c.company) : Number.MAX_SAFE_INTEGER,
        href: `/chile?tab=last-ficha&ticker=${encodeURIComponent(fullBBG(r.fullTicker))}`,
        v: finish(whole),
      });
      if (!c) continue;
      const base = normName(c.company);
      unitMap.set(base, whole);
      if (c.dual) c.series.forEach((s, i) => {
        const w = s.shares != null && c.sharesTotal ? s.shares / c.sharesTotal : 0;
        unitMap.set(`${base}-${s.label.toLowerCase()}`, makeUnit(a, seriesMcaps[i], w));
      });
    }
    rows.sort((x, y) => ord.orderIdx(x.name) - ord.orderIdx(y.name) || x.name.localeCompare(y.name));
    return { rows, unitMap };
  }, [res, ssByFicha, tc, ord, sub]);

  // Índices (peso de index_membership) y fondos (acciones en cartera / acciones de la unidad).
  const aggs = useMemo<AggRow[]>(() => {
    const out: AggRow[] = [];
    if (membership) {
      const acc = new Map<string, { bag: Bag; have: number; total: number }>();
      for (const key of Object.keys(membership.weights)) {
        let parsed: [string, string];
        try { parsed = JSON.parse(key) as [string, string]; } catch { continue; }
        const [idx, co] = parsed;
        const w = membership.weights[key];
        if (!(w > 0)) continue;
        let a = acc.get(idx);
        if (!a) { a = { bag: {}, have: 0, total: 0 }; acc.set(idx, a); }
        a.total++;
        const u = unitMap.get(toUnitKey(co));
        if (!u) continue;
        addInto(a.bag, u, w);
        a.have++;
      }
      for (const idx of membership.indices) {
        const a = acc.get(idx);
        if (a) out.push({ key: `i:${idx}`, name: idx, kind: "index", have: a.have, total: a.total, v: finish(a.bag) });
      }
    }
    if (carteras?.fondos.length && ss) {
      const byTicker = buildUnitByTicker(ss.companies);
      const acc = new Map<string, { bag: Bag; have: number; total: number }>();
      for (const key of Object.keys(carteras.holdings)) {
        let parsed: [string, string];
        try { parsed = JSON.parse(key) as [string, string]; } catch { continue; }
        const [fondo, ticker] = parsed;
        const held = carteras.holdings[key];
        if (!(held > 0)) continue;
        let a = acc.get(fondo);
        if (!a) { a = { bag: {}, have: 0, total: 0 }; acc.set(fondo, a); }
        a.total++;
        const ref = byTicker.get(ticker);
        const u = ref ? unitMap.get(ref.unitKey) : undefined;
        if (!ref || !u || !(ref.shares != null && ref.shares > 0)) continue;
        addInto(a.bag, u, held / ref.shares);
        a.have++;
      }
      for (const fondo of carteras.fondos) {
        const a = acc.get(fondo);
        if (a) out.push({ key: `f:${fondo}`, name: fondo, kind: "fund", have: a.have, total: a.total, v: finish(a.bag) });
      }
    }
    if (ss) {
      const byTicker = buildUnitByTicker(ss.companies);
      for (const g of CUSTOM_GROUPS) {
        const bag: Bag = {};
        let have = 0;
        for (const t of g.tickers) {
          const ref = byTicker.get(t);
          const u = ref ? unitMap.get(ref.unitKey) : undefined;
          if (u) { addInto(bag, u, 1); have++; }
        }
        out.push({ key: `g:${g.name}`, name: g.name, kind: "group", have, total: g.tickers.length, v: finish(bag) });
      }
    }
    return out;
  }, [membership, carteras, ss, unitMap]);

  const pendingNames = useMemo(() => (res?.pending ?? []).map((p) => {
    const c = ss?.companies.find((x) => x.fichaTicker === p.ticker);
    return { ...p, name: c?.company ?? p.ticker };
  }), [res, ss]);

  // Acumulado y Trimestre sólo tienen la página de Resultados (la valorización es LTM).
  const effView: View = sub === "ltm" ? view : "res";
  const allGroups = res ? groupsFor(effView, res, sub) : [];
  // Teléfono: un grupo por vez; si el elegido no existe en esta sub-pestaña, el primero.
  const phoneSel = allGroups.some((g) => g.id === phoneGrp) ? phoneGrp! : allGroups[0]?.id;
  const groups = isPhone ? allGroups.filter((g) => g.id === phoneSel) : allGroups;
  const gaps = !isPhone;

  const applyTc = () => {
    const v = parseFloat(tcInput.replace(",", "."));
    if (isFinite(v) && v > 0) { tcTouched.current = true; setTc(v); } else setTcInput(String(tc));
  };

  const gapTh = (k: string, rowSpan?: number) => gaps ? <th key={k} rowSpan={rowSpan} style={{ width: GAP_W, minWidth: GAP_W, padding: 0, background: "#fff" }} /> : null;
  const gapTd = (k: string, bg = "#fff") => gaps ? <td key={k} style={{ width: GAP_W, minWidth: GAP_W, padding: 0, background: bg }} /> : null;

  // Resultados tiene pocas columnas: letra más grande y la tabla a todo el ancho. Valorización
  // (más del doble de columnas) va más compacta para que entre sin scroll en un monitor normal.
  const roomy = effView === "res" && !isPhone;
  const tdx: React.CSSProperties = { ...td, padding: roomy ? "5px 12px" : isPhone ? "3px 7px" : "3px 8px" };

  const valueCells = (v: Bag, bg: string, bold: boolean, waiting: boolean) => groups.map((g, gi) => (
    <Fragment key={g.id}>
      {gi > 0 && gapTd(`g${g.id}`)}
      {g.cols.map((c) => {
        const f = fmtCell(v[c.id], c.fmt);
        return (
          <td key={c.id} style={{ ...tdx, background: bg, color: f.color, fontWeight: bold ? 700 : 400 }}>
            {f.text || (waiting ? <span style={{ color: NM_TEXT }}>…</span> : "")}
          </td>
        );
      })}
    </Fragment>
  ));

  const waitingPrices = pricing && effView === "val";

  return (
    <div>
      {/* ── Encabezado ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 28, minWidth: 0, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT1, letterSpacing: "-0.02em", margin: 0, fontFamily: FONT_PRIMARY }}>
              Resumen de Resultados{res?.companies.length ? ` · ${res.label}` : ""}
            </h2>
            {res && (
              <div style={{ fontSize: 11.5, color: TEXT2, marginTop: 3, fontFamily: FONT_SECONDARY }}>
                <b style={{ color: TEXT1 }}>{res.companies.length}</b> compañías reportaron {res.label}
                {res.pending.length ? <> · <b style={{ color: PATRIA.orange }}>{res.pending.length}</b> pendientes</> : null}
                {" "}· USD millones (CLP ÷ FX)
              </div>
            )}
          </div>
          {/* FX: el mismo recuadro destacado de Last Ficha, pero editable. */}
          <div style={{ fontFamily: FONT_SECONDARY }} title="Todos los montos en CLP se dividen por este FX. Por defecto, el FX de las fichas del trimestre (celda C6 de la hoja).">
            <div style={{ fontSize: 10.5, fontWeight: 700, color: TEXT1, marginBottom: 3 }}>
              FX usado · CLP por USD
              {res?.fx != null && tc !== res.fx && (
                <button onClick={() => { tcTouched.current = false; setTc(res.fx!); setTcInput(String(res.fx)); }}
                  style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: PATRIA.kingBlue, background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
                  volver al de las fichas ({res.fx.toLocaleString("en-US")})
                </button>
              )}
            </div>
            <input value={tcInput} onChange={(e) => setTcInput(e.target.value)} onBlur={applyTc}
              onKeyDown={(e) => { if (e.key === "Enter") applyTc(); }}
              inputMode="decimal" aria-label="FX CLP por USD"
              style={{ width: 96, padding: "4px 10px", textAlign: "center", fontSize: 15, fontWeight: 700, fontFamily: FONT_SECONDARY, color: PATRIA.blue, background: "rgba(255,187,141,0.35)", border: `1.5px solid ${PATRIA.darkBlue}`, outline: "none" }} />
            <span style={{ marginLeft: 8, fontSize: 10.5, color: TEXT3 }}>
              {res?.fx != null && tc === res.fx ? `FX de las fichas ${res.labels.q}` : "editado a mano"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {pricing && <span style={{ fontSize: 11, color: TEXT3 }}>Trayendo precios…</span>}
          <button onClick={() => void load()} disabled={loading} title="Volver a leer fichas, modelos y precios" style={iconBtn}>
            <RefreshCw size={13} style={loading || pricing ? { animation: "spin 0.8s linear infinite" } : undefined} />
          </button>
        </div>
      </div>

      {/* ── LTM / Acumulado / Trimestre ── */}
      <div className="tab-rail keep-dense" style={{ display: "flex", gap: 2, padding: 3, borderRadius: 8, background: "rgba(13,13,56,0.04)", border: "1px solid rgba(13,13,56,0.08)", width: "fit-content", marginBottom: 12 }}>
        {SUB_TABS.map((t) => (
          <button key={t.key} onClick={() => setSub(t.key)}
            style={{ padding: "5px 16px", borderRadius: 6, fontSize: 12.5, cursor: "pointer", fontWeight: sub === t.key ? 700 : 500, color: sub === t.key ? "#fff" : TEXT2, background: sub === t.key ? PATRIA.darkBlue : "transparent", border: "none" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Pendientes: van atrasadas respecto del trimestre vigente. */}
      {pendingNames.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 11.5, color: TEXT2, marginBottom: 12 }}>
          <span style={{ fontWeight: 700, color: TEXT1 }}>Aún sin {res!.label}:</span>
          {pendingNames.map((p) => (
            <span key={p.ticker} title={`Última ficha: ${p.lastLabel}`}
              style={{ padding: "1px 8px", borderRadius: 999, background: "rgba(255,107,6,0.08)", border: "1px solid rgba(255,107,6,0.28)", color: TEXT1 }}>
              {p.name} <span style={{ color: TEXT3 }}>· {p.lastLabel}</span>
            </span>
          ))}
        </div>
      )}

      {error && <div style={{ padding: 24, textAlign: "center", color: NEG, fontSize: 13 }}>{error}</div>}
      {!error && !res && <div style={{ padding: 24, textAlign: "center", color: TEXT3, fontSize: 13 }}>Cargando resumen…</div>}
      {res && !res.companies.length && !error && (
        <div style={{ padding: 24, textAlign: "center", color: TEXT3, fontSize: 13 }}>Todavía no hay fichas cargadas. Se suben con la macro “Send Ficha”.</div>
      )}

      {res && res.companies.length > 0 && <>
        {/* Resultados (página 1 de la hoja) / Valorización (página 2): sólo en LTM */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {sub === "ltm" && <div style={{ ...ctrlBox, padding: 2, gap: 0 }}>
            {([["res", "Resultados"], ["val", "Valorización"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => { setView(k); setPhoneGrp(null); }}
                style={{ padding: "4px 12px", fontSize: 12, fontWeight: 700, border: "none", borderRadius: 4, cursor: "pointer", background: view === k ? PATRIA.kingBlue : "transparent", color: view === k ? "#fff" : TEXT2 }}>
                {label}
              </button>
            ))}
          </div>}
          {isPhone && (
            <div className="tab-rail keep-dense" style={{ display: "flex", gap: 6 }}>
              {allGroups.map((g) => {
                const on = g.id === phoneSel;
                return (
                  <button key={g.id} onClick={() => setPhoneGrp(g.id)}
                    style={{ padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", border: `1px solid ${PATRIA.kingBlue}`, background: on ? PATRIA.kingBlue : "#fff", color: on ? "#fff" : PATRIA.kingBlue }}>
                    {g.title}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="scroll-x" style={{ background: "#fff", opacity: loading ? 0.6 : 1 }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, fontFamily: FONT_SECONDARY, fontSize: roomy ? 13 : 11.5, color: TEXT1, width: "100%" }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ ...bar, ...stickyLeft, zIndex: 3, textAlign: "left", minWidth: isPhone ? 110 : 150 }}>Compañías</th>
                {!isPhone && <th rowSpan={2} style={{ ...bar, textAlign: "left", minWidth: 120 }}>Industria</th>}
                {groups.map((g, gi) => (
                  <Fragment key={g.id}>
                    {(gi > 0 || !isPhone) && gapTh(`g${g.id}`, 2)}
                    <th colSpan={g.cols.length} style={{ ...bar, fontSize: 11, borderBottom: "1px solid rgba(255,255,255,0.22)" }}>{g.title}</th>
                  </Fragment>
                ))}
              </tr>
              <tr>
                {groups.map((g) => g.cols.map((c) => (
                  <th key={`${g.id}.${c.id}`} title={c.title} style={{ ...bar, fontWeight: 600, fontSize: 10, color: "rgba(255,255,255,0.85)", textAlign: "right" }}>{c.label}</th>
                )))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const prev = rows[i - 1];
                const newSec = i > 0 && prev.section !== r.section;
                // Bandas por sección: alterna blanco / celeste en cada cambio de industria.
                let band = 0;
                for (let j = 1; j <= i; j++) if (rows[j].section !== rows[j - 1].section) band++;
                const bg = band % 2 === 1 ? SEC_BAND : "#fff";
                return (
                  <tr key={r.key} style={newSec ? { boxShadow: `inset 0 1px 0 ${PATRIA.darkBlue}33` } : undefined}>
                    <td style={{ ...tdx, ...stickyLeft, background: bg, textAlign: "left", fontWeight: 600 }}>
                      <Link href={r.href} title="Abrir su Last Ficha" style={nameLink}>{r.name}</Link>
                    </td>
                    {!isPhone && <td style={{ ...tdx, background: bg, textAlign: "left", color: TEXT2 }}>{r.industria ?? ""}</td>}
                    {gaps && gapTd("g0")}
                    {valueCells(r.v, bg, false, waitingPrices)}
                  </tr>
                );
              })}

              {aggs.length > 0 && <tr><td colSpan={99} style={{ height: 14 }} /></tr>}
              {aggs.map((a, i) => {
                const bg = a.kind === "index" ? IDX_BG : a.kind === "fund" ? FUND_BG : GROUP_BG;
                const firstOfKind = i > 0 && aggs[i - 1].kind !== a.kind;
                const cov = `${a.have}/${a.total} reportaron`;
                return (
                  <tr key={a.key} style={firstOfKind ? { boxShadow: `inset 0 2px 0 ${a.kind === "group" ? PATRIA.pink : PATRIA.kingBlue}` } : undefined}>
                    <td style={{ ...tdx, ...stickyLeft, background: bg, textAlign: "left", fontWeight: 700 }}
                      title={`${a.kind === "index" ? "Índice" : a.kind === "fund" ? "Fondo" : "Grupo"}: suma ${a.have} de sus ${a.total} miembros (sólo los que ya reportaron ${res.label})`}>
                      {a.name}
                      {isPhone && <div style={{ fontSize: 9.5, fontWeight: 500, color: TEXT3 }}>{cov}</div>}
                    </td>
                    {!isPhone && <td style={{ ...tdx, background: bg, textAlign: "left", color: TEXT3, fontSize: 10.5 }}>{cov}</td>}
                    {gaps && gapTd("g0")}
                    {valueCells(a.v, bg, true, waitingPrices)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Methodology p={res} tc={tc} />
      </>}
    </div>
  );
}

// ── Metodología: cerrada por defecto, un clic la abre ──────────────────────────
function Methodology({ p, tc }: { p: ResumenPayload; tc: number }) {
  const [open, setOpen] = useState(false);
  const L = p.labels;
  type Item = { k: string; f?: string; v: string };
  const cards: { title: string; items: Item[] }[] = [
    { title: "Fuentes", items: [
      { k: "Resultados", v: `ficha_statements: la ficha que se sube con la macro “Send Ficha” (Last Ficha). Trimestre vigente = el más reciente de cualquier ficha (${p.label}); sólo entran las compañías que ya lo subieron.` },
      { k: "Precio", v: "Yahoo Finance en vivo (regularMarketPrice), el mismo de Stock Selection. Si difiere más de 15% del último cierre se usa el cierre (papeles sin transacciones)." },
      { k: "Acciones", v: "# Shares de la ficha del trimestre; en las de serie A/B, las de cada serie con el precio de esa serie." },
      { k: "Proyecciones 2026E / 2027E", v: "Último modelo del analista (model_* / bank_*): EBITDA, utilidad y EBIT, llevados a millones con la misma escala que mide Stock Selection." },
      { k: "Dividendo", v: "Payout del modelo del analista (el de 2027 = dividendo pagado sobre la utilidad 2026E, igual que Stock Selection)." },
      { k: "Índices y fondos", v: "Membresía de índices y carteras de Stock Selection (Admin Issues). Bancos = Banco de Chile + Santander Chile + BCI + Itaú." },
    ] },
    { title: "Resultados", items: [
      { k: "LTM", f: L.ltm, v: "Columna LTM de la ficha; si no viene, suma de los 4 últimos trimestres (al 4Q, el año)." },
      { k: "LTM-1", f: L.ltmPrev, v: "Suma de los 4 trimestres que terminan un año antes. Si falta uno, queda en blanco." },
      { k: "Acumulado", f: `Ac-1 = ${L.ytdPrev} · Ac = ${L.ytd}`, v: "Columnas Acumulado n-1 y Acumulado de la ficha; si no vienen, suma de los trimestres del año hasta el vigente (al 4Q, el año)." },
      { k: "Trimestre", f: `${L.qPrev} vs ${L.q}`, v: "El trimestre de la ficha contra el mismo trimestre del año anterior (el 4Q, si falta, = año − 1Q − 2Q − 3Q)." },
      { k: "Var%", f: "período / período n-1 − 1", v: "NM si la base es ≤ 0 o el período actual es negativo." },
      { k: "mg", f: "EBITDA / Ventas", v: "Margen EBITDA de cada período." },
      { k: "Capex", v: "Línea PP&E Capex del Cash Flow (negativo = inversión)." },
    ] },
    { title: "Valorización", items: [
      { k: "MKT Cap", f: "Precio × acciones", v: "Suma de las series en las A/B." },
      { k: `DN ${L.q}`, v: `Total Net Debt de la ficha a ${p.label}.` },
      { k: "FV", f: "MKT Cap + DN", v: "" },
      { k: "FV/EBITDA · P/U", f: "FV / EBITDA · MKT Cap / Utilidad", v: "LTM con la ficha; 2026E y 2027E con el modelo. NM si alguno de los dos términos es ≤ 0." },
      { k: "FV/S · FV/IC · P/BV", f: "FV / Ventas LTM · FV / (Patrimonio + Minoritarios + DN) · MKT Cap / Patrimonio", v: `Balance a ${p.label}.` },
      { k: `ROE ${L.q}`, f: "Utilidad LTM / Patrimonio de un año antes", v: `Patrimonio controlador a ${L.qPrev}.` },
      { k: "ROE 2026E", f: "Utilidad 2026E / Patrimonio actual", v: "" },
      { k: `ROIC ${L.q}`, f: "EBIT LTM × (1 − t) / Capital invertido de un año antes", v: "t = Tax Rate for ROIC de la ficha (27% si no viene). Capital invertido = patrimonio + minoritarios + DN." },
      { k: "ROIC 2026E", f: "EBIT 2026E × (1 − t) / Capital invertido actual", v: "" },
      { k: "Div Yield 2026E", f: "Payout × Utilidad 2026E / MKT Cap", v: "" },
    ] },
    { title: "Moneda y agregados", items: [
      { k: "Moneda", f: `CLP ÷ ${tc.toLocaleString("en-US")}`, v: "Todo en USD millones. Las fichas en USD quedan tal cual. El FX se edita arriba." },
      { k: "Índices", f: "Σ (compañía × peso)", v: "Peso de la membresía (1 = la compañía entera)." },
      { k: "Fondos", f: "Σ (compañía × acciones en cartera / acciones)", v: "La fracción de la compañía que tiene el fondo, por serie." },
      { k: "Ratios agregados", f: "Σ numerador / Σ denominador", v: "Nunca promedio de ratios. Cada compañía entra a un ratio sólo si tiene sus dos términos, y sólo suman las que ya reportaron (columna “x/y reportaron”)." },
    ] },
  ];
  return (
    <div style={{ marginTop: 12 }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT1, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
        <span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▸</span>
        Metodología y fuentes
      </button>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10, marginTop: 10 }}>
          {cards.map((c) => (
            <div key={c.title} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", padding: "10px 12px" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: PATRIA.darkBlue, marginBottom: 6 }}>{c.title}</div>
              {c.items.map((it) => (
                <div key={it.k} style={{ fontSize: 11.5, lineHeight: 1.5, color: TEXT2, marginBottom: 5 }}>
                  <span style={{ fontWeight: 700, color: TEXT1 }}>{it.k}</span>
                  {it.f && <span style={{ fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue, marginLeft: 6 }}>{it.f}</span>}
                  {it.v && <div>{it.v}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const stickyLeft: React.CSSProperties = { position: "sticky", left: 0, zIndex: 1 };
const bar: React.CSSProperties = {
  background: PATRIA.darkBlue, color: "#fff", fontFamily: FONT_SECONDARY, fontWeight: 700, fontSize: 10.5,
  padding: "3px 8px", textAlign: "center", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "2px 8px", lineHeight: 1.4, textAlign: "right", color: TEXT1, fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap", verticalAlign: "middle",
};
const nameLink: React.CSSProperties = {
  color: PATRIA.kingBlue, textDecoration: "underline", textDecorationStyle: "dotted",
  textDecorationColor: "rgba(32,68,220,0.55)", textUnderlineOffset: 2,
};
const ctrlBox: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, background: SURFACE };
const iconBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", color: TEXT1, cursor: "pointer" };
