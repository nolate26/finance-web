import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Shared types ──────────────────────────────────────────────────────────────

export interface MetricBlock {
  y0: number | null;
  y1: number | null;
  y2: number | null;
}

/**
 * DeltaBlock is indexed by the CURRENT row's y-positions.
 * delta.y0 = % change for the calendar year that curr.y0 represents,
 *            compared to the prev snapshot's value for that same calendar year.
 * null = no prior data for that calendar year (e.g. newly added forecast year).
 */
export interface DeltaBlock {
  y0: number | null;
  y1: number | null;
  y2: number | null;
}

export interface DeltaSet {
  ingresos: DeltaBlock | null;
  ebitda:   DeltaBlock | null;
  ebit:     DeltaBlock | null;
  utilidad: DeltaBlock | null;
}

export interface ProjectionRowAPI {
  empresa:   string;
  moneda:    string;
  sector:    string;
  base_year: number;
  ingresos:  MetricBlock | null;
  ebitda:    MetricBlock | null;
  ebit:      MetricBlock | null;
  utilidad:  MetricBlock | null;
  /** null when no prior snapshot exists for this company */
  delta:     DeltaSet | null;
}

// ── Prisma row shape (subset we need) ─────────────────────────────────────────
type PrismaRow = {
  empresa:      string;
  moneda:       string | null;
  base_year:    number;
  ingresos_y0:  number | null;
  ingresos_y1:  number | null;
  ingresos_y2:  number | null;
  ebitda_y0:    number | null;
  ebitda_y1:    number | null;
  ebitda_y2:    number | null;
  ebit_y0:      number | null;
  ebit_y1:      number | null;
  ebit_y2:      number | null;
  utilidad_y0:  number | null;
  utilidad_y1:  number | null;
  utilidad_y2:  number | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a MetricBlock; returns null only when every present value is exactly 0. */
function blockOrNull(
  v0: number | null | undefined,
  v1: number | null | undefined,
  v2: number | null | undefined,
): MetricBlock | null {
  const n0 = v0 ?? null;
  const n1 = v1 ?? null;
  const n2 = v2 ?? null;
  const values = [n0, n1, n2].filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  if (values.every((v) => v === 0)) return null;
  return { y0: n0, y1: n1, y2: n2 };
}

/**
 * Given a MetricBlock and its base_year, return the value that corresponds
 * to `targetCalendarYear`.  Returns null if the year is out of the [y0..y2] window.
 */
function getYearValue(
  block: MetricBlock | null,
  baseYear: number,
  targetCalendarYear: number,
): number | null {
  if (!block) return null;
  const offset = targetCalendarYear - baseYear;
  if (offset === 0) return block.y0;
  if (offset === 1) return block.y1;
  if (offset === 2) return block.y2;
  return null; // calendar year is outside this snapshot's window
}

/** Percentage change: ((curr / prev) - 1) * 100.  null when prev is 0 or missing. */
function pctDelta(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr / prev) - 1) * 100;
}

/**
 * Calendar-aware delta.
 * For each y-slot in `curr` (which represents calendar year currBase + n),
 * looks up the corresponding value in `prev` using `getYearValue`.
 * Returns null when there is no overlap at all.
 */
function deltaBlockCalendar(
  currBlock: MetricBlock | null,
  currBase:  number,
  prevBlock: MetricBlock | null,
  prevBase:  number,
): DeltaBlock | null {
  // Calculate pct delta for each current year-slot against the matching prev value
  const d0 = pctDelta(
    currBlock?.y0 ?? null,
    getYearValue(prevBlock, prevBase, currBase),       // currBase + 0
  );
  const d1 = pctDelta(
    currBlock?.y1 ?? null,
    getYearValue(prevBlock, prevBase, currBase + 1),
  );
  const d2 = pctDelta(
    currBlock?.y2 ?? null,
    getYearValue(prevBlock, prevBase, currBase + 2),
  );

  if (d0 === null && d1 === null && d2 === null) return null;
  return { y0: d0, y1: d1, y2: d2 };
}

function buildBlocks(row: PrismaRow) {
  return {
    ingresos: blockOrNull(row.ingresos_y0, row.ingresos_y1, row.ingresos_y2),
    ebitda:   blockOrNull(row.ebitda_y0,   row.ebitda_y1,   row.ebitda_y2),
    ebit:     blockOrNull(row.ebit_y0,     row.ebit_y1,     row.ebit_y2),
    utilidad: blockOrNull(row.utilidad_y0, row.utilidad_y1, row.utilidad_y2),
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const [allProyecciones, allIndustries] = await Promise.all([
      prisma.proyecciones_financieras.findMany({
        orderBy: [{ generated_at: "desc" }, { empresa: "asc" }],
      }),
      prisma.empresasIndustrias.findMany(),
    ]);

    if (allProyecciones.length === 0) {
      return NextResponse.json({ generatedAt: null, prevAt: null, base_year: 2025, rows: [] });
    }

    // ── Identify the two most-recent distinct snapshot timestamps ─────────────
    const distinctTs = [
      ...new Map(
        allProyecciones.map((p) => [p.generated_at.getTime(), p.generated_at])
      ).values(),
    ].sort((a, b) => b.getTime() - a.getTime());

    const latestTs = distinctTs[0];
    const prevTs   = distinctTs[1] ?? null;

    const latestRows = allProyecciones.filter(
      (p) => p.generated_at.getTime() === latestTs.getTime()
    );
    const prevRows = prevTs
      ? allProyecciones.filter((p) => p.generated_at.getTime() === prevTs.getTime())
      : [];

    // ── Industry lookup ───────────────────────────────────────────────────────
    const industryMap = new Map<string, string>();
    for (const ind of allIndustries) {
      if (ind.industriaChile) {
        if (ind.nombreChile)
          industryMap.set(ind.nombreChile.toLowerCase().trim(), ind.industriaChile);
        industryMap.set(ind.nombreLatam.toLowerCase().trim(), ind.industriaChile);
      }
    }

    // ── Previous snapshot: keyed by normalised empresa name ───────────────────
    const prevMap = new Map(
      prevRows.map((p) => [p.empresa.toLowerCase().trim(), p])
    );

    // ── Build response rows ───────────────────────────────────────────────────
    // Use the MAXIMUM base_year across the latest snapshot so the global anchor
    // is always the most forward-looking year, not the first row alphabetically
    // (which might be a stale company with an older base_year).
    const dominantBaseYear = Math.max(...latestRows.map((r) => r.base_year ?? 2025));

    const rows: ProjectionRowAPI[] = latestRows.map((proj) => {
      const key    = proj.empresa.toLowerCase().trim();
      const sector = industryMap.get(key) ?? "Unclassified";
      const prev   = prevMap.get(key) ?? null;

      const currBase  = proj.base_year ?? dominantBaseYear;
      const prevBase  = prev ? (prev.base_year ?? dominantBaseYear) : dominantBaseYear;

      const { ingresos, ebitda, ebit, utilidad }     = buildBlocks(proj as PrismaRow);
      const { ingresos: pIng, ebitda: pEbd, ebit: pEbt, utilidad: pUtl } =
        prev ? buildBlocks(prev as PrismaRow) : { ingresos: null, ebitda: null, ebit: null, utilidad: null };

      return {
        empresa:   proj.empresa,
        moneda:    proj.moneda ?? "",
        sector,
        base_year: currBase,
        ingresos,
        ebitda,
        ebit,
        utilidad,
        delta: prev
          ? {
              ingresos: deltaBlockCalendar(ingresos, currBase, pIng, prevBase),
              ebitda:   deltaBlockCalendar(ebitda,   currBase, pEbd, prevBase),
              ebit:     deltaBlockCalendar(ebit,     currBase, pEbt, prevBase),
              utilidad: deltaBlockCalendar(utilidad, currBase, pUtl, prevBase),
            }
          : null,
      };
    });

    // ── Format timestamps ─────────────────────────────────────────────────────
    const fmtTs = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ` +
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

    return NextResponse.json({
      generatedAt: fmtTs(latestTs),
      prevAt:      prevTs ? fmtTs(prevTs) : null,
      base_year:   dominantBaseYear,
      rows,
    });
  } catch (error) {
    console.error("Projections API error:", error);
    return NextResponse.json({ error: "Failed to load projections" }, { status: 500 });
  }
}
