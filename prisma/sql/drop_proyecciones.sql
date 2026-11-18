-- ═══════════════════════════════════════════════════════════════════════════════
-- DROP proyecciones_financieras + proyecciones_override (2026-11-18)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Las proyecciones de Stock Selection salen ahora de los modelos del analista
-- (model_financials / bank_financials) y la pestaña Projections se eliminó.
-- Respaldo de los datos (812 + 2 filas) en backups/*_2026-11-18.json (fuera del repo).
--
-- ORDEN: correr esto JUSTO ANTES del `git push` que saca los modelos del schema.
--   · Si se corre antes, el código que está en producción (que todavía lee estas tablas)
--     rompe Stock Selection hasta que termine el deploy.
--   · Si no se corre, el `prisma db push` del build ve tablas con datos que el schema ya
--     no tiene, se niega a borrarlas sin --accept-data-loss y el build falla.
--
--   npx prisma db execute --file prisma/sql/drop_proyecciones.sql
-- ═══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS "proyecciones_override";
DROP TABLE IF EXISTS "proyecciones_financieras";
