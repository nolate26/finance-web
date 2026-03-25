import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

const JSON_PATH = path.join(
  process.cwd(),
  "data",
  "Stock_selection_Chile",
  "top_picks.json"
);
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "top_picks");
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

interface PickAttachment {
  fileName: string;
  url: string;
}

interface Pick {
  company: string;
  tp: string;
  status: string;
  rationale: string;
  attachment?: PickAttachment;
}

interface TopPicksPeriod {
  id: string;
  date: string;
  title: string;
  comment: string;
  picks: Record<string, Pick[]>;
}

function readData(): TopPicksPeriod[] {
  const raw = fs.readFileSync(JSON_PATH, "utf-8");
  return JSON.parse(raw) as TopPicksPeriod[];
}

function writeData(data: TopPicksPeriod[]): void {
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

// ── POST: Upload a PDF and attach it to a pick ────────────────────────────────

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const periodId = (formData.get("periodId") as string | null)?.trim();
    const sector = (formData.get("sector") as string | null)?.trim();
    const companyName = (formData.get("companyName") as string | null)?.trim();

    // Basic field validation
    if (!file || !periodId || !sector || !companyName) {
      return NextResponse.json(
        { error: "Missing required fields: file, periodId, sector, companyName" },
        { status: 400 }
      );
    }

    // File type guard — PDF only
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are accepted" },
        { status: 415 }
      );
    }

    // Size guard
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File exceeds 10 MB limit" },
        { status: 413 }
      );
    }

    // Build unique filename
    const safePeriod = sanitizeFilename(periodId);
    const safeSector = sanitizeFilename(sector);
    const safeCompany = sanitizeFilename(companyName);
    const safeOriginal = sanitizeFilename(file.name);
    const fileName = `${safePeriod}_${safeSector}_${safeCompany}_${safeOriginal}`;
    const publicUrl = `/uploads/top_picks/${fileName}`;

    // Write file to disk
    await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.promises.writeFile(path.join(UPLOAD_DIR, fileName), buffer);

    // Update JSON
    const data = readData();
    const period = data.find((p) => p.id === periodId);
    if (!period) {
      return NextResponse.json({ error: "Period not found" }, { status: 404 });
    }

    const sectorPicks = period.picks[sector] ?? [];
    const pickIdx = sectorPicks.findIndex((p) => p.company === companyName);
    if (pickIdx === -1) {
      return NextResponse.json({ error: "Pick not found" }, { status: 404 });
    }

    // Delete old file if one exists
    const existing = sectorPicks[pickIdx].attachment;
    if (existing?.fileName) {
      const oldPath = path.join(UPLOAD_DIR, existing.fileName);
      if (fs.existsSync(oldPath)) {
        await fs.promises.unlink(oldPath).catch(() => {});
      }
    }

    sectorPicks[pickIdx] = {
      ...sectorPicks[pickIdx],
      attachment: { fileName, url: publicUrl },
    };
    period.picks[sector] = sectorPicks;
    writeData(data);

    return NextResponse.json({ ok: true, attachment: { fileName, url: publicUrl } });
  } catch (err) {
    console.error("top-picks upload POST error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

// ── DELETE: Remove an attachment from a pick ──────────────────────────────────

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const periodId = searchParams.get("periodId")?.trim();
    const sector = searchParams.get("sector")?.trim();
    const companyName = searchParams.get("companyName")?.trim();

    if (!periodId || !sector || !companyName) {
      return NextResponse.json(
        { error: "Missing query params: periodId, sector, companyName" },
        { status: 400 }
      );
    }

    const data = readData();
    const period = data.find((p) => p.id === periodId);
    if (!period) {
      return NextResponse.json({ error: "Period not found" }, { status: 404 });
    }

    const sectorPicks = period.picks[sector] ?? [];
    const pickIdx = sectorPicks.findIndex((p) => p.company === companyName);
    if (pickIdx === -1) {
      return NextResponse.json({ error: "Pick not found" }, { status: 404 });
    }

    const existing = sectorPicks[pickIdx].attachment;
    if (existing?.fileName) {
      const filePath = path.join(UPLOAD_DIR, existing.fileName);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath).catch(() => {});
      }
    }

    const { attachment: _removed, ...rest } = sectorPicks[pickIdx];
    void _removed;
    sectorPicks[pickIdx] = rest as Pick;
    period.picks[sector] = sectorPicks;
    writeData(data);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("top-picks upload DELETE error:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
