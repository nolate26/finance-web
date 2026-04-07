import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Indicator label mapping ───────────────────────────────────────────────────
// Maps the raw `indicator` value stored by Python → display name that
// MacroPanel filters on (selectedMetric === "GDP Growth" | "Inflation" | "10Y Rate")
const INDICATOR_MAP: Record<string, string> = {
  "GDP": "GDP Growth",
  "Inflation": "Inflation",
  "CBR (Policy Rate)": "Policy Rate",
  "10Y Note": "10Y Rate",
};

function toNum(v: string | null | undefined): number | null {
  if (!v || v === "-" || v === "" || v === "N/A") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// ── Long → Wide pivot for tenYearHistory ─────────────────────────────────────
// MacroHistorico stores one row per (date, pais, indicador).
// TenYearChart expects: { Date: "YYYY-MM-DD", "Chile - 10Y Yield (%)": x, ... }
// The column key "${pais} - ${indicador}" matches TenYearChart.getColumns() exactly.
function pivotMacroHistorico(
  records: { date: Date; pais: string; indicador: string; valor: number | null }[]
): Record<string, string | number | null>[] {
  // Collect all unique column keys preserving insertion order (already date-sorted)
  const colSet = new Set<string>();
  for (const r of records) colSet.add(`${r.pais} - ${r.indicador}`);
  const cols = Array.from(colSet);

  const rowMap = new Map<string, Record<string, string | number | null>>();
  for (const r of records) {
    const dateStr = r.date.toISOString().slice(0, 10); // YYYY-MM-DD
    if (!rowMap.has(dateStr)) {
      // "Date" key (capital) is what TenYearChart reads via row.Date
      const base: Record<string, string | number | null> = { Date: dateStr };
      for (const c of cols) base[c] = null;
      rowMap.set(dateStr, base);
    }
    rowMap.get(dateStr)![`${r.pais} - ${r.indicador}`] = r.valor;
  }

  return Array.from(rowMap.values());
}

// ── GET /api/macro ────────────────────────────────────────────────────────────
// Returns: { annual, quarterly, commodities, quarterlyKeys, revisions, tenYearHistory }
// Only `revisions` and `tenYearHistory` are consumed by MacroPanel / TenYearChart.
// `annual`, `quarterly`, `commodities` are kept as empty arrays for forward-compat.

export async function GET() {
  try {
    // ── Round 1: fetch in parallel ────────────────────────────────────────────
    const [latestForecast, tenYearRaw] = await Promise.all([
      prisma.macroForecasts.findFirst({
        orderBy: { snapshotDate: "desc" },
        select: { snapshotDate: true },
      }),
      prisma.macroHistorico.findMany({ orderBy: { date: "asc" } }),
    ]);

    // ── Round 2: fetch forecast rows for the latest snapshot ─────────────────
    const forecastRows = latestForecast
      ? await prisma.macroForecasts.findMany({
          where: { snapshotDate: latestForecast.snapshotDate },
          orderBy: { id: "asc" },
        })
      : [];

    // ── revisions — shape expected by MacroPanel ──────────────────────────────
    // MacroPanel.RevisionRow: { country, indicator, ago2026, current2026, current2027, current2028 }
    //
    // DB field mapping:
    //   prev_3mAgo  → ago2026   (3-month-old estimate for the forecasted year)
    //   current_Y0  → current2026  (current estimate for Y+0)
    //   current_Y1  → current2027  (current estimate for Y+1)
    //   current_Y2  → current2028  (current estimate for Y+2)
    const revisions = forecastRows.map((row) => ({
      country: row.country,
      indicator: INDICATOR_MAP[row.indicator] ?? row.indicator,
      ago2026: toNum(row.prev_3mAgo),
      current2026: toNum(row.current_Y0),
      current2027: toNum(row.current_Y1),
      current2028: toNum(row.current_Y2),
    }));

    // ── tenYearHistory — Long → Wide pivot from MacroHistorico ───────────────
    // Column names become "${pais} - ${indicador}", which matches the
    // TenYearChart.getColumns() patterns:
    //   "Chile - 10Y Yield (%)", "Chile - FX Spot"
    //   "United States - 10Y Yield (%)", "US - DXY Index"
    //   "European Union - 10Y Yield (%)", "European Union - EURUSD"
    const tenYearHistory = pivotMacroHistorico(tenYearRaw);

    return NextResponse.json({
      // These sections came from CSVs that no longer exist.
      // MacroPanel's <Props> marks them as `annual?: unknown[]` and never renders them.
      annual: [],
      quarterly: [],
      commodities: [],
      quarterlyKeys: [],
      // Active sections — now served from Prisma
      revisions,
      tenYearHistory,
    });
  } catch (error) {
    console.error("Macro API error:", error);
    return NextResponse.json({ error: "Failed to load macro data" }, { status: 500 });
  }
}
