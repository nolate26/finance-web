import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AssetAttribution {
  ticker:           string;
  company:          string;
  /** Portfolio weight — decimal (0.035 = 3.5 %) */
  wp:               number;
  /** Benchmark weight — decimal */
  wb:               number;
  /** Active weight = wp - wb */
  activeWeight:     number;
  /** Asset return for the period — decimal */
  ret:              number;
  /** Allocation effect (Brinson-Fachler) */
  allocationEffect: number;
  /** Selection effect — always 0 in flat-universe mode */
  selectionEffect:  0;
  /** Interaction effect — always 0 in flat-universe mode */
  interactionEffect:0;
  /** Total attribution = allocation + selection + interaction */
  totalEffect:      number;
}

export interface AttributionSummary {
  portReturn:   number;   // Rp  (decimal)
  benchReturn:  number;   // Rb  (decimal)
  totalAlpha:   number;   // Rp - Rb  (decimal)
  reportDate:   string;
  snapshotDate: string;
  nAssets:      number;
}

export interface FlatAttributionPayload {
  fundName:  string;
  benchmark: string;
  period:    string;
  summary:   AttributionSummary;
  assets:    AssetAttribution[];
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

// ── Raw query row ─────────────────────────────────────────────────────────────

interface RawRow {
  ticker:        string;
  company:       string;
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
    // ── Raw SQL: join the three tables ─────────────────────────────────────
    // We select ALL four return periods and pick the right one in TypeScript
    // to avoid Prisma.raw() dynamic column injection.
    const rows = await prisma.$queryRaw<RawRow[]>`
      WITH latest_weights AS (
        -- Most recent report_date per company for this fund
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
        -- Most recent snapshotDate per ticker
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
        ei.ticker_bloomberg            AS ticker,
        lw.company,
        lw.w_p,
        lw.w_b,
        COALESCE(ls.ret_ytd, 0)        AS ret_ytd,
        COALESCE(ls.ret_1w,  0)        AS ret_1w,
        COALESCE(ls.ret_1m,  0)        AS ret_1m,
        COALESCE(ls.ret_1y,  0)        AS ret_1y,
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

    // ── Pick return column for chosen period ───────────────────────────────
    const getReturn = (r: RawRow): number => {
      const map: Record<Period, number | null> = {
        retYtd: r.ret_ytd,
        ret1W:  r.ret_1w,
        ret1M:  r.ret_1m,
        ret1Y:  r.ret_1y,
      };
      return map[period] ?? 0;
    };

    // ── Brinson-Fachler (Flat Universe) ────────────────────────────────────
    //
    //  Since we use a single return source per asset (Bloomberg snapshot),
    //  r_p,i = r_b,i = r_i  ⟹  Selection_i = 0  and  Interaction_i = 0
    //
    //  R_b = Σ w_b,i · r_i          (benchmark return)
    //  R_p = Σ w_p,i · r_i          (portfolio return)
    //  A_i = (w_p,i − w_b,i)(r_i − R_b)   (allocation effect)
    //  Σ A_i = R_p − R_b  ✓
    //
    const Rb = rows.reduce((s, r) => s + r.w_b * getReturn(r), 0);
    const Rp = rows.reduce((s, r) => s + r.w_p * getReturn(r), 0);

    const assets: AssetAttribution[] = rows
      .map((r) => {
        const ret          = getReturn(r);
        const activeWeight = r.w_p - r.w_b;
        const alloc        = activeWeight * (ret - Rb);
        return {
          ticker:            r.ticker,
          company:           r.company,
          wp:                Number(r.w_p),
          wb:                Number(r.w_b),
          activeWeight,
          ret,
          allocationEffect:  alloc,
          selectionEffect:   0 as const,
          interactionEffect: 0 as const,
          totalEffect:       alloc,
        };
      })
      // Sort by absolute allocation effect (biggest contributors first)
      .sort((a, b) => Math.abs(b.allocationEffect) - Math.abs(a.allocationEffect));

    const toDateStr = (v: Date | string) =>
      v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

    const payload: FlatAttributionPayload = {
      fundName,
      benchmark: FUND_BENCHMARK[fundName] ?? "Unknown",
      period,
      summary: {
        portReturn:   Rp,
        benchReturn:  Rb,
        totalAlpha:   Rp - Rb,
        reportDate:   toDateStr(rows[0].report_date),
        snapshotDate: toDateStr(rows[0].snapshot_date),
        nAssets:      rows.length,
      },
      assets,
    };

    return NextResponse.json(payload);
  } catch (e) {
    console.error("[attribution/flat]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
