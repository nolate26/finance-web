-- ═══════════════════════════════════════════════════════════════════════════════
-- fichas — quarter del informe + una ficha por ticker
-- ═══════════════════════════════════════════════════════════════════════════════
-- CORRER ANTES de `npx prisma db push`.
--
-- Por qué antes: `db push` no puede agregar columnas NOT NULL a una tabla que ya
-- tiene filas (no sabe con qué llenarlas) ni crear un UNIQUE si hay duplicados.
-- Este script deja las dos cosas resueltas, y después `db push` las ve tal como las
-- declara el schema y no toca nada.
--
-- Backfill: las dos fichas cargadas (ANDINAB y CCU, 2026-09-17) son las de 2Q26 —
-- así lo dicen sus propios archivos (Andina_2Q26.pdf, CCU_2Q26.pdf). Cualquier fila
-- posterior sin quarter cae al trimestre CALENDARIO de su created_at, que es el
-- supuesto razonable para una carga hecha a mano.
--
-- Idempotente: se puede re-ejecutar sin efecto.
--
--   psql "$DATABASE_URL" -f prisma/sql/fichas_quarter_migration.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1 ── Columnas nuevas, primero nullable para poder rellenarlas.
ALTER TABLE fichas ADD COLUMN IF NOT EXISTS fiscal_year INT;
ALTER TABLE fichas ADD COLUMN IF NOT EXISTS quarter     INT;

-- 2 ── Backfill.
--     Las fichas existentes al 2026-09-17 son 2Q26.
UPDATE fichas
   SET fiscal_year = 2026, quarter = 2
 WHERE fiscal_year IS NULL
   AND created_at < DATE '2026-09-18';

--     Red de seguridad para cualquier otra fila sin quarter: trimestre calendario
--     de su fecha de carga.
UPDATE fichas
   SET fiscal_year = EXTRACT(YEAR    FROM created_at)::INT,
       quarter     = EXTRACT(QUARTER FROM created_at)::INT
 WHERE fiscal_year IS NULL;

-- 3 ── Ahora sí, NOT NULL + rango válido.
ALTER TABLE fichas ALTER COLUMN fiscal_year SET NOT NULL;
ALTER TABLE fichas ALTER COLUMN quarter     SET NOT NULL;

ALTER TABLE fichas DROP CONSTRAINT IF EXISTS fichas_quarter_range;
ALTER TABLE fichas ADD  CONSTRAINT fichas_quarter_range CHECK (quarter BETWEEN 1 AND 4);

-- 4 ── Una ficha viva por ticker. Si alguna vez quedaron varias, se conserva la del
--     quarter más nuevo (y a igualdad, la subida más recientemente).
--     OJO: esto borra filas, pero NO sus PDFs en R2. Hoy no hay duplicados —
--     quedó acá sólo para que el script sea seguro de re-ejecutar.
DELETE FROM fichas f
 WHERE EXISTS (
   SELECT 1 FROM fichas g
    WHERE g.ticker = f.ticker
      AND (g.fiscal_year, g.quarter, g.created_at) > (f.fiscal_year, f.quarter, f.created_at)
 );

DROP INDEX IF EXISTS "fichas_ticker_created_at_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "fichas_ticker_key"            ON fichas (ticker);
CREATE        INDEX IF NOT EXISTS "fichas_fiscal_year_quarter_idx" ON fichas (fiscal_year, quarter);

COMMIT;

-- Control: debería listar una fila por ticker, todas con su quarter.
-- SELECT ticker, quarter || 'Q' || RIGHT(fiscal_year::TEXT, 2) AS q, title FROM fichas ORDER BY ticker;
