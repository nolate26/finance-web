import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import Papa from "papaparse";

const FONDOS_DIR = path.join(process.cwd(), "data", "Fondos");

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

export interface FondoData {
  id: string;
  name: string;
  date: string;
  benchmark: string;
  cartera: CarteraRow[];
  error?: string;
}

function parseDateFromFilename(date: string): Date {
  // DD-MM-YYYY → sortable date
  const [d, m, y] = date.split("-");
  return new Date(`${y}-${m}-${d}`);
}

function getAvailableFondos(): { id: string; name: string; file: string; date: string }[] {
  const files = fs.readdirSync(FONDOS_DIR).filter(f => f.endsWith(".csv"));
  const result = files
    .map(f => {
      // Pattern: FundName-DD-MM-YYYY.csv  (e.g. MRV-13-03-2026.csv, Orange-13-03-2026.csv)
      const match = f.match(/^(.+?)-(\d{2}-\d{2}-\d{4})\.csv$/i);
      if (!match) return null;
      const name = match[1].toUpperCase();
      const date = match[2];
      const id = `${name}-${date}`;
      return { id, name, file: path.join(FONDOS_DIR, f), date };
    })
    .filter(Boolean) as { id: string; name: string; file: string; date: string }[];

  // Sort by fund name then by date ascending
  return result.sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return parseDateFromFilename(a.date).getTime() - parseDateFromFilename(b.date).getTime();
  });
}

function parseCSV(filePath: string, fondoName: string, date: string): FondoData {
  const content = fs.readFileSync(filePath, "utf-8");
  const { data: rows } = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  if (rows.length === 0) throw new Error("CSV vacío");

  // Detect columns dynamically
  const cols = Object.keys(rows[0]);
  // col[0] = company, col[1] = portfolio_pct, col[2] = benchmark_pct, col[3] = overweight
  const companyCol = cols[0];
  const portfolioCol = cols[1];
  const benchmarkCol = cols[2];
  const overweightCol = cols[3];

  // Extract benchmark name from header (e.g. "% IPSA" → "IPSA")
  const benchmarkName = benchmarkCol.replace(/^%\s*/i, "").trim() || "Benchmark";

  const cartera: CarteraRow[] = rows
    .filter(r => r[companyCol]?.trim())
    .map(r => ({
      company: r[companyCol].trim(),
      portfolioPct: parseFloat(r[portfolioCol]) || 0,
      benchmarkPct: parseFloat(r[benchmarkCol]) || 0,
      overweight: parseFloat(r[overweightCol]) || 0,
      industria: r["industria"] ?? "",
      analista: r["analista"] ?? "",
      top_pick: r["top_pick"] ?? "",
      observacion: r["observacion"] ?? "",
    }));

  const id = `${fondoName}-${date}`;
  return { id, name: fondoName, date, benchmark: benchmarkName, cartera };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fondoId = searchParams.get("fondo");

    const available = getAvailableFondos();

    if (!fondoId) {
      return NextResponse.json({
        fondos: available.map(f => ({ id: f.id, name: f.name, date: f.date })),
      });
    }

    const match = available.find(f => f.id === fondoId);
    if (!match) {
      return NextResponse.json({ error: `Fondo '${fondoId}' not found` }, { status: 404 });
    }

    try {
      const data = parseCSV(match.file, match.name, match.date);
      return NextResponse.json(data);
    } catch (err) {
      return NextResponse.json(
        { id: match.id, name: match.name, date: match.date, benchmark: "", cartera: [], error: String(err) },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error("Fondos API error:", error);
    return NextResponse.json({ error: "Error loading fund data" }, { status: 500 });
  }
}
