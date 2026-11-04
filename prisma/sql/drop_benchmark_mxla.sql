-- =============================================================================
-- DROP: benchmark_mxla
-- =============================================================================
-- Quedó huérfana al eliminar /api/quant/nav, su único lector. No tiene relaciones
-- con otras tablas. Sólo guardaba fecha y PX_LAST del MXLA Index, que se puede
-- volver a bajar de Bloomberg.
--
-- Ejecutar UNA vez, ANTES de desplegar: el modelo ya no está en schema.prisma y
-- `prisma db push` (corre en `npm run build`) se frena si la tabla sigue con datos.
-- Es irreversible.
--
--   npx prisma db execute --file prisma/sql/drop_benchmark_mxla.sql
-- =============================================================================

DROP TABLE IF EXISTS benchmark_mxla;
