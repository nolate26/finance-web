-- Columna LTM de la hoja "Send Ficha" (entre los años y los trimestres).
-- Se guarda como period_type = 'L', con year/quarter/period_end del ÚLTIMO trimestre de la
-- hoja (el LTM "a 3Q26" es year 2026, quarter 3). Hay UNO por compañía: /api/ficha/ingest
-- borra el LTM anterior del ticker antes de insertar el nuevo. Idempotente.
--   npx prisma db execute --file prisma/sql/ficha_ltm_migration.sql

ALTER TABLE "ficha_statements" DROP CONSTRAINT IF EXISTS "ficha_statements_period_check";
ALTER TABLE "ficha_statements" ADD CONSTRAINT "ficha_statements_period_check"
  CHECK ((period_type = 'A' AND quarter = 0) OR (period_type IN ('Q', 'L') AND quarter BETWEEN 1 AND 4));

ALTER TABLE "ficha_kpis" DROP CONSTRAINT IF EXISTS "ficha_kpis_period_check";
ALTER TABLE "ficha_kpis" ADD CONSTRAINT "ficha_kpis_period_check"
  CHECK ((period_type = 'A' AND quarter = 0) OR (period_type IN ('Q', 'L') AND quarter BETWEEN 1 AND 4));

-- Last Ficha: la celda LTM también se puede encerrar y comentar (target "ltm").
ALTER TABLE "ficha_comments" DROP CONSTRAINT IF EXISTS "ficha_comments_values_check";
ALTER TABLE "ficha_comments" ADD CONSTRAINT "ficha_comments_values_check"
  CHECK (quarter BETWEEN 1 AND 4 AND source IN ('statement','kpi') AND target ~ '^(line|yoy|qoq|ltm|A[0-9]{4}|Q[0-9]{4}-[1-4])$');

COMMENT ON COLUMN ficha_statements.period_type IS '"A" = año completo, "Q" = trimestre, "L" = LTM (últimos 12 meses) a ese trimestre; un solo LTM por ticker, cada subida reemplaza el anterior (CHECK ficha_statements_period_check).';
COMMENT ON COLUMN ficha_statements.quarter IS 'Trimestre 1..4 si period_type = "Q" o "L" (en "L" es el trimestre al que llega el LTM); 0 si es anual (nunca NULL, para que entre en la clave única). Filtrar anuales con quarter = 0 o period_type = ''A''.';
COMMENT ON COLUMN ficha_kpis.period_type IS '"A" = año completo, "Q" = trimestre, "L" = LTM a ese trimestre (uno solo por ticker).';
COMMENT ON COLUMN ficha_kpis.quarter IS '1..4 si period_type = "Q" o "L"; 0 si es anual (nunca NULL).';
COMMENT ON COLUMN ficha_comments.target IS 'Qué se comenta: "line" = la fila (columna de la derecha); "yoy"/"qoq" = la variación del trimestre base; "ltm" = la celda LTM; "A2025" = la celda del año 2025; "Q2026-3" = la celda del trimestre 3Q26.';
