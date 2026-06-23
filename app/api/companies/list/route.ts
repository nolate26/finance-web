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
 * Returns the union of every ticker that has data somewhere in the deep-dive:
 *   fund_portfolio_weights ∪ model_headers (joined to empresas_industrias_v2)
 *   ∪ bank_headers ∪ consensus_estimates ∪ email_research.
 * `nombre` comes from empresas_industrias_v2 when available, otherwise falls back to
 * the ticker. Each item carries a `kind` so the deep-dive can route a ticker to the
 * company or bank model view (bank iff in bank_headers AND NOT in model_headers).
 */
export async function GET() {
  try {
    // Membership = fund holdings ∪ company models ∪ banks ∪ consensus ∪ research
    // (so a ticker shows up if it has data in any deep-dive tab). `kind` follows the spec:
    // a ticker is a BANK iff it's in bank_headers AND NOT in model_headers (ModelHeader
    // takes precedence). A fund holding without any model still resolves to "company"
    // (renders the existing "No analyst model available" state). One scan per table,
    // no N+1; GROUP BY guarantees a single row per ticker.
    const rows = await prisma.$queryRaw<{ ticker: string; nombre: string; kind: string }[]>`
      WITH base AS (
        SELECT UPPER(ei.ticker_bloomberg) AS ticker, fpw.company AS nombre
        FROM fund_portfolio_weights fpw
        JOIN empresas_industrias_v2 ei ON fpw.company = ei.nombre_latam
        WHERE fpw.fund_name IN (
          'Moneda_Renta_Variable', 'Pionero', 'Orange', 'Glory', 'Mercer',
          'Moneda_Latin_America_Equities_(LX)', 'Moneda_Latin_America_Small_Cap_(LX)'
        )
        AND ei.ticker_bloomberg IS NOT NULL AND ei.ticker_bloomberg <> ''

        UNION

        SELECT UPPER(ei.ticker_bloomberg) AS ticker, ei.nombre_latam AS nombre
        FROM empresas_industrias_v2 ei
        JOIN model_headers mh ON UPPER(mh.ticker) = UPPER(ei.ticker_bloomberg)
        WHERE ei.ticker_bloomberg IS NOT NULL AND ei.ticker_bloomberg <> ''

        UNION

        SELECT UPPER(bh.ticker) AS ticker, COALESCE(NULLIF(ei.nombre_latam, ''), bh.ticker) AS nombre
        FROM bank_headers bh
        LEFT JOIN empresas_industrias_v2 ei ON UPPER(ei.ticker_bloomberg) = UPPER(bh.ticker)

        UNION

        -- Consensus coverage: aparece aunque no sea holding ni tenga modelo local.
        SELECT UPPER(ce.ticker) AS ticker, COALESCE(NULLIF(ei.nombre_latam, ''), ce.ticker) AS nombre
        FROM consensus_estimates ce
        LEFT JOIN empresas_industrias_v2 ei ON UPPER(ei.ticker_bloomberg) = UPPER(ce.ticker)
        WHERE ce.ticker IS NOT NULL AND ce.ticker <> ''

        UNION

        -- Research notes: email_research.company es el ticker Bloomberg.
        SELECT UPPER(er.company) AS ticker, COALESCE(NULLIF(ei.nombre_latam, ''), er.company) AS nombre
        FROM email_research er
        LEFT JOIN empresas_industrias_v2 ei ON UPPER(ei.ticker_bloomberg) = UPPER(er.company)
        WHERE er.company IS NOT NULL AND er.company <> ''
      )
      SELECT b.ticker AS ticker,
             MIN(b.nombre) AS nombre,
             CASE
               WHEN EXISTS (SELECT 1 FROM bank_headers bh  WHERE UPPER(bh.ticker) = UPPER(b.ticker))
                AND NOT EXISTS (SELECT 1 FROM model_headers mh WHERE UPPER(mh.ticker) = UPPER(b.ticker))
               THEN 'bank' ELSE 'company'
             END AS kind
      FROM base b
      GROUP BY b.ticker
      ORDER BY b.ticker ASC;
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
