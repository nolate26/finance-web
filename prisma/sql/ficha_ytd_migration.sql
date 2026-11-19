-- Columnas "Acumulado n-1" y "Acumulado" de la hoja "Send Ficha" (después del LTM).
-- Se guardan como period_type = 'Y' (year-to-date): "Acumulado" con year/quarter del ÚLTIMO
-- trimestre de la hoja y "Acumulado n-1" con el mismo trimestre del año anterior (9M26 →
-- year 2026, quarter 3; 9M25 → year 2025, quarter 3). Igual que el LTM, hay un solo par por
-- compañía: /api/ficha/ingest borra los 'Y' anteriores del ticker antes de insertar.
-- Idempotente.
--   npx prisma db execute --file prisma/sql/ficha_ytd_migration.sql

ALTER TABLE "ficha_statements" DROP CONSTRAINT IF EXISTS "ficha_statements_period_check";
ALTER TABLE "ficha_statements" ADD CONSTRAINT "ficha_statements_period_check"
  CHECK ((period_type = 'A' AND quarter = 0) OR (period_type IN ('Q', 'L', 'Y') AND quarter BETWEEN 1 AND 4));

ALTER TABLE "ficha_kpis" DROP CONSTRAINT IF EXISTS "ficha_kpis_period_check";
ALTER TABLE "ficha_kpis" ADD CONSTRAINT "ficha_kpis_period_check"
  CHECK ((period_type = 'A' AND quarter = 0) OR (period_type IN ('Q', 'L', 'Y') AND quarter BETWEEN 1 AND 4));

-- Last Ficha: las celdas de los acumulados también se pueden encerrar y comentar.
ALTER TABLE "ficha_comments" DROP CONSTRAINT IF EXISTS "ficha_comments_values_check";
ALTER TABLE "ficha_comments" ADD CONSTRAINT "ficha_comments_values_check"
  CHECK (quarter BETWEEN 1 AND 4 AND source IN ('statement','kpi') AND target ~ '^(line|yoy|qoq|ltm|ytd|ytdp|A[0-9]{4}|Q[0-9]{4}-[1-4])$');

COMMENT ON COLUMN ficha_statements.period_type IS '"A" = año completo, "Q" = trimestre, "L" = LTM (últimos 12 meses) a ese trimestre, "Y" = acumulado del año (year-to-date) a ese trimestre: el del último trimestre y el del mismo trimestre del año anterior. Un solo LTM y un solo par de acumulados por ticker: cada subida reemplaza los anteriores (CHECK ficha_statements_period_check).';
COMMENT ON COLUMN ficha_statements.quarter IS 'Trimestre 1..4 si period_type es "Q", "L" o "Y" (en "L" e "Y" es el trimestre al que llega); 0 si es anual (nunca NULL, para que entre en la clave única).';
COMMENT ON COLUMN ficha_kpis.period_type IS '"A" = año completo, "Q" = trimestre, "L" = LTM a ese trimestre, "Y" = acumulado del año a ese trimestre (uno solo por ticker y año).';
COMMENT ON COLUMN ficha_kpis.quarter IS '1..4 si period_type es "Q", "L" o "Y"; 0 si es anual (nunca NULL).';
COMMENT ON COLUMN ficha_comments.target IS 'Qué se comenta: "line" = la fila (columna de la derecha); "yoy"/"qoq" = la variación del trimestre base; "ltm" = la celda LTM; "ytd" / "ytdp" = el acumulado del año / del año anterior; "A2025" = la celda del año 2025; "Q2026-3" = la celda del trimestre 3Q26.';
