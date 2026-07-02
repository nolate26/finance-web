import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface ResearchTicker {
  ticker:   string; // Bloomberg ticker
  name:     string; // nombre_latam (falls back to ticker)
  industry: string; // industria_gics
}

/**
 * GET /api/research/tickers
 * Full BBG ticker universe from empresas_industrias_v2, para el buscador del
 * compositor de asunto en la pestaña Research. Liviano (ticker + nombre + industria),
 * pensado para filtrar en el cliente.
 */
export async function GET() {
  try {
    const rows = await prisma.empresasIndustriasV2.findMany({
      where:  { tickerBloomberg: { not: "" } },
      select: { tickerBloomberg: true, nombreLatam: true, industriaGics: true },
      orderBy: { tickerBloomberg: "asc" },
    });

    const tickers: ResearchTicker[] = rows
      .filter((r) => r.tickerBloomberg)
      .map((r) => ({
        ticker:   r.tickerBloomberg.toUpperCase(),
        name:     r.nombreLatam || r.tickerBloomberg,
        industry: r.industriaGics || "Other",
      }));

    return NextResponse.json({ tickers });
  } catch (err) {
    console.error("Research tickers error:", err);
    return NextResponse.json({ error: "Failed to fetch tickers" }, { status: 500 });
  }
}
