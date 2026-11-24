-- Optimización de la BDD (2026-11-23), después de la limpieza (Fases A–C).
-- Medido en producción con EXPLAIN ANALYZE en sesión de sólo lectura antes de proponer nada.
--   npx prisma db execute --file prisma/sql/optimization_2026-11-23.sql
-- Correr ANTES de desplegar el commit que saca los índices del schema (si no, el db push del
-- build los borra igual; el orden no rompe nada, pero así queda todo en un solo paso).
-- Los ALTER DATABASE aplican a conexiones NUEVAS: después de correrlo, reiniciar el servicio de la
-- app en Railway (o el deploy lo hace) para que el pool de Prisma tome los valores.

BEGIN;

-- 1. JIT apagado. El sidebar de compañías (/api/companies/list, que piden el deep-dive, el
--    combobox y Consensus Check) tardaba ~400 ms, de los cuales 325–385 ms eran compilación
--    JIT de una consulta que corre en ~70 ms. El JIT sólo rinde en consultas analíticas largas;
--    acá ninguna lo es.
ALTER DATABASE railway SET jit = off;

-- 2. work_mem 4 MB → 32 MB. Con 4 MB los ordenamientos grandes (último dato por papel sobre
--    valuation_history / consensus_estimates, que hace el MCP) escriben a disco: 930 archivos
--    temporales, 3 GB, desde agosto. Con 32 MB dejan de hacerlo. Conexiones reales: ~10.
ALTER DATABASE railway SET work_mem = '32MB';

-- 3. Registro de consultas lentas: pg_stat_statements ya está precargada en el servidor
--    (shared_preload_libraries) pero la extensión nunca se creó. En su propio schema para no
--    mezclarse con public (que administra Prisma). Consultar en 1–2 semanas:
--      SELECT calls, round(mean_exec_time) ms, query FROM monitoring.pg_stat_statements
--       ORDER BY total_exec_time DESC LIMIT 20;
CREATE SCHEMA IF NOT EXISTS monitoring;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements SCHEMA monitoring;

-- 4. Índices redundantes o sin uso (también salieron de schema.prisma):
--    prefijo de un índice único de la misma tabla (lo cubre el único):
DROP INDEX IF EXISTS top_picks_region_period_date_idx;                 -- ⊂ (region, period_date, nombre_latam)
DROP INDEX IF EXISTS top_pick_periods_region_period_date_idx;          -- = top_pick_periods_region_period_date_key
DROP INDEX IF EXISTS ficha_statements_ticker_period_type_year_quarter_idx;
DROP INDEX IF EXISTS ficha_kpis_ticker_period_type_year_quarter_idx;
DROP INDEX IF EXISTS ficha_comments_ticker_year_quarter_idx;
--    sin uso real (contadores desde el reinicio del 2026-08-22):
DROP INDEX IF EXISTS consensus_estimates_period_idx;                    -- 2 usos, 720 kB
DROP INDEX IF EXISTS price_vs_earnings_date_idx;                        -- 4 usos
DROP INDEX IF EXISTS ticker_return_snapshot_as_of_idx;                  -- tabla de ~200 filas

-- 5. Estadísticas del planificador al día. 12 tablas chicas nunca se habían analizado y otras
--    estaban desfasadas (bank_headers figuraba con 1 fila y tiene 14): eso infla los costos
--    estimados y empujaba consultas al JIT. ANALYZE sólo lee; corre dentro de la transacción.
ANALYZE;

COMMIT;

-- Verificación (en una conexión nueva):
--   SHOW jit;        -- off
--   SHOW work_mem;   -- 32MB
--   SELECT count(*) FROM monitoring.pg_stat_statements;   -- > 0
