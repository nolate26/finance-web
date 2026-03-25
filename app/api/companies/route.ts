import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import Papa from "papaparse";

export const dynamic = "force-dynamic";

function parseRow(row: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === "NM" || value === "" || value === null || value === undefined) {
      out[key] = null;
    } else {
      const num = Number(value);
      out[key] = isNaN(num) ? value : num;
    }
  }
  return out;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get("sector");
  const search = searchParams.get("search");

  const filePath = path.join(process.cwd(), "data", "Stock_selection_Chile", "companies.csv");

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const { data } = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    let companies = data.map(parseRow);

    if (sector) {
      companies = companies.filter((c) => c.sector === sector);
    }
    if (search) {
      const q = search.toLowerCase();
      companies = companies.filter((c) =>
        String(c.company || "").toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ companies });
  } catch {
    return NextResponse.json(
      { error: "Failed to read companies data" },
      { status: 500 }
    );
  }
}
