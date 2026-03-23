import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import Papa from "papaparse";

const PROJ_DIR = path.join(process.cwd(), "data", "Projections");

function toNum(v: string | undefined): number | null {
  if (!v || v.trim() === "" || v.trim() === "-") return null;
  const n = parseFloat(v.replace(/,/g, ""));
  return isFinite(n) ? n : null;
}

/** Returns { y2025, y2026, y2027 } only if all 3 values exist and sum ≠ 0; else null. */
function blockOrNull(
  v1: string,
  v2: string,
  v3: string,
): { y2025: number; y2026: number; y2027: number } | null {
  const n1 = toNum(v1);
  const n2 = toNum(v2);
  const n3 = toNum(v3);
  if (n1 === null || n2 === null || n3 === null) return null;
  if (n1 + n2 + n3 === 0) return null;
  return { y2025: n1, y2026: n2, y2027: n3 };
}

export async function GET() {
  try {
    // ── Pick the most recent file by filename (timestamps sort lexicographically) ──
    const files = fs
      .readdirSync(PROJ_DIR)
      .filter((f) => f.startsWith("proyecciones_") && f.endsWith(".csv"))
      .sort()
      .reverse();

    if (files.length === 0) {
      return NextResponse.json({ error: "No projection files found" }, { status: 404 });
    }

    const filePath = path.join(PROJ_DIR, files[0]);
    let content = fs.readFileSync(filePath, "utf-8");

    // Strip UTF-8 BOM if present
    content = content.replace(/^\uFEFF/, "");

    // Extract and remove the # header comment line
    let generatedAt: string | null = null;
    const lines = content.split("\n");
    if (lines[0].trimStart().startsWith("#")) {
      const match = lines[0].match(/# Generado:\s*(.+)/);
      if (match) generatedAt = match[1].trim();
      content = lines.slice(1).join("\n");
    }

    const { data: raw } = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    const rows = raw.map((r) => {
      return {
        empresa: r["Empresa"]?.trim() ?? "",
        moneda: r["Moneda"]?.trim() ?? "",
        sector: r["Div"]?.trim() ?? "",
        ingresos: blockOrNull(r["Ingresos_2025"], r["Ingresos_2026"], r["Ingresos_2027"]),
        ebitda: blockOrNull(r["EBITDA_2025"], r["EBITDA_2026"], r["EBITDA_2027"]),
        ebit: blockOrNull(r["EBIT_2025"], r["EBIT_2026"], r["EBIT_2027"]),
        utilidad: blockOrNull(r["Utilidad_2025"], r["Utilidad_2026"], r["Utilidad_2027"]),
      };
    });

    return NextResponse.json({ generatedAt, rows });
  } catch (error) {
    console.error("Projections API error:", error);
    return NextResponse.json({ error: "Failed to load projections" }, { status: 500 });
  }
}
