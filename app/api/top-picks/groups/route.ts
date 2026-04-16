import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET — distinct industry_group values for a region
export async function GET(request: NextRequest) {
  const region = request.nextUrl.searchParams.get("region");
  if (!region) return NextResponse.json({ groups: [] });

  try {
    const rows = await prisma.top_picks.findMany({
      where:    { region },
      select:   { industry_group: true },
      distinct: ["industry_group"],
      orderBy:  { industry_group: "asc" },
    });
    return NextResponse.json({ groups: rows.map((r) => r.industry_group) });
  } catch (err) {
    console.error("Groups fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
  }
}

// PUT — bulk rename an industry_group across all periods for a region
export async function PUT(request: NextRequest) {
  let body: { region: string; oldGroup: string; newGroup: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { region, oldGroup, newGroup } = body;
  if (!region || !oldGroup || !newGroup?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    const result = await prisma.top_picks.updateMany({
      where: { region, industry_group: oldGroup },
      data:  { industry_group: newGroup.trim() },
    });
    return NextResponse.json({ updated: result.count });
  } catch (err) {
    console.error("Group rename error:", err);
    return NextResponse.json({ error: "Failed to rename group" }, { status: 500 });
  }
}
