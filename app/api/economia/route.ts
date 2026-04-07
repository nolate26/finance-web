import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Pivot helper: Long → Wide
// Shared logic with /api/export — converts DB long-format rows to the wide
// array of { date, col1, col2, ... } objects that the charts expect.
// ---------------------------------------------------------------------------

function pivotLongToWide(
  records: { date: Date; colKey: string; value: number | null }[]
): Record<string, unknown>[] {
  const colSet = new Set<string>();
  for (const r of records) colSet.add(r.colKey);
  const cols = Array.from(colSet);

  const rowMap = new Map<string, Record<string, unknown>>();
  for (const r of records) {
    const dateStr = r.date.toISOString().slice(0, 10); // YYYY-MM-DD
    if (!rowMap.has(dateStr)) {
      const base: Record<string, unknown> = { date: dateStr };
      for (const c of cols) base[c] = null;
      rowMap.set(dateStr, base);
    }
    rowMap.get(dateStr)![r.colKey] = r.value;
  }

  return Array.from(rowMap.values());
}

// ---------------------------------------------------------------------------
// GET /api/economia
// Returns:  { resumenPE, tablaMaestra, allHistoriaPE, updateDate }
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    // ── Round 1: fetch all independent data in parallel ────────────────────
    // (PE history full scan + latest snapshotDate for each snapshot table)
    const [
      peHistoricoRaw,
      latestPeSnapshot,
      latestCompsSnapshot,
    ] = await Promise.all([
      prisma.peHistorico.findMany({ orderBy: { date: 'asc' } }),
      prisma.peSummarySnapshot.findFirst({
        orderBy: { snapshotDate: 'desc' },
        select: { snapshotDate: true },
      }),
      prisma.equityCompsSnapshot.findFirst({
        orderBy: { snapshotDate: 'desc' },
        select: { snapshotDate: true },
      }),
    ]);

    // ── Round 2: fetch snapshot rows for the latest date ──────────────────
    const [peSummaryRows, compsRows] = await Promise.all([
      latestPeSnapshot
        ? prisma.peSummarySnapshot.findMany({
            where: { snapshotDate: latestPeSnapshot.snapshotDate },
            orderBy: { id: 'asc' },
          })
        : Promise.resolve([]),
      latestCompsSnapshot
        ? prisma.equityCompsSnapshot.findMany({
            where: { snapshotDate: latestCompsSnapshot.snapshotDate },
            orderBy: { id: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    // ── allHistoriaPE — Long → Wide pivot ─────────────────────────────────
    // Shape: [{ date: "YYYY-MM-DD", "MSCI EM LatAm": 14.2, "IPSA (Chile)": 11.0, ... }]
    // PEHistoryChart slices this client-side by selected period (1Y/3Y/5Y/10Y).
    const allHistoriaPE = pivotLongToWide(
      peHistoricoRaw.map((r) => ({ date: r.date, colKey: r.indice, value: r.peValue }))
    );

    // ── resumenPE — shape expected by ValuationTable ───────────────────────
    // ValuationTable expects: Index, "Today (P/E)", median, max, min, stdDev, discount
    // PeSummarySnapshot stores: index, todayPE, histAvg (≈ median), plus1Std, minus1Std, discount
    //
    // stdDev is not stored directly → derive from (plus1Std − histAvg).
    // max/min are not stored → pass null; ValuationTable falls back to ±2σ bar using stdDev.
    // discount is stored as String? → recompute as number for type safety.
    const resumenPE = peSummaryRows.map((r) => {
      const median = r.histAvg;
      const stdDev =
        r.plus1Std != null && median != null ? r.plus1Std - median : null;
      const discount =
        r.todayPE != null && median != null && median > 0
          ? ((r.todayPE / median) - 1) * 100
          : null;

      return {
        Index: r.index,
        'Today (P/E)': r.todayPE,
        median,
        max: null as number | null,   // ValuationTable uses ±2σ when stdDev is present
        min: null as number | null,
        stdDev,
        discount,
      };
    });

    // ── tablaMaestra — shape expected by PerformanceTable ─────────────────
    // PerformanceTable expects string keys with Spanish-style column names.
    // EquityCompsSnapshot stores camelCase equivalents.
    // roeTrail is Float? in DB — component expects a string it can parseFloat().
    const tablaMaestra = compsRows.map((r) => ({
      Ticker: r.ticker,
      Index_Name: r.indexName,
      'Price (Local)': r.priceLocal,
      '1W': r.ret1W ?? '',
      '1M': r.ret1M ?? '',
      '3M': r.ret3M ?? '',
      YTD: r.retYTD ?? '',
      '1Y': r.ret1Y ?? '',
      '3Y': r.ret3Y ?? '',
      '5Y': r.ret5Y ?? '',
      '10Y': r.ret10Y ?? '',
      'EV/EBITDA (Fwd 12m)': r.evEbitdaFwd,
      'P/U (Fwd 12m)': r.peFwd,
      'ROE (Trailing)': r.roeTrail != null ? String(r.roeTrail) : '',
    }));

    // ── updateDate — formatted as "YYYY-MM-DD HH:MM:SS" ───────────────────
    // Frontend's formatUpdateDate() splits on space → needs that exact format.
    const updateDate = latestPeSnapshot
      ? latestPeSnapshot.snapshotDate.toISOString().replace('T', ' ').slice(0, 19)
      : null;

    return NextResponse.json({
      resumenPE,
      tablaMaestra,
      allHistoriaPE,
      updateDate,
    });
  } catch (error) {
    console.error('Economía API error:', error);
    return NextResponse.json({ error: 'Error loading economic data' }, { status: 500 });
  }
}
