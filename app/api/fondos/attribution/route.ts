import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import Papa from "papaparse";

const PA_DIR = path.join(process.cwd(), "data", "Fondos", "Performance_Attribution");
const PA_FILE_REGEX = /^pa_(\d{4}-\d{2}-\d{2})\.csv$/i;

function parseFlt(v: string | undefined): number | null {
  if (!v || v.trim() === "" || v.trim() === "—") return null;
  const n = parseFloat(v.trim());
  return isNaN(n) ? null : n;
}

function getAllFiles(): { file: string; date: string }[] {
  try {
    const all = fs.readdirSync(PA_DIR).filter((f) => f.endsWith(".csv"));
    const matched = all
      .map((f) => {
        const m = f.match(PA_FILE_REGEX);
        return m ? { file: path.join(PA_DIR, f), date: m[1] } : null;
      })
      .filter(Boolean) as { file: string; date: string }[];
    // ISO dates sort alphabetically = chronologically
    return matched.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

function parseFile(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const { data } = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });
  return data;
}

export interface AttributionRow {
  security: string;
  fundWeight: number | null;
  benchWeight: number | null;
  activeWeight: number | null;
  allocEffect: number | null;
  selectEffect: number | null;
  totalEffect: number | null;
  deltaWeight: number | null;
  deltaTotalEffect: number | null;
}

export interface HistoryPoint {
  date: string;
  weight: number | null;
  totalEffect: number | null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fund = searchParams.get("fund");
  if (!fund) {
    return NextResponse.json({ error: "fund parameter required" }, { status: 400 });
  }

  const files = getAllFiles();
  if (files.length === 0) {
    return NextResponse.json({ error: "No attribution files found" }, { status: 404 });
  }

  // Collect per-snapshot rows for the requested fund
  const snapshots: { date: string; rows: Record<string, string>[] }[] = [];
  const history: Record<string, HistoryPoint[]> = {};

  for (const { file, date } of files) {
    const rows = parseFile(file).filter(
      (r) => r["FUND"]?.trim() === fund && r["ROW_TYPE"]?.trim() === "company"
    );
    snapshots.push({ date, rows });

    for (const r of rows) {
      const security = r["SECURITY"]?.trim() ?? "";
      if (!security) continue;
      if (!history[security]) history[security] = [];
      history[security].push({
        date,
        weight: parseFlt(r["FUND_AVG_WEIGHT"]),
        totalEffect: parseFlt(r["TOTAL EFFECT"]),
      });
    }
  }

  // Build current period from the latest snapshot
  const current = snapshots[snapshots.length - 1];
  const prev = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null;

  // Index prev period by security for O(1) lookup
  const prevMap = new Map<string, Record<string, string>>();
  if (prev) {
    for (const r of prev.rows) {
      const sec = r["SECURITY"]?.trim() ?? "";
      if (sec) prevMap.set(sec, r);
    }
  }

  const currentPeriod: AttributionRow[] = current.rows.map((r) => {
    const security = r["SECURITY"]?.trim() ?? "";
    const fundWeight = parseFlt(r["FUND_AVG_WEIGHT"]);
    const benchWeight = parseFlt(r["BENCH_AVG_WEIGHT"]);
    const totalEffect = parseFlt(r["TOTAL EFFECT"]);
    const activeWeight =
      fundWeight !== null && benchWeight !== null ? fundWeight - benchWeight : null;

    const prevRow = prevMap.get(security) ?? null;
    const prevFundWeight = prevRow ? parseFlt(prevRow["FUND_AVG_WEIGHT"]) : null;
    const prevTotalEffect = prevRow ? parseFlt(prevRow["TOTAL EFFECT"]) : null;

    // For new positions (no prev), delta = full current value
    const deltaWeight =
      fundWeight !== null && prevFundWeight !== null
        ? fundWeight - prevFundWeight
        : fundWeight;

    const deltaTotalEffect =
      totalEffect !== null && prevTotalEffect !== null
        ? totalEffect - prevTotalEffect
        : totalEffect;

    return {
      security,
      fundWeight,
      benchWeight,
      activeWeight,
      allocEffect: parseFlt(r["ALLOC. EFFECT"]),
      selectEffect: parseFlt(r["SELECT. EFFECT"]),
      totalEffect,
      deltaWeight,
      deltaTotalEffect,
    };
  });

  return NextResponse.json({
    fund,
    currentDate: current.date,
    currentPeriod,
    history,
  });
}
