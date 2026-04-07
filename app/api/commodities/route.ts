import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Commodity group taxonomy (unchanged from original) ────────────────────────

const GROUP_ORDER = [
  "Energy",
  "Base Metals",
  "Precious Metals",
  "Agriculture & Food",
  "Indices, Freight & Crypto",
] as const;
type CommodityGroup = (typeof GROUP_ORDER)[number];

const COMMODITY_GROUP_MAP: Record<string, CommodityGroup> = {
  // Energy
  "US Gasoline (USD/gal)": "Energy",
  "CIF ARA Coal (USD/t)": "Energy",
  "Bunker Fuel (USD/t)": "Energy",
  "WTI Crude 12M Fwd (USD/bbl)": "Energy",
  "WTI Crude 24M Fwd (USD/bbl)": "Energy",
  "Brent Crude Oil (USD/bbl)": "Energy",
  "Brent Crude 24M Fwd (USD/bbl)": "Energy",
  "Indonesia Thermic Coal (USD/t)": "Energy",
  "Jet Fuel (USD/gal)": "Energy",
  "LNG Spot JKM (USD/MMBtu)": "Energy",
  "Propane Mont Belvieu (USc/gal)": "Energy",
  "US Diesel (USD/gal)": "Energy",
  "North Sea Nat Gas (GBp/th)": "Energy",
  "Henry Hub Nat Gas (USD/MMBtu)": "Energy",
  "TTF Neth Gas (EUR/MWh)": "Energy",
  "WTI Crude Oil (USD/bbl)": "Energy",
  "Richards Bay Coal (USD/t)": "Energy",
  "Newcastle Coal (USD/t)": "Energy",
  // Base Metals
  "Copper NYMEX Inventory": "Base Metals",
  "Copper HG1 (USD/lb)": "Base Metals",
  "Steel USA HRC (USD/t)": "Base Metals",
  "Aluminum LME (USD/t)": "Base Metals",
  "Copper 3M Fwd (USD/t)": "Base Metals",
  "Zinc LME (USD/t)": "Base Metals",
  "Nickel LME (USD/t)": "Base Metals",
  "Copper Spot LME (USD/t)": "Base Metals",
  "Copper 12M Fwd (USD/t)": "Base Metals",
  "Copper 24M Fwd (USD/t)": "Base Metals",
  "Copper LME Inventory": "Base Metals",
  "Copper Shanghai Inventory": "Base Metals",
  "Iron Ore 62% CFR (USD/t)": "Base Metals",
  // Precious Metals
  "Silver Spot (USD/oz)": "Precious Metals",
  "Gold Spot (USD/oz)": "Precious Metals",
  // Agriculture & Food
  "Corn (USc/bu)": "Agriculture & Food",
  "Cocoa (USD/t)": "Agriculture & Food",
  "CRB Food": "Agriculture & Food",
  "Cotton N°2 (USc/lb)": "Agriculture & Food",
  "FAO Cereals": "Agriculture & Food",
  "FAO Dairy": "Agriculture & Food",
  "FAO Meat": "Agriculture & Food",
  "FAO Veg Oils": "Agriculture & Food",
  "FAO Global": "Agriculture & Food",
  "FAO Sugar": "Agriculture & Food",
  "Coffee Arabica (USc/lb)": "Agriculture & Food",
  "Salmon Norway (NOK/kg)": "Agriculture & Food",
  "Fish Meal (USD/t)": "Agriculture & Food",
  "Refined Sugar (USD/t)": "Agriculture & Food",
  "Soybean Meal (USD/t)": "Agriculture & Food",
  "Soybean (USc/bu)": "Agriculture & Food",
  "Raw Sugar (USc/lb)": "Agriculture & Food",
  "Rice (USD/cwt)": "Agriculture & Food",
  "Wheat (USc/bu)": "Agriculture & Food",
  // Indices, Freight & Crypto
  "Baltic Dry Index": "Indices, Freight & Crypto",
  "CRB Metals": "Indices, Freight & Crypto",
  "CRB Commodity Index": "Indices, Freight & Crypto",
  "US Crude Inventories (kbbl)": "Indices, Freight & Crypto",
  "Shanghai Freight Index": "Indices, Freight & Crypto",
  "Chinese Port Inventories (Mt)": "Indices, Freight & Crypto",
  "S&P GSCI Index": "Indices, Freight & Crypto",
  "Bitcoin (USD)": "Indices, Freight & Crypto",
  "Ethereum (USD)": "Indices, Freight & Crypto",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parses optional Bloomberg ticker from commodity name.
 * Handles: "Name [TICKER Bloomberg]" → { name, ticker }
 * Falls back to { name: raw, ticker: null } when no brackets.
 */
function parseName(raw: string): { name: string; ticker: string | null } {
  const m = raw.match(/^(.+?)\s*\[(.+?)\]$/);
  if (m) return { name: m[1].trim(), ticker: m[2].trim() };
  return { name: raw.trim(), ticker: null };
}

function toNum(v: string | null | undefined): number | null {
  if (!v || v.trim() === "" || v.trim() === "-" || v.trim() === "N/A") return null;
  const n = parseFloat(v.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function forwardFill(arr: (number | null)[]): (number | null)[] {
  let last: number | null = null;
  return arr.map((v) => {
    if (v !== null) last = v;
    return last;
  });
}

// ── GET /api/commodities ──────────────────────────────────────────────────────

export async function GET() {
  try {
    // ── Round 1: fetch all independent data in parallel ───────────────────
    const [histRows, latestForecast] = await Promise.all([
      prisma.commodityHistorico.findMany({ orderBy: { date: "asc" } }),
      prisma.commodityForecasts.findFirst({
        orderBy: { snapshotDate: "desc" },
        select: { snapshotDate: true },
      }),
    ]);

    // ── Round 2: fetch forecast rows for the latest snapshot ──────────────
    const forecastRows = latestForecast
      ? await prisma.commodityForecasts.findMany({
          where: { snapshotDate: latestForecast.snapshotDate },
          orderBy: { id: "asc" },
        })
      : [];

    // =========================================================================
    // HISTORICAL — Long → Wide transformation + meta computation
    // =========================================================================

    // Collect unique commodity names and dates (order preserved from DB sort)
    const commSet = new Set<string>();
    for (const r of histRows) commSet.add(r.commodity);
    const commNames = Array.from(commSet);

    // Build indexed date list (already sorted ASC)
    const dateList: string[] = [];
    const seenDates = new Set<string>();
    for (const r of histRows) {
      const d = r.date.toISOString().slice(0, 10);
      if (!seenDates.has(d)) { seenDates.add(d); dateList.push(d); }
    }

    // Price lookup: dateStr → commodity → precio
    const priceMap = new Map<string, Map<string, number | null>>();
    for (const r of histRows) {
      const d = r.date.toISOString().slice(0, 10);
      if (!priceMap.has(d)) priceMap.set(d, new Map());
      priceMap.get(d)!.set(r.commodity, r.precio);
    }

    // Raw values per commodity (aligned with dateList)
    const rawValues: Record<string, (number | null)[]> = {};
    for (const name of commNames) {
      rawValues[name] = dateList.map((d) => priceMap.get(d)?.get(name) ?? null);
    }

    // Forward-filled values (used for spot, averages, and series output)
    const filled: Record<string, (number | null)[]> = {};
    for (const name of commNames) {
      filled[name] = forwardFill(rawValues[name]);
    }

    const totalRows = dateList.length;

    // ── Compute per-commodity meta ─────────────────────────────────────────
    const histMeta = commNames.map((name) => {
      const series = filled[name];

      // Spot = last non-null value in the filled series
      let spot: number | null = null;
      for (let i = series.length - 1; i >= 0; i--) {
        if (series[i] !== null) { spot = series[i]; break; }
      }

      // Yearly averages using filled series filtered by year prefix
      const vals2024 = dateList
        .map((d, i) => (d.startsWith("2024") ? series[i] : null))
        .filter((v): v is number => v !== null);
      const vals2025 = dateList
        .map((d, i) => (d.startsWith("2025") ? series[i] : null))
        .filter((v): v is number => v !== null);
      const vals2026 = dateList
        .map((d, i) => (d.startsWith("2026") ? series[i] : null))
        .filter((v): v is number => v !== null);

      const avg2024 = avg(vals2024);
      const avg2025 = avg(vals2025);
      const avg2026 = avg(vals2026);

      // YTD 2026: last non-null Dec-2025 price → fallback to first 2026 price
      let ytdBase: number | null = null;
      for (let i = dateList.length - 1; i >= 0; i--) {
        if (dateList[i].startsWith("2025-12") && series[i] !== null) {
          ytdBase = series[i]; break;
        }
      }
      if (ytdBase === null) {
        for (let i = 0; i < dateList.length; i++) {
          if (dateList[i].startsWith("2026") && series[i] !== null) {
            ytdBase = series[i]; break;
          }
        }
      }
      const ytdPct =
        ytdBase !== null && spot !== null && ytdBase > 0
          ? ((spot - ytdBase) / ytdBase) * 100
          : null;

      // Commodity name may contain a ticker bracket if Python preserved it
      const { name: cleanName, ticker } = parseName(name);

      const group: CommodityGroup =
        COMMODITY_GROUP_MAP[cleanName] ??
        COMMODITY_GROUP_MAP[name] ??
        "Indices, Freight & Crypto";

      return { name: cleanName, ticker, group, spot, ytdPct, avg2026, avg2025, avg2024 };
    });

    // Sort by group order, then alphabetically within group
    histMeta.sort((a, b) => {
      const gi = GROUP_ORDER.indexOf(a.group as CommodityGroup);
      const gj = GROUP_ORDER.indexOf(b.group as CommodityGroup);
      if (gi !== gj) return gi - gj;
      return a.name.localeCompare(b.name);
    });

    // ── Build downsampled series (~400 rows max) ───────────────────────────
    // Uses forward-filled values so charts render without gaps.
    const step = Math.max(1, Math.floor(totalRows / 400));
    const idxList: number[] = [];
    for (let i = 0; i < totalRows; i += step) idxList.push(i);
    if (totalRows > 0 && idxList[idxList.length - 1] !== totalRows - 1) {
      idxList.push(totalRows - 1);
    }

    const series = idxList.map((i) => {
      const row: Record<string, string | number | null> = { date: dateList[i] };
      for (const name of commNames) {
        // Use the clean name as key (same as histMeta.name) so the chart can match
        const { name: cleanName } = parseName(name);
        row[cleanName] = filled[name][i] ?? null;
      }
      return row;
    });

    // =========================================================================
    // PROJECTIONS — latest CommodityForecasts snapshot → ProjEntry[]
    // =========================================================================

    // Group by commodity, preserving insertion order
    const projMap = new Map<
      string,
      {
        ticker: string | null;
        spotCurrent: number | null;
        quarters: { quarter: string; fwd: number | null; analyst: number | null }[];
      }
    >();

    for (const row of forecastRows) {
      const { name, ticker } = parseName(row.commodity);
      if (!name) continue;
      if (!projMap.has(name)) {
        projMap.set(name, { ticker, spotCurrent: row.spotCurrent, quarters: [] });
      }
      projMap.get(name)!.quarters.push({
        quarter: row.quarter,
        fwd: toNum(row.fwdCurve),
        analyst: toNum(row.analystForecast),
      });
    }

    const projections = Array.from(projMap.entries()).map(([name, data]) => ({
      name,
      ...data,
    }));

    return NextResponse.json({ historical: { meta: histMeta, series }, projections });
  } catch (error) {
    console.error("Commodities API error:", error);
    return NextResponse.json({ error: "Failed to load commodities data" }, { status: 500 });
  }
}
