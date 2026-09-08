import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeTicker } from "@/lib/issuer";

export const dynamic = "force-dynamic";

// Serie de valuación de UNA empresa, y nada más.
//
// Existe para el buscador de comparables del gráfico Historical Valuation. La
// alternativa era reusar /api/companies/[ticker], pero ese endpoint dispara OCHO
// consultas en paralelo y devuelve priceVsEarnings, consenso, recomendaciones,
// rango de 52 semanas, short interest, pesos de cartera y total return — de todo eso
// una línea comparable usa exactamente una tabla. Superponer dos empresas cargaría
// dieciséis consultas para pintar dos líneas.
//
// Acá es una sola consulta sobre valuation_history, que además pega justo contra su
// PK (ticker, date), así que sale ordenada sin trabajo extra.

export interface ValuationHistoryPoint {
  date:        string;
  peFwd:       number | null;
  evEbitdaFwd: number | null;
  pbv:         number | null;
  roeFwd:      number | null;
}

export interface ValuationHistoryPayload {
  ticker: string;
  points: ValuationHistoryPoint[];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const normalized = normalizeTicker(decodeURIComponent(ticker));

  try {
    const rows = await prisma.valuationHistory.findMany({
      where:   { ticker: normalized },
      orderBy: { date: "asc" },
      select:  { date: true, peFwd: true, evEbitdaFwd: true, pbv: true, roeFwd: true },
    });

    const points: ValuationHistoryPoint[] = rows.map((r) => ({
      date:        r.date.toISOString().slice(0, 10),
      peFwd:       r.peFwd       ?? null,
      evEbitdaFwd: r.evEbitdaFwd ?? null,
      pbv:         r.pbv         ?? null,
      roeFwd:      r.roeFwd      ?? null,
    }));

    return NextResponse.json({ ticker: normalized, points } satisfies ValuationHistoryPayload);
  } catch (e) {
    console.error("[companies/[ticker]/valuation-history]", e);
    return NextResponse.json({ error: "No se pudo cargar la valuación histórica" }, { status: 500 });
  }
}
