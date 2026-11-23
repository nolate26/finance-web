-- Auditoría de BDD 2026-11 — FASE B4: presentations.company_name.
-- La empresa de una presentación vive sólo en presentation_tickers (FK a la maestra). La
-- columna de texto libre company_name se elimina.
-- Aplicar ANTES de desplegar el commit que la saca del schema.
--   npx prisma db execute --file prisma/sql/phase_b4_presentations_company_name_2026-11-23.sql
-- Respaldo: backups/presentations_company_name_2026-11-23.json (1 fila: "Ambev Investment Case",
-- que ya tiene ABEV3 BZ EQUITY en presentation_tickers, así que el INSERT de abajo no agrega nada;
-- queda como red por si se cargó otra presentación con company_name antes de correr esto).
-- Entre este SQL y el deploy, /presentations y "Related reports" del deep-dive dan error: la
-- versión desplegada todavía lee la columna. Desplegar inmediatamente después.

BEGIN;

-- Cualquier company_name que sea un ticker de la maestra y todavía no esté en la relación.
INSERT INTO presentation_tickers (id, presentation_id, ticker)
SELECT gen_random_uuid()::text, p.id, e.ticker_bloomberg
  FROM presentations p
  JOIN empresas_industrias_v2 e
    ON e.ticker_bloomberg = regexp_replace(upper(btrim(p.company_name)), '\s+', ' ', 'g')
 WHERE p.company_name IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM presentation_tickers t
                    WHERE t.presentation_id = p.id AND t.ticker = e.ticker_bloomberg);

ALTER TABLE presentations DROP COLUMN company_name;

COMMIT;

-- Verificación (debe dar 0):
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_name = 'presentations' AND column_name = 'company_name';
