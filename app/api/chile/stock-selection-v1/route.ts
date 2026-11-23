import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import YahooFinance from "yahoo-finance2";
import { OVERRIDE_FIELD_KEYS } from "@/lib/ssOverrideFields";
// Parche de tickers Yahoo rotos en la fuente. Vive en lib/ porque el panel de admin
// necesita mostrar qué filas está reescribiendo (y Next no deja exportarlo desde acá).
import { fixYahooTicker } from "@/lib/yahooTickerFixes";
import { normBBG } from "@/lib/bbg";
import { norm, cleanBBG, NAME_OVERRIDES, SERIES_NAMES } from "@/lib/ssHomologacion";
import { TRACK_RECORD } from "@/lib/securityAliases";
import {
  qKey, hasPeriod, loadFichaFunds, loadModelPicks, modelScale, recLabel,
  type Fund, type ModelPick,
} from "@/lib/ssFichaModel";

export const dynamic = "force-dynamic";

// `validation.logErrors: false` — Yahoo devuelve `meta.currency: null` en listados nuevos
// (PAMPA.SN, recién renombrada), y el esquema de la librería exige string: tira y escupe
// media pantalla de log en CADA pedido de precio. El error se sigue lanzando y lo atrapa
// fetchPrice, que cae a quote(); lo único que se apaga es el ruido en la consola.
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"], validation: { logErrors: false } });

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
  // Recomendación: modelo del analista (model_headers/bank_headers) si la serie es la del
  // modelo; si la compañía no tiene modelo, AnalystRecommendationHistory (match por BBG).
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
  /**
   * true = compañía SEMBRADA a mano: existe sólo por su homologación + los valores
   * cargados en stock_selection_override, sin ninguna fila todavía en stock_selection_v1.
   * Es como se prepara una empresa nueva antes de su primera carga. Se apaga sola cuando
   * el cargador empieza a traerla (o borrando sus overrides).
   */
  seeded?:     boolean;

  /**
   * De dónde salieron los fundamentales del período n:
   *   "ficha"  = ficha_statements (fuente nueva)
   *   "legacy" = stock_selection_v1 (la compañía todavía no tiene ficha para ese trimestre)
   *   "none"   = ninguna de las dos tiene ese trimestre → fundamentales vacíos
   * La vista pinta distinto todo lo que no sea "ficha".
   */
  fundSource:  "ficha" | "legacy" | "none";
  fichaTicker: string | null;  // ticker de la ficha usada (normalizado), si hay
  /**
   * Proyecciones/payout/Rec/TP: "model" = último modelo en model_* / bank_*. "none" = sin
   * modelo: proyecciones y payout vacíos, Rec/TP de AnalystRecommendationHistory.
   */
  projSource:  "model" | "none";
  modelTicker: string | null;
  modelDate:   string | null;  // YYYY-MM-DD del modelo usado
  modelScale:  number | null;  // factor modelo → millones que se aplicó (1 / 1000)

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

  // Proyecciones del modelo (moneda projCurrency, millones)
  ebitda2026E:   number | null;
  ebitda2027E:   number | null;
  utilidad2026E: number | null;
  utilidad2027E: number | null;
  payout:        number | null;

  // Recomendación a nivel compañía (modelo, o ARH por tickerBBG) — fila consolidada/single
  rec:     string | null;
  recDate: string | null;   // YYYY-MM-DD
  tp:      number | null;    // target price, moneda del listado (sin conv)

  // Campos con override de admin aplicado en este período (para pintarlos en la vista).
  overrides?: string[];
  // Valor base (previo al override) de esos campos, para mostrarlo en el panel de edición.
  baseValues?: Record<string, number | null>;
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
  // Cobertura de las fuentes nuevas en el período n (sobre las compañías mostradas).
  fichaCount:      number;
  modelCount:      number;
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
// norm / cleanBBG / NAME_OVERRIDES / SERIES_NAMES viven en lib/ssHomologacion.ts porque
// el panel de admin resuelve los nombres con las mismas reglas: si se duplicaran, el
// panel podría reportar "se ve" una compañía que la vista está descartando.

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

async function priceFromChart(ticker: string): Promise<PriceData | null> {
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

/**
 * Precio de una acción: chart primero, quote de respaldo.
 *
 * El respaldo NO es defensivo de más — es la única vía para los listados recién renombrados.
 * Con PAMPA.SN (ex Oro Blanco) Yahoo manda `meta.currency: null`, el esquema de la librería
 * lo rechaza y `chart()` LANZA; antes eso se tragaba en el catch y la fila quedaba sin
 * precio pese a que el símbolo existe y cotiza. `quote()` sobre el mismo símbolo devuelve
 * 10,6 sin chistar. Al revés también pasa: ORO-BLANCO.SN todavía da chart pero ya no da
 * quote. Los dos símbolos son el mismo papel en distintas etapas de la migración, así que
 * hace falta probar las dos vías.
 */
async function fetchPrice(ticker: string): Promise<PriceData | null> {
  const porChart = await priceFromChart(ticker);
  if (porChart?.price != null) return porChart;
  try {
    const q = await yf.quote(ticker);
    const p = q?.regularMarketPrice;
    if (p != null && isFinite(p) && p > 0) return { price: p, currency: q?.currency ?? null };
  } catch { /* sin quote tampoco: la fila queda sin precio */ }
  return null;
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
interface EmpRow { tickerBloomberg: string | null; isin: string | null; industriaChile: string | null; industriaGics: string | null; nombreLatam: string; yahooFinanceTicker: string | null; moneda: string | null; }
interface ResolvedName { tickerBBG: string | null; yahoo: string | null; industria: string | null; gics: string | null; moneda: string | null; }

export async function GET(request: NextRequest) {
  const withPrices = request.nextUrl.searchParams.get("withPrices") === "true";
  const fyParam = request.nextUrl.searchParams.get("fy");
  const qParam = request.nextUrl.searchParams.get("q");

  try {
    const [fichaFunds, modelPicks, ssRows, empresas, aliases, recRows] = await Promise.all([
      // Fundamentales de la ficha y proyecciones/Rec/TP del modelo. Del modelo basta el año
      // reportado (para medir la escala) y los dos proyectados.
      loadFichaFunds(),
      loadModelPicks([PROJ_Y0 - 1, PROJ_Y0, PROJ_Y1]),
      // stock_selection_v1: respaldo de fundamentales mientras falten fichas. Sin filtro de
      // serie: necesitamos shares A/B además de TOTAL.
      prisma.stockSelectionV1.findMany({
        select: { company: true, currency: true, metric: true, series: true, fiscalYear: true, quarter: true, value: true },
      }),
      prisma.empresasIndustriasV2.findMany({
        select: { nombreLatam: true, nombreChile: true, isin: true, tickerBloomberg: true, industriaChile: true, industriaGics: true, yahooFinanceTicker: true, moneda: true },
      }),
      // security_aliases (track_record): nombre del track record → ticker BBG (llave de las recos).
      prisma.securityAlias.findMany({
        where: { aliasSource: TRACK_RECORD, bbgTicker: { not: null } },
        select: { alias: true, bbgTicker: true },
      }),
      // Recomendaciones del analista (Rec./Date/TP). Orden asc → al reducir queda la última.
      prisma.analystRecommendationHistory.findMany({
        orderBy: [{ date: "asc" }, { id: "asc" }],
        select: { company: true, date: true, recommendation: true, targetPrice: true },
      }),
    ]);

    // name(normalizado) → filas candidatas de empresas_industrias_v2
    const byName = new Map<string, EmpRow[]>();
    const addName = (key: string | null, row: EmpRow) => {
      const k = norm(key); if (!k) return;
      if (!byName.has(k)) byName.set(k, []);
      const arr = byName.get(k)!; if (!arr.includes(row)) arr.push(row);
    };
    for (const e of empresas) {
      if (!norm(e.nombreLatam)) continue;
      const row: EmpRow = { tickerBloomberg: e.tickerBloomberg, isin: e.isin, industriaChile: e.industriaChile, industriaGics: e.industriaGics, nombreLatam: e.nombreLatam, yahooFinanceTicker: e.yahooFinanceTicker, moneda: e.moneda };
      addName(e.nombreLatam, row); addName(e.nombreChile, row);
    }
    // Ticker Yahoo: empresas_industrias_v2.yahoo_finance_ticker con los overrides de tickers
    // rotos. (El fallback por ISIN contra company_isins se quitó en B3: al migrar se verificó
    // que no aportaba ningún ticker que la maestra no tuviera.)
    const yahooOf = (row: EmpRow): string | null => fixYahooTicker(row.yahooFinanceTicker);
    const empByName = (key: string): EmpRow | null => byName.get(norm(key))?.[0] ?? null;
    const resolveName = (company: string): ResolvedName | null => {
      const key = norm(company);
      let rows = byName.get(key);
      if ((!rows || !rows.length) && NAME_OVERRIDES[key]) rows = byName.get(NAME_OVERRIDES[key]);
      if (!rows || !rows.length) return null;
      const scored = rows.map((r) => { const y = yahooOf(r); return { r, y, score: y ? (/\.SN$/i.test(y) ? 2 : 1) : 0 }; });
      scored.sort((a, b) => b.score - a.score);
      const best = scored[0];
      return { tickerBBG: cleanBBG(best.r.tickerBloomberg), yahoo: best.y, industria: best.r.industriaChile || null, gics: best.r.industriaGics || null, moneda: best.r.moneda || null };
    };

    // ── Recomendaciones: ARH.company → security_aliases (track_record) → bbg ──
    const bbgByAlias = new Map<string, string>();
    for (const a of aliases) {
      const nm = norm(a.alias), bbg = cleanBBG(a.bbgTicker);
      if (nm && bbg) bbgByAlias.set(nm, bbg);
    }
    interface RecInfo { rec: string; recDate: string; tp: number | null; }
    const recByBbg = new Map<string, RecInfo>();
    for (const r of recRows) { // recRows viene asc por date,id → el último .set gana = más reciente
      const bbg = bbgByAlias.get(norm(r.company));
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
    // Compañias ocultadas a mano: se leen aparte y de forma resiliente, igual que los
    // overrides. Si falta la tabla, no se oculta nada y la vista funciona como antes.
    let hiddenCompanies = new Set<string>();
    try {
      const hid = await prisma.stockSelectionHidden.findMany({ select: { company: true } });
      hiddenCompanies = new Set(hid.map((h) => h.company));
    } catch (e) {
      console.warn("[stock-selection-v1] visibilidad no disponible (falta db push?):", String(e).slice(0, 120));
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
    const labelOf = (fy: number, q: number) => `${q}Q ${fy}`;

    // Quarters presentes en los datos (desc) → para el selector del front. Fichas + tabla vieja:
    // el más reciente suele estar sólo en fichas (3Q26 hoy), los viejos sólo en la tabla vieja.
    const periodMap = new Map<number, { fy: number; q: number }>();
    for (const r of ssRows) { const k = qKey(r.fiscalYear, r.quarter); if (!periodMap.has(k)) periodMap.set(k, { fy: r.fiscalYear, q: r.quarter }); }
    for (const f of fichaFunds.values()) {
      for (const mm of f.metrics.values()) for (const k of mm.keys()) {
        if (!periodMap.has(k)) periodMap.set(k, { fy: Math.floor(k / 10), q: k % 10 });
      }
    }
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
    // Nombre tal como lo escribió el admin. Es lo que rotula a una compañía SEMBRADA a mano
    // (ver más abajo): como no tiene filas en stock_selection_v1, no hay otro lugar de donde
    // sacar el nombre para mostrar.
    const overrideLabels = new Map<string, string>();
    for (const o of overrideRows) {
      if (o.value == null || !OVERRIDE_FIELD_KEYS.has(o.field)) continue;
      const k = norm(o.company);
      let m = overridesByCompany.get(k); if (!m) { m = new Map(); overridesByCompany.set(k, m); }
      m.set(o.field, o.value);
      if (!overrideLabels.has(k)) overrideLabels.set(k, o.company);
    }

    // Campos numéricos que se asignan directo al objeto compañía (los demás son shares).
    // Las proyecciones 26E/27E no se editan: salen tal cual del modelo del analista.
    const DIRECT_FIELDS = new Set(["debtN", "debtN4", "equityN", "equityN4", "minorityN", "minorityN4", "ebitdaN", "ebitdaN4", "ebitdaLtm", "utilidadN", "utilidadN4", "utilidadLtm", "revenueLtm", "ebitLtm"]);

    const applyOverrides = (co: SsV1Company): void => {
      const key = norm(co.company);
      const ov = overridesByCompany.get(key);
      const applied: string[] = [];
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
    };
    const ltmLabels = (() => { const o: string[] = []; let f = selFy, q = selQ; for (let i = 0; i < 4; i++) { o.push(labelOf(f, q)); q--; if (q === 0) { q = 4; f--; } } return o.reverse(); })();

    // ── Fundamentales (serie TOTAL) + shares por serie ────────────────────────
    // `funds` = stock_selection_v1 por nombre (respaldo). La fuente principal es fichaFunds
    // (por ticker); la elección se hace por compañía al armar el universo.
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
    // Año calendario reportado: la ficha trae el período anual ("A") tal cual; la tabla vieja
    // sólo trimestres, así que ahí se suma (estricto: con los 4 trimestres o nada).
    const fyOf = (f: Fund, metric: string, year: number): number | null =>
      f.annual?.get(metric)?.get(year) ?? sumStrict(f, metric, [1, 2, 3, 4].map((q) => qKey(year, q)));
    const latestOf = (mm: Map<number, number> | undefined): number | null => {
      if (!mm) return null;
      const atN = mm.get(nKey); if (atN != null) return atN;
      let bk = -1, bv: number | null = null; for (const [key, v] of mm) if (key > bk) { bk = key; bv = v; }
      return bv;
    };

    // ── Construir universo ────────────────────────────────────────────────────
    // El universo es stock_selection_v1 MÁS las compañías sembradas a mano: las que un
    // admin dio de alta desde la web (homologación + valores en stock_selection_override)
    // y que el cargador todavía no trae. Sin esto no habría forma de preparar una empresa
    // nueva antes de su primera carga: la vista recorría sólo stock_selection_v1, así que
    // una compañía sin filas ahí era invisible por muchos overrides que tuviera.
    //
    // Se apagan solas: borrando sus overrides desaparecen, y cuando el cargador empieza a
    // mandarlas entran por la vía normal (los overrides siguen ganando sobre el dato
    // cargado hasta que se limpien, que es la semántica de siempre de esa capa).
    const universo: string[] = [];
    const seen = new Set<string>();
    for (const r of ssRows) {
      const k = norm(r.company);
      if (seen.has(k)) continue;
      seen.add(k);
      universo.push(r.company);
    }
    const sembradas = new Set<string>();
    for (const [k, label] of overrideLabels) {
      if (seen.has(k)) continue;
      seen.add(k); sembradas.add(k);
      universo.push(label);
    }

    // Tickers con los que una compañía puede aparecer en la ficha o en el modelo: el de la
    // compañía y, en las de doble serie, el de cada serie (la ficha de Andina viene por ANDINAB,
    // la de Aguas podría venir por AGUAS/A).
    const tickerCandidates = (companyName: string, resolved: ResolvedName): string[] => {
      const sn = SERIES_NAMES[norm(companyName)];
      const raw = [resolved.tickerBBG, sn ? empByName(sn.A)?.tickerBloomberg : null, sn ? empByName(sn.B)?.tickerBloomberg : null];
      return [...new Set(raw.map((t) => normBBG(t)).filter((t): t is string => !!t))];
    };
    // Compañías con ficha que no están en la tabla vieja: entran con su nombre de la maestra.
    // Es lo que va a definir el universo cuando stock_selection_v1 se elimine.
    const claimed = new Set<string>();
    for (const name of universo) {
      const r = resolveName(name);
      if (r) for (const t of tickerCandidates(name, r)) claimed.add(t);
    }
    const nameByBbg = new Map<string, string>();
    for (const e of empresas) {
      const t = normBBG(e.tickerBloomberg), nm = e.nombreChile?.trim() || e.nombreLatam?.trim();
      if (t && nm && !nameByBbg.has(t)) nameByBbg.set(t, nm);
    }
    const extraTicker = new Map<string, string>(); // norm(nombre) → ticker de su ficha
    for (const t of fichaFunds.keys()) {
      const nm = claimed.has(t) ? null : nameByBbg.get(t);
      if (!nm || seen.has(norm(nm))) continue;
      seen.add(norm(nm)); extraTicker.set(norm(nm), t);
      universo.push(nm);
    }

    const companies: SsV1Company[] = [];
    // Moneda de cotización según la maestra, para cuando Yahoo no la manda. Pasa en los
    // listados recién renombrados (PAMPA.SN llega con currency null): sin este respaldo el
    // precio se muestra pero el M.Cap sale vacío, porque conv() sólo entiende CLP y USD.
    const monedaListado = new Map<string, string>();
    for (const companyName of universo) {
      const k = norm(companyName);
      // Ocultada a mano por un admin (stock_selection_hidden). No se borra nada: la fila
      // vuelve apenas se desmarca en el panel de Administracion.
      if (hiddenCompanies.has(k)) continue;
      const resolved = resolveName(companyName);
      if (!resolved) continue;
      if (resolved.moneda) monedaListado.set(k, resolved.moneda.trim().toUpperCase());

      const cands = tickerCandidates(companyName, resolved);
      const extra = extraTicker.get(k);
      if (extra && !cands.includes(extra)) cands.push(extra);

      // ── Fundamentales: ficha → tabla vieja → vacío ──
      // Se elige UNA fuente por compañía para el período n, sin mezclar: la ficha si tiene ese
      // trimestre; si no, stock_selection_v1 si lo tiene; si ninguna, vacío. Mezclar daría LTM
      // falsos: la tabla vieja llega hasta 1Q26, y a 3Q26 sumaría medio año como si fuera uno.
      const fichaTicker = cands.find((t) => fichaFunds.has(t)) ?? null;
      const ficha = fichaTicker ? fichaFunds.get(fichaTicker) : undefined;
      const legacy = funds.get(k);
      const fundSource: SsV1Company["fundSource"] =
        hasPeriod(ficha, nKey) ? "ficha" : hasPeriod(legacy, nKey) ? "legacy" : "none";
      const base = ficha ?? legacy;
      // Sin fuente para n (o sembrada, sin nada cargado): vacío, salvo las acciones, que no
      // cambian de un trimestre a otro y permiten seguir mostrando M.Cap y series A/B. La
      // moneda: la de la fuente que exista, o la de la maestra.
      const f: Fund = fundSource === "ficha" ? ficha! : fundSource === "legacy" ? legacy! : {
        currency: base?.currency ?? (resolved.moneda === "USD" ? "USD" : "CLP"),
        metrics: base?.metrics.has("shares") ? new Map([["shares", base.metrics.get("shares")!]]) : new Map(),
        sharesSeries: base?.sharesSeries ?? new Map(),
      };

      // ── Proyecciones / payout / Rec / TP: último modelo del analista ──
      const modelTicker = cands.find((t) => modelPicks.has(t)) ?? null;
      const model: ModelPick | null = modelTicker ? modelPicks.get(modelTicker)! : null;
      const projSource: SsV1Company["projSource"] = model ? "model" : "none";
      // Escala del modelo medida contra el año reportado de la compañía (ver modelScale).
      const scale = model
        ? modelScale(model, PROJ_Y0 - 1, base ? {
            revenue: fyOf(base, "revenue", PROJ_Y0 - 1), ebitda: fyOf(base, "ebitda", PROJ_Y0 - 1), utilidad: fyOf(base, "utilidad", PROJ_Y0 - 1),
          } : null, base?.currency ?? null)
        : null;
      const modelVal = (year: number, field: "ebitda" | "utilidad"): number | null => {
        const v = model?.years.get(year)?.[field];
        return v == null || scale == null ? null : v * scale;
      };
      // Pol Div = payout del modelo para el año SIGUIENTE (PROJ_Y1): en el modelo el payout del
      // año Y es dividendo(Y) / utilidad(Y−1), y la vista lo aplica sobre la utilidad 2026E. En
      // Andina da 0,80 (= el pool_div de la tabla de proyecciones que reemplazó). El signo varía
      // entre modelos.
      const modelPayout = model?.years.get(PROJ_Y1)?.payout;
      const modelRec = model && recLabel(model.recc)
        ? { rec: recLabel(model.recc)!, recDate: model.updateDate.toISOString().slice(0, 10), tp: model.tp }
        : null;

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
      // Rec/Date/TP. Con modelo: el del header, en la serie del ticker del modelo (Andina →
      // serie B) y a nivel compañía; la otra serie queda sin Rec, igual que con ARH. Sin modelo
      // (o con recc vacío): AnalystRecommendationHistory, cada serie por el BBG de su clase.
      for (const s of series) {
        const ri = modelRec ? (normBBG(s.bbg) === modelTicker ? modelRec : null) : recOf(s.bbg);
        s.rec = ri?.rec ?? null; s.recDate = ri?.recDate ?? null; s.tp = ri?.tp ?? null;
      }
      // Retornos por BBG de la clase. Independientes de ?withPrices: vienen de la base.
      for (const s of series) applyReturns(s);
      const coRec = modelRec ?? recOf(resolved.tickerBBG);

      const co: SsV1Company = {
        company: companyName, tickerBBG: resolved.tickerBBG, industria: resolved.industria, gics: resolved.gics, dual,
        seeded: sembradas.has(k) || undefined,
        fundSource, fichaTicker, projSource, modelTicker,
        modelDate: model ? model.updateDate.toISOString().slice(0, 10) : null,
        modelScale: scale,
        ssCurrency: f.currency, projCurrency: model?.currency ?? null,
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
        ebitdaFyPrev:  fundSource === "none" ? null : fyOf(f, "ebitda", PROJ_Y0 - 1),
        // Valores del modelo tal cual, escalados a millones. Sin modelo → vacíos.
        ebitda2026E:   modelVal(PROJ_Y0, "ebitda"),
        ebitda2027E:   modelVal(PROJ_Y1, "ebitda"),
        utilidad2026E: modelVal(PROJ_Y0, "utilidad"),
        utilidad2027E: modelVal(PROJ_Y1, "utilidad"),
        payout: modelPayout == null ? null : Math.abs(modelPayout),
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
      for (const c of companies) {
        const fallbackCcy = monedaListado.get(norm(c.company)) ?? null;
        for (const s of c.series) {
          const pd = s.yahooTicker ? priceMap.get(s.yahooTicker) ?? null : null;
          s.price = pd?.price ?? null;
          // Si Yahoo no manda la moneda, la de empresas_industrias_v2. Sin esto un precio
          // válido no se convierte a USD y el M.Cap (y con él todos los múltiplos) sale
          // vacío, que es un modo de falla peor: la fila parece cargada y no lo está.
          s.currency = pd?.currency ?? (pd?.price != null ? fallbackCcy : null);
        }
      }
    }

    const payload: SsV1Payload = {
      withPrices,
      periodN: selFy ? labelOf(selFy, selQ) : null,
      periodN4: selFy ? labelOf(selFy - 1, selQ) : null,
      ltmLabels, periods, selFy, selQ, companies, indexLevels,
      returnsAsOf, returnsSource, returnsMatched, returnsRows: retRows.length,
      fichaCount: companies.filter((c) => c.fundSource === "ficha").length,
      modelCount: companies.filter((c) => c.projSource === "model").length,
    };
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[stock-selection-v1]", e);
    return NextResponse.json({ error: "Internal server error", details: String(e) }, { status: 500 });
  }
}
