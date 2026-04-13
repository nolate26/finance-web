import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── Type for Prisma row ───────────────────────────────────────────────────────
type PrismaRow = Awaited<
  ReturnType<typeof prisma.ssUniverse.findMany>
>[number];

/**
 * Re-maps a Prisma SsUniverse row back to the legacy CSV-keyed shape
 * matching EXACTLY the strict 40 columns left in the database.
 */
function toFrontendRow(r: PrismaRow): Record<string, unknown> {
  return {
    company:        r.company,
    mrv_vs_ipsa:    r.mrvVsIpsa,
    price:          r.price,
    
    // Returns
    ret_1m:         r.ret1m,
    ret_ytd:        r.retYtd,
    ret_1y:         r.ret1y,
    ret_5y:         r.ret5y,
    
    // Balance sheet
    mkt_cap_bn:     r.mktCapBn,
    net_debt:       r.netDebt,
    FV:             r.fv,          // uppercase F matches legacy components
    
    // EBITDA
    ebitda_prev:    r.ebitdaPrev,
    ebitda_act:     r.ebitdaAct,
    ebitda_chg:     r.ebitdaChg,
    ebitda_ltm:     r.ebitdaLtm,
    ebitda_yr1e:    r.ebitdaYr1e,
    ebitda_yr2e:    r.ebitdaYr2e,
    
    // Net income
    net_income_prev: r.netIncomePrev,
    net_income_act:  r.netIncomeAct,
    net_income_chg:  r.netIncomeChg,
    ni_ltm:          r.niLtm,
    ni_yr1e:         r.niYr1e,
    ni_yr2e:         r.niYr2e,
    
    // FV/EBITDA multiples
    fv_ebitda_ltm:  r.fvEbitdaLtm,
    fv_ebitda_yr1e: r.fvEbitdaYr1e,
    fv_ebitda_yr2e: r.fvEbitdaYr2e,
    
    // P/E
    pe_ltm:         r.peLtm,
    pe_yr1e:        r.peYr1e,
    pe_yr2e:        r.peYr2e,
    
    // Other valuation ratios
    p_ce_ltm:       r.pCeLtm,
    p_bv_ltm:       r.pBvLtm,
    roe_ltm:        r.roeLtm,
    roe_yr1e:       r.roeYr1e,
    fv_s_ltm:       r.fvSLtm,
    roic_ltm:       r.roicLtm,
    fv_ic:          r.fvIc,
    
    // Dividends & Recommendations
    pool_div:       r.poolDiv,
    div_yield:      r.divYield,
    recommendation: r.recommendation,
    
    // Target
    target_price:   r.targetPrice,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sectorFilter = searchParams.get("sector");
  const searchFilter = searchParams.get("search");

  try {
    // ── Find the most recent cierre_cartera ───────────────────────────────────
    const [latest, allIndustries] = await Promise.all([
      prisma.ssUniverse.findFirst({
        orderBy: { cierreCartera: "desc" },
        select: { cierreCartera: true, precios: true, resultados: true },
      }),
      // Load full table so we can replicate the fondos dual-lookup pattern
      prisma.empresasIndustrias.findMany(),
    ]);

    if (!latest) {
      return NextResponse.json(
        { error: "No stock selection data found" },
        { status: 404 }
      );
    }

    // ── Build industry lookups ────────────────────────────────────────────────
    const chileByChile = new Map<string, string>(); // nombre_chile.lower → industria_chile
    const chileByLatam = new Map<string, string>(); // nombre_latam.lower → industria_chile
    for (const ind of allIndustries) {
      const latamKey = ind.nombreLatam.toLowerCase().trim();
      if (ind.industriaChile) {
        if (ind.nombreChile) chileByChile.set(ind.nombreChile.toLowerCase().trim(), ind.industriaChile);
        chileByLatam.set(latamKey, ind.industriaChile);
      }
    }

    const latestDate = latest.cierreCartera;

    // ── Query indices and companies for the latest snapshot ───────────────────
    const [indicesRaw, companiesRaw] = await Promise.all([
      prisma.ssUniverse.findMany({
        where: { cierreCartera: latestDate, recordType: "index" },
        orderBy: { company: "asc" },
      }),
      prisma.ssUniverse.findMany({
        where: { cierreCartera: latestDate, recordType: "company" },
        orderBy: { mktCapBn: "desc" },
      }),
    ]);

    // ── Map to legacy CSV-keyed shape (+ industria) ───────────────────────────
    type EnrichedRow = Record<string, unknown> & {
      industria: string | null;
    };

    const addIndustry = (row: ReturnType<typeof toFrontendRow>): EnrichedRow => {
      const key = String(row.company ?? "").toLowerCase().trim();
      const industria = chileByChile.get(key) ?? chileByLatam.get(key) ?? null;
      return { ...row, industria };
    };

    const indices = indicesRaw.map((r) => addIndustry(toFrontendRow(r)));
    let companies = companiesRaw.map((r) => addIndustry(toFrontendRow(r)));

    // ── Server-side filters ───────────────────────────────────────────────────
    // NOTA: Como eliminamos la columna "sector" de la BDD, ahora el filtro
    // se aplica sobre la propiedad "industria" que inyectamos arriba.
    if (sectorFilter) {
      companies = companies.filter((c) => c.industria === sectorFilter);
    }
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      companies = companies.filter((c) =>
        String(c.company ?? "").toLowerCase().includes(q)
      );
    }

    // ── Build metadata object ─────────────────────────────────────────────────
    const metadata = {
      cierre_cartera: latestDate.toISOString().split("T")[0],
      precios:        latest.precios ?? "",
      resultados:     latest.resultados ?? "",
    };

    return NextResponse.json({ metadata, indices, companies });
  } catch (err) {
    console.error("Chile stock-selection API error:", err);
    return NextResponse.json(
      { error: "Failed to read stock selection data" },
      { status: 500 }
    );
  }
}