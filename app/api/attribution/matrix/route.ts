import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── Public types ──────────────────────────────────────────────────────────────

export interface MatrixAsset {
  ticker:              string;
  company:             string;
  /** Portfolio weight (decimal) */
  wp:                  number;
  /** Benchmark weight (decimal) */
  wb:                  number;
  /** Asset return for the period (decimal) */
  ret:                 number;
  /**
   * Contribution to sector selection
   *   contrib_i = w_b,i · (r_i − R_b,j)
   * Shows which stocks explain why the sector had positive/negative selection.
   */
  selectionContrib:    number;
}

export interface MatrixSector {
  sectorName:   string;
  Wp:           number;
  Wb:           number;
  activeWeight: number;
  Rp:           number;     // portfolio-weighted return inside sector
  Rb:           number;     // benchmark-weighted return inside sector
  allocation:   number;
  selection:    number;
  interaction:  number;
  totalAlpha:   number;
  nAssets:      number;
  assets:       MatrixAsset[];
}

export interface MatrixPayload {
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
    nSectors:     number;
  };
  sectors: MatrixSector[];
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

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fundName = searchParams.get("fundName") ?? VALID_FUNDS[0];
  const period   = (searchParams.get("period") ?? "retYtd") as Period;

  if (!VALID_FUNDS.includes(fundName as (typeof VALID_FUNDS)[number])) {
    return NextResponse.json({ error: "Invalid fundName" }, { status: 400 });
  }
  if (!VALID_PERIODS.includes(period)) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  try {
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
        ei.ticker_bloomberg                          AS ticker,
        lw.company,
        COALESCE(ei.industria_gics, 'Unclassified') AS sector,
        lw.w_p,
        lw.w_b,
        COALESCE(ls.ret_ytd, 0) AS ret_ytd,
        COALESCE(ls.ret_1w,  0) AS ret_1w,
        COALESCE(ls.ret_1m,  0) AS ret_1m,
        COALESCE(ls.ret_1y,  0) AS ret_1y,
        lw.report_date,
        ls.snapshot_date
      FROM latest_weights lw
      INNER JOIN empresas_industrias ei ON ei.nombre_latam = lw.company
      INNER JOIN latest_snapshots    ls ON ls.ticker = ei.ticker_bloomberg
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "No data found for this fund" }, { status: 404 });
    }

    // ── Normalise + pick period ───────────────────────────────────────────
    const getR = (r: RawRow): number => {
      const m: Record<Period, number | null> = {
        retYtd: r.ret_ytd, ret1W: r.ret_1w, ret1M: r.ret_1m, ret1Y: r.ret_1y,
      };
      return Number(m[period] ?? 0);
    };

    const assets = rows.map((r) => ({
      ticker:  r.ticker,
      company: r.company,
      sector:  r.sector,
      wp:      Number(r.w_p),
      wb:      Number(r.w_b),
      ret:     getR(r),
      _rd:     r.report_date,
      _sd:     r.snapshot_date,
    }));

    // ── Global returns ────────────────────────────────────────────────────
    const Rb_global = assets.reduce((s, a) => s + a.wb * a.ret, 0);
    const Rp_global = assets.reduce((s, a) => s + a.wp * a.ret, 0);

    // ── Group by sector ───────────────────────────────────────────────────
    const sectorMap = new Map<string, typeof assets>();
    for (const a of assets) {
      if (!sectorMap.has(a.sector)) sectorMap.set(a.sector, []);
      sectorMap.get(a.sector)!.push(a);
    }

    // ── Brinson-Fachler per sector + per-asset contribution ───────────────
    const sectors: MatrixSector[] = [];

    for (const [sectorName, sAssets] of sectorMap.entries()) {
      const Wp = sAssets.reduce((s, a) => s + a.wp, 0);
      const Wb = sAssets.reduce((s, a) => s + a.wb, 0);

      // Sector returns (weighted average within sector)
      const Rp_j = Wp > 0 ? sAssets.reduce((s, a) => s + a.wp * a.ret, 0) / Wp : 0;
      const Rb_j = Wb > 0 ? sAssets.reduce((s, a) => s + a.wb * a.ret, 0) / Wb : 0;

      const dW  = Wp - Wb;
      const dRj = Rp_j - Rb_j;

      const allocation  = dW  * (Rb_j - Rb_global);
      const selection   = Wb  * dRj;
      const interaction = dW  * dRj;
      const totalAlpha  = allocation + selection + interaction;

      // Per-asset contribution to sector selection
      //   contrib_i = w_b,i · (r_i − R_b,j)
      // Interpretation: given the benchmark held w_b,i of this stock,
      // how much did it beat/miss the sector's benchmark return?
      const sectorAssets: MatrixAsset[] = sAssets
        .map((a) => ({
          ticker:           a.ticker,
          company:          a.company,
          wp:               a.wp,
          wb:               a.wb,
          ret:              a.ret,
          selectionContrib: a.wb * (a.ret - Rb_j),
        }))
        .sort((x, y) => Math.abs(y.selectionContrib) - Math.abs(x.selectionContrib));

      sectors.push({
        sectorName, Wp, Wb, activeWeight: dW,
        Rp: Rp_j, Rb: Rb_j,
        allocation, selection, interaction, totalAlpha,
        nAssets: sAssets.length,
        assets:  sectorAssets,
      });
    }

    sectors.sort((a, b) => Math.abs(b.totalAlpha) - Math.abs(a.totalAlpha));

    const toDateStr = (v: Date | string) =>
      v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

    const payload: MatrixPayload = {
      fundName,
      benchmark: FUND_BENCHMARK[fundName] ?? "Unknown",
      period,
      summary: {
        portReturn:   Rp_global,
        benchReturn:  Rb_global,
        totalAlpha:   Rp_global - Rb_global,
        reportDate:   toDateStr(assets[0]._rd),
        snapshotDate: toDateStr(assets[0]._sd),
        nAssets:      assets.length,
        nSectors:     sectors.length,
      },
      sectors,
    };

    return NextResponse.json(payload);
  } catch (e) {
    console.error("[attribution/matrix]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
