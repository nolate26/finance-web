import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeTicker } from "@/lib/issuer";

export const dynamic = "force-dynamic";

// ── Config ────────────────────────────────────────────────────────────────────

const DISPLAY_NAMES: Record<string, string> = {
  Moneda_Renta_Variable:                 "MRV",
  "Moneda_Latin_America_Equities_(LX)":  "LA Equities (LX)",
  "Moneda_Latin_America_Small_Cap_(LX)": "LA Small Cap (LX)",
  Pionero: "Pionero",
  Orange:  "Orange",
  Glory:   "Glory",
  Mercer:  "Mercer",
};

const CHILE_FUNDS = new Set(["Pionero", "Moneda_Renta_Variable", "Orange"]);

// ── Types (frontend contract) ─────────────────────────────────────────────────

export interface FactorExposure {
  factor:            string;
  /** Σ (portfolio_weight × beta) */
  portfolioBeta:     number;
  /** Σ (benchmark_weight × beta) */
  benchmarkBeta:     number;
  /** portfolioBeta − benchmarkBeta */
  activeBeta:        number;
  /** Portfolio weight carrying a beta for this factor — decimal (0.92 = 92 %) */
  portfolioCoverage: number;
  /** Benchmark weight carrying a beta for this factor — decimal */
  benchmarkCoverage: number;
  /** Positions contributing to this factor */
  nPositions:        number;
}

export interface UnmappedPosition {
  company:         string;
  portfolioWeight: number;
  benchmarkWeight: number;
  /** no_ticker → missing in empresas_industrias_v2 · no_beta → ticker exists, no beta rows */
  reason:          "no_ticker" | "no_beta";
}

/** Holding whose beta is the average across several listings (ADR + share classes) */
export interface BlendedPosition {
  company:   string;
  nListings: number;
  tickers:   string;
}

/** Beta discarded by the outlier guard — a broken regression, not a real loading */
export interface ExcludedBeta {
  company: string;
  ticker:  string;
  factor:  string;
  beta:    number;
}

export interface BetaExposurePayload {
  fundName:      string;
  displayName:   string;
  benchmarkName: string;
  reportDate:    string;
  /** Latest calculation_date across the betas used */
  betaAsOf:      string | null;
  factors:       FactorExposure[];
  coverage: {
    nHoldings:        number;
    nCovered:         number;
    portfolioWeight:  number;   // Σ portfolio_weight of all rows
    benchmarkWeight:  number;   // Σ benchmark_weight of all rows
    portfolioCovered: number;   // Σ portfolio_weight of rows with ≥1 beta
    benchmarkCovered: number;   // Σ benchmark_weight of rows with ≥1 beta
  };
  unmapped:      UnmappedPosition[];
  blended:       BlendedPosition[];
  /** Outlier guard: betas with |β| above this were dropped (0 = guard off) */
  maxAbsBeta:    number;
  excluded:      ExcludedBeta[];
}

/** One listing (ADR / share class) behind a holding, for a given factor */
export interface ListingBeta {
  ticker:   string;
  beta:     number;
  /** Dropped by the user's ticker exclusions, or by the |β| outlier guard */
  excluded: boolean;
  /** True when it was the guard, not the user, that dropped it */
  outlier:  boolean;
}

/** Per-position contribution to one factor's exposure */
export interface PositionExposure {
  company:            string;
  /** Beta actually used = mean of the non-excluded listings */
  beta:               number | null;
  portfolioWeight:    number;
  benchmarkWeight:    number;
  activeWeight:       number;
  /** w_p × β — this row's share of the portfolio beta */
  portfolioContrib:   number;
  /** w_b × β */
  benchmarkContrib:   number;
  /** (w_p − w_b) × β — this row's share of the active beta */
  activeContrib:      number;
  listings:           ListingBeta[];
}

export interface FactorDetailPayload {
  fundName:   string;
  reportDate: string;
  factor:     string;
  positions:  PositionExposure[];
  totals: {
    portfolioBeta: number;
    benchmarkBeta: number;
    activeBeta:    number;
  };
}

/** One company's numbers for a single factor, in the all-factors export */
export interface CellExposure {
  beta:             number | null;
  portfolioContrib: number;
  benchmarkContrib: number;
  activeContrib:    number;
  tickersUsed:      string;
}

export interface CompanyExposureRow {
  company:         string;
  portfolioWeight: number;
  benchmarkWeight: number;
  activeWeight:    number;
  byFactor:        Record<string, CellExposure>;
}

/** `?factor=*` — every position against every factor, for the Excel export */
export interface AllFactorsDetailPayload {
  fundName:   string;
  reportDate: string;
  factors:    string[];
  rows:       CompanyExposureRow[];
  totals:     Record<string, { portfolioBeta: number; benchmarkBeta: number; activeBeta: number }>;
}

export interface FundOption {
  fundName:    string;
  displayName: string;
  region:      "Chile" | "LATAM";
  dates:       string[];        // ISO, most recent first
}

export interface BetaExposureFundsPayload {
  funds: FundOption[];
}

/** `?bootstrap=1` — catalogue + the default fund's exposure, in one response */
export type BetaExposureBootstrapPayload = BetaExposurePayload & { funds: FundOption[] };

// ── Raw query rows ────────────────────────────────────────────────────────────

interface FactorRow {
  factor:      string;
  port_beta:   number | string | null;
  bench_beta:  number | string | null;
  cov_w_p:     number | string | null;
  cov_w_b:     number | string | null;
  n_positions: number;
  calc_date:   Date | string | null;
}

interface PositionRow {
  company:      string;
  w_p:          number | string | null;
  w_b:          number | string | null;
  benchmark:    string | null;
  n_listings:   number;
  n_with_beta:  number;
  beta_tickers: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toDateStr = (v: Date | string | null): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

// ── Outlier guard ─────────────────────────────────────────────────────────────
//
// A handful of illiquid / stale-priced listings come back from the upstream
// regression with |β| in the hundreds (e.g. COSH NO at −511 vs CTTWBUSL_FX).
// Those are broken fits, not risk loadings, and a single 0.5 % position with
// β = −511 swamps every other name in the sum-product. Anything beyond ±10 is
// well outside a plausible equity loading on these factors, so it is dropped
// by default — and reported back so the exclusion is never silent.
const DEFAULT_MAX_ABS_BETA = 10;
const NO_LIMIT = 1e9;

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fundName   = searchParams.get("fundName");
  const reportDate = searchParams.get("reportDate");

  // ?maxAbsBeta=0 turns the guard off and keeps every beta as stored
  const rawMax = searchParams.get("maxAbsBeta");
  const maxAbsBeta =
    rawMax === null ? DEFAULT_MAX_ABS_BETA
                    : Number.isFinite(Number(rawMax)) && Number(rawMax) >= 0 ? Number(rawMax)
                    : DEFAULT_MAX_ABS_BETA;
  const betaLimit = maxAbsBeta > 0 ? maxAbsBeta : NO_LIMIT;

  // ?excludeTickers=PBR US Equity,SQM/A CI Equity — listings the user dropped
  // from a blended name. Applied everywhere so the headline numbers, the
  // drill-down and the export can never disagree.
  const dropped = (searchParams.get("excludeTickers") ?? "")
    .split(",")
    .map(normalizeTicker)
    .filter(Boolean);

  // ?factor=USDCLP switches to the per-position drill-down for that factor
  const factorParam = searchParams.get("factor");

  // ?bootstrap=1 returns the fund catalogue AND the default fund's exposure in
  // a single response, so first paint costs one round trip instead of two.
  const bootstrap = searchParams.get("bootstrap") === "1" && !fundName;

  try {
    // ── Mode 1: dropdown catalogue (fund → available report dates) ──────────
    //
    // Raw DISTINCT, not prisma.findMany({ distinct }) — the Prisma variant
    // de-duplicates in the client, so it drags all ~19 k weight rows over the
    // wire to hand back ~213 pairs. Against a remote database that is ~150 ms
    // of pure transfer for nothing.
    if (!fundName || bootstrap) {
      const distinct = await prisma.$queryRaw<{ fund_name: string; report_date: Date | string }[]>`
        SELECT DISTINCT fund_name, report_date
        FROM fund_portfolio_weights
        ORDER BY fund_name ASC, report_date DESC
      `;

      const byFund = new Map<string, string[]>();
      for (const r of distinct) {
        const list = byFund.get(r.fund_name) ?? [];
        list.push(toDateStr(r.report_date)!);
        byFund.set(r.fund_name, list);
      }

      const funds: FundOption[] = Array.from(byFund.entries()).map(([name, dates]) => ({
        fundName:    name,
        displayName: DISPLAY_NAMES[name] ?? name.replace(/_/g, " "),
        region:      CHILE_FUNDS.has(name) ? "Chile" : "LATAM",
        dates:       dates.sort((a, b) => b.localeCompare(a)),
      }));

      // Plain catalogue request
      if (!bootstrap) {
        const payload: BetaExposureFundsPayload = { funds };
        return NextResponse.json(payload);
      }

      // Bootstrap: resolve the default selection here and return the catalogue
      // together with its exposure, so the panel opens in one round trip
      // instead of catalogue-then-exposure.
      const first = funds.find((f) => f.region === "LATAM") ?? funds[0];
      if (!first) {
        return NextResponse.json({ error: "No funds available" }, { status: 404 });
      }
      const exposure = await buildExposure(
        first.fundName, first.dates[0], betaLimit, maxAbsBeta, dropped
      );
      if ("error" in exposure) {
        return NextResponse.json({ funds, ...exposure }, { status: 404 });
      }
      return NextResponse.json({ funds, ...exposure } satisfies BetaExposureBootstrapPayload);
    }

    // ── Resolve report date (default: latest available for the fund) ────────
    let dateStr = reportDate ?? "";
    if (dateStr && !isIsoDate(dateStr)) {
      return NextResponse.json({ error: "reportDate must be YYYY-MM-DD" }, { status: 400 });
    }
    if (!dateStr) {
      const latest = await prisma.fundPortfolioWeight.findFirst({
        where:   { fundName },
        select:  { reportDate: true },
        orderBy: { reportDate: "desc" },
      });
      if (!latest) {
        return NextResponse.json({ error: `No holdings found for fund '${fundName}'` }, { status: 404 });
      }
      dateStr = latest.reportDate.toISOString().slice(0, 10);
    }

    // ── Mode 4: `factor=*` — every position × every factor, for the export ──
    // Same collapse rules as everywhere else, but pivoted company × factor so
    // the workbook can carry the full drill-down instead of just the open tab.
    if (factorParam === "*") {
      const rows = await prisma.$queryRaw<{
        company: string;
        w_p: number | string | null;
        w_b: number | string | null;
        factor: string;
        beta: number | string | null;
        tickers_used: string | null;
      }[]>`
        WITH holdings AS (
          SELECT
            fpw.company                       AS company,
            LOWER(TRIM(fpw.company))          AS name_key,
            COALESCE(fpw.portfolio_weight, 0) AS w_p,
            COALESCE(fpw.benchmark_weight, 0) AS w_b
          FROM fund_portfolio_weights fpw
          WHERE fpw.fund_name   = ${fundName}
            AND fpw.report_date = ${dateStr}::date
        ),
        listing_beta AS (
          SELECT
            LOWER(TRIM(ei.nombre_latam)) AS name_key,
            ei.ticker_bloomberg          AS ticker,
            bs.factor                    AS factor,
            bs.beta                      AS beta,
            ABS(bs.beta) > ${betaLimit}                        AS outlier,
            ei.ticker_bloomberg = ANY(${dropped}) AS user_dropped
          FROM empresas_industrias_v2 ei
          JOIN beta_sensitivity bs
            ON bs.company = ei.ticker_bloomberg
          WHERE ei.nombre_latam     IS NOT NULL AND ei.nombre_latam     <> ''
            AND ei.ticker_bloomberg IS NOT NULL AND ei.ticker_bloomberg <> ''
        )
        SELECT
          h.company   AS company,
          h.w_p       AS w_p,
          h.w_b       AS w_b,
          lb.factor   AS factor,
          AVG(lb.beta) FILTER (WHERE NOT lb.outlier AND NOT lb.user_dropped) AS beta,
          STRING_AGG(lb.ticker, ', ' ORDER BY lb.ticker)
            FILTER (WHERE NOT lb.outlier AND NOT lb.user_dropped)            AS tickers_used
        FROM holdings h
        JOIN listing_beta lb ON lb.name_key = h.name_key
        GROUP BY h.company, h.w_p, h.w_b, lb.factor
      `;

      const byCompany = new Map<string, CompanyExposureRow>();
      const factorSet = new Set<string>();
      const totals: AllFactorsDetailPayload["totals"] = {};

      for (const r of rows) {
        factorSet.add(r.factor);
        const wp = num(r.w_p);
        const wb = num(r.w_b);

        let row = byCompany.get(r.company);
        if (!row) {
          row = {
            company:         r.company,
            portfolioWeight: wp,
            benchmarkWeight: wb,
            activeWeight:    wp - wb,
            byFactor:        {},
          };
          byCompany.set(r.company, row);
        }

        const beta = r.beta === null ? null : num(r.beta);
        const cell: CellExposure = {
          beta,
          portfolioContrib: beta === null ? 0 : wp * beta,
          benchmarkContrib: beta === null ? 0 : wb * beta,
          activeContrib:    beta === null ? 0 : (wp - wb) * beta,
          tickersUsed:      r.tickers_used ?? "",
        };
        row.byFactor[r.factor] = cell;

        const t = totals[r.factor] ?? { portfolioBeta: 0, benchmarkBeta: 0, activeBeta: 0 };
        t.portfolioBeta += cell.portfolioContrib;
        t.benchmarkBeta += cell.benchmarkContrib;
        t.activeBeta    += cell.activeContrib;
        totals[r.factor] = t;
      }

      // Match the on-screen ordering: biggest absolute exposure first
      const factors = Array.from(factorSet).sort(
        (a, b) => Math.abs(totals[b]?.portfolioBeta ?? 0) - Math.abs(totals[a]?.portfolioBeta ?? 0)
      );

      const payload: AllFactorsDetailPayload = {
        fundName,
        reportDate: dateStr,
        factors,
        rows: Array.from(byCompany.values()).sort((a, b) => b.portfolioWeight - a.portfolioWeight),
        totals,
      };
      return NextResponse.json(payload);
    }

    // ── Mode 3: drill-down — every position behind one factor ───────────────
    // Listings are returned whole (including the excluded ones) so the UI can
    // show what was dropped and let the user put it back.
    if (factorParam) {
      const rows = await prisma.$queryRaw<{
        company: string;
        w_p: number | string | null;
        w_b: number | string | null;
        beta: number | string | null;
        listings: ListingBeta[];
      }[]>`
        WITH holdings AS (
          SELECT
            fpw.company                       AS company,
            LOWER(TRIM(fpw.company))          AS name_key,
            COALESCE(fpw.portfolio_weight, 0) AS w_p,
            COALESCE(fpw.benchmark_weight, 0) AS w_b
          FROM fund_portfolio_weights fpw
          WHERE fpw.fund_name   = ${fundName}
            AND fpw.report_date = ${dateStr}::date
        ),
        listing_beta AS (
          SELECT
            LOWER(TRIM(ei.nombre_latam)) AS name_key,
            ei.ticker_bloomberg          AS ticker,
            bs.beta                      AS beta,
            ABS(bs.beta) > ${betaLimit}                              AS outlier,
            ei.ticker_bloomberg = ANY(${dropped})       AS user_dropped
          FROM empresas_industrias_v2 ei
          JOIN beta_sensitivity bs
            ON bs.company = ei.ticker_bloomberg
          WHERE bs.factor = ${factorParam}
            AND ei.nombre_latam     IS NOT NULL AND ei.nombre_latam     <> ''
            AND ei.ticker_bloomberg IS NOT NULL AND ei.ticker_bloomberg <> ''
        )
        SELECT
          h.company AS company,
          h.w_p     AS w_p,
          h.w_b     AS w_b,
          AVG(lb.beta) FILTER (WHERE NOT lb.outlier AND NOT lb.user_dropped) AS beta,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'ticker',   lb.ticker,
              'beta',     lb.beta,
              'excluded', lb.outlier OR lb.user_dropped,
              'outlier',  lb.outlier
            ) ORDER BY lb.ticker
          ) AS listings
        FROM holdings h
        JOIN listing_beta lb ON lb.name_key = h.name_key
        GROUP BY h.company, h.w_p, h.w_b
      `;

      const positions: PositionExposure[] = rows.map((r) => {
        const wp   = num(r.w_p);
        const wb   = num(r.w_b);
        // null when every listing of this name was excluded
        const beta = r.beta === null ? null : num(r.beta);
        return {
          company:          r.company,
          beta,
          portfolioWeight:  wp,
          benchmarkWeight:  wb,
          activeWeight:     wp - wb,
          portfolioContrib: beta === null ? 0 : wp * beta,
          benchmarkContrib: beta === null ? 0 : wb * beta,
          activeContrib:    beta === null ? 0 : (wp - wb) * beta,
          listings:         r.listings ?? [],
        };
      });

      // Biggest movers of the portfolio number first
      positions.sort((a, b) => Math.abs(b.portfolioContrib) - Math.abs(a.portfolioContrib));

      const portfolioBeta = positions.reduce((s, p) => s + p.portfolioContrib, 0);
      const benchmarkBeta = positions.reduce((s, p) => s + p.benchmarkContrib, 0);

      const detail: FactorDetailPayload = {
        fundName,
        reportDate: dateStr,
        factor:     factorParam,
        positions,
        totals: { portfolioBeta, benchmarkBeta, activeBeta: portfolioBeta - benchmarkBeta },
      };
      return NextResponse.json(detail);
    }

    const exposure = await buildExposure(fundName, dateStr, betaLimit, maxAbsBeta, dropped);
    if ("error" in exposure) {
      return NextResponse.json(exposure, { status: 404 });
    }
    return NextResponse.json(exposure);
  } catch (e) {
    console.error("[latam/beta-exposure]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── Exposure builder ──────────────────────────────────────────────────────────
// Shared by the plain exposure request and the bootstrap response. The three
// queries are independent, so they go out together: against a remote database
// each round trip is ~220 ms, and running them in sequence made the tab feel
// slow for no reason.
async function buildExposure(
  fundName:   string,
  dateStr:    string,
  betaLimit:  number,
  maxAbsBeta: number,
  dropped:    string[]
): Promise<BetaExposurePayload | { error: string }> {
    // ── Query A: factor exposures, aggregated in SQL ────────────────────────
    //
    //   Portfolio_Beta(f) = Σ_i  w_p,i · β_i,f
    //   Benchmark_Beta(f) = Σ_i  w_b,i · β_i,f
    //
    // The sum-product runs in Postgres so only one row per factor crosses the
    // wire, regardless of how many hundreds of positions the fund holds.
    //
    // Join chain: fund_portfolio_weights.company
    //               → empresas_industrias_v2.nombre_latam
    //               → ticker_bloomberg = beta_sensitivity.company
    //
    // ⚠ nombre_latam is NOT unique in empresas_industrias_v2 (682 rows / 551
    // distinct names): ADRs and share classes of one issuer share a name —
    // PETROBRAS maps to PETR3/PETR4/PBR/PBR-A. Joining straight through would
    // count that holding's weight four times and inflate every exposure.
    // The company_beta CTE therefore collapses to ONE beta per (name, factor)
    // by averaging across listings; they track each other closely (mean spread
    // 0.11–0.27 beta by factor), so the blend is stable.
    //
    // beta_sensitivity is keyed on (company, factor), so there is at most one
    // beta per ticker/factor pair — no de-duplication needed on that side.
    const factorRowsP = prisma.$queryRaw<FactorRow[]>`
      WITH holdings AS (
        SELECT
          LOWER(TRIM(fpw.company))          AS name_key,
          COALESCE(fpw.portfolio_weight, 0) AS w_p,
          COALESCE(fpw.benchmark_weight, 0) AS w_b
        FROM fund_portfolio_weights fpw
        WHERE fpw.fund_name   = ${fundName}
          AND fpw.report_date = ${dateStr}::date
      ),
      company_beta AS (
        SELECT
          LOWER(TRIM(ei.nombre_latam)) AS name_key,
          bs.factor                    AS factor,
          AVG(bs.beta)                 AS beta,
          MAX(bs.calculation_date)     AS calc_date
        FROM empresas_industrias_v2 ei
        JOIN beta_sensitivity bs
          ON bs.company = ei.ticker_bloomberg
        WHERE ei.nombre_latam     IS NOT NULL AND ei.nombre_latam     <> ''
          AND ei.ticker_bloomberg IS NOT NULL AND ei.ticker_bloomberg <> ''
          AND ABS(bs.beta) <= ${betaLimit}
          AND NOT (ei.ticker_bloomberg = ANY(${dropped}))
        GROUP BY 1, 2
      )
      SELECT
        cb.factor                    AS factor,
        SUM(h.w_p * cb.beta)         AS port_beta,
        SUM(h.w_b * cb.beta)         AS bench_beta,
        SUM(h.w_p)                   AS cov_w_p,
        SUM(h.w_b)                   AS cov_w_b,
        COUNT(*)::int                AS n_positions,
        MAX(cb.calc_date)            AS calc_date
      FROM holdings h
      JOIN company_beta cb ON cb.name_key = h.name_key
      GROUP BY cb.factor
    `;

    // ── Query B: position-level coverage diagnostics ─────────────────────────
    // One row per holding (tens–hundreds), used to report how much of the
    // portfolio actually carries beta data — without it the exposures above
    // silently understate whenever a name is missing from beta_sensitivity —
    // and which names had their beta blended across multiple listings.
    //
    // `has_beta` comes from a LEFT JOIN against a pre-aggregated ticker set,
    // NOT a correlated EXISTS. The EXISTS form re-scanned beta_sensitivity once
    // per listing (loops=682, ~10 k buffer hits) and cost 560 ms of execution;
    // the hash join does the same work in under 3 ms.
    const positionRowsP = prisma.$queryRaw<PositionRow[]>`
      WITH holdings AS (
        SELECT
          fpw.company                       AS company,
          LOWER(TRIM(fpw.company))          AS name_key,
          COALESCE(fpw.portfolio_weight, 0) AS w_p,
          COALESCE(fpw.benchmark_weight, 0) AS w_b,
          fpw.benchmark_name                AS benchmark
        FROM fund_portfolio_weights fpw
        WHERE fpw.fund_name   = ${fundName}
          AND fpw.report_date = ${dateStr}::date
      ),
      beta_tickers AS (
        SELECT DISTINCT company AS tkey
        FROM beta_sensitivity
        WHERE ABS(beta) <= ${betaLimit}
      ),
      listings AS (
        SELECT
          LOWER(TRIM(ei.nombre_latam)) AS name_key,
          ei.ticker_bloomberg          AS ticker,
          (
            bt.tkey IS NOT NULL
            AND NOT (ei.ticker_bloomberg = ANY(${dropped}))
          )                            AS has_beta
        FROM empresas_industrias_v2 ei
        LEFT JOIN beta_tickers bt
          ON bt.tkey = ei.ticker_bloomberg
        WHERE ei.nombre_latam     IS NOT NULL AND ei.nombre_latam     <> ''
          AND ei.ticker_bloomberg IS NOT NULL AND ei.ticker_bloomberg <> ''
      )
      SELECT
        h.company                                                   AS company,
        h.w_p                                                       AS w_p,
        h.w_b                                                       AS w_b,
        h.benchmark                                                 AS benchmark,
        COUNT(l.ticker)::int                                        AS n_listings,
        COUNT(*) FILTER (WHERE l.has_beta)::int                     AS n_with_beta,
        STRING_AGG(l.ticker, ', ' ORDER BY l.ticker)
          FILTER (WHERE l.has_beta)                                 AS beta_tickers
      FROM holdings h
      LEFT JOIN listings l ON l.name_key = h.name_key
      GROUP BY h.company, h.w_p, h.w_b, h.benchmark
    `;

    // ── Query C: what the outlier guard threw away, for this fund only ───────
    const excludedRowsP = maxAbsBeta > 0
      ? prisma.$queryRaw<{ company: string; ticker: string; factor: string; beta: number | string }[]>`
          SELECT
            ei.nombre_latam     AS company,
            ei.ticker_bloomberg AS ticker,
            bs.factor           AS factor,
            bs.beta             AS beta
          FROM fund_portfolio_weights fpw
          JOIN empresas_industrias_v2 ei
            ON LOWER(TRIM(ei.nombre_latam)) = LOWER(TRIM(fpw.company))
          JOIN beta_sensitivity bs
            ON bs.company = ei.ticker_bloomberg
          WHERE fpw.fund_name   = ${fundName}
            AND fpw.report_date = ${dateStr}::date
            AND ABS(bs.beta) > ${betaLimit}
          ORDER BY ABS(bs.beta) DESC
        `
      : Promise.resolve([]);

    // One round trip's worth of latency instead of three
    const [factorRows, positionRows, excludedRows] = await Promise.all([
      factorRowsP, positionRowsP, excludedRowsP,
    ]);

    if (positionRows.length === 0) {
      return { error: `No holdings for '${fundName}' on ${dateStr}` };
    }

    // ── Coverage ─────────────────────────────────────────────────────────────
    let portfolioWeight = 0, benchmarkWeight = 0;
    let portfolioCovered = 0, benchmarkCovered = 0, nCovered = 0;
    const unmapped: UnmappedPosition[] = [];
    const blended:  BlendedPosition[]  = [];

    for (const r of positionRows) {
      const wp = num(r.w_p);
      const wb = num(r.w_b);
      portfolioWeight += wp;
      benchmarkWeight += wb;

      if (Number(r.n_with_beta) > 0) {
        portfolioCovered += wp;
        benchmarkCovered += wb;
        nCovered += 1;
        if (Number(r.n_with_beta) > 1) {
          blended.push({
            company:   r.company,
            nListings: Number(r.n_with_beta),
            tickers:   r.beta_tickers ?? "",
          });
        }
      } else {
        unmapped.push({
          company:         r.company,
          portfolioWeight: wp,
          benchmarkWeight: wb,
          reason:          Number(r.n_listings) > 0 ? "no_beta" : "no_ticker",
        });
      }
    }

    blended.sort((a, b) => b.nListings - a.nListings || a.company.localeCompare(b.company));

    // Largest gaps first — that is what the user needs to chase down.
    unmapped.sort(
      (a, b) =>
        Math.max(b.portfolioWeight, b.benchmarkWeight) -
        Math.max(a.portfolioWeight, a.benchmarkWeight)
    );

    // ── Assemble factors ─────────────────────────────────────────────────────
    let betaAsOf: string | null = null;
    const factors: FactorExposure[] = factorRows
      .map((r) => {
        const portfolioBeta = num(r.port_beta);
        const benchmarkBeta = num(r.bench_beta);
        const d = toDateStr(r.calc_date);
        if (d && (betaAsOf === null || d > betaAsOf)) betaAsOf = d;
        return {
          factor:            r.factor,
          portfolioBeta,
          benchmarkBeta,
          activeBeta:        portfolioBeta - benchmarkBeta,
          portfolioCoverage: portfolioWeight > 0 ? num(r.cov_w_p) / portfolioWeight : 0,
          benchmarkCoverage: benchmarkWeight > 0 ? num(r.cov_w_b) / benchmarkWeight : 0,
          nPositions:        Number(r.n_positions),
        };
      })
      // Most material exposures first
      .sort((a, b) => Math.abs(b.portfolioBeta) - Math.abs(a.portfolioBeta));

    const benchmarkName =
      positionRows.find((r) => r.benchmark)?.benchmark ?? "Benchmark";

    const payload: BetaExposurePayload = {
      fundName,
      displayName: DISPLAY_NAMES[fundName] ?? fundName.replace(/_/g, " "),
      benchmarkName,
      reportDate:  dateStr,
      betaAsOf,
      factors,
      coverage: {
        nHoldings: positionRows.length,
        nCovered,
        portfolioWeight,
        benchmarkWeight,
        portfolioCovered,
        benchmarkCovered,
      },
      unmapped: unmapped.slice(0, 20),
      blended,
      maxAbsBeta,
      excluded: excludedRows.map((r) => ({
        company: r.company,
        ticker:  r.ticker,
        factor:  r.factor,
        beta:    num(r.beta),
      })),
    };

    return payload;
}
