import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const region = request.nextUrl.searchParams.get("region");

  if (!region) {
    return NextResponse.json({ periods: [] });
  }

  try {
    const rows = await prisma.topPick.findMany({
      where:    { region },
      select:   { periodDate: true },
      distinct: ["periodDate"],
      orderBy:  { periodDate: "desc" },
    });

    // Return as "YYYY-MM" strings so the frontend can use them directly
    const periods = rows.map((r) => r.periodDate.toISOString().slice(0, 7));

    return NextResponse.json({ periods });
  } catch (err) {
    console.error("Top picks periods error:", err);
    return NextResponse.json({ error: "Failed to fetch periods" }, { status: 500 });
  }
}
