import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import YahooFinance from "yahoo-finance2";

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
  // Precios / retornos (solo con ?withPrices=true)
  price?:    number | null;
  currency?: string | null;   // moneda del precio (CLP / USD / GBp…)
  retMonth?: number | null;
  retYtd?:   number | null;
  retYear?:  number | null;
  ret3y?:    number | null;
  ret5y?:    number | null;
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
}

export interface SsV1Period { fy: number; q: number; label: string; }

export interface SsV1Payload {
  withPrices: boolean;
  periodN:    string | null;
  periodN4:   string | null;
  ltmLabels:  string[];
  periods:    SsV1Period[]; // quarters disponibles (desc), para el selector
  selFy:      number;       // período n activo
  selQ:       number;
  companies:  SsV1Company[];
}

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

// Correcciones de tickers Yahoo mal cargados en empresas_industrias_v2.yahoo_finance_ticker
// (clave = valor en la tabla, en MAYÚSCULAS). Reportar al usuario para que arregle la fuente.
const YAHOO_OVERRIDE: Record<string, string> = {
  "POTASIO-A.SN": "POTASIOS-A.SN",
  "POTASIO-B.SN": "POTASIOS-B.SN",
};

// ── Precios / retornos (Yahoo) ──────────────────────────────────────────────────
const DAY = 86400000;
interface ChartPoint { t: number; v: number; }
function priceAsOf(series: ChartPoint[], targetMs: number): number | null {
  let res: number | null = null;
  for (const p of series) { if (p.t <= targetMs) res = p.v; else break; }
  return res;
}
const retOf = (cur: number, base: number | null): number | null => (base != null && base > 0 ? cur / base - 1 : null);
// Fecha calendario n años atrás (no 365·n días: eso se corre 1-2 días por los bisiestos).
const yearsAgo = (ms: number, years: number): number => {
  const d = new Date(ms);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.getTime();
};

interface YChartQuote { date: Date; close: number | null; adjclose?: number | null; }
interface YChartDiv { date: Date; amount?: number | null; }
interface YChart { meta?: { currency?: string; regularMarketPrice?: number }; quotes: YChartQuote[]; events?: { dividends?: YChartDiv[] }; }
interface PriceData { price: number | null; currency: string | null; retMonth: number | null; retYtd: number | null; retYear: number | null; ret3y: number | null; ret5y: number | null; }

async function fetchPrice(ticker: string): Promise<PriceData | null> {
  try {
    const period2 = new Date();
    const period1 = new Date(yearsAgo(period2.getTime(), 5) - 45 * DAY);
    const chart = (await yf.chart(ticker, { period1, period2, interval: "1d", events: "div" })) as YChart;

    // Cierre crudo. NO usamos adjclose: en varios .SN Yahoo sólo aplica el último
    // dividendo (BLUMAR.SN ajusta 1.7% habiendo repartido 40 CLP en 5 años, mientras
    // CENCOSUD.SN sí ajusta el 29%), así que los retornos no eran comparables entre
    // compañías. Reconstruimos el retorno total con los eventos de dividendos.
    const px: ChartPoint[] = [];
    for (const q of chart.quotes ?? []) {
      if (q.close != null && isFinite(q.close) && q.date) px.push({ t: new Date(q.date).getTime(), v: q.close });
    }
    px.sort((a, b) => a.t - b.t);
    if (!px.length) return null;

    const divs = (chart.events?.dividends ?? [])
      .map((e) => ({ t: new Date(e.date).getTime(), amt: e.amount ?? 0 }))
      .filter((e) => e.amt > 0 && isFinite(e.amt))
      .sort((a, b) => a.t - b.t);

    // Serie de retorno total: en cada ex-date el dividendo se reinvierte al cierre previo.
    const tr: ChartPoint[] = [];
    let acc = 1, di = 0;
    for (let i = 0; i < px.length; i++) {
      while (di < divs.length && divs[di].t <= px[i].t) {
        const prev = px[i - 1]?.v ?? px[i].v;
        if (prev > 0) acc *= (prev + divs[di].amt) / prev;
        di++;
      }
      tr.push({ t: px[i].t, v: px[i].v * acc });
    }

    const lastPx = px[px.length - 1], curT = lastPx.t, cur = tr[tr.length - 1].v;
    const yearStart = Date.UTC(new Date(curT).getUTCFullYear(), 0, 1) - 1;
    // Hasta 1 año: retorno acumulado. L3Y / L5Y: anualizado (CAGR), que es la
    // convención de mercado para horizontes de varios años.
    const cagr = (base: number | null, years: number): number | null => {
      const r = retOf(cur, base);
      return r == null ? null : Math.pow(1 + r, 1 / years) - 1;
    };
    return {
      price: chart.meta?.regularMarketPrice ?? lastPx.v,
      currency: chart.meta?.currency ?? null,
      retMonth: retOf(cur, priceAsOf(tr, curT - 30 * DAY)),
      retYtd: retOf(cur, priceAsOf(tr, yearStart)),
      retYear: retOf(cur, priceAsOf(tr, yearsAgo(curT, 1))),
      ret3y: cagr(priceAsOf(tr, yearsAgo(curT, 3)), 3),
      ret5y: cagr(priceAsOf(tr, yearsAgo(curT, 5)), 5),
    };
  } catch {
    return null;
  }
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
    const fixYahoo = (y: string | null | undefined): string | null => {
      if (!y || !y.trim()) return null;
      const t = y.trim();
      return YAHOO_OVERRIDE[t.toUpperCase()] ?? t;
    };
    const yahooOf = (row: EmpRow): string | null =>
      fixYahoo(row.yahooFinanceTicker) ?? fixYahoo(row.isin ? yahooByIsin.get(row.isin.trim()) : null);
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
      const coRec = recOf(resolved.tickerBBG);

      companies.push({
        company: r.company, tickerBBG: resolved.tickerBBG, industria: resolved.industria, gics: resolved.gics, dual,
        ssCurrency: f.currency, projCurrency: pick?.moneda ?? null,
        series, sharesTotal,
        rec: coRec?.rec ?? null, recDate: coRec?.recDate ?? null, tp: coRec?.tp ?? null,
        ebitdaN: at(f, "ebitda", nKey), ebitdaN4: at(f, "ebitda", n4Key), ebitdaLtm: ltmSum(f, "ebitda"),
        utilidadN: at(f, "utilidad", nKey), utilidadN4: at(f, "utilidad", n4Key), utilidadLtm: ltmSum(f, "utilidad"),
        revenueLtm: ltmSum(f, "revenue"), ebitLtm: ltmSum(f, "ebit"),
        debtN: at(f, "debt", nKey), debtN4: at(f, "debt", n4Key),
        equityN: at(f, "equity", nKey), equityN4: at(f, "equity", n4Key),
        minorityN: at(f, "minority_interest", nKey), minorityN4: at(f, "minority_interest", n4Key),
        ebitda2026E: projYear(pick, "ebitda", 2026), ebitda2027E: projYear(pick, "ebitda", 2027),
        utilidad2026E: projYear(pick, "utilidad", 2026), utilidad2027E: projYear(pick, "utilidad", 2027),
        divLabel: pick?.div ?? null, payout: pick?.pool_div ?? null,
      });
    }
    companies.sort((a, b) => a.company.localeCompare(b.company));

    // ── Precios (Yahoo, on-demand) ────────────────────────────────────────────
    if (withPrices) {
      const tickers = [...new Set(companies.flatMap((c) => c.series.map((s) => s.yahooTicker)).filter((t): t is string => !!t))];
      const priceMap = await fetchPricesChunked(tickers);
      for (const c of companies)
        for (const s of c.series) {
          const pd = s.yahooTicker ? priceMap.get(s.yahooTicker) ?? null : null;
          s.price = pd?.price ?? null; s.currency = pd?.currency ?? null;
          s.retMonth = pd?.retMonth ?? null; s.retYtd = pd?.retYtd ?? null; s.retYear = pd?.retYear ?? null;
          s.ret3y = pd?.ret3y ?? null; s.ret5y = pd?.ret5y ?? null;
        }
    }

    const payload: SsV1Payload = {
      withPrices,
      periodN: selFy ? labelOf(selFy, selQ) : null,
      periodN4: selFy ? labelOf(selFy - 1, selQ) : null,
      ltmLabels, periods, selFy, selQ, companies,
    };
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[stock-selection-v1]", e);
    return NextResponse.json({ error: "Internal server error", details: String(e) }, { status: 500 });
  }
}
