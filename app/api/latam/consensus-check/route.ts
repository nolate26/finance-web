import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface ConsensusCheckRow {
  ticker:     string;
  updateDate: string;
  analyst:    string | null;
  recc:       string | null;
  tp:         number | null;
  upside:     number | null;
  thesis:     string | null;
  country:    string | null;   // empresas_industrias_v2.country_risk (AR, BR, CL, …)
  industry:   string | null;   // empresas_industrias_v2.industria_gics
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
  rows:    ConsensusCheckRow[];
  year1FY: number;
  year2FY: number;
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
        select:   { ticker: true, updateDate: true, analyst: true, recc: true, tp: true, thesis: true },
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
      return NextResponse.json({ rows: [], year1FY, year2FY } satisfies ConsensusCheckPayload);
    }

    // Financials for each ticker's latest snapshot, for year1FY and year2FY.
    const [financials, bankFinancials, consensusRows, empresas] = await Promise.all([
      latestHeaders.length
        ? prisma.modelFinancials.findMany({
            where: {
              OR: latestHeaders.map((h) => ({
                ticker: h.ticker, updateDate: h.updateDate, year: { in: [year1FY, year2FY] },
              })),
            },
            select: { ticker: true, year: true, revenue: true, ebitda: true, netIncome: true, sharePrice: true },
          })
        : Promise.resolve([] as { ticker: string; year: number; revenue: number | null; ebitda: number | null; netIncome: number | null; sharePrice: number | null }[]),
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
    ]);

    // ei: UPPER(ticker) → { country, industry } (match case-insensitive).
    const eiMap = new Map<string, { country: string | null; industry: string | null }>();
    for (const e of empresas) {
      if (!e.tickerBloomberg) continue;
      eiMap.set(e.tickerBloomberg.toUpperCase(), {
        country:  e.countryRisk   || null,
        industry: e.industriaGics || null,
      });
    }
    const eiFor = (ticker: string) => eiMap.get(ticker.toUpperCase()) ?? { country: null, industry: null };

    // financials: (ticker, year) → company model values (already in consensus/1000 scale)
    const finMap = new Map<string, { revenue: number | null; ebitda: number | null; netIncome: number | null; sharePrice: number | null }>();
    for (const f of financials) {
      finMap.set(`${f.ticker}::${f.year}`, {
        revenue:    f.revenue    ?? null,
        ebitda:     f.ebitda     ?? null,
        netIncome:  f.netIncome  ?? null,
        sharePrice: f.sharePrice ?? null,
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
      const key = `${r.ticker.toUpperCase()}::${r.metric.toUpperCase()}::${r.period}`;
      if (!seenCon.has(key)) {
        seenCon.add(key);
        conMap.set(key, r.value);
      }
    }

    const companyRows: ConsensusCheckRow[] = latestHeaders.map((h) => {
      const fin1 = finMap.get(`${h.ticker}::${year1FY}`);
      const fin2 = finMap.get(`${h.ticker}::${year2FY}`);
      const getCon = (metric: string, period: string) =>
        conMap.get(`${h.ticker.toUpperCase()}::${metric.toUpperCase()}::${period}`) ?? null;

      const price  = fin1?.sharePrice ?? fin2?.sharePrice ?? null;
      const tp     = h.tp ?? null;
      const upside = tp && price ? tp / price - 1 : null;

      const moneda = {
        rev1FY:    fin1?.revenue   ?? null,
        rev2FY:    fin2?.revenue   ?? null,
        ebitda1FY: fin1?.ebitda    ?? null,
        ebitda2FY: fin2?.ebitda    ?? null,
        ni1FY:     fin1?.netIncome ?? null,
        ni2FY:     fin2?.netIncome ?? null,
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
        thesis:     h.thesis ?? null,
        ...eiFor(h.ticker),
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
        conMap.get(`${h.ticker.toUpperCase()}::${metric.toUpperCase()}::${period}`) ?? null;

      const price  = fin1?.sharePrice ?? fin2?.sharePrice ?? null;
      const tp     = h.tp ?? null;
      const upside = tp && price ? tp / price - 1 : null;

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
        thesis:     h.thesis ?? null,
        ...eiFor(h.ticker),
        moneda,
        consensus: scaledConsensus(moneda, rawConsensus),
      };
    });

    const rows = [...companyRows, ...bankRows];

    return NextResponse.json({ rows, year1FY, year2FY } satisfies ConsensusCheckPayload);
  } catch (e) {
    console.error("[consensus-check]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
