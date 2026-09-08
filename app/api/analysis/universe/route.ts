import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Universo de empresas para selectores. `?withValuation=1` lo recorta a las que
// realmente tienen serie en valuation_history: de las 682 del maestro sólo 383 la
// tienen, así que sin el filtro el buscador de comparables ofrecería empresas que
// al elegirlas pintan una línea vacía.

export interface UniverseItem {
  ticker:   string;
  name:     string;
  industry: string | null;
}

export interface UniversePayload {
  companies: UniverseItem[];
}

export async function GET(req: NextRequest) {
  const withValuation = new URL(req.url).searchParams.get("withValuation") === "1";

  try {
    const rows = await prisma.empresasIndustriasV2.findMany({
      where:   { tickerBloomberg: { not: "" } },
      select:  { tickerBloomberg: true, nombreLatam: true, industriaGics: true },
      orderBy: { tickerBloomberg: "asc" },
    });

    // Se resuelve con un distinct sobre valuation_history y un filtro en memoria:
    // son ~400 tickers, mucho más barato que un join contra el maestro (que además
    // repite nombre_latam y haría fan-out).
    let allowed: Set<string> | null = null;
    if (withValuation) {
      const withData = await prisma.valuationHistory.findMany({
        select:   { ticker: true },
        distinct: ["ticker"],
      });
      allowed = new Set(withData.map((r) => r.ticker));
    }

    const companies: UniverseItem[] = rows
      .filter((r) => r.tickerBloomberg && (!allowed || allowed.has(r.tickerBloomberg)))
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
