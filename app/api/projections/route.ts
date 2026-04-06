import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Returns { y2025, y2026, y2027 } only when all 3 values are non-null and sum ≠ 0; else null. */
function blockOrNull(
  v1: number | null | undefined,
  v2: number | null | undefined,
  v3: number | null | undefined,
): { y2025: number; y2026: number; y2027: number } | null {
  if (v1 == null || v2 == null || v3 == null) return null;
  if (v1 + v2 + v3 === 0) return null;
  return { y2025: v1, y2026: v2, y2027: v3 };
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

    const rows = latestRows.map((proj) => {
      const key = proj.empresa?.toLowerCase().trim() ?? "";
      const sector = industryMap.get(key) ?? "Unclassified";
      return {
        empresa: proj.empresa,
        moneda: proj.moneda ?? "",
        sector,
        ingresos: blockOrNull(proj.ingresos_2025, proj.ingresos_2026, proj.ingresos_2027),
        ebitda:   blockOrNull(proj.ebitda_2025,   proj.ebitda_2026,   proj.ebitda_2027),
        ebit:     blockOrNull(proj.ebit_2025,     proj.ebit_2026,     proj.ebit_2027),
        utilidad: blockOrNull(proj.utilidad_2025, proj.utilidad_2026, proj.utilidad_2027),
      };
    });

    // Format generatedAt as "YYYY-MM-DD HH:MM:SS" for the frontend formatter
    const d = latestGeneratedAt;
    const generatedAt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

    return NextResponse.json({ generatedAt, rows });
  } catch (error) {
    console.error("Projections API error:", error);
    return NextResponse.json({ error: "Failed to load projections" }, { status: 500 });
  }
}
