-- Rediseño de moneda_fund_returns (2026-11-25): pasa de los PDFs por página al Excel de
-- rentabilidades por familia. Clave nueva (report_date DATE, familia, currency, fund); se van
-- page_num, incep, inception_date, fund_group y dyn_1..3.
--
-- CORRER ANTES DEL DEPLOY (la tabla está vacía; el build hace prisma db push y la recrea):
--   npx prisma db execute --file prisma/sql/moneda_fund_returns_redesign_2026-11-25.sql
--
-- La vista ai.fund_peer_returns depende de las columnas viejas y bloquearía el db push, así que
-- se borra acá. DESPUÉS del deploy:
--   npx prisma db execute --file prisma/sql/phase_c_ai_schema_2026-11-23.sql   (recrea la vista nueva)
--   npx prisma db execute --file prisma/sql/moneda_fund_returns_comments.sql

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM moneda_fund_returns LIMIT 1) THEN
    RAISE EXCEPTION 'moneda_fund_returns tiene filas: este script asume la tabla vacía. Abortado.';
  END IF;
END $$;

DROP VIEW IF EXISTS ai.fund_peer_returns;
DROP TABLE moneda_fund_returns;

COMMIT;
