-- Auditoría de BDD 2026-11 — FASE B6: FKs hacia la maestra (empresas_industrias_v2).
-- Cierra la Fase B. Seis tablas pasan a exigir que su ticker exista en la maestra:
--   model_headers, bank_headers, ficha_statements, ficha_kpis, ficha_comments, estimates_hidden.
-- Verificado el 2026-11-23: 0 tickers sin match EXACTO en las seis.
--
-- Reglas (las mismas que fichas / presentation_tickers / security_aliases):
--   ON DELETE RESTRICT — no se puede borrar de la maestra una empresa con modelos/fichas.
--   ON UPDATE CASCADE  — renombrar su ticker en la maestra lo propaga (y de ahí, por las FKs
--                        que ya existían, a model_financials/model_kpis/bank_*).
-- Los nombres de constraint son los que genera Prisma: el `db push` del deploy no tiene nada
-- que hacer. Este SQL no rompe la versión desplegada (no quita nada), así que puede correrse
-- antes o después del deploy; lo natural es antes.
--   npx prisma db execute --file prisma/sql/phase_b6_fks_2026-11-23.sql

BEGIN;

-- 0. PAMPA: única fila de la maestra con el ticker fuera de formato ("PAMPA CI Equity") y
--    country_risk 'Chile' en vez de 'CL'. Con FK, un modelo o ficha de Pampa llega canónico
--    ("PAMPA CI EQUITY") y sería rechazado. ON UPDATE CASCADE arrastra las referencias que
--    ya existan (fichas, presentation_tickers, ficha_tickers, security_aliases).
UPDATE empresas_industrias_v2
   SET ticker_bloomberg = 'PAMPA CI EQUITY', country_risk = 'CL'
 WHERE ticker_bloomberg = 'PAMPA CI Equity'
   AND NOT EXISTS (SELECT 1 FROM empresas_industrias_v2 WHERE ticker_bloomberg = 'PAMPA CI EQUITY');

-- 1. FKs.
ALTER TABLE model_headers    ADD CONSTRAINT model_headers_ticker_fkey    FOREIGN KEY (ticker) REFERENCES empresas_industrias_v2 (ticker_bloomberg) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE bank_headers     ADD CONSTRAINT bank_headers_ticker_fkey     FOREIGN KEY (ticker) REFERENCES empresas_industrias_v2 (ticker_bloomberg) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE ficha_statements ADD CONSTRAINT ficha_statements_ticker_fkey FOREIGN KEY (ticker) REFERENCES empresas_industrias_v2 (ticker_bloomberg) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE ficha_kpis       ADD CONSTRAINT ficha_kpis_ticker_fkey       FOREIGN KEY (ticker) REFERENCES empresas_industrias_v2 (ticker_bloomberg) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE ficha_comments   ADD CONSTRAINT ficha_comments_ticker_fkey   FOREIGN KEY (ticker) REFERENCES empresas_industrias_v2 (ticker_bloomberg) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE estimates_hidden ADD CONSTRAINT estimates_hidden_ticker_fkey FOREIGN KEY (ticker) REFERENCES empresas_industrias_v2 (ticker_bloomberg) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Comentarios para el MCP: la columna ticker ahora es una FK garantizada.
COMMENT ON COLUMN model_headers.ticker    IS 'Ticker Bloomberg canónico ("ANDINAB CI EQUITY"). FK a empresas_industrias_v2.ticker_bloomberg: JOIN directo por igualdad, siempre existe en la maestra.';
COMMENT ON COLUMN bank_headers.ticker     IS 'Ticker Bloomberg canónico del banco ("BCI CI EQUITY"). FK a empresas_industrias_v2.ticker_bloomberg: JOIN directo por igualdad, siempre existe en la maestra.';
COMMENT ON COLUMN ficha_statements.ticker IS 'Ticker Bloomberg canónico, MAYÚSCULA ("ANDINAB CI EQUITY"). FK a empresas_industrias_v2.ticker_bloomberg: JOIN directo por igualdad, siempre existe en la maestra.';
COMMENT ON COLUMN ficha_kpis.ticker       IS 'Ticker Bloomberg canónico, MAYÚSCULA. FK a empresas_industrias_v2.ticker_bloomberg: JOIN directo por igualdad, siempre existe en la maestra.';
COMMENT ON COLUMN ficha_comments.ticker   IS 'Ticker Bloomberg canónico, igual que ficha_statements.ticker. FK a empresas_industrias_v2.ticker_bloomberg.';
COMMENT ON COLUMN estimates_hidden.ticker IS 'Ticker Bloomberg canónico del modelo oculto (= model_headers / bank_headers.ticker). FK a empresas_industrias_v2.ticker_bloomberg.';

COMMIT;

-- Verificación:
--   SELECT conrelid::regclass, conname FROM pg_constraint
--    WHERE contype = 'f' AND confrelid = 'empresas_industrias_v2'::regclass ORDER BY 1;   -- 10 filas
--   SELECT ticker_bloomberg, country_risk FROM empresas_industrias_v2 WHERE nombre_latam = 'PAMPA INVESTMENTS';
