import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import Papa from "papaparse";

const FONDOS_DIR = path.join(process.cwd(), "data", "Fondos", "Fondos_record");
const RETORNOS_FILE = path.join(process.cwd(), "data", "Fondos", "Retornos", "retornos_limpio.csv");
const SECTORS_FILE = path.join(process.cwd(), "data", "Companies", "companies_sectors.csv");

const DISPLAY_NAMES: Record<string, string> = {
  Moneda_Renta_Variable: "MRV",
  "Moneda_Latin_America_Equities_(LX)": "LA Equities (LX)",
  "Moneda_Latin_America_Small_Cap_(LX)": "LA Small Cap (LX)",
  Pionero: "Pionero",
  Orange: "Orange",
  Glory: "Glory",
  Mercer: "Mercer",
};

const FUND_RETORNOS_MAP: Record<string, string> = {
  Pionero: "Pionero (CLP)",
  Moneda_Renta_Variable: "MRV (CLP)",
  Orange: "ORANGE",
  Glory: "GLORY (USD)",
  Mercer: "MERCER (EUR)",
  "Moneda_Latin_America_Equities_(LX)": "MLE",
  "Moneda_Latin_America_Small_Cap_(LX)": "MSC",
};

const CHILE_FUNDS = new Set(["Pionero", "Moneda_Renta_Variable", "Orange"]);

export interface CarteraRow {
  company: string;
  portfolioPct: number;
  benchmarkPct: number;
  overweight: number;
  sector: string;
  delta1W: number | null;
  delta1M: number | null;
}

export interface ReturnRow {
  clase: string;
  ytd: number | null;
  oneYear: number | null;
  threeYears: number | null;
  fiveYears: number | null;
  tenYears: number | null;
  sinceInception: number | null;
  moic: number | null;
  alpha: number | null;
  stdDev3Y: number | null;
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
  returns: ReturnRow[];
  reportDate: string | null;
  error?: string;
}

function toNum(v: string | undefined): number | null {
  if (!v || v.trim() === "" || v.trim() === "-") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// Build company (lowercase) → portfolioPct lookup from a snapshot file
function buildWeightMap(filePath: string): Record<string, number> {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const { data } = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
    });
    const map: Record<string, number> = {};
    if (data.length === 0) return map;
    const cols = Object.keys(data[0]);
    const companyCol = cols[0];
    const portfolioCol = cols[1];
    for (const row of data) {
      const company = row[companyCol]?.trim();
      if (company) map[company.toLowerCase()] = parseFloat(row[portfolioCol]) || 0;
    }
    return map;
  } catch {
    return {};
  }
}

// Find the snapshot of the same fund whose date is closest to (currentDate - daysAgo),
// considering only snapshots strictly before currentDate.
function findClosestSnapshot(
  fundName: string,
  currentDate: string,
  daysAgo: number,
  allSnapshots: (FondoMeta & { file: string })[]
): string | null {
  const current = new Date(currentDate).getTime();
  const target = current - daysAgo * 24 * 60 * 60 * 1000;

  const candidates = allSnapshots.filter(
    (s) => s.name === fundName && s.date < currentDate
  );
  if (candidates.length === 0) return null;

  // Pick the one whose date is closest to target
  let best: (FondoMeta & { file: string }) | null = null;
  let bestDiff = Infinity;
  for (const s of candidates) {
    const diff = Math.abs(new Date(s.date).getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return best?.file ?? null;
}

// Build company → sector lookup
function loadSectors(): Record<string, string> {
  try {
    const content = fs.readFileSync(SECTORS_FILE, "utf-8");
    const { data } = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
    });
    const map: Record<string, string> = {};
    for (const row of data) {
      const company = row["company"]?.trim();
      const sector = row["sector"]?.trim();
      if (company && sector) map[company.toLowerCase()] = sector;
    }
    return map;
  } catch {
    return {};
  }
}

// Load retornos for a given fund name
function loadReturns(fundName: string): { rows: ReturnRow[]; reportDate: string | null } {
  const retornosKey = FUND_RETORNOS_MAP[fundName];
  if (!retornosKey) return { rows: [], reportDate: null };
  try {
    const content = fs.readFileSync(RETORNOS_FILE, "utf-8");
    const { data } = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
    });
    const filtered = data.filter((r) => r["Fondo"]?.trim() === retornosKey);
    const reportDate = filtered[0]?.["Fecha_Reporte"]?.trim() ?? null;
    const rows = filtered.map((r) => ({
      clase: r["Clase"]?.trim() ?? "",
      ytd: toNum(r["YTD"]),
      oneYear: toNum(r["1_Year"]),
      threeYears: toNum(r["3_Years"]),
      fiveYears: toNum(r["5_Years"]),
      tenYears: toNum(r["10_Years"]),
      sinceInception: toNum(r["Since_Inception"]),
      moic: toNum(r["MOIC_x"]),
      alpha: toNum(r["Alpha"]),
      stdDev3Y: toNum(r["DesvEstandar_3Y"]),
    }));
    return { rows, reportDate };
  } catch {
    return { rows: [], reportDate: null };
  }
}

function getAvailableFondos(): (FondoMeta & { file: string })[] {
  const files = fs.readdirSync(FONDOS_DIR).filter((f) => f.endsWith(".csv"));

  const result = files
    .map((f) => {
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

  return result.sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.date.localeCompare(b.date);
  });
}

function parseCSV(
  filePath: string,
  meta: FondoMeta,
  allSnapshots: (FondoMeta & { file: string })[]
): FondoData {
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

  const sectorMap = loadSectors();

  // Build historical weight maps (null-safe: returns {} if no snapshot found)
  const file1W = findClosestSnapshot(meta.name, meta.date, 7, allSnapshots);
  const file1M = findClosestSnapshot(meta.name, meta.date, 30, allSnapshots);
  const weights1W = file1W ? buildWeightMap(file1W) : {};
  const weights1M = file1M ? buildWeightMap(file1M) : {};
  const has1W = file1W !== null;
  const has1M = file1M !== null;

  const cartera: CarteraRow[] = rows
    .filter((r) => r[companyCol]?.trim())
    .map((r) => {
      const company = r[companyCol].trim();
      const key = company.toLowerCase();
      const sector = sectorMap[key] ?? "Other";
      const currentPct = parseFloat(r[portfolioCol]) || 0;

      const delta1W = has1W
        ? currentPct - (weights1W[key] ?? 0)
        : null;
      const delta1M = has1M
        ? currentPct - (weights1M[key] ?? 0)
        : null;

      return {
        company,
        portfolioPct: currentPct,
        benchmarkPct: parseFloat(r[benchmarkCol]) || 0,
        overweight: parseFloat(r[overweightCol]) || 0,
        sector,
        delta1W,
        delta1M,
      };
    });

  const { rows: returns, reportDate } = loadReturns(meta.name);

  return { ...meta, benchmark: benchmarkName, cartera, returns, reportDate };
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
      const data = parseCSV(file, meta, available);
      return NextResponse.json(data);
    } catch (err) {
      const { file: _f, ...meta } = match;
      return NextResponse.json({
        ...meta, benchmark: "", cartera: [], returns: [], reportDate: null, error: String(err),
      });
    }
  } catch (error) {
    console.error("Fondos API error:", error);
    return NextResponse.json({ error: "Error loading fund data" }, { status: 500 });
  }
}
