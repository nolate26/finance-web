import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import Papa from "papaparse";

export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), "data", "Stock_selection_Chile");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Rename duplicate column headers by appending _2, _3, etc. */
function deduplicateHeaders(headerLine: string): string {
  const cols = headerLine.split(",");
  const seen = new Map<string, number>();
  return cols
    .map((col) => {
      const h = col.trim();
      const count = seen.get(h) ?? 0;
      seen.set(h, count + 1);
      return count === 0 ? h : `${h}_${count + 1}`;
    })
    .join(",");
}

/** Parse a CSV that starts with 3 metadata lines + 1 blank line before the real headers. */
function parseFileWithMetadata(content: string): {
  metadata: { cierre_cartera: string; precios: string; resultados: string };
  rows: Record<string, string>[];
} {
  // Normalize line endings (handles \r\n Windows + \n Unix)
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  const metaVal = (line: string) => (line ?? "").split(",")[1]?.trim() ?? "";
  const metadata = {
    cierre_cartera: metaVal(lines[0]),
    precios: metaVal(lines[1]),
    resultados: metaVal(lines[2]),
  };

  // lines[3] is blank; data starts at lines[4]
  const dataLines = lines.slice(4).filter((_, i, arr) => {
    // keep header (i=0) always; keep data lines that are not completely empty
    return i === 0 || arr[i].replace(/,/g, "").trim() !== "";
  });

  if (dataLines.length === 0) return { metadata, rows: [] };

  // Deduplicate column headers
  dataLines[0] = deduplicateHeaders(dataLines[0]);

  const { data } = Papa.parse<Record<string, string>>(dataLines.join("\n"), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  return { metadata, rows: data };
}

/** Parse a plain CSV (no metadata lines) with dedup applied to headers. */
function parsePlainFile(content: string): Record<string, string>[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length === 0) return [];
  lines[0] = deduplicateHeaders(lines[0]);
  const { data } = Papa.parse<Record<string, string>>(lines.join("\n"), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  return data;
}

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

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get("sector");
  const search = searchParams.get("search");

  try {
    // ── indices.csv (has 3-line metadata header) ──────────────────────────────
    const indicesContent = fs.readFileSync(path.join(DATA_DIR, "indices.csv"), "utf-8");
    const { metadata, rows: indicesRaw } = parseFileWithMetadata(indicesContent);
    const indices = indicesRaw.map(parseRow);

    // ── companies.csv (same 3-line metadata header as indices.csv) ───────────
    const companiesContent = fs.readFileSync(path.join(DATA_DIR, "companies.csv"), "utf-8");
    const { rows: companiesRaw } = parseFileWithMetadata(companiesContent);
    let companies = companiesRaw.map(parseRow);

    if (sector) {
      companies = companies.filter((c) => c.sector === sector);
    }
    if (search) {
      const q = search.toLowerCase();
      companies = companies.filter((c) =>
        String(c.company || "").toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ metadata, indices, companies });
  } catch (err) {
    console.error("Chile stock-selection API error:", err);
    return NextResponse.json(
      { error: "Failed to read stock selection data" },
      { status: 500 }
    );
  }
}
