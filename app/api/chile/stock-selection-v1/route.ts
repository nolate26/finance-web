import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import YahooFinance from "yahoo-finance2";
import { OVERRIDE_FIELD_KEYS } from "@/lib/ssOverrideFields";
import {
  buildOverrideIndex, getOverride, ROW_YEAR,
  type OverrideRecord, type OverrideIndex,
} from "@/lib/proyeccionOverrideFields";
// Parche de tickers Yahoo rotos en la fuente. Vive en lib/ porque el panel de admin
// necesita mostrar qué filas está reescribiendo (y Next no deja exportarlo desde acá).
import { fixYahooTicker } from "@/lib/yahooTickerFixes";
import { normBBG } from "@/lib/bbg";

export const dynamic = "force-dynamic";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// ── Public types ──────────────────────────────────────────────────────────────
// El frontend aplica conv() con el TC manual. La API devuelve fundamentales en su
// MONEDA REPORTADA (sin convertir), en MILLONES; acciones en millones.
// Las compañías de doble serie (A/B) traen una entrada por serie con su propio
// ticker Yahoo y nº de acciones; el frontend arma filas A / B / consolidada.

export interface SsV1Series {
  label:       string;        // "A" | "B" | "TOTAL"
  bbg:         string | null;
  yahooTicker: string | null;
  shares:      number | null; // millones de acciones de esta serie
  // Recomendación (AnalystRecommendationHistory, match por BBG de la serie)
  rec?:     string | null;
  recDate?: string | null;    // YYYY-MM-DD
  tp?:      number | null;     // target price, moneda del listado (sin conv)
  // Precio: Yahoo, en vivo (solo con ?withPrices=true)
  price?:    number | null;
  currency?: string | null;   // moneda del precio (CLP / USD / GBp…)
  // Retornos: ticker_return_snapshot (Bloomberg, cargado por script). NO se calculan acá
  // ni dependen de ?withPrices — vienen de la base, así que están siempre disponibles y
  // corresponden a `retAsOf`, que casi nunca es el día del precio.
  retMonth?: number | null;
  retYtd?:   number | null;
  retYear?:  number | null;
  ret3y?:    number | null;   // anualizado
  ret5y?:    number | null;   // anualizado
  retAsOf?:  string | null;   // YYYY-MM-DD del snapshot que aplicó a esta serie
}

export interface SsV1Company {
  company:     string;
  tickerBBG:   string | null;
  industria:   string | null;
  gics:        string | null;
  dual:        boolean;       // true → tiene series A/B

  ssCurrency:   "CLP" | "USD";
  projCurrency: "CLP" | "USD" | null;

  series:      SsV1Series[];  // [TOTAL] para compañías de una serie; [A, B] para dobles
  sharesTotal: number | null; // serie TOTAL, millones

  // Fundamentales (moneda reportada, millones) ─ a nivel COMPAÑÍA (sin prorratear)
  ebitdaN:     number | null;
  ebitdaN4:    number | null;
  ebitdaLtm:   number | null;
  utilidadN:   number | null;
  utilidadN4:  number | null;
  utilidadLtm: number | null;
  revenueLtm:  number | null;
  ebitLtm:     number | null;
  debtN:       number | null;
  debtN4:      number | null;
  equityN:     number | null;
  equityN4:    number | null;
  minorityN:   number | null;
  minorityN4:  number | null;

  // Bases de las variaciones de EBITDA que muestra la tabla de índices. Son ESTRICTAS:
  // si falta algún trimestre de la ventana el campo va null, porque comparar 9 meses
  // contra 12 daría un crecimiento inventado. (El ebitdaLtm de arriba sigue siendo laxo:
  // es el monto que se muestra, y ahí sumar lo que haya es preferible a un hueco.)
  ebitdaLtm4:    number | null;  // LTM del período n, con los 4 trimestres presentes
  ebitdaLtmPrev: number | null;  // LTM del período n-4 (misma ventana, un año antes)
  ebitdaFyPrev:  number | null;  // año calendario anterior al de las proyecciones

  // Proyecciones (moneda projCurrency, millones)
  ebitda2026E:   number | null;
  ebitda2027E:   number | null;
  utilidad2026E: number | null;
  utilidad2027E: number | null;
  divLabel:      string | null;
  payout:        number | null;

  // Recomendación a nivel compañía (match por tickerBBG) — para fila consolidada/single
  rec:     string | null;
  recDate: string | null;   // YYYY-MM-DD
  tp:      number | null;    // target price, moneda del listado (sin conv)

  // Campos con override de admin aplicado en este período (para pintarlos en la vista).
  // Incluye los campos de proyección que llegaron editados desde /projections, que se
  // pintan igual pero NO se editan acá.
  overrides?: string[];
  // Valor base (previo al override) de esos campos, para mostrarlo en el panel de edición.
  baseValues?: Record<string, number | null>;
  // Firma de los campos de proyección editados a mano en /projections (sólo lectura acá).
  projEdits?: Record<string, { by: string | null; at: string }>;
}

export interface SsV1Period { fy: number; q: number; label: string; }

// Nivel del índice (Yahoo). Sin retornos: los de la vista salen de ticker_return_snapshot
// y los agregados por índice se calculan ponderando a los miembros.
export interface IndexLevel { price: number | null; currency: string | null }

export interface SsV1Payload {
  withPrices: boolean;
  periodN:    string | null;
  periodN4:   string | null;
  ltmLabels:  string[];
  periods:    SsV1Period[]; // quarters disponibles (desc), para el selector
  selFy:      number;       // período n activo
  selQ:       number;
  companies:  SsV1Company[];
  // Retornos: fecha del snapshot vigente y cuántas series machearon. La vista lo muestra
  // como "al DD/MM/YY" sobre las columnas de retorno, que NO son del día del precio.
  returnsAsOf:     string | null; // YYYY-MM-DD
  returnsSource:   string | null;
  returnsMatched:  number;        // series de la vista con retorno
  returnsRows:     number;        // filas totales del snapshot
  // Nivel real de cada índice (solo con ?withPrices). Sólo los que Yahoo sirve por quote:
  // IPSA (^IPSA) e IGPA (IGPA.SN). Los sub-índices IGPA y los "Mon" no existen en Yahoo.
  indexLevels?: Record<string, IndexLevel>;
}

// Año base de las proyecciones que muestra esta vista. Los nombres de los campos
// (ebitda2026E, utilidad2027E) están fijos, así que si esto cambia hay que renombrarlos
// y actualizar las etiquetas de las columnas en el componente.
const PROJ_Y0 = 2026;
const PROJ_Y1 = PROJ_Y0 + 1;

// ── Homologación / overrides ───────────────────────────────────────────────────
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const cleanBBG = (t: string | null | undefined) => (t ? t.replace(/\s+EQUITY$/i, "").trim() : null);

const NAME_OVERRIDES: Record<string, string> = {
  aguas: "aguas-a", andina: "andina-b", "las condes": "clinica las condes", potasios: "potasios-b",
};

// Compañías de doble serie (A/B): nombre_chile de cada serie en empresas_industrias_v2.
// El ticker Yahoo y BBG por serie se sacan de esa tabla (no se hardcodean).
const SERIES_NAMES: Record<string, { A: string; B: string }> = {
  aguas:     { A: "aguas-a",    B: "aguas-b" },
  andina:    { A: "andina-a",   B: "andina-b" },
  embonor:   { A: "embonor-a",  B: "embonor-b" },
  potasios:  { A: "potasios-a", B: "potasios-b" },
  soquimich: { A: "sqm-a",      B: "sqm-b" },
};

// ── Precio (Yahoo) ──────────────────────────────────────────────────────────────
// SÓLO el último precio. Los retornos ya NO se calculan acá: se cargan a
// ticker_return_snapshot desde Bloomberg (POST /api/ingest, table "TickerReturnSnapshot").
//
// Por qué se sacaron: la serie diaria de Yahoo para .SN inventa barras — volumen 0 y
// OHLC plano copiando el último cierre real — 24 de las últimas 120 en TODOS los papeles
// líquidos, con un bloque de 13 días hábiles seguidos; y omite sesiones (falta 2025-12-31,
// que es la base del YTD). Contra Bloomberg, CAP daba 1 mes −15.7% vs −14.8% y YTD −28.2%
// vs −29.0%, porque la fecha base caía sobre una barra inventada o faltante. El último
// precio puntual sí es correcto y se contrasta contra el cierre, así que se conserva.
const DAY = 86400000;
interface YChartQuote { date: Date; close: number | null }
interface YChart { meta?: { currency?: string; regularMarketPrice?: number }; quotes: YChartQuote[] }
interface PriceData { price: number | null; currency: string | null }

async function fetchPrice(ticker: string): Promise<PriceData | null> {
  try {
    const period2 = new Date();
    // 90 días: suficiente para tener un cierre real incluso en los papeles que pasan
    // semanas sin operar (AFPCAPITAL.SN no transa desde jun-2026).
    const period1 = new Date(period2.getTime() - 90 * DAY);
    const chart = (await yf.chart(ticker, { period1, period2, interval: "1d" })) as YChart;

    let last: number | null = null, lastT = -Infinity;
    for (const q of chart.quotes ?? []) {
      if (q.close == null || !isFinite(q.close) || !q.date) continue;
      const t = new Date(q.date).getTime();
      if (t >= lastT) { lastT = t; last = q.close; }
    }
    if (last == null) return null;

    // meta.regularMarketPrice suele ir un día más adelante que la serie de cierres y es el
    // que calza con la referencia, así que se prefiere. Pero en papeles sin volumen Yahoo
    // devuelve ahí un precio indicativo que no corresponde: AFPCAPITAL.SN informa 310
    // contra un último cierre real de 247,5 (+25%) tras 14 ruedas sin operar. Por eso se
    // acepta sólo si está dentro de ±15% del último cierre; si no, se cae al cierre.
    const meta = chart.meta?.regularMarketPrice;
    const metaOk = meta != null && isFinite(meta) && meta > 0 && last > 0 && Math.abs(meta / last - 1) <= 0.15;
    return { price: metaOk ? meta : last, currency: chart.meta?.currency ?? null };
  } catch {
    return null;
  }
}
// Nivel de índice: sólo los que Yahoo sirve por quote (chart viene vacío para éstos, así
// que no hay retornos históricos, sólo el nivel actual). Sub-índices IGPA y "Mon" no existen.
const INDEX_TICKERS: Record<string, string> = {
  IPSA: "^IPSA",
  IGPA: "IGPA.SN",
};
async function fetchIndexLevels(): Promise<Record<string, IndexLevel>> {
  const out: Record<string, IndexLevel> = {};
  await Promise.all(
    Object.entries(INDEX_TICKERS).map(async ([name, tk]) => {
      const pd = await fetchPrice(tk);
      // Nivel actual por quote: más confiable que el chart para índices.
      let level: number | null = null, ccy: string | null = null;
      try {
        const q = await yf.quote(tk);
        if (q?.regularMarketPrice != null && isFinite(q.regularMarketPrice)) { level = q.regularMarketPrice; ccy = q.currency ?? null; }
      } catch { /* sin quote */ }
      if (pd == null && level == null) return;
      out[name] = { price: level ?? pd?.price ?? null, currency: ccy ?? pd?.currency ?? null };
    }),
  );
  return out;
}
async function fetchPricesChunked(tickers: string[]): Promise<Map<string, PriceData>> {
  const out = new Map<string, PriceData>();
  const CHUNK = 8;
  for (let i = 0; i < tickers.length; i += CHUNK) {
    const batch = tickers.slice(i, i + CHUNK);
    const res = await Promise.all(batch.map((t) => fetchPrice(t)));
    res.forEach((p, j) => { if (p) out.set(batch[j], p); });
  }
  return out;
}

// ── Route ─────────────────────────────────────────────────────────────────────
interface EmpRow { tickerBloomberg: string | null; isin: string | null; industriaChile: string | null; industriaGics: string | null; nombreLatam: string; yahooFinanceTicker: string | null; }
interface ResolvedName { tickerBBG: string | null; yahoo: string | null; industria: string | null; gics: string | null; }

export async function GET(request: NextRequest) {
  const withPrices = request.nextUrl.searchParams.get("withPrices") === "true";
  const fyParam = request.nextUrl.searchParams.get("fy");
  const qParam = request.nextUrl.searchParams.get("q");

  try {
    const [ssRows, projRows, empresas, isins, recRows] = await Promise.all([
      // Sin filtro de serie: necesitamos shares A/B además de TOTAL.
      prisma.stockSelectionV1.findMany({
        select: { company: true, currency: true, metric: true, series: true, fiscalYear: true, quarter: true, value: true },
      }),
      prisma.proyecciones_financieras.findMany(),
      prisma.empresasIndustriasV2.findMany({
        select: { nombreLatam: true, nombreChile: true, isin: true, tickerBloomberg: true, industriaChile: true, industriaGics: true, yahooFinanceTicker: true },
      }),
      // company_isins: company_name → isin (llave de las recos) + fallback de Yahoo.
      prisma.companyIsin.findMany({ select: { companyName: true, isin: true, yahooFinanceTicker: true } }),
      // Recomendaciones del analista (Rec./Date/TP). Orden asc → al reducir queda la última.
      prisma.analystRecommendationHistory.findMany({
        orderBy: [{ date: "asc" }, { id: "asc" }],
        select: { company: true, date: true, recommendation: true, targetPrice: true },
      }),
    ]);

    const yahooByIsin = new Map<string, string>();
    for (const c of isins) if (c.isin && c.yahooFinanceTicker?.trim()) yahooByIsin.set(c.isin.trim(), c.yahooFinanceTicker.trim());

    // name(normalizado) → filas candidatas de empresas_industrias_v2
    const byName = new Map<string, EmpRow[]>();
    const addName = (key: string | null, row: EmpRow) => {
      const k = norm(key); if (!k) return;
      if (!byName.has(k)) byName.set(k, []);
      const arr = byName.get(k)!; if (!arr.includes(row)) arr.push(row);
    };
    for (const e of empresas) {
      if (!norm(e.nombreLatam)) continue;
      const row: EmpRow = { tickerBloomberg: e.tickerBloomberg, isin: e.isin, industriaChile: e.industriaChile, industriaGics: e.industriaGics, nombreLatam: e.nombreLatam, yahooFinanceTicker: e.yahooFinanceTicker };
      addName(e.nombreLatam, row); addName(e.nombreChile, row);
    }
    // Ticker Yahoo: 1) empresas_industrias_v2.yahoo_finance_ticker (fuente curada),
    // 2) fallback company_isins por ISIN. Luego aplica overrides de tickers rotos.
    const yahooOf = (row: EmpRow): string | null =>
      fixYahooTicker(row.yahooFinanceTicker) ?? fixYahooTicker(row.isin ? yahooByIsin.get(row.isin.trim()) : null);
    const empByName = (key: string): EmpRow | null => byName.get(norm(key))?.[0] ?? null;
    const resolveName = (company: string): ResolvedName | null => {
      const key = norm(company);
      let rows = byName.get(key);
      if ((!rows || !rows.length) && NAME_OVERRIDES[key]) rows = byName.get(NAME_OVERRIDES[key]);
      if (!rows || !rows.length) return null;
      const scored = rows.map((r) => { const y = yahooOf(r); return { r, y, score: y ? (/\.SN$/i.test(y) ? 2 : 1) : 0 }; });
      scored.sort((a, b) => b.score - a.score);
      const best = scored[0];
      return { tickerBBG: cleanBBG(best.r.tickerBloomberg), yahoo: best.y, industria: best.r.industriaChile || null, gics: best.r.industriaGics || null };
    };

    // ── Recomendaciones: ARH.company → company_isins.company_name → isin → bbg ──
    const isinByCompanyName = new Map<string, string>();
    for (const ci of isins) {
      const nm = norm(ci.companyName), isin = ci.isin?.trim();
      if (nm && isin) isinByCompanyName.set(nm, isin);
    }
    const bbgByIsin = new Map<string, string>();
    for (const e of empresas) {
      const isin = e.isin?.trim(), bbg = cleanBBG(e.tickerBloomberg);
      if (isin && bbg && !bbgByIsin.has(isin)) bbgByIsin.set(isin, bbg);
    }
    interface RecInfo { rec: string; recDate: string; tp: number | null; }
    const recByBbg = new Map<string, RecInfo>();
    for (const r of recRows) { // recRows viene asc por date,id → el último .set gana = más reciente
      const isin = isinByCompanyName.get(norm(r.company));
      if (!isin) continue;
      const bbg = bbgByIsin.get(isin);
      if (!bbg) continue;
      recByBbg.set(bbg.toUpperCase(), {
        rec: r.recommendation,
        recDate: r.date.toISOString().slice(0, 10),
        tp: r.targetPrice > 0 ? r.targetPrice : null,
      });
    }
    const recOf = (bbg: string | null | undefined): RecInfo | null => (bbg ? recByBbg.get(bbg.toUpperCase()) ?? null : null);

    // ── Retornos (ticker_return_snapshot, cargado por POST /api/ingest) ──────────
    // Resiliente igual que los overrides: si falta la tabla (`prisma db push` pendiente)
    // la vista sale con los retornos vacíos en vez de romperse.
    interface RetRow { tickerBBG: string; asOf: Date; source: string | null; retMonth: number | null; retYtd: number | null; retYear: number | null; ret3y: number | null; ret5y: number | null }
    let retRows: RetRow[] = [];
    try {
      retRows = await prisma.tickerReturnSnapshot.findMany({
        select: { tickerBBG: true, asOf: true, source: true, retMonth: true, retYtd: true, retYear: true, ret3y: true, ret5y: true },
      });
    } catch (e) {
      console.warn("[stock-selection-v1] retornos no disponibles (¿falta db push o el ingest?):", String(e).slice(0, 120));
    }
    const retByBbg = new Map<string, RetRow>();
    for (const r of retRows) { const k = normBBG(r.tickerBBG); if (k) retByBbg.set(k, r); }
    let returnsMatched = 0;
    // Aplica el snapshot a una serie. Se machea por el BBG de la CLASE (Andina-A y
    // Andina-B tienen retornos distintos), no por el de la compañía.
    const applyReturns = (s: SsV1Series): void => {
      const rr = retByBbg.get(normBBG(s.bbg) ?? "");
      if (!rr) { s.retMonth = s.retYtd = s.retYear = s.ret3y = s.ret5y = null; s.retAsOf = null; return; }
      s.retMonth = rr.retMonth; s.retYtd = rr.retYtd; s.retYear = rr.retYear;
      s.ret3y = rr.ret3y; s.ret5y = rr.ret5y;
      s.retAsOf = rr.asOf.toISOString().slice(0, 10);
      returnsMatched++;
    };
    // Fecha del snapshot: la más reciente de la tabla. El script carga un solo lote, así
    // que en la práctica es una sola fecha para todos.
    const returnsAsOf = retRows.length
      ? retRows.reduce((mx, r) => (r.asOf > mx ? r.asOf : mx), retRows[0].asOf).toISOString().slice(0, 10)
      : null;
    const returnsSource = retRows.find((r) => r.source)?.source ?? null;

    // ── Periodo n (seleccionable vía ?fy=&q=) ─────────────────────────────────
    const qKey = (fy: number, q: number) => fy * 10 + q;
    const labelOf = (fy: number, q: number) => `${q}Q ${fy}`;

    // Quarters presentes en los datos (desc) → para el selector del front.
    const periodMap = new Map<number, { fy: number; q: number }>();
    for (const r of ssRows) { const k = qKey(r.fiscalYear, r.quarter); if (!periodMap.has(k)) periodMap.set(k, { fy: r.fiscalYear, q: r.quarter }); }
    const periods = [...periodMap.values()]
      .sort((a, b) => qKey(b.fy, b.q) - qKey(a.fy, a.q))
      .map((p) => ({ fy: p.fy, q: p.q, label: labelOf(p.fy, p.q) }));

    // n = el quarter pedido (si existe en los datos), si no el más reciente.
    let selFy = periods[0]?.fy ?? 0, selQ = periods[0]?.q ?? 0;
    if (fyParam && qParam) {
      const fy = parseInt(fyParam, 10), q = parseInt(qParam, 10);
      if (Number.isFinite(fy) && Number.isFinite(q) && periodMap.has(qKey(fy, q))) { selFy = fy; selQ = q; }
    }
    const nKey = qKey(selFy, selQ), n4Key = qKey(selFy - 1, selQ);
    const ltmKeys: number[] = []; { let f = selFy, q = selQ; for (let i = 0; i < 4; i++) { ltmKeys.push(qKey(f, q)); q--; if (q === 0) { q = 4; f--; } } }
    // Ventana LTM de un año antes (n-4) y año calendario previo al de las proyecciones:
    // son las bases contra las que la tabla de índices calcula el crecimiento de EBITDA.
    const ltmPrevKeys: number[] = []; { let f = selFy - 1, q = selQ; for (let i = 0; i < 4; i++) { ltmPrevKeys.push(qKey(f, q)); q--; if (q === 0) { q = 4; f--; } } }
    const fyPrevKeys = [1, 2, 3, 4].map((q) => qKey(PROJ_Y0 - 1, q));

    // ── Overrides de admin para el período activo (norm(company) → field → value) ──
    // Resiliente: si la tabla aún no existe (falta `prisma db push`), se ignora y la vista
    // funciona igual sin overrides.
    let overrideRows: { company: string; field: string; value: number | null }[] = [];
    try {
      overrideRows = await prisma.stockSelectionOverride.findMany({
        where: { fiscalYear: selFy, quarter: selQ },
        select: { company: true, field: true, value: true },
      });
    } catch (e) {
      console.warn("[stock-selection-v1] overrides no disponibles (¿falta db push?):", String(e).slice(0, 120));
    }
    // El filtro por OVERRIDE_FIELD_KEYS también es el que neutraliza cualquier override
    // viejo sobre un campo de proyección: esos campos salieron de la lista editable, así
    // que las filas que hayan quedado en la base se ignoran acá sin migrar nada.
    const overridesByCompany = new Map<string, Map<string, number>>();
    for (const o of overrideRows) {
      if (o.value == null || !OVERRIDE_FIELD_KEYS.has(o.field)) continue;
      const k = norm(o.company);
      let m = overridesByCompany.get(k); if (!m) { m = new Map(); overridesByCompany.set(k, m); }
      m.set(o.field, o.value);
    }

    // ── Proyecciones: esta vista sólo CONSUME ─────────────────────────────────
    // EBITDA/Utilidad 26E-27E, la moneda proyectada y el payout salen de Proyecciones y
    // son de sólo lectura acá. La única forma de editarlos a mano es /projections, que
    // resuelve el valor ganador con su propia regla (gana la foto más fresca entre el
    // último Excel y la última edición manual). Acá se lee ese ganador y se muestra.
    let proyOverrideRows: OverrideRecord[] = [];
    try {
      proyOverrideRows = await prisma.proyeccionOverride.findMany();
    } catch (e) {
      console.warn("[stock-selection-v1] ediciones de proyecciones no disponibles (¿falta db push?):", String(e).slice(0, 120));
    }
    // Campos numéricos que se asignan directo al objeto compañía (los demás son shares).
    // Sin los 26E/27E: esos ya no se editan desde acá.
    const DIRECT_FIELDS = new Set(["debtN", "debtN4", "equityN", "equityN4", "minorityN", "minorityN4", "ebitdaN", "ebitdaN4", "ebitdaLtm", "utilidadN", "utilidadN4", "utilidadLtm", "revenueLtm", "ebitLtm"]);

    // Campos cuyo valor llegó de una edición manual hecha en /projections, con su firma.
    // No son overrides de esta vista (nadie los editó acá): se listan aparte para poder
    // pintarlos y decir de dónde salieron, pero el panel los muestra en sólo lectura.
    const projEditedFields = new Map<string, string[]>();
    const projEditInfo = new Map<string, Record<string, { by: string | null; at: string }>>();

    const applyOverrides = (co: SsV1Company): void => {
      const key = norm(co.company);
      const ov = overridesByCompany.get(key);
      const fromProj = projEditedFields.get(key) ?? [];
      const applied: string[] = [...fromProj];
      const baseValues: Record<string, number | null> = {};

      for (const [field, value] of ov ?? []) {
        if (field === "sharesTotal") {
          if (!co.dual) { baseValues[field] = co.sharesTotal; co.sharesTotal = value; if (co.series[0]) co.series[0].shares = value; applied.push(field); }
        } else if (field === "sharesA") {
          if (co.dual && co.series[0]) { baseValues[field] = co.series[0].shares; co.series[0].shares = value; applied.push(field); }
        } else if (field === "sharesB") {
          if (co.dual && co.series[1]) { baseValues[field] = co.series[1].shares; co.series[1].shares = value; applied.push(field); }
        } else if (DIRECT_FIELDS.has(field)) {
          const rec = co as unknown as Record<string, number | null>;
          baseValues[field] = rec[field] ?? null; rec[field] = value; applied.push(field);
        }
      }
      // Doble serie: sharesTotal coherente con A+B tras editar acciones (prorrateo).
      if (co.dual && (ov?.has("sharesA") || ov?.has("sharesB"))) {
        const a = co.series[0]?.shares, b = co.series[1]?.shares;
        if (a != null && b != null) co.sharesTotal = a + b;
      }
      if (applied.length) { co.overrides = applied; co.baseValues = baseValues; }
      const info = projEditInfo.get(key);
      if (info) co.projEdits = info;
    };
    const ltmLabels = (() => { const o: string[] = []; let f = selFy, q = selQ; for (let i = 0; i < 4; i++) { o.push(labelOf(f, q)); q--; if (q === 0) { q = 4; f--; } } return o.reverse(); })();

    // ── Fundamentales (serie TOTAL) + shares por serie ────────────────────────
    interface Fund { currency: "CLP" | "USD"; metrics: Map<string, Map<number, number>>; sharesSeries: Map<string, Map<number, number>>; }
    const funds = new Map<string, Fund>();
    for (const r of ssRows) {
      const k = norm(r.company);
      let f = funds.get(k);
      if (!f) { f = { currency: r.currency === "USD" ? "USD" : "CLP", metrics: new Map(), sharesSeries: new Map() }; funds.set(k, f); }
      if (r.value == null) continue;
      const key = qKey(r.fiscalYear, r.quarter);
      if (r.metric === "shares" && (r.series === "A" || r.series === "B")) {
        let mm = f.sharesSeries.get(r.series); if (!mm) { mm = new Map(); f.sharesSeries.set(r.series, mm); }
        mm.set(key, r.value);
      } else if (r.series === "TOTAL") {
        let mm = f.metrics.get(r.metric); if (!mm) { mm = new Map(); f.metrics.set(r.metric, mm); }
        mm.set(key, r.value);
      }
    }
    const at = (f: Fund, metric: string, key: number): number | null => f.metrics.get(metric)?.get(key) ?? null;
    const ltmSum = (f: Fund, metric: string): number | null => {
      const mm = f.metrics.get(metric); if (!mm) return null;
      let s = 0, c = 0; for (const key of ltmKeys) { const v = mm.get(key); if (v != null) { s += v; c++; } }
      return c ? s : null;
    };
    // Suma sólo si TODOS los trimestres de la ventana existen; si falta uno, null.
    const sumStrict = (f: Fund, metric: string, keys: number[]): number | null => {
      const mm = f.metrics.get(metric); if (!mm) return null;
      let s = 0;
      for (const key of keys) { const v = mm.get(key); if (v == null) return null; s += v; }
      return s;
    };
    const latestOf = (mm: Map<number, number> | undefined): number | null => {
      if (!mm) return null;
      const atN = mm.get(nKey); if (atN != null) return atN;
      let bk = -1, bv: number | null = null; for (const [key, v] of mm) if (key > bk) { bk = key; bv = v; }
      return bv;
    };

    // ── Proyecciones (latest generated_at) ────────────────────────────────────
    interface ProjPick { moneda: "CLP" | "USD" | null; base_year: number; div: string | null; pool_div: number | null; ebitda: (number | null)[]; utilidad: (number | null)[]; }
    const projByName = new Map<string, ProjPick>(); const projAt = new Map<string, number>();
    for (const p of projRows) {
      const k = norm(p.empresa); const ts = new Date(p.generated_at).getTime();
      if (!projAt.has(k) || ts > projAt.get(k)!) {
        projAt.set(k, ts);
        projByName.set(k, {
          moneda: p.moneda === "USD" ? "USD" : p.moneda === "CLP" ? "CLP" : null, base_year: p.base_year, div: p.div ?? null,
          pool_div: p.pool_div ?? null,
          ebitda: [p.ebitda_y0 ?? null, p.ebitda_y1 ?? null, p.ebitda_y2 ?? null],
          utilidad: [p.utilidad_y0 ?? null, p.utilidad_y1 ?? null, p.utilidad_y2 ?? null],
        });
      }
    }
    const projYear = (pick: ProjPick | undefined, arr: "ebitda" | "utilidad", cal: number): number | null => {
      if (!pick) return null; const off = cal - pick.base_year; if (off < 0 || off > 2) return null; return pick[arr][off] ?? null;
    };

    // Ediciones manuales de /projections. Cada una compite contra el snapshot vigente DE SU
    // empresa (projAt): si el Excel se corrió después, la edición ya no aplica.
    const proyIndex: OverrideIndex = buildOverrideIndex(
      proyOverrideRows,
      (key) => { const ts = projAt.get(key); return ts == null ? null : new Date(ts); },
    );

    // Valor ganador de una celda de proyección: la edición manual si le gana al snapshot,
    // si no el del Excel. La decisión ya la tomó buildOverrideIndex; acá sólo se lee.
    const projYearEff = (
      key: string, pick: ProjPick | undefined, arr: "ebitda" | "utilidad", cal: number, field: string,
    ): number | null => {
      const o = getOverride(proyIndex, key, arr, cal);
      if (!o) return projYear(pick, arr, cal);

      const list = projEditedFields.get(key) ?? [];
      list.push(field);
      projEditedFields.set(key, list);

      const info = projEditInfo.get(key) ?? {};
      info[field] = { by: o.editedBy, at: o.editedAt.toISOString() };
      projEditInfo.set(key, info);
      return o.value;
    };

    const monedaEff = (key: string, pick: ProjPick | undefined): "CLP" | "USD" | null => {
      const t = getOverride(proyIndex, key, "moneda", ROW_YEAR)?.textValue?.toUpperCase();
      if (t === "USD" || t === "CLP") return t;
      return pick?.moneda ?? null;
    };
    const payoutEff = (key: string, pick: ProjPick | undefined): number | null =>
      getOverride(proyIndex, key, "pool_div", ROW_YEAR)?.value ?? pick?.pool_div ?? null;

    // ── Construir universo ────────────────────────────────────────────────────
    const companies: SsV1Company[] = [];
    const seen = new Set<string>();
    for (const r of ssRows) {
      const k = norm(r.company);
      if (seen.has(k)) continue;
      seen.add(k);
      const resolved = resolveName(r.company);
      if (!resolved) continue;

      const f = funds.get(k)!;
      const pick = projByName.get(k);
      const sharesTotal = latestOf(f.metrics.get("shares"));

      // ¿Doble serie? Requiere mapeo de nombres de serie + shares A/B.
      // Ticker Yahoo y BBG por serie salen de empresas_industrias_v2 (fila de cada clase).
      const sn = SERIES_NAMES[k];
      const sharesA = latestOf(f.sharesSeries.get("A"));
      const sharesB = latestOf(f.sharesSeries.get("B"));
      const dual = !!sn && sharesA != null && sharesB != null;

      let series: SsV1Series[];
      if (dual) {
        const rowA = empByName(sn.A), rowB = empByName(sn.B);
        series = [
          { label: "A", bbg: cleanBBG(rowA?.tickerBloomberg), yahooTicker: rowA ? yahooOf(rowA) : null, shares: sharesA },
          { label: "B", bbg: cleanBBG(rowB?.tickerBloomberg), yahooTicker: rowB ? yahooOf(rowB) : null, shares: sharesB },
        ];
      } else {
        series = [{ label: "TOTAL", bbg: resolved.tickerBBG, yahooTicker: resolved.yahoo, shares: sharesTotal }];
      }
      // Rec/Date/TP por BBG: cada serie por su clase; nivel compañía por tickerBBG.
      for (const s of series) { const ri = recOf(s.bbg); s.rec = ri?.rec ?? null; s.recDate = ri?.recDate ?? null; s.tp = ri?.tp ?? null; }
      // Retornos por BBG de la clase. Independientes de ?withPrices: vienen de la base.
      for (const s of series) applyReturns(s);
      const coRec = recOf(resolved.tickerBBG);

      const co: SsV1Company = {
        company: r.company, tickerBBG: resolved.tickerBBG, industria: resolved.industria, gics: resolved.gics, dual,
        ssCurrency: f.currency, projCurrency: monedaEff(k, pick),
        series, sharesTotal,
        rec: coRec?.rec ?? null, recDate: coRec?.recDate ?? null, tp: coRec?.tp ?? null,
        ebitdaN: at(f, "ebitda", nKey), ebitdaN4: at(f, "ebitda", n4Key), ebitdaLtm: ltmSum(f, "ebitda"),
        utilidadN: at(f, "utilidad", nKey), utilidadN4: at(f, "utilidad", n4Key), utilidadLtm: ltmSum(f, "utilidad"),
        revenueLtm: ltmSum(f, "revenue"), ebitLtm: ltmSum(f, "ebit"),
        debtN: at(f, "debt", nKey), debtN4: at(f, "debt", n4Key),
        equityN: at(f, "equity", nKey), equityN4: at(f, "equity", n4Key),
        minorityN: at(f, "minority_interest", nKey), minorityN4: at(f, "minority_interest", n4Key),
        ebitdaLtm4:    sumStrict(f, "ebitda", ltmKeys),
        ebitdaLtmPrev: sumStrict(f, "ebitda", ltmPrevKeys),
        ebitdaFyPrev:  sumStrict(f, "ebitda", fyPrevKeys),
        ebitda2026E:   projYearEff(k, pick, "ebitda",   PROJ_Y0, "ebitda2026E"),
        ebitda2027E:   projYearEff(k, pick, "ebitda",   PROJ_Y1, "ebitda2027E"),
        utilidad2026E: projYearEff(k, pick, "utilidad", PROJ_Y0, "utilidad2026E"),
        utilidad2027E: projYearEff(k, pick, "utilidad", PROJ_Y1, "utilidad2027E"),
        divLabel: pick?.div ?? null, payout: payoutEff(k, pick),
      };
      applyOverrides(co); // capa de overrides de admin (in place)
      companies.push(co);
    }
    companies.sort((a, b) => a.company.localeCompare(b.company));

    // ── Precios (Yahoo, on-demand) ────────────────────────────────────────────
    let indexLevels: Record<string, IndexLevel> | undefined;
    if (withPrices) {
      const tickers = [...new Set(companies.flatMap((c) => c.series.map((s) => s.yahooTicker)).filter((t): t is string => !!t))];
      const [priceMap, levels] = await Promise.all([fetchPricesChunked(tickers), fetchIndexLevels()]);
      indexLevels = levels;
      // Sólo precio y moneda: los retornos ya quedaron puestos desde el snapshot.
      for (const c of companies)
        for (const s of c.series) {
          const pd = s.yahooTicker ? priceMap.get(s.yahooTicker) ?? null : null;
          s.price = pd?.price ?? null; s.currency = pd?.currency ?? null;
        }
    }

    const payload: SsV1Payload = {
      withPrices,
      periodN: selFy ? labelOf(selFy, selQ) : null,
      periodN4: selFy ? labelOf(selFy - 1, selQ) : null,
      ltmLabels, periods, selFy, selQ, companies, indexLevels,
      returnsAsOf, returnsSource, returnsMatched, returnsRows: retRows.length,
    };
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[stock-selection-v1]", e);
    return NextResponse.json({ error: "Internal server error", details: String(e) }, { status: 500 });
  }
}
