import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  YEAR_METRICS, ROW_YEAR, normEmpresa, buildOverrideIndex, getOverride, pctChange,
  type YearMetric, type OverrideRecord, type OverrideIndex,
} from "@/lib/proyeccionOverrideFields";

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

/**
 * Firma de una celda editada a mano. `prev`/`prevText` es el valor que la celda tenía
 * justo antes (venga del Excel o de una edición anterior) y `prevAt` su fecha, así que
 * `pct` es exactamente "la variación con la fecha anterior" que se muestra al pasar
 * por encima.
 */
export interface CellEdit {
  by:       string | null;
  at:       string;          // "YYYY-MM-DD HH:mm"
  prev:     number | null;
  prevText: string | null;
  prevAt:   string | null;   // "YYYY-MM-DD HH:mm"
  pct:      number | null;
}

export interface EditBlock {
  y0: CellEdit | null;
  y1: CellEdit | null;
  y2: CellEdit | null;
}

export interface EditSet {
  ingresos: EditBlock | null;
  ebitda:   EditBlock | null;
  ebit:     EditBlock | null;
  utilidad: EditBlock | null;
  moneda:   CellEdit | null;
  analyst:  CellEdit | null;
  pool_div: CellEdit | null;
}

export interface ProjectionRowAPI {
  empresa:   string;
  moneda:    string;
  sector:    string;
  analyst:   string | null;
  payout:    number | null;
  /**
   * Ancla de los bloques. La API ya re-ancla TODAS las filas al año base global, así que
   * y0/y1/y2 son siempre las mismas tres columnas de calendario para todo el mundo.
   * Eso es lo que permite editar años fuera del window original de la fila.
   */
  base_year:       number;
  /** base_year con el que el Excel publicó esta fila (para el badge "base 2025"). */
  sourceBaseYear:  number;
  ingresos:  MetricBlock | null;
  ebitda:    MetricBlock | null;
  ebit:      MetricBlock | null;
  utilidad:  MetricBlock | null;
  /** null when no prior snapshot exists for this company */
  delta:     DeltaSet | null;
  /** null cuando la fila no tiene ninguna celda editada a mano */
  edits:     EditSet | null;
  /** ediciones que el último reporte del Excel dejó atrás (ya no se aplican) */
  supersededEdits: number;
}

// ── Prisma row shape (subset we need) ─────────────────────────────────────────
type PrismaRow = {
  empresa:      string;
  moneda:       string | null;
  analyst:      string | null;
  pool_div:     number | null;
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

function buildBlocks(row: PrismaRow) {
  return {
    ingresos: blockOrNull(row.ingresos_y0, row.ingresos_y1, row.ingresos_y2),
    ebitda:   blockOrNull(row.ebitda_y0,   row.ebitda_y1,   row.ebitda_y2),
    ebit:     blockOrNull(row.ebit_y0,     row.ebit_y1,     row.ebit_y2),
    utilidad: blockOrNull(row.utilidad_y0, row.utilidad_y1, row.utilidad_y2),
  };
}

const fmtTs = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ` +
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

const fmtTsShort = (d: Date | null) => (d ? fmtTs(d).slice(0, 16) : null);

/** Traduce un override a la firma que consume el tooltip. */
function toCellEdit(o: OverrideRecord, effective: number | null): CellEdit {
  return {
    by:       o.editedBy,
    at:       fmtTs(o.editedAt).slice(0, 16),
    prev:     o.baseValue,
    prevText: o.baseText,
    prevAt:   fmtTsShort(o.baseAt),
    pct:      pctChange(effective, o.baseValue),
  };
}

const isEmptyEditBlock = (b: EditBlock) => !b.y0 && !b.y1 && !b.y2;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const [allProyecciones, allIndustries] = await Promise.all([
      prisma.proyecciones_financieras.findMany({
        orderBy: [{ generated_at: "desc" }, { empresa: "asc" }],
      }),
      prisma.empresasIndustriasV2.findMany(),
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

    // ── Ediciones manuales ────────────────────────────────────────────────────
    // Resiliente: si la tabla todavía no existe (falta `prisma db push`), la vista sale
    // con los datos del Excel en vez de romperse.
    let overrideRows: OverrideRecord[] = [];
    try {
      overrideRows = await prisma.proyeccionOverride.findMany();
    } catch (e) {
      console.warn("[projections] overrides no disponibles (¿falta db push?):", String(e).slice(0, 140));
    }
    // Todas las filas mostradas vienen del mismo snapshot, así que la foto contra la que
    // compite cada edición es la misma: latestTs.
    const ovrIndex: OverrideIndex = buildOverrideIndex(overrideRows, () => latestTs);

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
      const key    = normEmpresa(proj.empresa);
      const sector = industryMap.get(key) ?? "Unclassified";
      const prev   = prevMap.get(key) ?? null;

      const currBase  = proj.base_year ?? dominantBaseYear;
      const prevBase  = prev ? (prev.base_year ?? dominantBaseYear) : dominantBaseYear;

      const baseBlocks = buildBlocks(proj as PrismaRow);
      const prevBlocks = prev
        ? buildBlocks(prev as PrismaRow)
        : { ingresos: null, ebitda: null, ebit: null, utilidad: null };

      // ── Re-anclado al año base global + overlay de ediciones ────────────────
      // Cada columna es un año calendario fijo (dominantBaseYear + ci) para TODAS las
      // filas. Así una fila con base 2025 aporta sus valores donde corresponde y, sobre
      // todo, puede recibir una edición para un año que el Excel nunca proyectó.
      const values:  Record<YearMetric, MetricBlock> = {
        ingresos: { y0: null, y1: null, y2: null },
        ebitda:   { y0: null, y1: null, y2: null },
        ebit:     { y0: null, y1: null, y2: null },
        utilidad: { y0: null, y1: null, y2: null },
      };
      const deltas: Record<YearMetric, DeltaBlock> = {
        ingresos: { y0: null, y1: null, y2: null },
        ebitda:   { y0: null, y1: null, y2: null },
        ebit:     { y0: null, y1: null, y2: null },
        utilidad: { y0: null, y1: null, y2: null },
      };
      const edits: Record<YearMetric, EditBlock> = {
        ingresos: { y0: null, y1: null, y2: null },
        ebitda:   { y0: null, y1: null, y2: null },
        ebit:     { y0: null, y1: null, y2: null },
        utilidad: { y0: null, y1: null, y2: null },
      };

      const slots = ["y0", "y1", "y2"] as const;
      for (const metric of YEAR_METRICS) {
        for (let ci = 0; ci < 3; ci++) {
          const calYear = dominantBaseYear + ci;
          const slot    = slots[ci];

          const fromExcel = getYearValue(baseBlocks[metric], currBase, calYear);
          const ovr       = getOverride(ovrIndex, key, metric, calYear);
          const effective = ovr ? ovr.value : fromExcel;

          values[metric][slot] = effective;
          if (ovr) edits[metric][slot] = toCellEdit(ovr, effective);

          // Δ contra el reporte anterior, calculado sobre el valor EFECTIVO (regla de
          // negocio: da igual si el número vino del Excel o de una edición).
          deltas[metric][slot] = pctChange(
            effective,
            getYearValue(prevBlocks[metric], prevBase, calYear),
          );
        }
      }

      // ── Campos de fila (moneda / analista / payout) ─────────────────────────
      const rowOvr = (metric: "moneda" | "analyst" | "pool_div") =>
        getOverride(ovrIndex, key, metric, ROW_YEAR);

      const oMoneda  = rowOvr("moneda");
      const oAnalyst = rowOvr("analyst");
      const oPayout  = rowOvr("pool_div");

      const moneda  = oMoneda?.textValue  ?? proj.moneda   ?? "";
      const analyst = oAnalyst?.textValue ?? proj.analyst  ?? null;
      const payout  = oPayout?.value      ?? proj.pool_div ?? null;

      const editSet: EditSet = {
        ingresos: isEmptyEditBlock(edits.ingresos) ? null : edits.ingresos,
        ebitda:   isEmptyEditBlock(edits.ebitda)   ? null : edits.ebitda,
        ebit:     isEmptyEditBlock(edits.ebit)     ? null : edits.ebit,
        utilidad: isEmptyEditBlock(edits.utilidad) ? null : edits.utilidad,
        moneda:   oMoneda  ? toCellEdit(oMoneda,  null)   : null,
        analyst:  oAnalyst ? toCellEdit(oAnalyst, null)   : null,
        pool_div: oPayout  ? toCellEdit(oPayout,  payout) : null,
      };
      const hasEdits = Object.values(editSet).some((v) => v !== null);

      const blockOf = (m: YearMetric): MetricBlock | null =>
        blockOrNull(values[m].y0, values[m].y1, values[m].y2);
      const deltaOf = (m: YearMetric): DeltaBlock | null =>
        deltas[m].y0 === null && deltas[m].y1 === null && deltas[m].y2 === null ? null : deltas[m];

      return {
        empresa:   proj.empresa,
        moneda,
        sector,
        analyst,
        payout,
        base_year:      dominantBaseYear,   // los bloques ya vienen re-anclados acá
        sourceBaseYear: currBase,
        ingresos:  blockOf("ingresos"),
        ebitda:    blockOf("ebitda"),
        ebit:      blockOf("ebit"),
        utilidad:  blockOf("utilidad"),
        delta: prev
          ? {
              ingresos: deltaOf("ingresos"),
              ebitda:   deltaOf("ebitda"),
              ebit:     deltaOf("ebit"),
              utilidad: deltaOf("utilidad"),
            }
          : null,
        edits: hasEdits ? editSet : null,
        supersededEdits: ovrIndex.superseded.get(key) ?? 0,
      };
    });

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
