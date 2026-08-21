import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface CompanyListItem {
  ticker: string;
  nombre: string;
  kind:   "company" | "bank";
}

/**
 * GET /api/companies/list
 * Devuelve un item por TICKER de `empresas_industrias_v2` que tenga datos en alguna
 * pestaña del deep-dive: fund_portfolio_weights ∪ model_headers ∪ bank_headers
 * ∪ consensus_estimates ∪ email_research.
 *
 * `empresas_industrias_v2` es la autoridad del universo: un ticker que no existe ahí
 * NO aparece en el sidebar. Antes cualquier ticker mal escrito en una fuente (sobre
 * todo `email_research.company`, que llegaba del correo con espacios) se colaba como
 * una "compañía" propia con el ticker crudo de nombre. `nombre` sale siempre de
 * `nombre_latam`, nunca de la fuente. Cada item lleva `kind` para rutear al modelo de
 * compañía o de banco (bank sii está en bank_headers Y NO en model_headers).
 */
export async function GET() {
  try {
    // Un solo escaneo por tabla, sin N+1. `have_data` colapsa las cinco fuentes a un
    // set de tickers y el INNER JOIN contra la maestra garantiza una fila por ticker
    // real y descarta cualquier basura de origen.
    //
    // Los tickers están normalizados en la base (Fase 1), así que se comparan con
    // igualdad directa: nada de UPPER()/BTRIM() sobre la columna, que impedía usar
    // los índices y forzaba escaneo secuencial de tablas enteras.
    const rows = await prisma.$queryRaw<{ ticker: string; nombre: string; kind: string }[]>`
      WITH have_data AS (
        SELECT ei.ticker_bloomberg AS ticker
        FROM fund_portfolio_weights fpw
        JOIN empresas_industrias_v2 ei ON fpw.company = ei.nombre_latam
        WHERE fpw.fund_name IN (
          'Moneda_Renta_Variable', 'Pionero', 'Orange', 'Glory', 'Mercer',
          'Moneda_Latin_America_Equities_(LX)', 'Moneda_Latin_America_Small_Cap_(LX)'
        )

        UNION
        SELECT mh.ticker FROM model_headers mh

        UNION
        SELECT bh.ticker FROM bank_headers bh

        UNION
        -- Consensus coverage: aparece aunque no sea holding ni tenga modelo local.
        SELECT ce.ticker FROM consensus_estimates ce
        WHERE ce.ticker IS NOT NULL AND ce.ticker <> ''

        UNION
        -- Research notes: email_research.company es el ticker Bloomberg.
        SELECT er.company FROM email_research er
        WHERE er.company IS NOT NULL AND er.company <> ''
      )
      SELECT ei.ticker_bloomberg AS ticker,
             ei.nombre_latam AS nombre,
             CASE
               WHEN EXISTS (SELECT 1 FROM bank_headers bh
                            WHERE bh.ticker = ei.ticker_bloomberg)
                AND NOT EXISTS (SELECT 1 FROM model_headers mh
                            WHERE mh.ticker = ei.ticker_bloomberg)
               THEN 'bank' ELSE 'company'
             END AS kind
      FROM empresas_industrias_v2 ei
      JOIN have_data d ON d.ticker = ei.ticker_bloomberg
      WHERE ei.ticker_bloomberg IS NOT NULL AND ei.ticker_bloomberg <> ''
      ORDER BY ei.ticker_bloomberg ASC;
    `;

    const companies: CompanyListItem[] = rows.map((r) => ({
      ticker: r.ticker,
      nombre: r.nombre,
      kind:   r.kind === "bank" ? "bank" : "company",
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
