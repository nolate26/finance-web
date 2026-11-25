import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeTicker } from "@/lib/issuer";

const DISPLAY_NAMES: Record<string, string> = {
  Moneda_Renta_Variable: "MRV",
  "Moneda_Latin_America_Equities_(LX)": "LA Equities (LX)",
  "Moneda_Latin_America_Small_Cap_(LX)": "LA Small Cap (LX)",
  Pionero: "Pionero",
  Orange: "Orange",
  Glory: "Glory",
  Mercer: "Mercer",
  Patria_Long_Biased_Master_FIM: "Patria Long Biased",
  Patria_LO_Master_FIA: "Patria Long Only",
};

const CHILE_FUNDS = new Set(["Pionero", "Moneda_Renta_Variable", "Orange"]);
// Hojas LB / LO del Excel diario de Patria (scripts/ingest_brazil_portfolio.py).
// A diferencia de Chile/LATAM, `company` trae el ticker BBG y no el nombre, y no
// hay benchmark: nombre y sector salen de empresas_industrias_v2 por ticker.
const BRAZIL_FUNDS = new Set(["Patria_Long_Biased_Master_FIM", "Patria_LO_Master_FIA"]);

type Region = "Chile" | "LATAM" | "Brazil";

function regionOf(fundName: string): Region {
  if (CHILE_FUNDS.has(fundName)) return "Chile";
  if (BRAZIL_FUNDS.has(fundName)) return "Brazil";
  return "LATAM";
}


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
  ticker?: string; // sólo Brasil: el ticker BBG tal como está guardado en `company`
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
  region: Region;
}

export interface FondoData extends FondoMeta {
  benchmark: string;
  hasBenchmark: boolean;
  cartera: CarteraRow[];
  sectorSummary: SectorSummary[];
  error?: string;
}

// ── Industry maps (built from empresas_industrias_v2 DB table) ───────────────
//
// Chile funds report using international names, so the portfolio holdings
// may not match nombre_chile.  We try two keys and always return industria_chile:
//
//   1. nombre_chile.toLowerCase()  → industria_chile  (exact local match)
//   2. nombre_latam.toLowerCase()  → industria_chile  (fallback via global name)
//
// LATAM funds use only nombre_latam → industria_gics.
// Brazil funds hold BBG tickers: ticker_bloomberg → nombre_latam + industria_gics.

type IndustryMaps = {
  chileByChile: Map<string, string>; // nombre_chile.lower() → industria_chile
  chileByLatam: Map<string, string>; // nombre_latam.lower() → industria_chile
  latamMap:     Map<string, string>; // nombre_latam.lower() → industria_gics
  byTicker:     Map<string, { name: string; sector: string }>; // ticker canónico
};

async function loadIndustryMaps(): Promise<IndustryMaps> {
  const rows = await prisma.empresasIndustriasV2.findMany();

  const chileByChile = new Map<string, string>();
  const chileByLatam = new Map<string, string>();
  const latamMap     = new Map<string, string>();
  const byTicker     = new Map<string, { name: string; sector: string }>();

  for (const r of rows) {
    if (r.tickerBloomberg) {
      byTicker.set(normalizeTicker(r.tickerBloomberg), {
        name:   r.nombreLatam || r.tickerBloomberg,
        sector: r.industriaGics || "Unclassified",
      });
    }
    // Fuente con campos vacíos: ignorar filas sin nombre_latam (IS NOT NULL AND <> '')
    if (!r.nombreLatam) continue;
    const latamKey = r.nombreLatam.toLowerCase().trim();
    if (r.industriaChile) {
      if (r.nombreChile) chileByChile.set(r.nombreChile.toLowerCase().trim(), r.industriaChile);
      chileByLatam.set(latamKey, r.industriaChile);
    }
    if (r.industriaGics) latamMap.set(latamKey, r.industriaGics);
  }

  return { chileByChile, chileByLatam, latamMap, byTicker };
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
        return { id, name, displayName, date, region: regionOf(name) };
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
      region: regionOf(fundName),
    };

    try {
      // ── Load holdings from DB ────────────────────────────────────────────
      const holdings = await prisma.fundPortfolioWeight.findMany({
        where: { fundName, reportDate },
        orderBy: { portfolioWeight: "desc" },
      });

      if (holdings.length === 0) throw new Error("No holdings found");

      // Sin benchmark (Brasil) la vista muestra pesos absolutos en vez de activos.
      const hasBenchmark = holdings.some((h) => h.benchmarkName != null || h.benchmarkWeight != null);
      const benchmarkName = holdings[0].benchmarkName ?? (hasBenchmark ? "Benchmark" : "");
      const isChile = CHILE_FUNDS.has(fundName);
      const isBrazil = BRAZIL_FUNDS.has(fundName);
      const { chileByChile, chileByLatam, latamMap, byTicker } = await loadIndustryMaps();

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
        // Brazil: futuros y opciones de índice ("BZZ6 Index", "ESZ6 Index") no
        // están en la maestra → bucket propio en vez de inflar "Unclassified".
        const brazilHit = isBrazil ? byTicker.get(normalizeTicker(company)) : undefined;
        const rawSector = isBrazil
          ? (brazilHit?.sector ?? (/ INDEX$/i.test(company.trim()) ? "Index & Futures" : "Unclassified"))
          : isChile
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
          company: isBrazil ? (brazilHit?.name ?? company) : company,
          ...(isBrazil ? { ticker: company } : {}),
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


      return NextResponse.json({
        ...meta,
        benchmark: benchmarkName,
        hasBenchmark,
        cartera,
        sectorSummary,
      });
    } catch (err) {
      return NextResponse.json({
        ...meta,
        benchmark: "",
        hasBenchmark: false,
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
