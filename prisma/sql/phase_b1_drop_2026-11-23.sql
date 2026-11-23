-- Auditoría de BDD 2026-11 — FASE B1: features con feed detenido.
-- Aplicar ANTES de desplegar el commit que saca los modelos del schema (el build corre
-- `prisma db push`, que se negaría a dropear tablas con datos).
--   npx prisma db execute --file prisma/sql/phase_b1_drop_2026-11-23.sql
-- Respaldos: backups/latam_equity_snapshots_2026-11-23.json (422 filas),
--            backups/beta_sensitivity_2026-11-23.json (3.564),
--            backups/performance_attribution_2026-11-23.json (4.225)
-- Entre este SQL y el deploy, /latam y la pestaña Attribution de /fondos dan error: la
-- versión desplegada todavía las consulta. Desplegar inmediatamente después.

BEGIN;

DROP TABLE IF EXISTS latam_equity_snapshots;   -- último snapshot 2026-04-28
DROP TABLE IF EXISTS beta_sensitivity;         -- un solo cálculo, 2026-08-07
DROP TABLE IF EXISTS performance_attribution;  -- último reporte 2026-08-31

COMMIT;

-- Verificación (debe dar 0):
--   SELECT count(*) FROM information_schema.tables
--    WHERE table_name IN ('latam_equity_snapshots','beta_sensitivity','performance_attribution');
