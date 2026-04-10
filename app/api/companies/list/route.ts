import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface CompanyListItem {
  ticker: string;
  nombre: string;
}

/**
 * GET /api/companies/list
 * Returns all companies that have a Bloomberg ticker, joined from
 * fund_portfolio_weights → empresas_industrias.
 */
export async function GET() {
  try {
    // Raw query to get distinct ticker + nombre_latam pairs
    const rows = await prisma.$queryRaw<{ ticker: string; nombre_latam: string }[]>`
      SELECT DISTINCT
        ei.ticker_bloomberg AS ticker,
        fpw.company         AS nombre_latam
      FROM fund_portfolio_weights fpw
      JOIN empresas_industrias ei
        ON fpw.company = ei.nombre_latam
       AND ei.ticker_bloomberg IS NOT NULL
      ORDER BY ei.ticker_bloomberg ASC
    `;

    const companies: CompanyListItem[] = rows.map((r) => ({
      ticker: r.ticker,
      nombre: r.nombre_latam,
    }));

    return NextResponse.json({ companies });
  } catch (err) {
    console.error("Companies list error:", err);
    return NextResponse.json(
      { error: "Failed to fetch company list" },
      { status: 500 }
    );
  }
}
