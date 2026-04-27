import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── Public types ──────────────────────────────────────────────────────────────

export interface SectorRow {
  sectorName:   string;
  /** Portfolio weight in sector (sum of w_p,i) */
  Wp:           number;
  /** Benchmark weight in sector (sum of w_b,i) */
  Wb:           number;
  /** Active weight = Wp - Wb */
  activeWeight: number;
  /** Weighted portfolio return inside sector */
  Rp:           number;
  /** Weighted benchmark return inside sector */
  Rb:           number;
  /** Allocation effect: (Wp - Wb)(Rb,j - Rb_global) */
  allocation:   number;
  /** Selection effect: Wb,j * (Rp,j - Rb,j) */
  selection:    number;
  /** Interaction effect: (Wp - Wb)(Rp,j - Rb,j) */
  interaction:  number;
  /** Total sector alpha = allocation + selection + interaction */
  totalAlpha:   number;
  /** Asset count in sector */
  nAssets:      number;
}

export interface SectorAttributionPayload {
  fundName:   string;
  benchmark:  string;
  period:     string;
  summary: {
    portReturn:   number;
    benchReturn:  number;
    totalAlpha:   number;
    reportDate:   string;
    snapshotDate: string;
    nAssets:      number;
  };
  sectors: SectorRow[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_FUNDS = [
  "Moneda_Latin_America_Equities_(LX)",
  "Moneda_Latin_America_Small_Cap_(LX)",
] as const;

const FUND_BENCHMARK: Record<string, string> = {
  "Moneda_Latin_America_Equities_(LX)":  "MXLA Index",
  "Moneda_Latin_America_Small_Cap_(LX)": "MXLASC Index",
};

const VALID_PERIODS = ["retYtd", "ret1W", "ret1M", "ret1Y"] as const;
type Period = (typeof VALID_PERIODS)[number];

// ── Raw DB row ────────────────────────────────────────────────────────────────

interface RawRow {
  ticker:        string;
  company:       string;
  sector:        string;
  w_p:           number;
  w_b:           number;
  ret_ytd:       number | null;
  ret_1w:        number | null;
  ret_1m:        number | null;
  ret_1y:        number | null;
  report_date:   Date | string;
  snapshot_date: Date | string;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fundName = searchParams.get("fundName") ?? VALID_FUNDS[0];
  const period   = (searchParams.get("period")   ?? "retYtd") as Period;

  if (!VALID_FUNDS.includes(fundName as (typeof VALID_FUNDS)[number])) {
    return NextResponse.json({ error: "Invalid fundName" }, { status: 400 });
  }
  if (!VALID_PERIODS.includes(period)) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  try {
    // ── 1. Raw data: same join as flat attribution + industria_gics ───────
    const rows = await prisma.$queryRaw<RawRow[]>`
      WITH latest_weights AS (
        SELECT DISTINCT ON (company)
          company,
          COALESCE(portfolio_weight, 0) AS w_p,
          COALESCE(benchmark_weight, 0) AS w_b,
          report_date
        FROM fund_portfolio_weights
        WHERE fund_name = ${fundName}
        ORDER BY company, report_date DESC
      ),
      latest_snapshots AS (
        SELECT DISTINCT ON (ticker)
          ticker,
          "retYtd"       AS ret_ytd,
          "ret1W"        AS ret_1w,
          "ret1M"        AS ret_1m,
          "ret1Y"        AS ret_1y,
          "snapshotDate" AS snapshot_date
        FROM latam_equity_snapshots
        ORDER BY ticker, "snapshotDate" DESC
      )
      SELECT
        ei.ticker_bloomberg                             AS ticker,
        lw.company,
        COALESCE(ei.industria_gics, 'Unclassified')    AS sector,
        lw.w_p,
        lw.w_b,
        COALESCE(ls.ret_ytd, 0)                        AS ret_ytd,
        COALESCE(ls.ret_1w,  0)                        AS ret_1w,
        COALESCE(ls.ret_1m,  0)                        AS ret_1m,
        COALESCE(ls.ret_1y,  0)                        AS ret_1y,
        lw.report_date,
        ls.snapshot_date
      FROM latest_weights lw
      INNER JOIN empresas_industrias ei
        ON ei.nombre_latam = lw.company
      INNER JOIN latest_snapshots ls
        ON ls.ticker = ei.ticker_bloomberg
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "No data found for this fund" }, { status: 404 });
    }

    // ── 2. Pick period return ─────────────────────────────────────────────
    const getR = (r: RawRow): number => {
      const m: Record<Period, number | null> = {
        retYtd: r.ret_ytd,
        ret1W:  r.ret_1w,
        ret1M:  r.ret_1m,
        ret1Y:  r.ret_1y,
      };
      return Number(m[period] ?? 0);
    };

    // Normalise weight types (Prisma raw can return Decimal objects)
    const assets = rows.map((r) => ({
      ticker:  r.ticker,
      company: r.company,
      sector:  r.sector,
      wp:      Number(r.w_p),
      wb:      Number(r.w_b),
      ret:     getR(r),
    }));

    // ── 3. Global returns (Step A) ────────────────────────────────────────
    //   R_b = Σ w_b,i · r_i
    //   R_p = Σ w_p,i · r_i
    const Rb_global = assets.reduce((s, a) => s + a.wb * a.ret, 0);
    const Rp_global = assets.reduce((s, a) => s + a.wp * a.ret, 0);

    // ── 4. Group by sector (Step B) ──────────────────────────────────────
    const sectorMap = new Map<string, {
      wp_sum:  number; wb_sum:  number;
      wp_ret:  number; wb_ret:  number;   // numerators for R_p,j and R_b,j
      count:   number;
    }>();

    for (const a of assets) {
      const cur = sectorMap.get(a.sector) ?? { wp_sum: 0, wb_sum: 0, wp_ret: 0, wb_ret: 0, count: 0 };
      cur.wp_sum += a.wp;
      cur.wb_sum += a.wb;
      cur.wp_ret += a.wp * a.ret;   // Σ w_p,i · r_i  (numerator for R_p,j)
      cur.wb_ret += a.wb * a.ret;   // Σ w_b,i · r_i  (numerator for R_b,j)
      cur.count  += 1;
      sectorMap.set(a.sector, cur);
    }

    // ── 5. Brinson-Fachler per sector (Step C) ───────────────────────────
    //
    //   W_p,j = sector portfolio weight
    //   W_b,j = sector benchmark weight
    //   R_p,j = Σ(w_p,i · r_i) / W_p,j   ← internal portfolio return
    //   R_b,j = Σ(w_b,i · r_i) / W_b,j   ← internal benchmark return
    //
    //   Allocation   A_j = (W_p,j − W_b,j)(R_b,j − R_b)
    //   Selection    S_j = W_b,j · (R_p,j − R_b,j)
    //   Interaction  I_j = (W_p,j − W_b,j)(R_p,j − R_b,j)
    //
    //   Identity: Σ_j(A_j + S_j + I_j) = R_p − R_b  ✓
    //
    const sectors: SectorRow[] = [];

    for (const [sectorName, g] of sectorMap.entries()) {
      const Wp = g.wp_sum;
      const Wb = g.wb_sum;

      // Weighted-average sector returns (guard division by zero)
      const Rp_j = Wp > 0 ? g.wp_ret / Wp : 0;
      const Rb_j = Wb > 0 ? g.wb_ret / Wb : 0;

      const dW  = Wp - Wb;                   // active weight
      const dRj = Rp_j - Rb_j;              // active return within sector

      const allocation   = dW  * (Rb_j - Rb_global);
      const selection    = Wb  * dRj;
      const interaction  = dW  * dRj;
      const totalAlpha   = allocation + selection + interaction;

      sectors.push({
        sectorName,
        Wp, Wb,
        activeWeight: dW,
        Rp: Rp_j,
        Rb: Rb_j,
        allocation,
        selection,
        interaction,
        totalAlpha,
        nAssets: g.count,
      });
    }

    // Sort by |totalAlpha| desc
    sectors.sort((a, b) => Math.abs(b.totalAlpha) - Math.abs(a.totalAlpha));

    const toDateStr = (v: Date | string) =>
      v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

    const payload: SectorAttributionPayload = {
      fundName,
      benchmark: FUND_BENCHMARK[fundName] ?? "Unknown",
      period,
      summary: {
        portReturn:   Rp_global,
        benchReturn:  Rb_global,
        totalAlpha:   Rp_global - Rb_global,
        reportDate:   toDateStr(rows[0].report_date),
        snapshotDate: toDateStr(rows[0].snapshot_date),
        nAssets:      assets.length,
      },
      sectors,
    };

    return NextResponse.json(payload);
  } catch (e) {
    console.error("[attribution/sector]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
