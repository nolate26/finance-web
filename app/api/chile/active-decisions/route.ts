import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeBands } from "@/lib/stats";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const MIN_OBS = 12; // mínimo de puntos mensuales para una banda confiable

// ── Public types ──────────────────────────────────────────────────────────────

export interface ADBand {
  lower: number;
  avg:   number;
  upper: number;
  n:     number;
}

export interface ADCompany {
  ticker:      string;
  name:        string;
  gics:        string | null;
  yahooTicker: string | null;
  pe:          ADBand | null;
  evEbitda:    ADBand | null;
  // Consenso (consensus_estimates), año forward más cercano. En MILLONES de la moneda
  // de reporte de la empresa (CLP para la mayoría; USD para Copec/CMPC/etc.).
  netIncome:   number | null;
  ebitda:      number | null;
  // Deuda neta del último balance de la ficha (ficha_statements "Total Net Debt"), en CLP
  // MIL-MILLONES; positivo = deuda, negativo = caja. null = la empresa no tiene ficha.
  netDebt:       number | null;
  netDebtPeriod: string | null;   // trimestre del balance usado, "3Q26"
  // Solo con ?withPrices=true
  currentPrice?: number | null;
  currency?:     string | null;
  shares?:       number | null;
}

export interface ActiveDecisionsPayload {
  asOf:       string | null;
  withPrices: boolean;
  usdClp?:    number | null;   // para convertir NET_INCOME en USD → CLP
  companies:  ADCompany[];
}

interface CompanyRow { ticker: string; name: string; chile: string | null; latam: string | null; gics: string | null; isin: string | null; yahoo: string | null; }
interface SeriesRow  { tk: string; pe: number | null; ev: number | null; }
interface ConsRow    { tk: string; metric: string; value: number; }
interface NdRow      { tk: string; currency: string; fx: number | null; year: number; quarter: number; value: number; }

const CHILE_FILTER =
  "(UPPER(e.moneda) = 'CLP' OR UPPER(e.country_risk) IN ('CHILE', 'CL'))";

const band = (vals: (number | null)[]): ADBand | null => {
  const n = vals.filter((v): v is number => v != null && isFinite(v)).length;
  if (n < MIN_OBS) return null;
  const b = computeBands(vals);
  return { lower: b.lower, avg: b.avg, upper: b.upper, n };
};

interface YQuote { symbol?: string; regularMarketPrice?: number; marketCap?: number; sharesOutstanding?: number; currency?: string; }

export async function GET(request: NextRequest) {
  const withPrices = request.nextUrl.searchParams.get("withPrices") === "true";

  try {
    // ── 1. Universo chileno + GICS + ticker Yahoo de la maestra ───────────────
    const companyRows = await prisma.$queryRawUnsafe<CompanyRow[]>(`
      SELECT e.ticker_bloomberg AS ticker,
             COALESCE(NULLIF(e.nombre_chile, ''), e.nombre_latam) AS name,
             NULLIF(e.nombre_chile, '') AS chile,
             NULLIF(e.nombre_latam, '') AS latam,
             NULLIF(e.industria_gics, '') AS gics,
             e.isin AS isin,
             NULLIF(e.yahoo_finance_ticker, '') AS yahoo
      FROM empresas_industrias_v2 e
      WHERE ${CHILE_FILTER}
        AND e.ticker_bloomberg IS NOT NULL AND e.ticker_bloomberg <> ''
      ORDER BY name ASC
    `);

    // ── 2. Series de múltiplos (peFwd, evEbitdaFwd) ───────────────────────────
    // Join por igualdad directa: los tickers están canónicos en la base, así que
    // usa valuation_history_pkey en vez de escanear las 193k filas.
    const seriesRows = await prisma.$queryRawUnsafe<SeriesRow[]>(`
      SELECT v.ticker AS tk, v."peFwd" AS pe, v."evEbitdaFwd" AS ev
      FROM valuation_history v
      JOIN empresas_industrias_v2 e ON e.ticker_bloomberg = v.ticker
      WHERE ${CHILE_FILTER}
    `);

    // ── 3. Consenso NET_INCOME / EBITDA del año forward más cercano (latest) ──
    const consRows = await prisma.$queryRawUnsafe<ConsRow[]>(`
      SELECT DISTINCT ON (ce.ticker, ce.metric)
             ce.ticker AS tk, ce.metric AS metric, ce.value AS value
      FROM consensus_estimates ce
      JOIN empresas_industrias_v2 e ON e.ticker_bloomberg = ce.ticker
      WHERE ce.metric IN ('NET_INCOME', 'EBITDA') AND ${CHILE_FILTER}
      ORDER BY ce.ticker, ce.metric, ce.period ASC, ce.date DESC
    `);
    const [{ asof }] = await prisma.$queryRawUnsafe<{ asof: Date | null }[]>(
      `SELECT MAX(date) AS asof FROM valuation_history`,
    );

    // ── 4. Deuda neta: último balance de la ficha de cada ticker ──────────────
    // Es un saldo, así que vale el período más reciente de cualquier tipo; a igual fecha se
    // prefiere la fila trimestral ("Q"). Montos en MILLONES de la moneda reportada.
    const ndRows = await prisma.$queryRawUnsafe<NdRow[]>(`
      SELECT DISTINCT ON (f.ticker)
             f.ticker AS tk, f.currency, f.fx::float AS fx, f.year, f.quarter, f.value::float AS value
      FROM ficha_statements f
      WHERE f.section = 'Balance Sheet' AND f.line = 'Total Net Debt'
      ORDER BY f.ticker, f.period_end DESC, (f.period_type = 'Q') DESC
    `);

    // ── Agrupación por ticker (ya canónico en ambos lados) ───────────────────
    const peByTk = new Map<string, (number | null)[]>();
    const evByTk = new Map<string, (number | null)[]>();
    for (const r of seriesRows) {
      if (!peByTk.has(r.tk)) { peByTk.set(r.tk, []); evByTk.set(r.tk, []); }
      peByTk.get(r.tk)!.push(r.pe);
      evByTk.get(r.tk)!.push(r.ev);
    }
    const niByTk = new Map<string, number>();
    const ebByTk = new Map<string, number>();
    for (const r of consRows) {
      if (r.metric === "NET_INCOME") niByTk.set(r.tk, r.value);
      else if (r.metric === "EBITDA") ebByTk.set(r.tk, r.value);
    }
    // Millones de la moneda reportada → CLP mil-millones. Las que reportan en USD (Blumar,
    // Camanchaca, Multix…) se pasan a CLP con el fx de su ficha (CLP por USD): ss_universe
    // las traía en USD mn rotuladas como CLP bn, y el EV implícito salía ~970x corto.
    type Nd = { bn: number; period: string };
    const ndByTk = new Map<string, Nd>();
    for (const r of ndRows) {
      const clpMn = r.currency === "CLP" ? r.value : r.currency === "USD" && r.fx ? r.value * r.fx : null;
      if (clpMn == null) continue;
      ndByTk.set(r.tk, { bn: clpMn / 1000, period: `${r.quarter}Q${String(r.year).slice(-2)}` });
    }
    // La deuda neta es de la COMPAÑÍA, no de la serie: la ficha de Andina viene por ANDINAB y
    // vale igual para ANDINAA. Se comparte entre los tickers con el mismo nombre_latam.
    const ndByName = new Map<string, Nd>();
    for (const c of companyRows) {
      const nd = ndByTk.get(c.ticker);
      const k = c.latam?.toLowerCase().trim();
      if (nd && k && !ndByName.has(k)) ndByName.set(k, nd);
    }
    const netDebtOf = (c: CompanyRow): Nd | null =>
      ndByTk.get(c.ticker) ?? ndByName.get(c.latam?.toLowerCase().trim() ?? "") ?? null;

    const companies: ADCompany[] = companyRows.map((c) => {
      const tk = c.ticker;
      const nd = netDebtOf(c);
      return {
        ticker:      c.ticker,
        name:        c.name,
        gics:        c.gics,
        yahooTicker: c.yahoo,
        pe:          band(peByTk.get(tk) ?? []),
        evEbitda:    band(evByTk.get(tk) ?? []),
        netIncome:   niByTk.get(tk) ?? null,
        ebitda:      ebByTk.get(tk) ?? null,
        netDebt:       nd?.bn ?? null,
        netDebtPeriod: nd?.period ?? null,
      };
    });

    // ── 4. Precio actual + acciones + USDCLP (solo con ?withPrices) ──────────
    let usdClp: number | null = null;
    if (withPrices) {
      const symbols = [
        ...new Set(companies.map((c) => c.yahooTicker).filter((s): s is string => !!s)),
        "USDCLP=X",
      ];
      const quoteMap = new Map<string, YQuote>();
      try {
        const raw = await (yf.quote as unknown as (
          s: string[], q?: unknown, m?: unknown,
        ) => Promise<YQuote[]>)(symbols, undefined, { validateResult: false });
        for (const r of Array.isArray(raw) ? raw : [raw]) if (r?.symbol) quoteMap.set(r.symbol, r);
      } catch (e) {
        console.error("[active-decisions] yahoo quote failed:", e);
      }
      usdClp = quoteMap.get("USDCLP=X")?.regularMarketPrice ?? null;
      for (const co of companies) {
        const qt = co.yahooTicker ? quoteMap.get(co.yahooTicker) : undefined;
        const price = qt?.regularMarketPrice ?? null;
        co.currentPrice = price;
        co.currency = qt?.currency ?? null;
        co.shares = qt?.sharesOutstanding ?? (qt?.marketCap && price ? qt.marketCap / price : null);
      }
    }

    const payload: ActiveDecisionsPayload = {
      asOf: asof ? asof.toISOString().slice(0, 10) : null,
      withPrices,
      usdClp,
      companies,
    };
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[active-decisions]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
