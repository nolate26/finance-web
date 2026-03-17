import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import Papa from "papaparse";

const DATA_DIR = path.join(process.cwd(), "data", "Economia");

function readCSV(filename: string) {
  const filePath = path.join(DATA_DIR, filename);
  const content = fs.readFileSync(filePath, "utf-8");
  const result = Papa.parse(content, { header: true, dynamicTyping: true, skipEmptyLines: true });
  return result.data;
}

export async function GET() {
  try {
    const resumenPE = readCSV("resumen_pe.csv");
    const tablaMaestra = readCSV("tabla_maestra_comps.csv");
    const historiaPE = readCSV("historia_pe_5Y.csv");

    // Get last 252 rows (~1 year) from history for initial load
    const historySlice = (historiaPE as Record<string, unknown>[]).slice(-252);

    return NextResponse.json({
      resumenPE,
      tablaMaestra,
      historiaPE: historySlice,
      allHistoriaPE: historiaPE,
    });
  } catch (error) {
    console.error("Economía API error:", error);
    return NextResponse.json({ error: "Error loading economic data" }, { status: 500 });
  }
}
