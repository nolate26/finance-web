import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ModelKind } from "@/lib/extractMetrics";

export const dynamic = "force-dynamic";

/**
 * GET /api/extract/universe
 *
 * Empresas que tienen modelo cargado (empresa o banco), con lo que necesitan los
 * filtros de Extract Data: país, sector, tipo de modelo, fecha del último snapshot.
 * Una empresa presente en model_headers nunca se trata como banco (misma regla que
 * /api/latam/consensus-check). País/sector salen de empresas_industrias_v2; si el
 * ticker no está en la maestra igual se lista, con esos campos en null.
 */
export interface ExtractCompany {
  ticker:     string;
  name:       string;
  country:    string | null;   // country_risk (CL, BR, MX…)
  industry:   string | null;   // industria_gics
  kind:       ModelKind;
  updateDate: string;          // último snapshot del modelo (YYYY-MM-DD)
  analyst:    string | null;
  yearMin:    number | null;
  yearMax:    number | null;
}

export interface ExtractUniversePayload {
  companies:      ExtractCompany[];
  countries:      string[];
  industries:     string[];
  /** Años con consenso Bloomberg cargado (consensus_estimates.period). */
  consensusYears: number[];
}

const normTicker = (t: string) => t.trim().toUpperCase();

export async function GET() {
  try {
    const [companyHeaders, bankHeadersRaw, empresas, companyYears, bankYears, periods] = await Promise.all([
      prisma.modelHeader.findMany({
        distinct: ["ticker"],
        orderBy:  { updateDate: "desc" },
        select:   { ticker: true, updateDate: true, analyst: true },
      }),
      prisma.bankHeader.findMany({
        distinct: ["ticker"],
        orderBy:  { updateDate: "desc" },
        select:   { ticker: true, updateDate: true, analyst: true },
      }),
      prisma.empresasIndustriasV2.findMany({
        select: { tickerBloomberg: true, nombreLatam: true, countryRisk: true, industriaGics: true },
      }),
      // Rango de años por ticker (sobre TODOS los snapshots: el último siempre está incluido).
      prisma.modelFinancials.groupBy({ by: ["ticker"], _min: { year: true }, _max: { year: true } }),
      prisma.bankFinancials.groupBy({ by: ["ticker"], _min: { year: true }, _max: { year: true } }),
      prisma.consensusEstimate.findMany({ distinct: ["period"], select: { period: true } }),
    ]);

    const companySet  = new Set(companyHeaders.map((h) => normTicker(h.ticker)));
    const bankHeaders = bankHeadersRaw.filter((b) => !companySet.has(normTicker(b.ticker)));

    const eiMap = new Map<string, { name: string; country: string | null; industry: string | null }>();
    for (const e of empresas) {
      if (!e.tickerBloomberg) continue;
      eiMap.set(normTicker(e.tickerBloomberg), {
        name:     e.nombreLatam,
        country:  e.countryRisk   || null,
        industry: e.industriaGics || null,
      });
    }

    const yearsMap = new Map<string, { min: number | null; max: number | null }>();
    for (const y of [...companyYears, ...bankYears]) {
      yearsMap.set(normTicker(y.ticker), { min: y._min.year, max: y._max.year });
    }

    const toRow = (h: { ticker: string; updateDate: Date; analyst: string | null }, kind: ModelKind): ExtractCompany => {
      const key = normTicker(h.ticker);
      const ei  = eiMap.get(key);
      const yr  = yearsMap.get(key);
      return {
        ticker:     h.ticker,
        name:       ei?.name ?? h.ticker.replace(/ EQUITY$/i, ""),
        country:    ei?.country  ?? null,
        industry:   ei?.industry ?? null,
        kind,
        updateDate: h.updateDate.toISOString().slice(0, 10),
        analyst:    h.analyst ?? null,
        yearMin:    yr?.min ?? null,
        yearMax:    yr?.max ?? null,
      };
    };

    const companies = [
      ...companyHeaders.map((h) => toRow(h, "company")),
      ...bankHeaders.map((h)    => toRow(h, "bank")),
    ].sort((a, b) => a.name.localeCompare(b.name));

    const uniq = (xs: (string | null)[]) => Array.from(new Set(xs.filter(Boolean) as string[])).sort();

    return NextResponse.json({
      companies,
      countries:      uniq(companies.map((c) => c.country)),
      industries:     uniq(companies.map((c) => c.industry)),
      consensusYears: periods.map((p) => Number(p.period)).filter(Number.isInteger).sort((a, b) => a - b),
    } satisfies ExtractUniversePayload);
  } catch (e) {
    console.error("[extract/universe]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
