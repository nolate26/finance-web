-- Auditoría de BDD 2026-11 — FASE B2: ss_universe.
-- Aplicar ANTES de desplegar el commit que saca SsUniverse del schema (el build corre
-- `prisma db push`, que se negaría a dropear una tabla con datos).
--   npx prisma db execute --file prisma/sql/phase_b2_drop_2026-11-23.sql
-- Respaldo: backups/ss_universe_2026-11-23.json (117 filas, único corte 2026-03-31).
-- Entre este SQL y el deploy, Active Decisions (Chile) da error: la versión desplegada todavía
-- lee la deuda neta de esta tabla. Desplegar inmediatamente después.

BEGIN;

DROP TABLE IF EXISTS ss_universe;

COMMIT;

-- Verificación (debe dar 0):
--   SELECT count(*) FROM information_schema.tables WHERE table_name = 'ss_universe';
