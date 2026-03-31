import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import Papa from "papaparse";

const RENTABILIDADES_DIR = path.join(process.cwd(), "data", "Fondos", "Rentabilidades");

export interface RentabilidadRow {
  fund: string;
  manager: string;
  group: string;
  currency: string;
  mtd: number | null;
  ytd: number | null;
  oneYear: number | null;
  threeYears: number | null;
  fiveYears: number | null;
  tenYears: number | null;
  aum: number | null;
  sharpe: number | null;
  mgmtFee: number | null;
  annSinceIncep: number | null;
  isMoneda: boolean;
}

export interface FundMeta {
  group: string;
  isMoneda: boolean;
}

/** Converts Excel-style percentage strings to decimals.
 *  Handles Unicode minus signs (U+2212, en-dash, em-dash) from Excel exports. */
function parsePercent(v: string | undefined): number | null {
  if (!v || v.trim() === "" || v.trim() === "—") return null;
  const s = v
    .trim()
    .replace(/â/g, "-")
    .replace(/[\u2212\u2013\u2014\uFE63\uFF0D]/g, "-")
    .replace(/%/g, "")
    .replace(/,/g, "")
    .trim();
  if (s === "" || s === "-") return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n / 100;
}

function parseNum(v: string | undefined): number | null {
  if (!v || v.trim() === "" || v.trim() === "—") return null;
  const s = v
    .trim()
    .replace(/â/g, "-")
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/,/g, "")
    .trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Returns the LAST non-empty "ANNUALIZED S. INCEP." value in the row.
 *  Last-wins ensures the fund's own inception column takes precedence
 *  over earlier cross-reference columns (e.g. ANNUALIZED S. INCEP. ORANGE). */
function findAnnSinceIncep(row: Record<string, string>): number | null {
  let result: number | null = null;
  for (const key of Object.keys(row)) {
    if (key.trim().startsWith("ANNUALIZED S. INCEP.") && row[key]?.trim()) {
      const v = parsePercent(row[key]);
      if (v !== null) result = v;
    }
  }
  return result;
}

/** Lists and parses all CSV files in the Rentabilidades directory,
 *  returning those whose date matches the given year prefix, sorted oldest→newest. */
/** Parse a date string YYYY-MM-DD → epoch ms for reliable chronological sorting */
function dateMs(iso: string): number {
  return new Date(iso).getTime();
}

/** Strict regex: anchored, handles both `-` and `_` separators before the date */
const FILE_REGEX = /^informe_rentabilidades[-_](\d{4}-\d{2}-\d{2})\.csv$/i;

function getFilesForYear(year: string): { file: string; date: string }[] {
  try {
    const all = fs.readdirSync(RENTABILIDADES_DIR).filter((f) => f.endsWith(".csv"));
    const matched = all
      .map((f) => {
        const m = f.match(FILE_REGEX);
        return m && m[1].startsWith(year)
          ? { file: path.join(RENTABILIDADES_DIR, f), date: m[1] }
          : null;
      })
      .filter(Boolean) as { file: string; date: string }[];
    // ISO date strings (YYYY-MM-DD) sort perfectly with localeCompare → oldest first
    return matched.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

function getMostRecentFile(): { file: string; date: string } | null {
  try {
    const all = fs.readdirSync(RENTABILIDADES_DIR).filter((f) => f.endsWith(".csv"));
    const matched = all
      .map((f) => {
        const m = f.match(FILE_REGEX);
        return m ? { file: path.join(RENTABILIDADES_DIR, f), date: m[1] } : null;
      })
      .filter(Boolean) as { file: string; date: string }[];
    if (matched.length === 0) return null;
    // Sort ascending, take the last element = most recent date
    const sorted = matched.sort((a, b) => a.date.localeCompare(b.date));
    return sorted[sorted.length - 1];
  } catch {
    return null;
  }
}

/** From the latest snapshot rows for a page, select the funds to chart:
 *  – All Moneda funds (isMoneda)
 *  – Up to 4 Peer Group rows (first in order)
 *  – Up to 3 Indices rows (first in order) */
function selectChartFunds(rows: RentabilidadRow[]): (FundMeta & { fund: string })[] {
  const result: (FundMeta & { fund: string })[] = [];

  for (const r of rows) {
    if (r.isMoneda) result.push({ fund: r.fund, group: r.group, isMoneda: true });
  }

  for (const r of rows) {
    if (!r.isMoneda && r.group.startsWith("Peer")) {
      result.push({ fund: r.fund, group: r.group, isMoneda: false });
    }
  }

  for (const r of rows) {
    if (r.group === "Indices") {
      result.push({ fund: r.fund, group: r.group, isMoneda: false });
    }
  }

  return result;
}

/** Reads every year-file chronologically and extracts YTD for the selected funds,
 *  building a Recharts-ready timeseries:
 *  [{ date: '2026-01-02', 'Pionero A': 0.006, 'IPSA': null, ... }, ...] */
function buildTimeseries(
  pageFilter: string,
  chartFunds: (FundMeta & { fund: string })[],
  yearFiles: { file: string; date: string }[]
): Record<string, string | number | null>[] {
  const fundNames = new Set(chartFunds.map((f) => f.fund));

  return yearFiles.map(({ file, date }) => {
    const content = fs.readFileSync(file, "utf-8");
    const { data } = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
    });

    // Initialize every fund to null so Recharts shows a gap if missing
    const point: Record<string, string | number | null> = { date };
    for (const fund of fundNames) point[fund] = null;

    for (const row of data) {
      if (row["page_num"]?.trim() !== pageFilter) continue;
      const fund = row["FUND"]?.trim() ?? "";
      if (fundNames.has(fund)) {
        point[fund] = parsePercent(row["YTD"]);
      }
    }

    return point;
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pageFilter = searchParams.get("page");

  const latest = getMostRecentFile();
  if (!latest) {
    return NextResponse.json({ error: "No rentabilidades files found" }, { status: 404 });
  }

  const content = fs.readFileSync(latest.file, "utf-8");
  const { data } = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  const reportDate = data[0]?.["report_date"] ?? "";
  const file = path.basename(latest.file);

  const pages: Record<string, RentabilidadRow[]> = {};

  for (const row of data) {
    const pageNum = row["page_num"]?.trim();
    if (!pageNum) continue;
    if (pageFilter && pageNum !== pageFilter) continue;

    if (!pages[pageNum]) pages[pageNum] = [];

    const group = row["group"]?.trim() ?? "";
    const fund = row["FUND"]?.trim() ?? "";
    const isMoneda =
      group === "Moneda" ||
      (group === "Other Moneda Funds Returns" &&
        (fund === "Glory" || fund === "Mercer"));

    pages[pageNum].push({
      fund,
      manager: row["Manager"]?.trim() ?? "",
      group,
      currency: row["currency"]?.trim() ?? "",
      mtd: parsePercent(row["MTD"]),
      ytd: parsePercent(row["YTD"]),
      oneYear: parsePercent(row["1_year"]),
      threeYears: parsePercent(row["3_years"]),
      fiveYears: parsePercent(row["5_years"]),
      tenYears: parsePercent(row["10_years"]),
      aum: parseNum(row["AUM_USD_mm"]),
      sharpe: parseNum(row["Sharpe"]),
      mgmtFee: parsePercent(row["Mgmt_Fee"]),
      annSinceIncep: findAnnSinceIncep(row),
      isMoneda,
    });
  }

  if (pageFilter) {
    const rows = pages[pageFilter] ?? [];

    // Build timeseries: use the year from the latest file's date
    const year = latest.date.substring(0, 4);
    const yearFiles = getFilesForYear(year);
    const chartFunds = selectChartFunds(rows);
    const timeseries = buildTimeseries(pageFilter, chartFunds, yearFiles);

    // Build fundMeta map for frontend line coloring
    const fundMeta: Record<string, FundMeta> = {};
    for (const cf of chartFunds) {
      fundMeta[cf.fund] = { group: cf.group, isMoneda: cf.isMoneda };
    }

    return NextResponse.json({ reportDate, file, rows, timeseries, fundMeta });
  }

  return NextResponse.json({ reportDate, file, pages });
}
