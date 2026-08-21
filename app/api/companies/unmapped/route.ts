import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { normalizeTicker } from "@/lib/issuer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface UnmappedTicker {
  ticker:      string;
  modelRows:   number;
  bankRows:    number;
  consensusRows: number;
  suggestions: { ticker: string; nombre: string }[];
}

export interface UnmappedHeader {
  updateDate: string;
  analyst:    string | null;
  recc:       string | null;
  tp:         number | null;
  currency:   string | null;
}

export interface UnmappedDetail {
  ticker:        string;
  modelHeaders:  UnmappedHeader[];
  bankHeaders:   UnmappedHeader[];
  consensus:     {
    rows:    number;
    metrics: string[];
    periods: string[];
    minDate: string | null;
    maxDate: string | null;
  };
  /** Otras tablas del deep-dive con datos de este ticker. Informativo: el borrado NO las toca. */
  otherData: { table: string; rows: number }[];
}

/**
 * GET /api/companies/unmapped  (solo admin)
 *
 * Tickers con datos cargados (modelos de analista, modelos de banco o consensus)
 * que NO existen en `empresas_industrias_v2`.
 *
 * Importa porque el sidebar del deep-dive se arma exclusivamente desde la maestra:
 * un ticker que no está ahí es inalcanzable desde la UI y sus datos quedan muertos
 * en la base. No se puede arreglar desde la app —hay que crear la fila en la maestra
 * o corregir el ticker en el origen de la carga—, así que esto es una alerta, no un
 * formulario.
 */
/**
 * Un ticker es "no mapeado" si NO existe en la maestra. Es la precondición de todo
 * lo que hace esta ruta: el detalle y, sobre todo, el DELETE solo operan sobre
 * tickers fuera de `empresas_industrias_v2`, así que este endpoint nunca puede
 * borrar datos de una compañía real del universo.
 */
async function isUnmapped(ticker: string): Promise<boolean> {
  const hit = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM empresas_industrias_v2 ei
    WHERE ei.ticker_bloomberg = ${ticker}
  `;
  return Number(hit[0]?.n ?? 0) === 0;
}

export async function GET(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const detailFor = normalizeTicker(request.nextUrl.searchParams.get("ticker"));
  if (detailFor) return detail(detailFor);

  try {
    const rows = await prisma.$queryRaw<{
      ticker: string; modelRows: bigint; bankRows: bigint; consensusRows: bigint;
    }[]>`
      WITH src AS (
        SELECT mh.ticker AS ticker FROM model_headers mh
        UNION
        SELECT bh.ticker FROM bank_headers bh
        UNION
        SELECT ce.ticker FROM consensus_estimates ce
        WHERE ce.ticker IS NOT NULL AND ce.ticker <> ''
      )
      SELECT src.ticker,
             (SELECT COUNT(*) FROM model_headers mh
              WHERE mh.ticker = src.ticker)      AS "modelRows",
             (SELECT COUNT(*) FROM bank_headers bh
              WHERE bh.ticker = src.ticker)      AS "bankRows",
             (SELECT COUNT(*) FROM consensus_estimates ce
              WHERE ce.ticker = src.ticker)      AS "consensusRows"
      FROM src
      WHERE src.ticker <> ''
        AND NOT EXISTS (
          SELECT 1 FROM empresas_industrias_v2 ei
          WHERE ei.ticker_bloomberg = src.ticker
        )
      ORDER BY src.ticker
    `;

    // Sugerencia de match por raíz del ticker: ENTEL CL EQUITY → ENTEL CI EQUITY,
    // JBSS3 BZ EQUITY → JBSS32 BZ EQUITY. Es una pista para el admin, no un
    // automatismo: la corrección la hace una persona sobre la maestra.
    const universe = await prisma.empresasIndustriasV2.findMany({
      where:  { tickerBloomberg: { not: "" } },
      select: { tickerBloomberg: true, nombreLatam: true },
    });

    function suggest(raw: string): { ticker: string; nombre: string }[] {
      const root = raw.split(/[\s*:,]/)[0].replace(/\d+$/, "");
      if (root.length < 3) return [];
      return universe
        .filter((u) => u.tickerBloomberg.toUpperCase().startsWith(root))
        .slice(0, 3)
        .map((u) => ({ ticker: u.tickerBloomberg.toUpperCase(), nombre: u.nombreLatam }));
    }

    const tickers: UnmappedTicker[] = rows.map((r) => ({
      ticker:        r.ticker,
      modelRows:     Number(r.modelRows),
      bankRows:      Number(r.bankRows),
      consensusRows: Number(r.consensusRows),
      suggestions:   suggest(r.ticker),
    }));

    return NextResponse.json({ tickers });
  } catch (err) {
    console.error("Unmapped tickers error:", err);
    return NextResponse.json({ error: "Failed to fetch unmapped tickers" }, { status: 500 });
  }
}

/** Detalle de UN ticker sin ficha: qué es exactamente lo que hay cargado. */
async function detail(ticker: string) {
  try {
    if (!(await isUnmapped(ticker))) {
      return NextResponse.json(
        { error: "Ese ticker sí existe en empresas_industrias_v2" },
        { status: 400 }
      );
    }

    const [modelHeaders, bankHeaders, consensusAgg, otherData] = await Promise.all([
      prisma.$queryRaw<{ updateDate: Date; analyst: string | null; recc: string | null; tp: number | null; currency: string | null }[]>`
        SELECT update_date AS "updateDate", analyst, recc, tp, currency
        FROM model_headers WHERE ticker = ${ticker}
        ORDER BY update_date DESC
      `,
      prisma.$queryRaw<{ updateDate: Date; analyst: string | null; recc: string | null; tp: number | null; currency: string | null }[]>`
        SELECT update_date AS "updateDate", analyst, recc, tp, currency
        FROM bank_headers WHERE ticker = ${ticker}
        ORDER BY update_date DESC
      `,
      prisma.$queryRaw<{ rows: bigint; metrics: string[] | null; periods: string[] | null; minDate: Date | null; maxDate: Date | null }[]>`
        SELECT COUNT(*) AS "rows",
               ARRAY_AGG(DISTINCT metric) AS metrics,
               ARRAY_AGG(DISTINCT period) AS periods,
               MIN(date) AS "minDate", MAX(date) AS "maxDate"
        FROM consensus_estimates WHERE ticker = ${ticker}
      `,
      // Rastro del ticker en el resto del deep-dive. Se muestra pero NO se borra:
      // son series de mercado que no dependen de la maestra.
      prisma.$queryRaw<{ table: string; rows: bigint }[]>`
        SELECT 'valuation_history' AS "table", COUNT(*) AS "rows" FROM valuation_history WHERE ticker = ${ticker}
        UNION ALL SELECT 'price_vs_earnings', COUNT(*) FROM price_vs_earnings WHERE ticker = ${ticker}
        UNION ALL SELECT 'short_interest', COUNT(*) FROM short_interest WHERE ticker = ${ticker}
        UNION ALL SELECT 'price_range_52w', COUNT(*) FROM price_range_52w WHERE ticker = ${ticker}
        UNION ALL SELECT 'analyst_recommendations', COUNT(*) FROM analyst_recommendations WHERE ticker = ${ticker}
      `,
    ]);

    const agg = consensusAgg[0];
    const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

    const payload: UnmappedDetail = {
      ticker,
      modelHeaders: modelHeaders.map((h) => ({ ...h, updateDate: iso(h.updateDate)! })),
      bankHeaders:  bankHeaders.map((h)  => ({ ...h, updateDate: iso(h.updateDate)! })),
      consensus: {
        rows:    Number(agg?.rows ?? 0),
        metrics: agg?.metrics ?? [],
        periods: agg?.periods ?? [],
        minDate: iso(agg?.minDate ?? null),
        maxDate: iso(agg?.maxDate ?? null),
      },
      otherData: otherData
        .map((o) => ({ table: o.table, rows: Number(o.rows) }))
        .filter((o) => o.rows > 0),
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("Unmapped detail error:", err);
    return NextResponse.json({ error: "Failed to fetch ticker detail" }, { status: 500 });
  }
}

/**
 * DELETE /api/companies/unmapped?ticker=XXX  (solo admin)
 *
 * Borra los datos que hacen aparecer al ticker en la alerta: model_headers y
 * bank_headers (que cascadean a sus financials/KPIs) y consensus_estimates.
 *
 * Solo opera sobre tickers que NO están en `empresas_industrias_v2`: si alguien
 * pasa el ticker de una compañía real, se rechaza. Es irreversible.
 */
export async function DELETE(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const ticker = normalizeTicker(request.nextUrl.searchParams.get("ticker"));
  if (!ticker) {
    return NextResponse.json({ error: "Falta el parámetro ticker" }, { status: 400 });
  }

  try {
    if (!(await isUnmapped(ticker))) {
      return NextResponse.json(
        { error: "Ese ticker existe en empresas_industrias_v2 — no se borra desde acá" },
        { status: 400 }
      );
    }

    // Los headers cascadean a model_financials / model_kpis / bank_* por FK.
    const [models, banks, consensus] = await prisma.$transaction([
      prisma.$executeRaw`DELETE FROM model_headers      WHERE ticker = ${ticker}`,
      prisma.$executeRaw`DELETE FROM bank_headers       WHERE ticker = ${ticker}`,
      prisma.$executeRaw`DELETE FROM consensus_estimates WHERE ticker = ${ticker}`,
    ]);

    return NextResponse.json({
      ok: true,
      ticker,
      deleted: { modelHeaders: models, bankHeaders: banks, consensusRows: consensus },
    });
  } catch (err) {
    console.error("Unmapped delete error:", err);
    return NextResponse.json({ error: "No se pudo eliminar el ticker" }, { status: 500 });
  }
}
