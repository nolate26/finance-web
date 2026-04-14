import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Returns { y0, y1, y2 } only when all 3 values are non-null and sum ≠ 0; else null. */
function blockOrNull(
  v0: number | null | undefined,
  v1: number | null | undefined,
  v2: number | null | undefined,
): { y0: number; y1: number; y2: number } | null {
  if (v0 == null || v1 == null || v2 == null) return null;
  if (v0 + v1 + v2 === 0) return null;
  return { y0: v0, y1: v1, y2: v2 };
}

export async function GET() {
  try {
    const [proyecciones, allIndustries] = await Promise.all([
      prisma.proyecciones_financieras.findMany({
        orderBy: [{ generated_at: "desc" }, { empresa: "asc" }],
      }),
      prisma.empresasIndustrias.findMany(),
    ]);

    if (proyecciones.length === 0) {
      return NextResponse.json({ generatedAt: null, rows: [] });
    }

    // Build industry lookup (Chile ecosystem — always use industria_chile)
    const industryMap = new Map<string, string>();
    for (const ind of allIndustries) {
      if (ind.industriaChile) {
        if (ind.nombreChile) industryMap.set(ind.nombreChile.toLowerCase().trim(), ind.industriaChile);
        industryMap.set(ind.nombreLatam.toLowerCase().trim(), ind.industriaChile);
      }
    }

    // Use the most recent generated_at as the snapshot date
    const latestGeneratedAt = proyecciones[0].generated_at;
    const latestRows = proyecciones.filter(
      (p) => p.generated_at.getTime() === latestGeneratedAt.getTime()
    );

    const baseYear = latestRows[0].base_year ?? 2025;

    const rows = latestRows.map((proj) => {
      const key = proj.empresa?.toLowerCase().trim() ?? "";
      const sector = industryMap.get(key) ?? "Unclassified";
      return {
        empresa: proj.empresa,
        moneda: proj.moneda ?? "",
        sector,
        ingresos: blockOrNull(proj.ingresos_y0, proj.ingresos_y1, proj.ingresos_y2),
        ebitda:   blockOrNull(proj.ebitda_y0,   proj.ebitda_y1,   proj.ebitda_y2),
        ebit:     blockOrNull(proj.ebit_y0,     proj.ebit_y1,     proj.ebit_y2),
        utilidad: blockOrNull(proj.utilidad_y0, proj.utilidad_y1, proj.utilidad_y2),
      };
    });

    // Format generatedAt as "YYYY-MM-DD HH:MM:SS" for the frontend formatter
    const d = latestGeneratedAt;
    const generatedAt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

    return NextResponse.json({ generatedAt, base_year: baseYear, rows });
  } catch (error) {
    console.error("Projections API error:", error);
    return NextResponse.json({ error: "Failed to load projections" }, { status: 500 });
  }
}
