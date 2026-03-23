import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

const PRES_DIR = path.join(process.cwd(), "data", "Presentations");

export async function GET() {
  try {
    if (!fs.existsSync(PRES_DIR)) {
      return NextResponse.json({ files: [] });
    }

    const files = fs
      .readdirSync(PRES_DIR)
      .filter((f) => f.toLowerCase().endsWith(".pdf"))
      .map((name) => {
        const stat = fs.statSync(path.join(PRES_DIR, name));
        return { name, modifiedAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

    return NextResponse.json({ files });
  } catch (error) {
    console.error("Presentations API error:", error);
    return NextResponse.json({ files: [] });
  }
}
