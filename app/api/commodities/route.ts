import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import Papa from "papaparse";

const ECON_DIR = path.join(process.cwd(), "data", "Economia", "Economic Data");

// ── Commodity groups ─────────────────────────────────────────────────────────
const GROUP_ORDER = ["Energy", "Base Metals", "Precious Metals", "Agriculture & Food", "Indices, Freight & Crypto"] as const;
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

function toNum(v: string | undefined): number | null {
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

export async function GET() {
  try {
    // ── Historical (wide format) ──────────────────────────────────────────────
    const histContent = fs.readFileSync(
      path.join(ECON_DIR, "historico_commodities_5Y.csv"),
      "utf-8"
    );
    const { data: histRaw } = Papa.parse<Record<string, string>>(histContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    // Dynamically derive all commodity columns (every column except 'Date')
    const commNames = histRaw.length > 0
      ? Object.keys(histRaw[0]).filter((c) => c !== "Date")
      : [];
    const totalRows = histRaw.length;

    // Raw numeric values per commodity
    const rawValues: Record<string, (number | null)[]> = {};
    for (const name of commNames) {
      rawValues[name] = histRaw.map((r) => toNum(r[name]));
    }

    // Forward-filled values
    const filled: Record<string, (number | null)[]> = {};
    for (const name of commNames) {
      filled[name] = forwardFill(rawValues[name]);
    }

    // Per-commodity metadata
    const histMeta = commNames.map((name) => {
      const series = filled[name];

      // Spot = last non-null value
      let spot: number | null = null;
      for (let i = series.length - 1; i >= 0; i--) {
        if (series[i] !== null) { spot = series[i]; break; }
      }

      // Yearly averages
      const vals2024 = histRaw
        .map((r, i) => (r.Date?.startsWith("2024") ? series[i] : null))
        .filter((v): v is number => v !== null);
      const vals2025 = histRaw
        .map((r, i) => (r.Date?.startsWith("2025") ? series[i] : null))
        .filter((v): v is number => v !== null);

      const avg2024 = avg(vals2024);
      const avg2025 = avg(vals2025);

      const vals2026 = histRaw
        .map((r, i) => (r.Date?.startsWith("2026") ? series[i] : null))
        .filter((v): v is number => v !== null);

      const avg2026 = avg(vals2026);

      const group: CommodityGroup = COMMODITY_GROUP_MAP[name] ?? "Indices, Freight & Crypto";
      return { name, group, spot, avg2026, avg2025, avg2024 };
    });

    // Sort meta by group order, then alphabetically within group
    histMeta.sort((a, b) => {
      const gi = GROUP_ORDER.indexOf(a.group as CommodityGroup);
      const gj = GROUP_ORDER.indexOf(b.group as CommodityGroup);
      if (gi !== gj) return gi - gj;
      return a.name.localeCompare(b.name);
    });

    // Build downsampled series for charting (~400 rows max)
    const step = Math.max(1, Math.floor(totalRows / 400));
    const idxList: number[] = [];
    for (let i = 0; i < totalRows; i += step) idxList.push(i);
    if (idxList[idxList.length - 1] !== totalRows - 1) idxList.push(totalRows - 1);

    const series = idxList.map((i) => {
      const out: Record<string, string | number | null> = {
        date: histRaw[i]?.Date ?? "",
      };
      for (const name of commNames) {
        out[name] = filled[name][i] ?? null;
      }
      return out;
    });

    // ── Projections (long format) ─────────────────────────────────────────────
    const projContent = fs.readFileSync(
      path.join(ECON_DIR, "proyecciones_commodities_Q.csv"),
      "utf-8"
    );
    const { data: projRaw } = Papa.parse<Record<string, string>>(projContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    // Group by commodity (preserving insertion order)
    const projMap = new Map<
      string,
      {
        spotCurrent: number | null;
        quarters: { quarter: string; fwd: number | null; analyst: number | null }[];
      }
    >();

    for (const row of projRaw) {
      const name = row["Commodity"]?.trim();
      if (!name) continue;
      if (!projMap.has(name)) {
        projMap.set(name, {
          spotCurrent: toNum(row["Spot Current"]),
          quarters: [],
        });
      }
      projMap.get(name)!.quarters.push({
        quarter: row["Quarter"]?.trim() ?? "",
        fwd: toNum(row["Fwd Curve"]),
        analyst: toNum(row["Analyst Forecast"]),
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
