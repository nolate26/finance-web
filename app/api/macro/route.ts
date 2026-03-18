import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import Papa from "papaparse";

const MACRO_DIR = path.join(process.cwd(), "data", "Economia", "macro_details");

const METRIC_LABELS: Record<string, string> = {
  "GDP (Annual, %)": "GDP Growth",
  "INFLATION RATE (EOP, %)": "Inflation",
  "MONETARY POLICY RATE (EOP, %)": "Policy Rate",
  "10 YEARS NOMINAL INTEREST RATE (EOP, %)": "10Y Rate",
};

function readCSV(filename: string) {
  const content = fs.readFileSync(path.join(MACRO_DIR, filename), "utf-8");
  const { data } = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  return data;
}

function toNum(v: string | undefined): number | null {
  if (!v || v === "-" || v === "" || v === "N/A") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export async function GET() {
  try {
    // ── Annual projections ────────────────────────────────────────────────────
    const annualRaw = readCSV("all_countries_annual.csv");
    const annual = annualRaw.map((row) => ({
      country: row["COUNTRY"],
      metric: METRIC_LABELS[row["METRIC"]] ?? row["METRIC"],
      "2025": toNum(row["2025"]),
      "2026": toNum(row["2026"]),
      "2027": toNum(row["2027"]),
      "2028": toNum(row["2028"]),
      "2029": toNum(row["2029"]),
      "2030": toNum(row["2030"]),
    }));

    // ── Quarterly projections ─────────────────────────────────────────────────
    const quarterlyRaw = readCSV("all_countries_quarterly.csv");
    const quarterlyKeys = Object.keys(quarterlyRaw[0] ?? {}).filter(
      (k) => k !== "COUNTRY" && k !== "METRIC"
    );
    const quarterly = quarterlyRaw.map((row) => {
      const out: Record<string, string | number | null> = {
        country: row["COUNTRY"],
        metric: METRIC_LABELS[row["METRIC"]] ?? row["METRIC"],
      };
      for (const k of quarterlyKeys) out[k] = toNum(row[k]);
      return out;
    });

    // ── Commodities ───────────────────────────────────────────────────────────
    const commRaw = readCSV("Commodities_prices.csv");
    const commodities = commRaw.map((row) => {
      // Extract unit from commodity name (everything after first space cluster)
      const full = row["COMMODITY"] ?? "";
      // "Copper US$c/lb" → name="Copper", unit="US$c/lb"
      const parts = full.match(/^([\w\s]+?)\s+(US\$.*|USD.*)$/);
      const name = parts ? parts[1].trim() : full;
      const unit = parts ? parts[2].trim() : "";

      return {
        commodity: full,
        name,
        unit,
        "2020": toNum(row["2020.0"]),
        "2021": toNum(row["2021.0"]),
        "2022": toNum(row["2022.0"]),
        "2023": toNum(row["2023.0"]),
        "2024": toNum(row["2024.0"]),
        "2025": toNum(row["2025.0"]),
        "2026e": toNum(row["2026e"]),
        "2027e": toNum(row["2027e"]),
        "2028e": toNum(row["2028e"]),
      };
    });

    return NextResponse.json({ annual, quarterly, commodities, quarterlyKeys });
  } catch (error) {
    console.error("Macro API error:", error);
    return NextResponse.json({ error: "Failed to load macro data" }, { status: 500 });
  }
}
