import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// industry_group ya NO es el eje de agrupación —eso pasó a los sectores (PickSector)—
// pero la columna sigue viva como etiqueta GICS descriptiva, y estas rutas la mantienen
// consultable y renombrable en bloque.

// GET — distinct industry_group values for a region
export async function GET(request: NextRequest) {
  const region = request.nextUrl.searchParams.get("region");
  if (!region) return NextResponse.json({ groups: [] });

  try {
    const rows = await prisma.topPick.findMany({
      where:    { region, industryGroup: { not: null } },
      select:   { industryGroup: true },
      distinct: ["industryGroup"],
      orderBy:  { industryGroup: "asc" },
    });
    return NextResponse.json({ groups: rows.map((r) => r.industryGroup).filter(Boolean) });
  } catch (err) {
    console.error("Groups fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
  }
}

// PUT — bulk rename an industry_group across all periods for a region
export async function PUT(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

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
    const result = await prisma.topPick.updateMany({
      where: { region, industryGroup: oldGroup },
      data:  { industryGroup: newGroup.trim() },
    });
    return NextResponse.json({ updated: result.count });
  } catch (err) {
    console.error("Group rename error:", err);
    return NextResponse.json({ error: "Failed to rename group" }, { status: 500 });
  }
}
