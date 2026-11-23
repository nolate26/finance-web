-- Auditoría de BDD 2026-11-23 — FASE A.
-- Aplicar ANTES de desplegar el commit que saca EmpresasIndustrias / LastRun / AnalystLink.region
-- del schema (el build corre `prisma db push`, que se negaría a dropear tablas con datos).
--   npx prisma db execute --file prisma/sql/phase_a_cleanup_2026-11-23.sql
-- Respaldos: backups/empresas_industrias_2026-11-23.json, last_run_2026-11-23.json,
--            analyst_links_2026-11-23.json, total_return_index_mixedcase_2026-11-23.json
-- Todo en una transacción: si un paso falla no se aplica ninguno.

BEGIN;

-- 1. claude_ro (MCP de los analistas / futuro bot) deja de ver autenticación.
--    users guarda hashes de password; accounts/sessions/verification_tokens son de NextAuth.
--    El DEFAULT PRIVILEGES de public (SELECT en toda tabla nueva) se cierra en la Fase C,
--    cuando claude_ro pase a leer sólo el schema `ai`.
REVOKE ALL ON TABLE users, accounts, sessions, verification_tokens FROM claude_ro;

-- 2. Tablas muertas.
DROP TABLE IF EXISTS empresas_industrias;   -- maestra v1, 0 referencias en el código
DROP TABLE IF EXISTS last_run;              -- 0 filas desde siempre

-- 3. Columna legada sin datos (0 de 3 filas).
ALTER TABLE analyst_links DROP COLUMN IF EXISTS region;

-- 4. total_return_index: ticker canónico (UPPER + espacios colapsados), igual que lib/issuer.ts
--    normalizeTicker. Verificado el 2026-11-23: 3.854 filas a normalizar y 0 colisiones con
--    (ticker, date) ya existentes en mayúscula. Si hubiera alguna, el UPDATE violaría la PK y
--    la transacción entera se revierte.
UPDATE total_return_index
   SET ticker = regexp_replace(upper(btrim(ticker)), '\s+', ' ', 'g')
 WHERE ticker <> regexp_replace(upper(btrim(ticker)), '\s+', ' ', 'g');

COMMIT;

-- Verificación (correr aparte, debe dar 0 / 0 / false):
--   SELECT count(*) FROM total_return_index WHERE ticker <> upper(ticker);
--   SELECT count(*) FROM information_schema.tables WHERE table_name IN ('empresas_industrias','last_run');
--   SELECT has_table_privilege('claude_ro','users','SELECT');
