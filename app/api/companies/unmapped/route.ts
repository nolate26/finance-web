import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";
import { normalizeTicker } from "@/lib/issuer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface UnmappedTicker {
  ticker:      string;
  modelRows:   number;
  bankRows:    number;
  consensusRows: number;
  suggestions: { ticker: string; nombre: string }[];
  /**
   * La maestra SÍ tiene este ticker, pero escrito distinto (mayúsculas/espacios).
   * No es un ticker huérfano: es un ticker bien cargado que quedó fuera de la vista
   * por casing. Borrarlo destruiría un modelo válido → la UI y el DELETE lo bloquean.
   */
  caseMatch:   { ticker: string; nombre: string } | null;
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
      caseMatchTicker: string | null; caseMatchNombre: string | null;
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
              WHERE ce.ticker = src.ticker)      AS "consensusRows",
             cm.ticker_bloomberg                 AS "caseMatchTicker",
             cm.nombre_latam                     AS "caseMatchNombre"
      FROM src
      -- ¿Existe en la maestra el MISMO ticker, solo que con otro casing/espaciado?
      -- Si existe, la fila no es huérfana: es un problema de normalización.
      LEFT JOIN LATERAL (
        SELECT ei2.ticker_bloomberg, ei2.nombre_latam
        FROM empresas_industrias_v2 ei2
        WHERE upper(btrim(ei2.ticker_bloomberg)) = upper(btrim(src.ticker))
        LIMIT 1
      ) cm ON true
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
      caseMatch:     r.caseMatchTicker
        ? { ticker: r.caseMatchTicker, nombre: r.caseMatchNombre ?? "" }
        : null,
    }));

    // Valores ya en uso, para que el alta ofrezca opciones existentes en vez de dejar
    // tipear libre: un "Bancos" nuevo al lado de "Banks" crea un bucket fantasma en las
    // agrupaciones de Moneda Estimates.
    const [gicsRows, countryRows] = await Promise.all([
      prisma.empresasIndustriasV2.findMany({
        where: { industriaGics: { not: "" } },
        select: { industriaGics: true },
        distinct: ["industriaGics"],
        orderBy: { industriaGics: "asc" },
      }),
      prisma.empresasIndustriasV2.findMany({
        where: { countryRisk: { not: "" } },
        select: { countryRisk: true },
        distinct: ["countryRisk"],
        orderBy: { countryRisk: "asc" },
      }),
    ]);

    return NextResponse.json({
      tickers,
      gicsOptions:    gicsRows.map((r) => r.industriaGics),
      countryOptions: countryRows.map((r) => r.countryRisk),
    });
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
 * POST /api/companies/unmapped?ticker=XXX  (solo admin)
 *
 * Crea la ficha del ticker en empresas_industrias_v2. Es la salida para los tickers
 * que NO son un typo sino una empresa real que simplemente nunca se cargó en la
 * maestra (el caso típico: cobertura de consensus sin ficha, como AMXL MM EQUITY).
 * Creada la ficha, el ticker aparece en el sidebar y sus datos dejan de ser
 * inalcanzables — sin mover ni borrar nada.
 *
 * Sólo pide los 4 campos que cambian el comportamiento de las vistas: nombre
 * (sidebar), country_risk e industria_gics (agrupaciones de Moneda Estimates) y
 * moneda. El resto de columnas NOT NULL se crean vacías, que es exactamente lo que
 * ya tienen cientos de filas cargadas por el loader (584 sin nombre_chile, 584 sin
 * industria_chile, 13 sin isin): se completan después desde el panel de homologación.
 */
export async function POST(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const user = await getSessionUser();

  const ticker = normalizeTicker(request.nextUrl.searchParams.get("ticker"));
  if (!ticker) {
    return NextResponse.json({ error: "Falta el parámetro ticker" }, { status: 400 });
  }

  let body: {
    nombre?: string; countryRisk?: string; moneda?: string; industriaGics?: string;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const nombre        = (body.nombre        ?? "").trim();
  const countryRisk   = (body.countryRisk   ?? "").trim().toUpperCase();
  const moneda        = (body.moneda        ?? "").trim().toUpperCase();
  const industriaGics = (body.industriaGics ?? "").trim();

  if (!nombre)                          return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  if (nombre.length > 200)              return NextResponse.json({ error: "El nombre no puede pasar de 200 caracteres" }, { status: 400 });
  if (!/^[A-Z]{2}$/.test(countryRisk))  return NextResponse.json({ error: "El país debe ser un código de 2 letras (CL, BR, MX, US, OT…)" }, { status: 400 });
  if (!/^[A-Z]{3}$/.test(moneda))       return NextResponse.json({ error: "La moneda debe ser un código ISO de 3 letras (CLP, BRL, MXN, USD…)" }, { status: 400 });
  if (!industriaGics)                   return NextResponse.json({ error: "La industria GICS es obligatoria" }, { status: 400 });
  if (industriaGics.length > 200)       return NextResponse.json({ error: "La industria no puede pasar de 200 caracteres" }, { status: 400 });

  try {
    // Si ya está en la maestra no hay nada que crear (y el @unique lo rechazaría igual).
    if (!(await isUnmapped(ticker))) {
      return NextResponse.json(
        { error: `"${ticker}" ya existe en empresas_industrias_v2` },
        { status: 400 }
      );
    }

    const created = await prisma.empresasIndustriasV2.create({
      data: {
        tickerBloomberg: ticker,
        nombreLatam:     nombre,
        countryRisk,
        moneda,
        industriaGics,
        // NOT NULL sin dato todavía: se completan desde el panel de homologación.
        nombreChile:     "",
        industriaChile:  "",
        isin:            "",
      },
      select: { id: true, tickerBloomberg: true, nombreLatam: true },
    });

    await logAdminChanges(
      [{
        entity:    ENTITY.empresas,
        entityKey: String(created.id),
        label:     created.nombreLatam,
        field:     "ticker_bloomberg",
        oldValue:  null,
        newValue:  created.tickerBloomberg,
        context:   "alta desde tickers sin ficha",
        action:    "create",
      }],
      user?.email ?? null,
    );

    return NextResponse.json({ ok: true, created });
  } catch (err) {
    console.error("Unmapped create error:", err);
    return NextResponse.json({ error: "No se pudo crear la ficha" }, { status: 500 });
  }
}

/**
 * PATCH /api/companies/unmapped?ticker=XXX&target=YYY  (solo admin)
 *
 * Re-matchea un ticker huérfano contra uno que SÍ existe en la maestra: mueve
 * model_headers, bank_headers y consensus_estimates de `ticker` a `target`.
 * Los financials y KPIs viajan solos (las 4 FK son ON UPDATE CASCADE).
 *
 * Es la alternativa NO destructiva al DELETE, para typers de la planilla:
 * "ENTEL CL EQUITY" → "ENTEL CI EQUITY" sin perder el modelo.
 *
 * Aborta si el destino ya tiene filas en la misma llave (un snapshot de la misma
 * fecha, o el mismo (date, metric, period) de consensus): mover ahí violaría el
 * índice único y no hay respuesta obvia sobre cuál fila debería ganar. En ese
 * caso hay que resolver el duplicado a mano.
 */
export async function PATCH(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const ticker = normalizeTicker(request.nextUrl.searchParams.get("ticker"));
  const target = normalizeTicker(request.nextUrl.searchParams.get("target"));

  if (!ticker || !target) {
    return NextResponse.json({ error: "Faltan los parámetros ticker y target" }, { status: 400 });
  }
  if (ticker === target) {
    return NextResponse.json({ error: "El origen y el destino son el mismo ticker" }, { status: 400 });
  }

  try {
    // El origen tiene que ser huérfano: si ya está en la maestra, mover sus datos
    // a otro ticker sería mezclar dos compañías reales.
    if (!(await isUnmapped(ticker))) {
      return NextResponse.json(
        { error: `"${ticker}" sí existe en empresas_industrias_v2 — no se re-matchea desde acá` },
        { status: 400 }
      );
    }

    // El destino tiene que existir en la maestra, o el dato quedaría igual de huérfano.
    const hit = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM empresas_industrias_v2 ei
      WHERE ei.ticker_bloomberg = ${target}
    `;
    if (Number(hit[0]?.n ?? 0) === 0) {
      return NextResponse.json(
        { error: `"${target}" no existe en empresas_industrias_v2` },
        { status: 400 }
      );
    }

    // Colisiones contra el destino, tabla por tabla.
    const [modelClash, bankClash, consClash] = await Promise.all([
      prisma.$queryRaw<{ update_date: Date }[]>`
        SELECT a.update_date FROM model_headers a
        JOIN model_headers b ON b.ticker = ${target} AND b.update_date = a.update_date
        WHERE a.ticker = ${ticker} ORDER BY a.update_date`,
      prisma.$queryRaw<{ update_date: Date }[]>`
        SELECT a.update_date FROM bank_headers a
        JOIN bank_headers b ON b.ticker = ${target} AND b.update_date = a.update_date
        WHERE a.ticker = ${ticker} ORDER BY a.update_date`,
      prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM consensus_estimates a
        JOIN consensus_estimates b
          ON b.ticker = ${target} AND b.date = a.date AND b.metric = a.metric AND b.period = a.period
        WHERE a.ticker = ${ticker}`,
    ]);

    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const conflicts: string[] = [];
    if (modelClash.length > 0) {
      conflicts.push(`${target} ya tiene modelo de analista en ${modelClash.map((r) => iso(r.update_date)).join(", ")}`);
    }
    if (bankClash.length > 0) {
      conflicts.push(`${target} ya tiene modelo de banco en ${bankClash.map((r) => iso(r.update_date)).join(", ")}`);
    }
    const consN = Number(consClash[0]?.n ?? 0);
    if (consN > 0) {
      conflicts.push(`${consN.toLocaleString("en-US")} filas de consensus chocan con las que ya tiene ${target}`);
    }
    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: `No se puede re-matchear: ${conflicts.join(" · ")}. Hay que resolver el duplicado a mano.` },
        { status: 409 }
      );
    }

    // Los headers arrastran financials y KPIs por FK ON UPDATE CASCADE.
    const [models, banks, consensus] = await prisma.$transaction([
      prisma.$executeRaw`UPDATE model_headers       SET ticker = ${target} WHERE ticker = ${ticker}`,
      prisma.$executeRaw`UPDATE bank_headers        SET ticker = ${target} WHERE ticker = ${ticker}`,
      prisma.$executeRaw`UPDATE consensus_estimates SET ticker = ${target} WHERE ticker = ${ticker}`,
    ]);

    return NextResponse.json({
      ok: true,
      ticker,
      target,
      moved: { modelHeaders: models, bankHeaders: banks, consensusRows: consensus },
    });
  } catch (err) {
    console.error("Unmapped reassign error:", err);
    return NextResponse.json({ error: "No se pudo re-matchear el ticker" }, { status: 500 });
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

    // Segunda barrera: el ticker no está en la maestra TAL CUAL, pero sí con otro
    // casing. Eso no es data huérfana, es un modelo bueno mal escrito — borrarlo
    // perdería financials y KPIs reales. Se corrige normalizando, no eliminando.
    const caseHit = await prisma.$queryRaw<{ ticker_bloomberg: string }[]>`
      SELECT ei.ticker_bloomberg FROM empresas_industrias_v2 ei
      WHERE upper(btrim(ei.ticker_bloomberg)) = upper(btrim(${ticker}))
      LIMIT 1
    `;
    if (caseHit.length > 0) {
      return NextResponse.json(
        {
          error: `"${ticker}" sí existe en la maestra como "${caseHit[0].ticker_bloomberg}": ` +
                 `solo difiere en mayúsculas/espacios. Borrarlo destruiría un modelo válido — ` +
                 `hay que normalizar el ticker, no eliminarlo.`,
        },
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
