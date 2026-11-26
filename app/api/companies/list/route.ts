import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface CompanyListItem {
  ticker: string;
  nombre: string;
  kind:   "company" | "bank";
  /** true = tiene datos en alguna pestaña del deep-dive; false = sólo existe en la maestra. */
  hasData: boolean;
  /**
   * Qué pestañas del deep-dive tienen contenido. El sidebar lo pinta como cuatro
   * íconos por fila para que se vea la cobertura antes de abrir la empresa.
   */
  coverage: {
    model:     boolean;   // model_headers ∪ bank_headers
    consensus: boolean;   // consensus_estimates
    reports:   boolean;   // presentation_tickers ∪ fichas ∪ ficha_tickers
    research:  boolean;   // email_research (no descartadas)
  };
}

/**
 * GET /api/companies/list
 * Devuelve DOS listas de `empresas_industrias_v2` (sólo tickers EQUITY):
 *
 *   • `companies` — los tickers con datos en alguna pestaña del deep-dive:
 *     fund_portfolio_weights ∪ model_headers ∪ bank_headers ∪ consensus_estimates
 *     ∪ email_research. Es la lista que se muestra por defecto en el sidebar y la
 *     única que consumen el resto de las pantallas (selector de presentaciones,
 *     validación de tickers en Consensus Check).
 *   • `universe` — el resto de la maestra: empresas sin datos cargados todavía.
 *     El sidebar las suma SÓLO cuando se escribe en el buscador, para poder llegar
 *     por la lupa a cualquier empresa de `empresas_industrias_v2` aunque su deep
 *     dive venga vacío.
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
    // set de tickers; la maestra manda (sale entera) y el LEFT JOIN sólo marca cuáles
    // tienen datos, así que cualquier basura de origen que no exista ahí se descarta.
    //
    // Los tickers están normalizados en la base (Fase 1), así que se comparan con
    // igualdad directa: nada de UPPER()/BTRIM() sobre la columna, que impedía usar
    // los índices y forzaba escaneo secuencial de tablas enteras.
    const rows = await prisma.$queryRaw<{
      ticker: string; nombre: string; kind: string; has_data: boolean;
      has_model: boolean; has_consensus: boolean; has_reports: boolean; has_research: boolean;
    }[]>`
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
      -- LEFT JOIN (antes INNER): la maestra entera sale en una sola pasada y
      -- has_data marca cuáles tienen deep dive. DISTINCT ON porque
      -- empresas_industrias_v2 repite filas por empresa (fan-out de nombre_latam)
      -- y el sidebar necesita un item por ticker.
      SELECT DISTINCT ON (ei.ticker_bloomberg)
             ei.ticker_bloomberg AS ticker,
             ei.nombre_latam AS nombre,
             CASE
               WHEN EXISTS (SELECT 1 FROM bank_headers bh
                            WHERE bh.ticker = ei.ticker_bloomberg)
                AND NOT EXISTS (SELECT 1 FROM model_headers mh
                            WHERE mh.ticker = ei.ticker_bloomberg)
               THEN 'bank' ELSE 'company'
             END AS kind,
             (d.ticker IS NOT NULL) AS has_data,
             -- Cobertura por pestaña: los mismos filtros que usa cada pestaña al
             -- cargar, para que el ícono no prometa algo que después sale vacío.
             -- Son sondeos por índice (ticker) sobre ~550 filas de la maestra.
             (EXISTS (SELECT 1 FROM model_headers mh WHERE mh.ticker = ei.ticker_bloomberg)
               OR EXISTS (SELECT 1 FROM bank_headers bh WHERE bh.ticker = ei.ticker_bloomberg)
             ) AS has_model,
             EXISTS (SELECT 1 FROM consensus_estimates ce WHERE ce.ticker = ei.ticker_bloomberg) AS has_consensus,
             (EXISTS (SELECT 1 FROM presentation_tickers pt WHERE pt.ticker = ei.ticker_bloomberg)
               OR EXISTS (SELECT 1 FROM fichas f WHERE f.ticker = ei.ticker_bloomberg)
               OR EXISTS (SELECT 1 FROM ficha_tickers ft WHERE ft.ticker = ei.ticker_bloomberg)
             ) AS has_reports,
             EXISTS (SELECT 1 FROM email_research er
                     WHERE er.company = ei.ticker_bloomberg AND er.dismissed_at IS NULL) AS has_research
      FROM empresas_industrias_v2 ei
      LEFT JOIN have_data d ON d.ticker = ei.ticker_bloomberg
      WHERE ei.ticker_bloomberg IS NOT NULL AND ei.ticker_bloomberg <> ''
        -- Sólo acciones. La maestra llegó a tener tickers de bonos (sufijo CORP,
        -- las cinco series de UNIFIN FINANCIERA) que no son perfiles de compañía;
        -- se borraron de la tabla y este filtro evita que vuelvan a colarse por
        -- una carga nueva. Los tickers están normalizados en mayúsculas, así que
        -- el LIKE va directo sin UPPER()/BTRIM().
        AND ei.ticker_bloomberg LIKE '% EQUITY'
      ORDER BY ei.ticker_bloomberg ASC;
    `;

    const items: CompanyListItem[] = rows.map((r) => ({
      ticker:  r.ticker,
      nombre:  r.nombre,
      kind:    r.kind === "bank" ? "bank" : "company",
      hasData: r.has_data === true,
      coverage: {
        model:     r.has_model === true,
        consensus: r.has_consensus === true,
        reports:   r.has_reports === true,
        research:  r.has_research === true,
      },
    }));

    // `companies` conserva exactamente el contrato anterior (sólo con datos); el
    // resto de la maestra viaja aparte para que ningún otro consumidor cambie.
    return NextResponse.json({
      companies: items.filter((c) => c.hasData),
      universe:  items.filter((c) => !c.hasData),
    });
  } catch (err) {
    console.error("Companies list error:", err);
    return NextResponse.json(
      { error: "Failed to fetch company list" },
      { status: 500 }
    );
  }
}
