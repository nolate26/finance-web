import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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


// ── Types (kept for frontend contract) ───────────────────────────────────────
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

// ── Industry maps (built from empresas_industrias DB table) ──────────────────
//
// Chile funds report using international names, so the portfolio holdings
// may not match nombre_chile.  We try two keys and always return industria_chile:
//
//   1. nombre_chile.toLowerCase()  → industria_chile  (exact local match)
//   2. nombre_latam.toLowerCase()  → industria_chile  (fallback via global name)
//
// LATAM funds use only nombre_latam → industria_gics.

type IndustryMaps = {
  chileByChile: Map<string, string>; // nombre_chile.lower() → industria_chile
  chileByLatam: Map<string, string>; // nombre_latam.lower() → industria_chile
  latamMap:     Map<string, string>; // nombre_latam.lower() → industria_gics
};

async function loadIndustryMaps(): Promise<IndustryMaps> {
  const rows = await prisma.empresasIndustrias.findMany();

  const chileByChile = new Map<string, string>();
  const chileByLatam = new Map<string, string>();
  const latamMap     = new Map<string, string>();

  for (const r of rows) {
    const latamKey = r.nombreLatam.toLowerCase().trim();
    if (r.industriaChile) {
      if (r.nombreChile) chileByChile.set(r.nombreChile.toLowerCase().trim(), r.industriaChile);
      chileByLatam.set(latamKey, r.industriaChile);
    }
    if (r.industriaGics) latamMap.set(latamKey, r.industriaGics);
  }

  return { chileByChile, chileByLatam, latamMap };
}

// ── Sector aggregation ────────────────────────────────────────────────────────
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

// ── Date / numeric helpers (same logic as rentabilidades/route.ts) ─────────────
const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** "9/Jan/2026" → "2026-01-09". Passthrough if already ISO or unrecognised. */
function parseDateToISO(raw: string): string {
  const match = raw.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})$/);
  if (match) {
    const [, day, mon, year] = match;
    const mm = MONTH_MAP[mon] ?? "01";
    return `${year}-${mm}-${day.padStart(2, "0")}`;
  }
  return raw;
}

/** Percentage stored in DB (e.g. 3.5) → decimal for frontend (0.035). */
function toDec(v: number | null | undefined): number | null {
  if (v == null) return null;
  return v / 100;
}

// ── Rentabilidades timeseries (from moneda_fund_returns) ──────────────────────
async function buildRentabilidadesTimeseries(pageNum: string): Promise<{
  timeseries: Record<string, string | number | null>[];
  fundMeta: Record<string, { group: string; isMoneda: boolean }>;
}> {
  const pageInt = parseInt(pageNum, 10);

  // Can't rely on DB ORDER BY for "D/MMM/YYYY" strings — sort in JS after parsing.
  const allDateRecords = await prisma.monedaFundReturn.findMany({
    where: { pageNum: pageInt },
    select: { reportDate: true },
    distinct: ["reportDate"],
  });
  if (allDateRecords.length === 0) return { timeseries: [], fundMeta: {} };

  const sortedDates = allDateRecords
    .map((r) => ({ raw: r.reportDate, iso: parseDateToISO(r.reportDate) }))
    .sort((a, b) => a.iso.localeCompare(b.iso));

  const latestEntry = sortedDates[sortedDates.length - 1];
  const latestDateRaw = latestEntry.raw; // used for DB WHERE
  const latestDateISO = latestEntry.iso; // used for year extraction
  const year = latestDateISO.substring(0, 4);

  // Get all rows for latest date to determine chart funds
  const latestRows = await prisma.monedaFundReturn.findMany({
    where: { pageNum: pageInt, reportDate: latestDateRaw },
    select: { fund: true, fundGroup: true },
  });

  // Select chart funds: Moneda + all peers + indices
  const fundMeta: Record<string, { group: string; isMoneda: boolean }> = {};
  for (const r of latestRows) {
    const group = r.fundGroup ?? "";
    const fund = r.fund;
    const isMoneda =
      group === "Moneda" || group === "Other Moneda Funds Returns";
    if (isMoneda || group.startsWith("Peer") || group === "Indices") {
      fundMeta[fund] = {
        group: isMoneda ? "Moneda" : group.startsWith("Peer") ? "Peer Group" : "Indices",
        isMoneda,
      };
    }
  }

  const fundSet = new Set(Object.keys(fundMeta));
  if (fundSet.size === 0) return { timeseries: [], fundMeta: {} };

  // Dates in DB end with "/<year>" (e.g. "9/Jan/2026") — use endsWith filter.
  const yearRows = await prisma.monedaFundReturn.findMany({
    where: {
      pageNum: pageInt,
      reportDate: { endsWith: `/${year}` },
      fund: { in: Array.from(fundSet) },
    },
    select: { reportDate: true, fund: true, ytd: true },
  });

  // Sort chronologically using parsed ISO dates
  yearRows.sort((a, b) =>
    parseDateToISO(a.reportDate).localeCompare(parseDateToISO(b.reportDate))
  );

  const dateMap = new Map<string, Record<string, string | number | null>>();
  for (const row of yearRows) {
    const d = parseDateToISO(row.reportDate); // ISO date for the frontend
    if (!dateMap.has(d)) {
      const point: Record<string, string | number | null> = { date: d };
      for (const f of fundSet) point[f] = null;
      dateMap.set(d, point);
    }
    dateMap.get(d)![row.fund] = toDec(row.ytd);
  }

  return { timeseries: Array.from(dateMap.values()), fundMeta };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fondoId = searchParams.get("fondo");

    // ── List available funds (distinct fund_name + report_date) ─────────────
    if (!fondoId) {
      const distinct = await prisma.fundPortfolioWeight.findMany({
        select: { fundName: true, reportDate: true },
        distinct: ["fundName", "reportDate"],
        orderBy: [{ fundName: "asc" }, { reportDate: "asc" }],
      });

      const fondos: FondoMeta[] = distinct.map((r) => {
        const name = r.fundName;
        const date = r.reportDate.toISOString().split("T")[0];
        const id = `${name}_${date}`;
        const displayName = DISPLAY_NAMES[name] ?? name.replace(/_/g, " ");
        const region: "Chile" | "LATAM" = CHILE_FUNDS.has(name) ? "Chile" : "LATAM";
        return { id, name, displayName, date, region };
      });

      return NextResponse.json({ fondos });
    }

    // ── Parse fondoId → fundName + date ──────────────────────────────────────
    // Format: "Pionero_2026-01-15" or "Moneda_Latin_America_Equities_(LX)_2026-01-15"
    const dateMatch = fondoId.match(/_(\d{4}-\d{2}-\d{2})$/);
    if (!dateMatch) {
      return NextResponse.json({ error: `Invalid fund id: ${fondoId}` }, { status: 400 });
    }
    const date = dateMatch[1];
    const fundName = fondoId.slice(0, fondoId.length - date.length - 1);

    // Check it exists in DB
    const reportDate = new Date(date + "T00:00:00");
    const count = await prisma.fundPortfolioWeight.count({
      where: { fundName, reportDate },
    });
    if (count === 0) {
      return NextResponse.json({ error: `Fund '${fondoId}' not found` }, { status: 404 });
    }

    const meta: FondoMeta = {
      id: fondoId,
      name: fundName,
      displayName: DISPLAY_NAMES[fundName] ?? fundName.replace(/_/g, " "),
      date,
      region: CHILE_FUNDS.has(fundName) ? "Chile" : "LATAM",
    };

    try {
      // ── Load holdings from DB ────────────────────────────────────────────
      const holdings = await prisma.fundPortfolioWeight.findMany({
        where: { fundName, reportDate },
        orderBy: { portfolioWeight: "desc" },
      });

      if (holdings.length === 0) throw new Error("No holdings found");

      const benchmarkName = holdings[0].benchmarkName ?? "Benchmark";
      const isChile = CHILE_FUNDS.has(fundName);
      const { chileByChile, chileByLatam, latamMap } = await loadIndustryMaps();

      // ── Find closest prior snapshots for delta calculations ──────────────
      const allDatesForFund = await prisma.fundPortfolioWeight.findMany({
        where: { fundName, reportDate: { lt: reportDate } },
        select: { reportDate: true },
        distinct: ["reportDate"],
        orderBy: { reportDate: "desc" },
      });

      const findClosestDate = (daysAgo: number): Date | null => {
        const target = reportDate.getTime() - daysAgo * 86400000;
        if (allDatesForFund.length === 0) return null;
        return allDatesForFund.reduce(
          (best, r) => {
            const diff = Math.abs(r.reportDate.getTime() - target);
            const bestDiff = Math.abs(best.getTime() - target);
            return diff < bestDiff ? r.reportDate : best;
          },
          allDatesForFund[0].reportDate
        );
      };

      const date1W = findClosestDate(7);
      const date1M = findClosestDate(30);

      // Build weight maps for delta calculation
      const buildWeightMapDB = async (d: Date | null): Promise<Record<string, number>> => {
        if (!d) return {};
        const rows = await prisma.fundPortfolioWeight.findMany({
          where: { fundName, reportDate: d },
          select: { company: true, portfolioWeight: true },
        });
        const map: Record<string, number> = {};
        for (const r of rows) map[r.company.toLowerCase()] = r.portfolioWeight ?? 0;
        return map;
      };

      const [weights1W, weights1M] = await Promise.all([
        buildWeightMapDB(date1W),
        buildWeightMapDB(date1M),
      ]);

      const has1W = date1W !== null;
      const has1M = date1M !== null;

      // ── Build cartera rows ───────────────────────────────────────────────
      const cartera: CarteraRow[] = holdings.map((r) => {
        const company = r.company;
        const key = company.toLowerCase().trim();
        // Chile funds: try nombre_chile match first, then nombre_latam fallback.
        // Industry assigned is always industria_chile regardless of which key matched.
        // LATAM funds: use nombre_latam → industria_gics directly.
        const rawSector = isChile
          ? (chileByChile.get(key) ?? chileByLatam.get(key) ?? "Unclassified")
          : (latamMap.get(key) ?? "Unclassified");
        if (key === "edelpa") console.log("[fondos] Cruce de EDELPA:", rawSector);
        // Dictatorial rule: macroSector === rawSector.
        // Chile view → industria_chile string. LATAM view → industria_gics string.
        // No macro-bucket translation — keeps the chart in a single language.
        const macroSector = rawSector;

        const currentPct = r.portfolioWeight ?? 0;
        const delta1W = has1W ? currentPct - (weights1W[company.toLowerCase()] ?? 0) : null;
        const delta1M = has1M ? currentPct - (weights1M[company.toLowerCase()] ?? 0) : null;

        return {
          company,
          portfolioPct: currentPct,
          benchmarkPct: r.benchmarkWeight ?? 0,
          overweight: r.overweight ?? 0,
          sector: rawSector,
          macroSector,
          delta1W,
          delta1M,
        };
      });

      const sectorSummary = buildSectorSummary(cartera);

      // ── Build rentabilidades timeseries ──────────────────────────────────
      const pageNum = FUND_PAGE_MAP[fundName];
      const { timeseries, fundMeta } = pageNum
        ? await buildRentabilidadesTimeseries(pageNum)
        : { timeseries: [], fundMeta: {} };

      return NextResponse.json({
        ...meta,
        benchmark: benchmarkName,
        cartera,
        sectorSummary,
        timeseries,
        fundMeta,
      });
    } catch (err) {
      return NextResponse.json({
        ...meta,
        benchmark: "",
        cartera: [],
        sectorSummary: [],
        error: String(err),
      });
    }
  } catch (error) {
    console.error("Fondos API error:", error);
    return NextResponse.json({ error: "Error loading fund data" }, { status: 500 });
  }
}
