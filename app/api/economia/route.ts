import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import Papa from "papaparse";

const DATA_DIR = path.join(process.cwd(), "data", "Economia", "Economic Data");

function readCSV(filename: string) {
  const filePath = path.join(DATA_DIR, filename);
  const content = fs.readFileSync(filePath, "utf-8");
  const result = Papa.parse(content, { header: true, dynamicTyping: true, skipEmptyLines: true });
  return result.data;
}

// Column name overrides (currently none needed — CSV headers are clean)
const COL_DISPLAY_MAP: Record<string, string> = {};

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function GET() {
  try {
    const tablaMaestra = readCSV("tabla_maestra_comps.csv");
    const historiaPE = readCSV("historia_pe_10Y.csv") as Record<string, number | null>[];

    // ── Compute per-index stats from full 10Y history ──────────────────────
    const statsMap: Record<string, { median: number; max: number; min: number }> = {};

    if (historiaPE.length > 0) {
      const cols = Object.keys(historiaPE[0]).filter((c) => c !== "date");
      for (const col of cols) {
        const displayName = COL_DISPLAY_MAP[col] ?? col;
        const values = historiaPE
          .map((r) => r[col])
          .filter((v): v is number => typeof v === "number" && v > 0 && !isNaN(v));
        if (values.length > 0) {
          statsMap[displayName] = {
            median: computeMedian(values),
            max: Math.max(...values),
            min: Math.min(...values),
          };
        }
      }
    }

    // ── Read today's P/E from resumen_pe.csv ───────────────────────────────
    const resumenRaw = readCSV("resumen_pe.csv") as Record<string, string | number>[];
    const todayMap: Record<string, number> = {};
    for (const row of resumenRaw) {
      const idx = String(row["Index"] ?? "").trim();
      const pe = typeof row["Today (P/E)"] === "number" ? row["Today (P/E)"] : parseFloat(String(row["Today (P/E)"]));
      if (idx && !isNaN(pe)) todayMap[idx] = pe;
    }

    // ── Build unified resumenPE array ──────────────────────────────────────
    // Use statsMap as the authoritative index list (from historia)
    const resumenPE = Object.entries(statsMap).map(([indexName, stats]) => {
      const todayPE = todayMap[indexName] ?? null;
      const discount =
        todayPE != null && stats.median > 0
          ? ((todayPE / stats.median) - 1) * 100
          : null;
      return {
        Index: indexName,
        "Today (P/E)": todayPE,
        median: stats.median,
        max: stats.max,
        min: stats.min,
        discount,
      };
    });

    // Slice history for initial (1Y) load; keep allHistoriaPE for charts
    const historySlice = historiaPE.slice(-252);

    // Remap historia column names for chart use
    const remapRow = (row: Record<string, number | null>) => {
      const out: Record<string, number | null | string> = { date: row["date"] as unknown as string };
      for (const [k, v] of Object.entries(row)) {
        if (k === "date") continue;
        out[COL_DISPLAY_MAP[k] ?? k] = v;
      }
      return out;
    };
    const historiaPERemapped = historiaPE.map(remapRow);
    const historySliceRemapped = historySlice.map(remapRow);

    // ── Update date ────────────────────────────────────────────────────────
    let updateDate: string | null = null;
    try {
      const dateRaw = readCSV("date.csv") as Record<string, string>[];
      updateDate = dateRaw[0]?.["Ultima_Actualizacion"] ?? null;
    } catch { /* file optional */ }

    return NextResponse.json({
      resumenPE,
      tablaMaestra,
      historiaPE: historySliceRemapped,
      allHistoriaPE: historiaPERemapped,
      updateDate,
    });
  } catch (error) {
    console.error("Economía API error:", error);
    return NextResponse.json({ error: "Error loading economic data" }, { status: 500 });
  }
}
