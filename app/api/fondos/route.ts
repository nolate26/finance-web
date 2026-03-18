import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import Papa from "papaparse";

const FONDOS_DIR = path.join(process.cwd(), "data", "Fondos");

// Display names for internal fund keys
const DISPLAY_NAMES: Record<string, string> = {
  Moneda_Renta_Variable: "MRV",
  "Moneda_Latin_America_Equities_(LX)": "LA Equities (LX)",
  "Moneda_Latin_America_Small_Cap_(LX)": "LA Small Cap (LX)",
  Pionero: "Pionero",
  Orange: "Orange",
  Glory: "Glory",
  Mercer: "Mercer",
};

// Funds classified as Chile
const CHILE_FUNDS = new Set(["Pionero", "Moneda_Renta_Variable", "Orange"]);

export interface CarteraRow {
  company: string;
  portfolioPct: number;
  benchmarkPct: number;
  overweight: number;
  industria: string;
  analista: string;
  top_pick: string;
  observacion: string;
}

export interface FondoMeta {
  id: string;
  name: string;
  displayName: string;
  date: string;
  region: "Chile" | "LATAM";
}

export interface FondoData extends FondoMeta {
  benchmark: string;
  cartera: CarteraRow[];
  error?: string;
}

function getAvailableFondos(): (FondoMeta & { file: string })[] {
  const files = fs.readdirSync(FONDOS_DIR).filter((f) => f.endsWith(".csv"));

  const result = files
    .map((f) => {
      // Pattern: FundName_YYYY-MM-DD.csv
      const match = f.match(/^(.+)_(\d{4}-\d{2}-\d{2})\.csv$/);
      if (!match) return null;
      const name = match[1];
      const date = match[2];
      const id = `${name}_${date}`;
      const displayName = DISPLAY_NAMES[name] ?? name.replace(/_/g, " ");
      const region: "Chile" | "LATAM" = CHILE_FUNDS.has(name) ? "Chile" : "LATAM";
      return { id, name, displayName, date, region, file: path.join(FONDOS_DIR, f) };
    })
    .filter(Boolean) as (FondoMeta & { file: string })[];

  // Sort by name then date ascending
  return result.sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.date.localeCompare(b.date);
  });
}

function parseCSV(filePath: string, meta: FondoMeta): FondoData {
  const content = fs.readFileSync(filePath, "utf-8");
  const { data: rows } = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  if (rows.length === 0) throw new Error("Empty CSV");

  const cols = Object.keys(rows[0]);
  const companyCol = cols[0];
  const portfolioCol = cols[1];
  const benchmarkCol = cols[2];
  const overweightCol = cols[3];

  const benchmarkName = benchmarkCol.replace(/^%\s*/i, "").trim() || "Benchmark";

  const cartera: CarteraRow[] = rows
    .filter((r) => r[companyCol]?.trim())
    .map((r) => ({
      company: r[companyCol].trim(),
      portfolioPct: parseFloat(r[portfolioCol]) || 0,
      benchmarkPct: parseFloat(r[benchmarkCol]) || 0,
      overweight: parseFloat(r[overweightCol]) || 0,
      industria: r["industria"] ?? "",
      analista: r["analista"] ?? "",
      top_pick: r["top_pick"] ?? "",
      observacion: r["observacion"] ?? "",
    }));

  return { ...meta, benchmark: benchmarkName, cartera };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fondoId = searchParams.get("fondo");

    const available = getAvailableFondos();

    if (!fondoId) {
      return NextResponse.json({
        fondos: available.map(({ file: _f, ...rest }) => rest),
      });
    }

    const match = available.find((f) => f.id === fondoId);
    if (!match) {
      return NextResponse.json({ error: `Fund '${fondoId}' not found` }, { status: 404 });
    }

    try {
      const { file, ...meta } = match;
      const data = parseCSV(file, meta);
      return NextResponse.json(data);
    } catch (err) {
      const { file: _f, ...meta } = match;
      return NextResponse.json({ ...meta, benchmark: "", cartera: [], error: String(err) });
    }
  } catch (error) {
    console.error("Fondos API error:", error);
    return NextResponse.json({ error: "Error loading fund data" }, { status: 500 });
  }
}
