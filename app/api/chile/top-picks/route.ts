import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

const FILE_PATH = path.join(process.cwd(), "data", "Stock_selection_Chile", "top_picks.json");

function readData(): TopPicksPeriod[] {
  const raw = fs.readFileSync(FILE_PATH, "utf-8");
  return JSON.parse(raw) as TopPicksPeriod[];
}

function writeData(data: TopPicksPeriod[]): void {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function sanitizeString(val: unknown, maxLen = 500): string {
  if (typeof val !== "string") return "";
  return val.trim().slice(0, maxLen);
}

export interface PickAttachment {
  fileName: string;
  url: string;
}

export interface Pick {
  company: string;
  tp: string;
  status: "new" | "kept" | "out";
  rationale: string;
  attachment?: PickAttachment;
}

export interface TopPicksPeriod {
  id: string;
  date: string;
  title: string;
  comment: string;
  picks: Record<string, Pick[]>;
}

export async function GET() {
  try {
    const data = readData();
    return NextResponse.json(data);
  } catch (err) {
    console.error("top-picks GET error:", err);
    return NextResponse.json({ error: "Failed to read top picks" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TopPicksPeriod;
    const data = readData();

    const validStatuses = new Set(["new", "kept", "out"]);

    // Sanitize all pick fields
    const sanitizedPicks: Record<string, Pick[]> = {};
    for (const sector of Object.keys(body.picks ?? {})) {
      sanitizedPicks[sector] = (body.picks[sector] ?? []).map((pick) => {
        const base: Pick = {
          company: sanitizeString(pick.company, 100),
          tp: sanitizeString(pick.tp, 50),
          status: validStatuses.has(pick.status) ? pick.status : "kept",
          rationale: sanitizeString(pick.rationale, 2000),
        };
        if (pick.attachment?.fileName && pick.attachment?.url) {
          base.attachment = {
            fileName: sanitizeString(pick.attachment.fileName, 200),
            url: sanitizeString(pick.attachment.url, 300),
          };
        }
        return base;
      });
    }

    const sanitizedPeriod: TopPicksPeriod = {
      id: sanitizeString(body.id, 50) || "period-" + Date.now(),
      date: sanitizeString(body.date, 20),
      title: sanitizeString(body.title, 200),
      comment: sanitizeString(body.comment, 1000),
      picks: sanitizedPicks,
    };

    data.unshift(sanitizedPeriod);
    writeData(data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("top-picks POST error:", err);
    return NextResponse.json({ error: "Failed to save top picks" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as TopPicksPeriod;
    const data = readData();
    const idx = data.findIndex((p) => p.id === body.id);
    if (idx === -1) return NextResponse.json({ error: "Period not found" }, { status: 404 });
    data[idx] = body;
    writeData(data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("top-picks PUT error:", err);
    return NextResponse.json({ error: "Failed to update top picks" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }
    const data = readData();
    const filtered = data.filter((p) => p.id !== id);
    if (filtered.length === data.length) {
      return NextResponse.json({ error: "Period not found" }, { status: 404 });
    }
    writeData(filtered);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("top-picks DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete period" }, { status: 500 });
  }
}
