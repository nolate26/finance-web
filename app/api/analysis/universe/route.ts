import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface UniverseItem {
  ticker:   string;
  name:     string;
  industry: string | null;
}

export interface UniversePayload {
  companies: UniverseItem[];
}

export async function GET() {
  try {
    const rows = await prisma.empresasIndustriasV2.findMany({
      where:   { tickerBloomberg: { not: "" } },
      select:  { tickerBloomberg: true, nombreLatam: true, industriaGics: true },
      orderBy: { tickerBloomberg: "asc" },
    });

    const companies: UniverseItem[] = rows
      .filter((r) => r.tickerBloomberg)
      .map((r) => ({
        ticker:   r.tickerBloomberg!,
        name:     r.nombreLatam,
        industry: r.industriaGics ?? null,
      }));

    return NextResponse.json({ companies } satisfies UniversePayload);
  } catch (e) {
    console.error("[analysis/universe]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
