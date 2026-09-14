-- Normaliza el ticker (UPPER + espacios colapsados, igual que lib/issuer.ts) en las tablas
-- del deep-dive. La carga del 2026-09-11 entró con la capitalización de Bloomberg
-- ("ENAEX CI Equity") y las rutas de lectura comparan por igualdad contra el ticker
-- canónico ("ENAEX CI EQUITY"), así que el deep-dive seguía leyendo el precio de agosto.
-- El ingest ya normaliza al escribir (app/api/ingest/route.ts → withCanonicalTicker);
-- esto repara lo que ya está guardado. Correr una sola vez, dentro de la transacción.

BEGIN;

-- ── 1) Fotos acumuladas: sin colisiones (sólo la carga del 2026-09-11 venía mal) ──────────
UPDATE price_range_52w
   SET ticker = UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'))
 WHERE ticker <> UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'));

UPDATE short_interest
   SET ticker = UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'))
 WHERE ticker <> UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'));

UPDATE analyst_recommendations
   SET ticker = UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'))
 WHERE ticker <> UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'));

-- ── 2) Series con colisiones: la misma (ticker, fecha[, metric, period]) existe en ambas
--       capitalizaciones (re-cargas de la misma foto). Se conserva la fila canónica y se
--       borra la duplicada; después se normaliza el resto.
DELETE FROM valuation_history v
 WHERE v.ticker <> UPPER(regexp_replace(BTRIM(v.ticker), '[[:space:]]+', ' ', 'g'))
   AND EXISTS (
     SELECT 1 FROM valuation_history c
      WHERE c.ticker = UPPER(regexp_replace(BTRIM(v.ticker), '[[:space:]]+', ' ', 'g'))
        AND c.date   = v.date
   );
UPDATE valuation_history
   SET ticker = UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'))
 WHERE ticker <> UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'));

DELETE FROM price_vs_earnings v
 WHERE v.ticker <> UPPER(regexp_replace(BTRIM(v.ticker), '[[:space:]]+', ' ', 'g'))
   AND EXISTS (
     SELECT 1 FROM price_vs_earnings c
      WHERE c.ticker = UPPER(regexp_replace(BTRIM(v.ticker), '[[:space:]]+', ' ', 'g'))
        AND c.date   = v.date
   );
UPDATE price_vs_earnings
   SET ticker = UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'))
 WHERE ticker <> UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'));

DELETE FROM consensus_estimates v
 WHERE v.ticker <> UPPER(regexp_replace(BTRIM(v.ticker), '[[:space:]]+', ' ', 'g'))
   AND EXISTS (
     SELECT 1 FROM consensus_estimates c
      WHERE c.ticker = UPPER(regexp_replace(BTRIM(v.ticker), '[[:space:]]+', ' ', 'g'))
        AND c.date   = v.date
        AND c.metric = v.metric
        AND c.period = v.period
   );
UPDATE consensus_estimates
   SET ticker = UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'))
 WHERE ticker <> UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'));

COMMIT;

-- ── Verificación: todo debe dar 0 ────────────────────────────────────────────────────────
SELECT 'price_range_52w'         AS t, COUNT(*) FROM price_range_52w         WHERE ticker <> UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'))
UNION ALL SELECT 'short_interest',         COUNT(*) FROM short_interest         WHERE ticker <> UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'))
UNION ALL SELECT 'analyst_recommendations',COUNT(*) FROM analyst_recommendations WHERE ticker <> UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'))
UNION ALL SELECT 'valuation_history',      COUNT(*) FROM valuation_history      WHERE ticker <> UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'))
UNION ALL SELECT 'price_vs_earnings',      COUNT(*) FROM price_vs_earnings      WHERE ticker <> UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'))
UNION ALL SELECT 'consensus_estimates',    COUNT(*) FROM consensus_estimates    WHERE ticker <> UPPER(regexp_replace(BTRIM(ticker), '[[:space:]]+', ' ', 'g'));
