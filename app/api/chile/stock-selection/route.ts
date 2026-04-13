import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── Type for Prisma row ───────────────────────────────────────────────────────
// ssUniverse returns camelCase fields; we need to re-key to the exact strings
// the frontend expects (matching original CSV column headers/new relative names).

type PrismaRow = Awaited<
  ReturnType<typeof prisma.ssUniverse.findMany>
>[number];

/**
 * Re-maps a Prisma SsUniverse row back to the legacy CSV-keyed shape.
 *
 * Critical differences:
 * fv            → "FV"             (CSV header was uppercase)
 * fvEbitda* → "Fv_ebitda_*"    (CSV header used mixed case)
 * camelCase #s  → snake_case keys  (every other numeric field)
 */
function toFrontendRow(r: PrismaRow): Record<string, unknown> {
  return {
    company:           r.company,
    sector:            r.sector,
    recommendation:    r.recommendation,
    rec_date:          r.recDate,
    div_policy:        r.divPolicy,
    target_price:      r.targetPrice,
    price:             r.price,
    pio_vs_igpa_mc_sc: r.pioVsIgpaMcSc,
    mrv_vs_ipsa:       r.mrvVsIpsa,

    // Returns
    ret_1m:   r.ret1m,
    ret_ytd:  r.retYtd,
    ret_1y:   r.ret1y,
    ret_5y:   r.ret5y,

    // Balance sheet
    mkt_cap_bn: r.mktCapBn,
    net_debt:   r.netDebt,
    FV:         r.fv,          // ← uppercase — CompanyTable uses c.FV

    // EBITDA (Nombres relativos actualizados)
    ebitda_prev:  r.ebitdaPrev,
    ebitda_ltm:   r.ebitdaLtm,
    ebitda_ltm_b: r.ebitdaLtmB,
    ebitda_ltm2:  r.ebitdaLtm2,
    ebitda_chg:   r.ebitdaChg,
    ebitda_yr1e:  r.ebitdaYr1e,
    ebitda_yr2e:  r.ebitdaYr2e,
    ebitda_yr3e:  r.ebitdaYr3e,

    // Net income (Nombres relativos actualizados)
    net_income_prev: r.netIncomePrev,
    net_income_ltm:  r.netIncomeLtm,
    net_income_chg:  r.netIncomeChg,

    // FV/EBITDA multiples — capital "F" matches original CSV & IndicesTable/CompanyTable keys
    Fv_ebitda_yr0:  r.fvEbitdaYr0,
    Fv_ebitda_ltm:  r.fvEbitdaLtm,
    Fv_ebitda_yr1e: r.fvEbitdaYr1e,
    Fv_ebitda_yr2e: r.fvEbitdaYr2e,
    Fv_ebitda_yr3e: r.fvEbitdaYr3e,

    // NI
    ni_yr0:  r.niYr0,
    ni_ltm:  r.niLtm,
    ni_yr1e: r.niYr1e,
    ni_yr2e: r.niYr2e,
    ni_yr3e: r.niYr3e,

    // P/E
    pe_yr0:   r.peYr0,
    pe_ltm:   r.peLtm,
    pe_yr1e:  r.peYr1e,
    pe_yr2e:  r.peYr2e,
    pe_yr3e:  r.peYr3e,
    peg_yr2e: r.pegYr2e,

    // Other valuation ratios
    p_ce_ltm:     r.pCeLtm,
    p_bv_ltm:     r.pBvLtm,
    roe_ltm:      r.roeLtm,
    roe_yr1e:     r.roeYr1e,
    roe_yr2e:     r.roeYr2e,
    fv_s_ltm:     r.fvSLtm,
    fv_ic_ltm:    r.fvIcLtm,
    leverage_ltm: r.leverageLtm,
    roic_ltm:     r.roicLtm,

    // Dividend yields
    div_yield_yr2e:   r.divYieldYr2e,
    div_yield_yr2e_b: r.divYieldYr2eB,
    div_yield_ltm:    r.divYieldLtm,
    div_yield_lagged: r.divYieldLagged,
    div_yield_hist:   r.divYieldHist,
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

    // ── Build industry lookups (same approach as fondos/route.ts) ─────────────
    // Chile companies: try nombre_chile first, fall back to nombre_latam.
    // Both keys resolve to industria_chile.
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

    // ── Map to legacy CSV-keyed shape (+ industria_chile) ────────────────────────
    // Try nombre_chile key first, then nombre_latam fallback — same as fondos API.
    //
    // We explicitly re-declare `sector` in the return type so TypeScript knows the
    // property exists after spreading Record<string,unknown> (spreading an index
    // signature loses named properties in the inferred type).
    type EnrichedRow = Record<string, unknown> & {
      sector: string | null;
      industria: string | null;
    };

    const addIndustry = (row: ReturnType<typeof toFrontendRow>): EnrichedRow => {
      const key = String(row.company ?? "").toLowerCase().trim();
      const industria = chileByChile.get(key) ?? chileByLatam.get(key) ?? null;
      const sector = (row.sector as string | null) ?? null;
      return { ...row, sector, industria };
    };

    const indices = indicesRaw.map((r) => addIndustry(toFrontendRow(r)));
    let companies = companiesRaw.map((r) => addIndustry(toFrontendRow(r)));

    // ── Optional server-side filters (kept for API backward-compatibility) ────
    if (sectorFilter) {
      companies = companies.filter((c) => c.sector === sectorFilter);
    }
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      companies = companies.filter((c) =>
        String(c.company ?? "").toLowerCase().includes(q)
      );
    }

    // ── Build metadata object (same shape as before) ──────────────────────────
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