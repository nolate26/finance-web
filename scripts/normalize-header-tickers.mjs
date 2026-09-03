// ---------------------------------------------------------------------------
// normalize-header-tickers.mjs — Canoniza `ticker` en model_headers y bank_headers.
//
// POR QUÉ: empresas_industrias_v2 guarda el ticker Bloomberg en MAYÚSCULA
// ("CCU CI EQUITY"). Entre el 2026-08-21 y el 2026-09-03 la macro de Excel cargó
// 7 snapshots con casing mixto ("CCU CI Equity"). Todas las rutas de lectura del
// deep-dive comparan con igualdad exacta, así que esos modelos quedaron
// inalcanzables desde la UI aunque los datos estén completos y correctos.
//
// QUÉ HACE: aplica la misma normalización que normalizeTicker() de lib/issuer.ts
// (trim + espacios colapsados + MAYÚSCULA) sobre las dos tablas de headers.
// model_financials, model_kpis, bank_financials y bank_kpis se arrastran solos:
// sus 4 FK están declaradas ON UPDATE CASCADE.
//
// SEGURIDAD: corre todo en UNA transacción y aborta con ROLLBACK si detecta que
// dos filas colisionarían en (ticker_normalizado, update_date). Es idempotente:
// correrlo dos veces no hace nada la segunda vez.
//
// Uso:
//   node scripts/normalize-header-tickers.mjs           # aplica
//   node scripts/normalize-header-tickers.mjs --dry-run # solo muestra
// ---------------------------------------------------------------------------

import "dotenv/config";
import pg from "pg";

const DRY = process.argv.includes("--dry-run");

// Misma normalización que normalizeTicker() en lib/issuer.ts.
const NORM = `upper(regexp_replace(btrim(ticker), '\s+', ' ', 'g'))`;
const TABLES = ["model_headers", "bank_headers"];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const show = async (label, sql) => {
  const r = await client.query(sql);
  console.log(`\n-- ${label} (${r.rowCount})`);
  for (const row of r.rows) console.log("   " + JSON.stringify(row));
  return r.rows;
};

await client.query("BEGIN");
try {
  for (const t of TABLES) {
    await show(
      `${t}: filas a normalizar`,
      `SELECT ticker AS antes, ${NORM} AS despues FROM ${t} WHERE ticker <> ${NORM} ORDER BY 1`
    );

    // Colisión = dos filas distintas caerían en el mismo (ticker, update_date).
    const col = await show(
      `${t}: colisiones tras normalizar (debe ser 0)`,
      `SELECT ${NORM} AS ticker_norm, update_date, count(*) AS n
         FROM ${t} GROUP BY 1, 2 HAVING count(*) > 1`
    );
    if (col.length > 0) throw new Error(`${t}: hay colisiones — abortando sin tocar nada`);

    const r = await client.query(`UPDATE ${t} SET ticker = ${NORM} WHERE ticker <> ${NORM}`);
    console.log(`   >> ${t}: ${r.rowCount} fila(s) actualizada(s)`);
  }

  if (DRY) {
    await client.query("ROLLBACK");
    console.log("\n--dry-run: ROLLBACK, no se cambió nada.");
  } else {
    await client.query("COMMIT");
    console.log("\nCOMMIT OK");
  }
} catch (e) {
  await client.query("ROLLBACK");
  console.error("\nROLLBACK:", e.message);
  await client.end();
  process.exit(1);
}

await show(
  "Verificación: ¿quedan tickers no canónicos?",
  `SELECT 'model' AS tabla, ticker FROM model_headers WHERE ticker <> ${NORM}
   UNION ALL
   SELECT 'bank', ticker FROM bank_headers WHERE ticker <> ${NORM}`
);

await show(
  "Verificación: hijos huérfanos (todo debe dar 0)",
  `SELECT 'model_financials' AS tabla, count(*) AS n FROM model_financials f
     WHERE NOT EXISTS (SELECT 1 FROM model_headers h WHERE h.ticker = f.ticker AND h.update_date = f.update_date)
   UNION ALL SELECT 'model_kpis', count(*) FROM model_kpis k
     WHERE NOT EXISTS (SELECT 1 FROM model_headers h WHERE h.ticker = k.ticker AND h.update_date = k.update_date)
   UNION ALL SELECT 'bank_financials', count(*) FROM bank_financials f
     WHERE NOT EXISTS (SELECT 1 FROM bank_headers h WHERE h.ticker = f.ticker AND h.update_date = f.update_date)
   UNION ALL SELECT 'bank_kpis', count(*) FROM bank_kpis k
     WHERE NOT EXISTS (SELECT 1 FROM bank_headers h WHERE h.ticker = k.ticker AND h.update_date = k.update_date)`
);

await client.end();
