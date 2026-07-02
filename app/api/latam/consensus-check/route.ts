import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface ConsensusCheckRow {
  ticker:     string;
  updateDate: string;
  analyst:    string | null;
  recc:       string | null;
  tp:          number | null;
  upside:      number | null;   // vs precio de mercado actual (px_last del último día)
  upsideModel: number | null;   // upside del analista al hacer el modelo (vs share_price del modelo)
  thesis:      string | null;
  country:    string | null;   // empresas_industrias_v2.country_risk (AR, BR, CL, …)
  industry:   string | null;   // empresas_industrias_v2.industria_gics
  unit:        string | null;  // ModelHeader.unit ("mn" | "000 mn"); null para bancos
  moneda: {
    rev1FY:    number | null;
    rev2FY:    number | null;
    ebitda1FY: number | null;
    ebitda2FY: number | null;
    ni1FY:     number | null;
    ni2FY:     number | null;
  };
  consensus: {
    rev1FY:    number | null;
    rev2FY:    number | null;
    ebitda1FY: number | null;
    ebitda2FY: number | null;
    ni1FY:     number | null;
    ni2FY:     number | null;
  };
}

export interface ConsensusCheckPayload {
  rows:       ConsensusCheckRow[];
  year1FY:    number;
  year2FY:    number;
  pricesAsOf: string | null;   // último día de precios (price_range_52w) usado para el Upside
}

// Consensus is ingested in inconsistent scales: for some tickers it is stored ~1000×
// the model ("Moneda") scale (which the client's ÷1000 assumes), for others already in
// model scale. Detect the per-ticker factor from a reference metric (where both sides
// exist) and rescale consensus to the expected "1000× model" scale so the client's
// ÷1000 yields the right number. The factor is always a power of 1000 (usually 1 or 1000).
function consensusScaleFactor(moneda: (number | null)[], consensus: (number | null)[]): number {
  for (let i = 0; i < moneda.length; i++) {
    const m = moneda[i];
    const c = consensus[i];
    if (m != null && c != null && m !== 0 && c !== 0) {
      const ratio = c / m;                                   // target ≈ 1000
      const exp   = Math.round(Math.log(1000 / ratio) / Math.log(1000));
      return Math.pow(1000, exp);
    }
  }
  return 1;
}

// Modelo → moneda del consenso: multiplica por el fx del analista (no-op si es null).
// El sentido (fx o 1/fx) lo decide el analista; acá sólo multiplicamos.
const applyFx = (v: number | null | undefined, fx: number | null | undefined): number | null =>
  v == null ? null : v * (fx ?? 1);

// Clave canónica para joins por ticker entre tablas. Los tickers vienen con casing
// distinto entre tablas y, a veces, con espacios sobrantes (p.ej. bank_headers guarda
// "NU US Equity " con espacio final, mientras price/consensus lo tienen limpio). Sin
// trim, el match exacto falla y la fila queda sin precio/consenso. Normalizamos siempre.
const normTicker = (t: string) => t.trim().toUpperCase();

function scaledConsensus(
  moneda: ConsensusCheckRow["moneda"],
  raw:    ConsensusCheckRow["consensus"],
): ConsensusCheckRow["consensus"] {
  const k = consensusScaleFactor(
    [moneda.ni1FY, moneda.ni2FY, moneda.rev1FY, moneda.rev2FY, moneda.ebitda1FY, moneda.ebitda2FY],
    [raw.ni1FY,    raw.ni2FY,    raw.rev1FY,    raw.rev2FY,    raw.ebitda1FY,    raw.ebitda2FY],
  );
  const mul = (v: number | null) => (v == null ? null : v * k);
  return {
    rev1FY:    mul(raw.rev1FY),    rev2FY:    mul(raw.rev2FY),
    ebitda1FY: mul(raw.ebitda1FY), ebitda2FY: mul(raw.ebitda2FY),
    ni1FY:     mul(raw.ni1FY),     ni2FY:     mul(raw.ni2FY),
  };
}

export async function GET() {
  try {
    const year1FY = new Date().getFullYear();
    const year2FY = year1FY + 1;

    // Latest header per ticker for companies (ModelHeader) and banks (BankHeader).
    const [latestHeaders, latestBankHeadersRaw] = await Promise.all([
      prisma.modelHeader.findMany({
        distinct: ["ticker"],
        orderBy:  { updateDate: "desc" },
        select:   { ticker: true, updateDate: true, analyst: true, recc: true, tp: true, thesis: true, unit: true },
      }),
      prisma.bankHeader.findMany({
        distinct: ["ticker"],
        orderBy:  { updateDate: "desc" },
        select:   { ticker: true, updateDate: true, analyst: true, recc: true, tp: true, thesis: true },
      }),
    ]);

    // Company precedence: a ticker present as a company is never treated as a bank.
    const companyTickerSet = new Set(latestHeaders.map((h) => h.ticker));
    const latestBankHeaders = latestBankHeadersRaw.filter((b) => !companyTickerSet.has(b.ticker));

    if (latestHeaders.length === 0 && latestBankHeaders.length === 0) {
      return NextResponse.json({ rows: [], year1FY, year2FY, pricesAsOf: null } satisfies ConsensusCheckPayload);
    }

    // Fecha de referencia = último día de precios de la tabla (para el badge "Prices as of").
    // OJO: el Upside NO se ata a ese día exacto — la ingesta llega despareja por ticker, así que
    // fijar una sola fecha global dejaba sin upside a nombres recién agregados o atrasados. En su
    // lugar traemos una ventana reciente y tomamos, por ticker, su ÚLTIMO precio disponible.
    const latestPriceRow = await prisma.priceRange52w.findFirst({
      orderBy: { date: "desc" }, select: { date: true },
    });
    const pricesAsOfDate = latestPriceRow?.date ?? null;
    const pricesAsOf     = pricesAsOfDate ? pricesAsOfDate.toISOString().slice(0, 10) : null;
    // Ventana hacia atrás desde el último día; suficiente para cubrir el rezago de ingesta.
    const PRICE_WINDOW_DAYS = 14;
    const priceWindowStart  = pricesAsOfDate
      ? new Date(pricesAsOfDate.getTime() - PRICE_WINDOW_DAYS * 86_400_000)
      : null;

    // Financials for each ticker's latest snapshot, for year1FY and year2FY.
    const [financials, bankFinancials, consensusRows, empresas, prices, refPrices, bankRefPrices] = await Promise.all([
      latestHeaders.length
        ? prisma.modelFinancials.findMany({
            where: {
              OR: latestHeaders.map((h) => ({
                ticker: h.ticker, updateDate: h.updateDate, year: { in: [year1FY, year2FY] },
              })),
            },
            select: { ticker: true, year: true, fxConsensus: true, revenue: true, ebitda: true, netIncome: true, sharePrice: true },
          })
        : Promise.resolve([] as { ticker: string; year: number; fxConsensus: number | null; revenue: number | null; ebitda: number | null; netIncome: number | null; sharePrice: number | null }[]),
      latestBankHeaders.length
        ? prisma.bankFinancials.findMany({
            where: {
              OR: latestBankHeaders.map((b) => ({
                ticker: b.ticker, updateDate: b.updateDate, year: { in: [year1FY, year2FY] },
              })),
            },
            select: { ticker: true, year: true, revenue: true, controllingNetIncome: true, sharePrice: true },
          })
        : Promise.resolve([] as { ticker: string; year: number; revenue: number | null; controllingNetIncome: number | null; sharePrice: number | null }[]),
      // Consensus para los 2 FY; el ticker se matchea case-insensitive en JS (abajo) porque
      // consensus_estimates trae casing distinto a model_headers / empresas_industrias_v2.
      prisma.consensusEstimate.findMany({
        where: {
          metric: { in: ["NET_INCOME", "EBITDA", "REVENUE"] },
          period: { in: [String(year1FY), String(year2FY)] },
        },
        orderBy: { date: "desc" },
        select:  { ticker: true, metric: true, period: true, value: true },
      }),
      // País (country_risk) e industria (industria_gics) por ticker Bloomberg.
      prisma.empresasIndustriasV2.findMany({
        select: { tickerBloomberg: true, countryRisk: true, industriaGics: true },
      }),
      // Precios de la ventana reciente (px_last) para el Upside. Ordenados por fecha desc para
      // quedarnos, por ticker, con la fila más nueva al construir el mapa.
      priceWindowStart
        ? prisma.priceRange52w.findMany({
            where:   { date: { gte: priceWindowStart } },
            orderBy: { date: "desc" },
            select:  { ticker: true, date: true, pxLast: true },
          })
        : Promise.resolve([] as { ticker: string; date: Date; pxLast: number }[]),
      // Precio de referencia del modelo para "Upside @Model": algunos analistas NO cargan el
      // share_price en los años proyectados (year1FY/year2FY) sino en el último año con dato real
      // (p.ej. 2025). Traemos todos los años ≤ year1FY con share_price no nulo, ordenados por año
      // desc, para quedarnos por ticker con el del mayor año disponible.
      latestHeaders.length
        ? prisma.modelFinancials.findMany({
            where: {
              OR: latestHeaders.map((h) => ({
                ticker: h.ticker, updateDate: h.updateDate, year: { lte: year1FY }, sharePrice: { not: null },
              })),
            },
            orderBy: { year: "desc" },
            select:  { ticker: true, sharePrice: true },
          })
        : Promise.resolve([] as { ticker: string; sharePrice: number | null }[]),
      latestBankHeaders.length
        ? prisma.bankFinancials.findMany({
            where: {
              OR: latestBankHeaders.map((b) => ({
                ticker: b.ticker, updateDate: b.updateDate, year: { lte: year1FY }, sharePrice: { not: null },
              })),
            },
            orderBy: { year: "desc" },
            select:  { ticker: true, sharePrice: true },
          })
        : Promise.resolve([] as { ticker: string; sharePrice: number | null }[]),
    ]);

    // Precio de mercado más reciente por ticker: normTicker → px_last. Como `prices` viene
    // ordenado por fecha desc, la primera aparición de cada ticker es su último precio.
    const priceMap = new Map<string, number>();
    for (const p of prices) {
      const k = normTicker(p.ticker);
      if (!priceMap.has(k)) priceMap.set(k, p.pxLast);
    }

    // Precio de referencia del modelo por ticker: normTicker → share_price del mayor año ≤ year1FY
    // con valor válido. refPrices/bankRefPrices vienen ordenados por año desc, así que la primera
    // aparición (no nula, no 0) de cada ticker es la del año más reciente disponible.
    const modelPriceMap = new Map<string, number>();
    for (const r of [...refPrices, ...bankRefPrices]) {
      const k = normTicker(r.ticker);
      if (r.sharePrice != null && r.sharePrice !== 0 && !modelPriceMap.has(k)) {
        modelPriceMap.set(k, r.sharePrice);
      }
    }

    // ei: UPPER(ticker) → { country, industry } (match case-insensitive).
    const eiMap = new Map<string, { country: string | null; industry: string | null }>();
    for (const e of empresas) {
      if (!e.tickerBloomberg) continue;
      eiMap.set(normTicker(e.tickerBloomberg), {
        country:  e.countryRisk   || null,
        industry: e.industriaGics || null,
      });
    }
    const eiFor = (ticker: string) => eiMap.get(normTicker(ticker)) ?? { country: null, industry: null };

    // financials: (ticker, year) → company model values (already in consensus/1000 scale).
    // fxConsensus convierte la moneda del modelo a la del consenso (no-op si es null).
    const finMap = new Map<string, { revenue: number | null; ebitda: number | null; netIncome: number | null; sharePrice: number | null; fxConsensus: number | null }>();
    for (const f of financials) {
      finMap.set(`${f.ticker}::${f.year}`, {
        revenue:     f.revenue     ?? null,
        ebitda:      f.ebitda      ?? null,
        netIncome:   f.netIncome   ?? null,
        sharePrice:  f.sharePrice  ?? null,
        fxConsensus: f.fxConsensus ?? null,
      });
    }

    // bankFinancials: (ticker, year) → raw bank model values (divided by 1000 below)
    const bankFinMap = new Map<string, { revenue: number | null; netIncome: number | null; sharePrice: number | null }>();
    for (const f of bankFinancials) {
      bankFinMap.set(`${f.ticker}::${f.year}`, {
        revenue:    f.revenue              ?? null,
        netIncome:  f.controllingNetIncome ?? null,
        sharePrice: f.sharePrice           ?? null,
      });
    }

    // consensus: (TICKER, METRIC, period) → value (deduplicated, first = latest).
    // Claves normalizadas a UPPER → match case-insensitive contra los tickers de los headers.
    const conMap  = new Map<string, number>();
    const seenCon = new Set<string>();
    for (const r of consensusRows) {
      const key = `${normTicker(r.ticker)}::${r.metric.toUpperCase()}::${r.period}`;
      if (!seenCon.has(key)) {
        seenCon.add(key);
        conMap.set(key, r.value);
      }
    }

    const companyRows: ConsensusCheckRow[] = latestHeaders.map((h) => {
      const fin1 = finMap.get(`${h.ticker}::${year1FY}`);
      const fin2 = finMap.get(`${h.ticker}::${year2FY}`);
      const getCon = (metric: string, period: string) =>
        conMap.get(`${normTicker(h.ticker)}::${metric.toUpperCase()}::${period}`) ?? null;

      const price       = priceMap.get(normTicker(h.ticker)) ?? null;     // px_last más reciente (live)
      const modelPrice  = modelPriceMap.get(normTicker(h.ticker))         // precio de referencia (mayor año ≤ year1FY)
                        ?? fin1?.sharePrice ?? fin2?.sharePrice ?? null;   // fallback: años proyectados
      const tp          = h.tp ?? null;
      const upside      = tp && price      ? tp / price      - 1 : null;  // vs precio actual
      const upsideModel = tp && modelPrice ? tp / modelPrice - 1 : null;  // upside del analista al hacer el modelo

      // Moneda convertida a la moneda del consenso (× fxConsensus por año). El detector de
      // escala (scaledConsensus) corre sobre la moneda ya convertida → alinea bien cualquier
      // divisa, no sólo las ≈1000× (CLP).
      const moneda = {
        rev1FY:    applyFx(fin1?.revenue,   fin1?.fxConsensus),
        rev2FY:    applyFx(fin2?.revenue,   fin2?.fxConsensus),
        ebitda1FY: applyFx(fin1?.ebitda,    fin1?.fxConsensus),
        ebitda2FY: applyFx(fin2?.ebitda,    fin2?.fxConsensus),
        ni1FY:     applyFx(fin1?.netIncome, fin1?.fxConsensus),
        ni2FY:     applyFx(fin2?.netIncome, fin2?.fxConsensus),
      };
      const rawConsensus = {
        rev1FY:    getCon("REVENUE",    String(year1FY)),
        rev2FY:    getCon("REVENUE",    String(year2FY)),
        ebitda1FY: getCon("EBITDA",     String(year1FY)),
        ebitda2FY: getCon("EBITDA",     String(year2FY)),
        ni1FY:     getCon("NET_INCOME", String(year1FY)),
        ni2FY:     getCon("NET_INCOME", String(year2FY)),
      };

      return {
        ticker:     h.ticker,
        updateDate: h.updateDate.toISOString().slice(0, 10),
        analyst:    h.analyst ?? null,
        recc:       h.recc   ?? null,
        tp,
        upside,
        upsideModel,
        thesis:     h.thesis ?? null,
        ...eiFor(h.ticker),
        unit:       h.unit ?? null,
        moneda,
        consensus: scaledConsensus(moneda, rawConsensus),
      };
    });

    // Bank model values are stored raw; divide by 1000 so they share the company
    // "Moneda" scale (consensus is divided by 1000 on the client). Banks have no EBITDA.
    const k1000 = (v: number | null | undefined): number | null => (v == null ? null : v / 1000);

    const bankRows: ConsensusCheckRow[] = latestBankHeaders.map((h) => {
      const fin1 = bankFinMap.get(`${h.ticker}::${year1FY}`);
      const fin2 = bankFinMap.get(`${h.ticker}::${year2FY}`);
      const getCon = (metric: string, period: string) =>
        conMap.get(`${normTicker(h.ticker)}::${metric.toUpperCase()}::${period}`) ?? null;

      const price       = priceMap.get(normTicker(h.ticker)) ?? null;     // px_last más reciente (live)
      const modelPrice  = modelPriceMap.get(normTicker(h.ticker))         // precio de referencia (mayor año ≤ year1FY)
                        ?? fin1?.sharePrice ?? fin2?.sharePrice ?? null;   // fallback: años proyectados
      const tp          = h.tp ?? null;
      const upside      = tp && price      ? tp / price      - 1 : null;  // vs precio actual
      const upsideModel = tp && modelPrice ? tp / modelPrice - 1 : null;  // upside del analista al hacer el modelo

      const moneda = {
        rev1FY:    k1000(fin1?.revenue),
        rev2FY:    k1000(fin2?.revenue),
        ebitda1FY: null,
        ebitda2FY: null,
        ni1FY:     k1000(fin1?.netIncome),
        ni2FY:     k1000(fin2?.netIncome),
      };
      const rawConsensus = {
        rev1FY:    getCon("REVENUE",    String(year1FY)),
        rev2FY:    getCon("REVENUE",    String(year2FY)),
        ebitda1FY: getCon("EBITDA",     String(year1FY)),
        ebitda2FY: getCon("EBITDA",     String(year2FY)),
        ni1FY:     getCon("NET_INCOME", String(year1FY)),
        ni2FY:     getCon("NET_INCOME", String(year2FY)),
      };

      return {
        ticker:     h.ticker,
        updateDate: h.updateDate.toISOString().slice(0, 10),
        analyst:    h.analyst ?? null,
        recc:       h.recc   ?? null,
        tp,
        upside,
        upsideModel,
        thesis:     h.thesis ?? null,
        ...eiFor(h.ticker),
        unit:       null,   // los bancos no tienen columna unit
        moneda,
        consensus: scaledConsensus(moneda, rawConsensus),
      };
    });

    const rows = [...companyRows, ...bankRows];

    return NextResponse.json({ rows, year1FY, year2FY, pricesAsOf } satisfies ConsensusCheckPayload);
  } catch (e) {
    console.error("[consensus-check]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
