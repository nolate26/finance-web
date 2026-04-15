import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const rows = await prisma.empresasIndustrias.findMany({
      where: {
        OR: [
          { nombreLatam: { contains: q, mode: "insensitive" } },
          { nombreChile: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        nombreLatam:   true,
        industriaGics: true,
        industriaChile: true,
      },
      take: 10,
    });

    return NextResponse.json({ results: rows });
  } catch (err) {
    console.error("Company search error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
