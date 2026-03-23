import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import Papa from "papaparse";

const ECON_DIR = path.join(process.cwd(), "data", "Economia", "Economic Data");

// No hardcoded commodity list — columns are read dynamically from the CSV.

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

      return { name, spot, avg2026, avg2025, avg2024 };
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
