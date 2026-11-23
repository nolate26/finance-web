-- Auditoría de BDD 2026-11 — FASE B3: company_isins → security_aliases.
-- Aplicar ANTES de desplegar el commit que reemplaza CompanyIsin por SecurityAlias en el schema
-- (el build corre `prisma db push`, que se negaría a dropear company_isins con datos). El DDL
-- replica exactamente lo que genera Prisma, así que el db push del deploy no tiene nada que hacer.
--   npx prisma db execute --file prisma/sql/phase_b3_security_aliases_2026-11-23.sql
-- Respaldo: backups/company_isins_2026-11-23.json (235 filas).
-- Entre este SQL y el deploy, el track record, Stock Selection, Active Decisions y la carga de
-- carteras dan error (la versión desplegada lee company_isins). Desplegar inmediatamente después.

BEGIN;

-- ── 1. Tabla ──────────────────────────────────────────────────────────────────
CREATE TABLE security_aliases (
  alias_source VARCHAR(40)  NOT NULL,
  alias        VARCHAR(120) NOT NULL,
  bbg_ticker   VARCHAR(100),
  isin         VARCHAR(50),
  yahoo_ticker VARCHAR(100),
  note         VARCHAR(300),
  created_at   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by   VARCHAR(200),
  CONSTRAINT security_aliases_pkey PRIMARY KEY (alias_source, alias)
);
CREATE INDEX security_aliases_bbg_ticker_idx ON security_aliases (bbg_ticker);
ALTER TABLE security_aliases
  ADD CONSTRAINT security_aliases_bbg_ticker_fkey FOREIGN KEY (bbg_ticker)
  REFERENCES empresas_industrias_v2 (ticker_bloomberg) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 2. Migración desde company_isins ─────────────────────────────────────────
-- Resolución contra la maestra: 1º por ticker Yahoo (case-insensitive), 2º por ISIN. Yahoo
-- primero porque es lo que el track record usa de verdad para traer precios, y corrige un ISIN
-- mal cargado (EMBONOR-B traía el ISIN de la serie A). Si dos tickers empatan (IFS PE / IFS US,
-- mismo ISIN y mismo Yahoo), se prefiere el listado en US cuando el Yahoo no trae sufijo de bolsa.
-- isin / yahoo_ticker se guardan SÓLO si la maestra no los da: sin match se conservan los dos;
-- con match, el yahoo sólo si difiere del de la maestra (o ésta no tiene).
INSERT INTO security_aliases (alias_source, alias, bbg_ticker, isin, yahoo_ticker, note, created_by)
SELECT 'track_record',
       ci.company_name,
       m.ticker_bloomberg,
       CASE WHEN m.ticker_bloomberg IS NULL THEN NULLIF(btrim(ci.isin), '') END,
       CASE WHEN m.ticker_bloomberg IS NULL
              OR upper(coalesce(m.yahoo_finance_ticker, '')) <> upper(coalesce(btrim(ci.yahoo_finance_ticker), ''))
            THEN NULLIF(btrim(ci.yahoo_finance_ticker), '') END,
       CASE WHEN m.ticker_bloomberg IS NULL THEN 'Sin match en la maestra al migrar company_isins (2026-11-23)' END,
       'migracion-b3'
FROM company_isins ci
LEFT JOIN LATERAL (
  SELECT v.ticker_bloomberg, v.yahoo_finance_ticker
  FROM empresas_industrias_v2 v
  WHERE (NULLIF(btrim(ci.yahoo_finance_ticker), '') IS NOT NULL
         AND upper(btrim(v.yahoo_finance_ticker)) = upper(btrim(ci.yahoo_finance_ticker)))
     OR (NULLIF(btrim(ci.isin), '') IS NOT NULL AND btrim(v.isin) = btrim(ci.isin))
  ORDER BY (upper(btrim(v.yahoo_finance_ticker)) = upper(btrim(ci.yahoo_finance_ticker))) IS TRUE DESC,
           ((v.ticker_bloomberg LIKE '% US EQUITY') = (position('.' IN coalesce(ci.yahoo_finance_ticker, '')) = 0)) DESC,
           v.ticker_bloomberg
  LIMIT 1
) m ON true;

-- ── 3. company_isins fuera ────────────────────────────────────────────────────
DROP TABLE company_isins;

-- ── 4. Comentarios para el MCP ────────────────────────────────────────────────
COMMENT ON TABLE security_aliases IS 'Puente de NOMBRES ALTERNATIVOS → papel de la maestra. Cada fuente que nombra empresas a su manera (hoy: el track record, cuyo AnalystRecommendationHistory.company usa nemotécnicos chilenos como ''ANDINA-B'' o nombres viejos como ''NUEVAPOLAR'') registra acá su alias y a qué ticker Bloomberg corresponde. Reemplazó a company_isins (2026-11-23). PK (alias_source, alias). Para resolver un alias: JOIN empresas_industrias_v2 ON ticker_bloomberg = bbg_ticker; el ticker Yahoo efectivo es COALESCE(security_aliases.yahoo_ticker, empresas_industrias_v2.yahoo_finance_ticker) y el ISIN COALESCE(security_aliases.isin, empresas_industrias_v2.isin).';
COMMENT ON COLUMN security_aliases.alias_source IS 'De qué fuente es el alias. Valores: ''track_record'' (= AnalystRecommendationHistory.company).';
COMMENT ON COLUMN security_aliases.alias IS 'El nombre tal como lo escribe la fuente (match exacto; para track_record, igual a AnalystRecommendationHistory.company).';
COMMENT ON COLUMN security_aliases.bbg_ticker IS 'Ticker Bloomberg canónico ("BICE CI EQUITY"), FK a empresas_industrias_v2.ticker_bloomberg. NULL = el papel NO está en la maestra (deslistado, fusionado o fuera de cobertura): en ese caso isin y yahoo_ticker son la única referencia.';
COMMENT ON COLUMN security_aliases.isin IS 'ISIN sólo cuando bbg_ticker es NULL. Con bbg_ticker, el ISIN es el de la maestra.';
COMMENT ON COLUMN security_aliases.yahoo_ticker IS 'Ticker Yahoo que usa el track record para bajar precios. Sólo se guarda cuando difiere del de la maestra o ésta no tiene: si no es NULL, MANDA sobre empresas_industrias_v2.yahoo_finance_ticker.';
COMMENT ON COLUMN security_aliases.note IS 'Texto libre: por qué el alias no tiene ticker, de dónde salió el mapeo, etc.';
COMMENT ON COLUMN security_aliases.created_at IS 'Fecha de alta del alias.';
COMMENT ON COLUMN security_aliases.created_by IS 'Email de quien lo dio de alta (''migracion-b3'' para los que vienen de company_isins).';

COMMIT;

-- Verificación:
--   SELECT count(*) total, count(bbg_ticker) con_ticker FROM security_aliases;   -- 235 / 208
--   SELECT count(*) FROM information_schema.tables WHERE table_name = 'company_isins';  -- 0
