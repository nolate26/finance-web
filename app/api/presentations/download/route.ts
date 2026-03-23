import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

const PRES_DIR = path.join(process.cwd(), "data", "Presentations");

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file");

  if (!file || file.includes("..") || !file.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Invalid file parameter" }, { status: 400 });
  }

  const filePath = path.join(PRES_DIR, file);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const buffer = fs.readFileSync(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${file}"`,
      },
    });
  } catch (error) {
    console.error("Presentations download error:", error);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
