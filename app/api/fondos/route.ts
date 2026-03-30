import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import Papa from "papaparse";

const FONDOS_DIR = path.join(process.cwd(), "data", "Fondos", "Fondos_record");
const CHILE_INDUSTRIES_FILE = path.join(process.cwd(), "data", "Fondos", "industry", "companies_sectors.csv");
const LATAM_INDUSTRIES_FILE = path.join(process.cwd(), "data", "Fondos", "industry", "latam_universe_with_gics.csv");
const RENTABILIDADES_DIR = path.join(process.cwd(), "data", "Fondos", "Rentabilidades");

const FUND_PAGE_MAP: Record<string, string> = {
  Pionero: "1",
  Moneda_Renta_Variable: "2",
  Orange: "2",
  "Moneda_Latin_America_Small_Cap_(LX)": "3",
  "Moneda_Latin_America_Equities_(LX)": "4",
  Glory: "4",
  Mercer: "4",
};

const DISPLAY_NAMES: Record<string, string> = {
  Moneda_Renta_Variable: "MRV",
  "Moneda_Latin_America_Equities_(LX)": "LA Equities (LX)",
  "Moneda_Latin_America_Small_Cap_(LX)": "LA Small Cap (LX)",
  Pionero: "Pionero",
  Orange: "Orange",
  Glory: "Glory",
  Mercer: "Mercer",
};

const CHILE_FUNDS = new Set(["Pionero", "Moneda_Renta_Variable", "Orange"]);

const MACRO_SECTOR_MAP: Record<string, string> = {
  "Acero":              "Materials",
  "Explosivos":         "Materials",
  "Forestal":           "Materials",
  "Min. Metal":         "Materials",
  "Min. No-Metal":      "Materials",
  "Alimentos":          "Consumer",
  "Bebidas":            "Consumer",
  "Salmones y Pesca":   "Consumer",
  "Retail":             "Consumer",
  "Bancos":             "Financials",
  "Grup. Financ.":      "Financials",
  "AFP":                "Financials",
  "Seguros y Salud":    "Financials",
  "Construcción":       "Industrials",
  "Transp y puerto":    "Industrials",
  "Conglomerados":      "Industrials",
  "Electrico":          "Utilities & Tech",
  "Telecom":            "Utilities & Tech",
  "Tecnología":         "Utilities & Tech",
};

export interface SectorSummary {
  sector: string;
  fundWeight: number;
  benchWeight: number;
  activeWeight: number;
  count: number;
}

export interface CarteraRow {
  company: string;
  portfolioPct: number;
  benchmarkPct: number;
  overweight: number;
  sector: string;
  macroSector: string;
  delta1W: number | null;
  delta1M: number | null;
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
  sectorSummary: SectorSummary[];
  error?: string;
  timeseries?: Record<string, string | number | null>[];
  fundMeta?: Record<string, { group: string; isMoneda: boolean }>;
}

function parsePercentAggressive(v: string | undefined): number | null {
  if (!v || v.trim() === "" || v.trim() === "—") return null;
  const clean = v
    .trim()
    .replace(/â/g, "-")
    .replace(/[\u2212\u2013\u2014\uFE63\uFF0D]/g, "-")
    .replace(/%/g, "")
    .replace(/,/g, "")
    .trim();
  if (!clean || /^-+$/.test(clean)) return null;
  const n = parseFloat(clean);
  return Number.isNaN(n) ? null : n / 100;
}

function getLatestRentabilidadesFile(): { file: string; date: string } | null {
  try {
    const parsed = fs
      .readdirSync(RENTABILIDADES_DIR)
      .filter((f) => f.endsWith(".csv"))
      .map((f) => {
        const m = f.match(/informe_rentabilidades[-_](\d{4}-\d{2}-\d{2})\.csv/i);
        return m ? { file: path.join(RENTABILIDADES_DIR, f), date: m[1] } : null;
      })
      .filter(Boolean) as { file: string; date: string }[];
    if (parsed.length === 0) return null;
    return parsed.sort((a, b) => b.date.localeCompare(a.date))[0];
  } catch {
    return null;
  }
}

function getRentabilidadesFilesForYear(year: string): { file: string; date: string }[] {
  try {
    const matched: { file: string; date: string }[] = [];
    const filenames = fs.readdirSync(RENTABILIDADES_DIR);

    for (const filename of filenames) {
      const match = filename.match(/informe_rentabilidades_(\d{4}-\d{2}-\d{2})\.csv/);
      if (!match) continue;
      const extractedDate = match[1];
      if (!extractedDate.startsWith(year)) continue;
      matched.push({
        file: path.join(RENTABILIDADES_DIR, filename),
        date: extractedDate,
      });
    }

    return matched.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

function selectChartFunds(rows: Record<string, string>[]): { fund: string; group: string; isMoneda: boolean }[] {
  const selected: { fund: string; group: string; isMoneda: boolean }[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const fund = row["FUND"]?.trim() ?? "";
    const group = row["group"]?.trim() ?? "";
    const isMoneda =
      group === "Moneda" ||
      (group === "Other Moneda Funds Returns" && (fund === "Glory" || fund === "Mercer"));
    if (isMoneda && fund && !seen.has(fund)) {
      selected.push({ fund, group: "Moneda", isMoneda: true });
      seen.add(fund);
    }
  }

  let peerCount = 0;
  for (const row of rows) {
    const fund = row["FUND"]?.trim() ?? "";
    const group = row["group"]?.trim() ?? "";
    if (group.startsWith("Peer") && fund && !seen.has(fund) && peerCount < 4) {
      selected.push({ fund, group: "Peer Group", isMoneda: false });
      seen.add(fund);
      peerCount++;
    }
  }

  let indexCount = 0;
  for (const row of rows) {
    const fund = row["FUND"]?.trim() ?? "";
    const group = row["group"]?.trim() ?? "";
    if (group === "Indices" && fund && !seen.has(fund) && indexCount < 3) {
      selected.push({ fund, group: "Indices", isMoneda: false });
      seen.add(fund);
      indexCount++;
    }
  }

  return selected;
}

function buildRentabilidadesTimeseries(
  pageNum: string
): {
  timeseries: Record<string, string | number | null>[];
  fundMeta: Record<string, { group: string; isMoneda: boolean }>;
} {
  const latest = getLatestRentabilidadesFile();
  if (!latest) return { timeseries: [], fundMeta: {} };

  const latestContent = fs.readFileSync(latest.file, "utf-8");
  const latestRows = Papa.parse<Record<string, string>>(latestContent, {
    header: true,
    skipEmptyLines: true,
  }).data.filter((row) => row["page_num"]?.trim() === pageNum);

  const chartFunds = selectChartFunds(latestRows);
  const fundSet = new Set(chartFunds.map((f) => f.fund));

  const fundMeta: Record<string, { group: string; isMoneda: boolean }> = {};
  for (const f of chartFunds) {
    fundMeta[f.fund] = { group: f.group, isMoneda: f.isMoneda };
  }

  const year = latest.date.substring(0, 4);
  const yearFiles = getRentabilidadesFilesForYear(year);

  const timeseries = yearFiles.map(({ file, date }) => {
    const content = fs.readFileSync(file, "utf-8");
    const rows = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
    }).data;

    const point: Record<string, string | number | null> = { date };
    for (const fund of fundSet) point[fund] = null;

    for (const row of rows) {
      if (row["page_num"]?.trim() !== pageNum) continue;
      const fund = row["FUND"]?.trim() ?? "";
      if (fundSet.has(fund)) {
        point[fund] = parsePercentAggressive(row["YTD"]);
      }
    }

    return point;
  });

  return { timeseries, fundMeta };
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

// Load Chile sector dictionary: company (lowercase) → micro-sector
function loadChileIndustries(): Record<string, string> {
  try {
    const content = fs.readFileSync(CHILE_INDUSTRIES_FILE, "utf-8");
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

// Load LATAM GICS dictionary: company (uppercase) → GICS industry
function loadLatamIndustries(): Record<string, string> {
  try {
    const content = fs.readFileSync(LATAM_INDUSTRIES_FILE, "utf-8");
    const { data } = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
    });
    const map: Record<string, string> = {};
    for (const row of data) {
      const company = row["Company"]?.trim();
      const industry = row["Industry"]?.trim();
      if (company && industry) map[company.toUpperCase()] = industry;
    }
    return map;
  } catch {
    return {};
  }
}

// Aggregate cartera rows into sector summaries
function buildSectorSummary(cartera: CarteraRow[]): SectorSummary[] {
  const groups: Record<string, { fundWeight: number; benchWeight: number; count: number }> = {};
  for (const row of cartera) {
    const s = row.macroSector || "Unclassified";
    if (!groups[s]) groups[s] = { fundWeight: 0, benchWeight: 0, count: 0 };
    groups[s].fundWeight += row.portfolioPct;
    groups[s].benchWeight += row.benchmarkPct;
    groups[s].count += 1;
  }
  return Object.entries(groups).map(([sector, g]) => ({
    sector,
    fundWeight: g.fundWeight,
    benchWeight: g.benchWeight,
    activeWeight: g.fundWeight - g.benchWeight,
    count: g.count,
  }));
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

  const isChile = CHILE_FUNDS.has(meta.name);
  const industryMap = isChile ? loadChileIndustries() : loadLatamIndustries();

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
      // Chile uses lowercase keys; LATAM uses uppercase keys
      const lookupKey = isChile ? company.toLowerCase() : company.toUpperCase();
      const rawSector = industryMap[lookupKey] ?? "Unclassified";
      // Chile: map micro-sector → macro-sector; LATAM: GICS industry is already the right level
      const macroSector = isChile
        ? (MACRO_SECTOR_MAP[rawSector] ?? "Other")
        : rawSector;

      const currentPct = parseFloat(r[portfolioCol]) || 0;
      const delta1W = has1W ? currentPct - (weights1W[company.toLowerCase()] ?? 0) : null;
      const delta1M = has1M ? currentPct - (weights1M[company.toLowerCase()] ?? 0) : null;

      return {
        company,
        portfolioPct: currentPct,
        benchmarkPct: parseFloat(r[benchmarkCol]) || 0,
        overweight: parseFloat(r[overweightCol]) || 0,
        sector: rawSector,
        macroSector,
        delta1W,
        delta1M,
      };
    });

  const sectorSummary = buildSectorSummary(cartera);

  return { ...meta, benchmark: benchmarkName, cartera, sectorSummary };
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
      const pageNum = FUND_PAGE_MAP[meta.name];
      const { timeseries, fundMeta } = pageNum
        ? buildRentabilidadesTimeseries(pageNum)
        : { timeseries: [], fundMeta: {} };

      return NextResponse.json({ ...data, timeseries, fundMeta });
    } catch (err) {
      const { file: _f, ...meta } = match;
      return NextResponse.json({
        ...meta, benchmark: "", cartera: [], sectorSummary: [], error: String(err),
      });
    }
  } catch (error) {
    console.error("Fondos API error:", error);
    return NextResponse.json({ error: "Error loading fund data" }, { status: 500 });
  }
}
