-- ═══════════════════════════════════════════════════════════════════════════════
-- ficha_statements / ficha_kpis — documentación para el servidor MCP
-- ═══════════════════════════════════════════════════════════════════════════════
-- Correr DESPUÉS de crear las tablas (ficha_statements_kpis_migration.sql o db push).
-- Idempotente: COMMENT ON reemplaza el comentario anterior.
--
--   psql "$DATABASE_URL" -f prisma/sql/ficha_statements_kpis_comments.sql
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE ficha_statements IS
'Estados financieros de la ficha de una empresa (Income Statement, Balance Sheet, Cash Flow), anuales y trimestrales, en formato largo: una fila por (ticker, período, sección, línea). Se cargan desde la macro de Excel SubirFicha (hoja "Send Ficha") vía POST /api/ficha/ingest, SIEMPRE con UPSERT por la clave única (ticker, period_type, year, quarter, section, line): reenviar la planilla actualiza valores, no duplica, y las líneas/períodos que dejaron de venir NO se borran. NO tiene relación con la tabla fichas (esa guarda los PDFs). No hay tabla de períodos: los períodos de un ticker salen de SELECT DISTINCT period_type, year, quarter, period_end. Montos en la moneda reportada (currency), en las unidades de la planilla. Para convertir a USD dividir por fx cuando currency es moneda local.';

COMMENT ON COLUMN ficha_statements.id IS 'Autoincremental, sin significado de negocio.';
COMMENT ON COLUMN ficha_statements.ticker IS 'Ticker Bloomberg canónico (trim + espacios colapsados + MAYÚSCULA), p.ej. "ANDINAB CI EQUITY". Mismo formato que empresas_industrias_v2.ticker_bloomberg, pero SIN FK.';
COMMENT ON COLUMN ficha_statements.currency IS 'Moneda en que reporta la empresa (celda C7 de la hoja), en MAYÚSCULA, p.ej. "CLP". Se repite en todas las filas del ticker; la última carga la pisa.';
COMMENT ON COLUMN ficha_statements.fx IS 'Tipo de cambio de la celda C6 de la hoja (moneda local por USD, p.ej. 972.6 para CLP). Se repite en todas las filas del ticker; la última carga lo pisa.';
COMMENT ON COLUMN ficha_statements.period_type IS '"A" = año completo, "Q" = trimestre, "L" = LTM (últimos 12 meses) a ese trimestre (CHECK ficha_statements_period_check).';
COMMENT ON COLUMN ficha_statements.year IS 'Año del período (para "3Q 2026" es 2026).';
COMMENT ON COLUMN ficha_statements.quarter IS 'Trimestre 1..4 si period_type = "Q"; 0 si es anual (nunca NULL, para que entre en la clave única). Filtrar anuales con quarter = 0 o period_type = ''A''.';
COMMENT ON COLUMN ficha_statements.period_end IS 'Fecha de cierre del período (fila "Period End" de la hoja), p.ej. 2026-09-30 para 3Q 2026. Útil para ordenar anuales y trimestrales juntos.';
COMMENT ON COLUMN ficha_statements.section IS 'Estado financiero: exactamente "Income Statement", "Balance Sheet" o "Cash Flow".';
COMMENT ON COLUMN ficha_statements.line IS 'Nombre de la línea tal como está en la planilla (columna B). Las filas "A"/"B" bajo una línea se guardan como "<línea> A" / "<línea> B" (series dual-class). Si un nombre se repite dentro de la sección, la segunda aparición lleva " (2)", la tercera " (3)", etc.';
COMMENT ON COLUMN ficha_statements.line_order IS 'Posición de la línea dentro de su sección en la planilla (1 = primera). Usar ORDER BY section, line_order para reconstruir el estado.';
COMMENT ON COLUMN ficha_statements.value IS 'Valor numérico de la celda. Las celdas vacías o con error no generan fila.';
COMMENT ON COLUMN ficha_statements.updated_at IS 'Última vez que la fila fue insertada o actualizada por el ingest.';

COMMENT ON TABLE ficha_kpis IS
'KPIs operacionales de la ficha de una empresa (bloque "KPIs" de la hoja "Send Ficha"), anuales y trimestrales, una fila por (ticker, período, section, kpi). Mismo ciclo de vida que ficha_statements: macro SubirFicha → POST /api/ficha/ingest, UPSERT por (ticker, period_type, year, quarter, section, kpi), nunca borra. section es el subtítulo del bloque (p.ej. "Chile", "Brasil"), no un estado financiero.';

COMMENT ON COLUMN ficha_kpis.id IS 'Autoincremental, sin significado de negocio.';
COMMENT ON COLUMN ficha_kpis.ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA, p.ej. "ANDINAB CI EQUITY". Sin FK.';
COMMENT ON COLUMN ficha_kpis.currency IS 'Moneda reportada de la empresa (C7). Ojo: muchos KPIs no son montos (volúmenes, %, unidades).';
COMMENT ON COLUMN ficha_kpis.fx IS 'Tipo de cambio de la celda C6 (moneda local por USD).';
COMMENT ON COLUMN ficha_kpis.period_type IS '"A" = año completo, "Q" = trimestre, "L" = LTM a ese trimestre.';
COMMENT ON COLUMN ficha_kpis.year IS 'Año del período.';
COMMENT ON COLUMN ficha_kpis.quarter IS '1..4 si period_type = "Q"; 0 si es anual (nunca NULL).';
COMMENT ON COLUMN ficha_kpis.period_end IS 'Fecha de cierre del período.';
COMMENT ON COLUMN ficha_kpis.section IS 'Subtítulo dentro del bloque KPIs de la planilla (fila de texto sin números que precede a los KPIs), p.ej. "Chile".';
COMMENT ON COLUMN ficha_kpis.kpi IS 'Nombre del KPI tal como está en la planilla. Si se repite dentro de la misma section (típico "Var %"), la segunda aparición lleva " (2)", la tercera " (3)", etc., según kpi_order.';
COMMENT ON COLUMN ficha_kpis.kpi_order IS 'Posición del KPI dentro de su section (1 = primero). ORDER BY kpi_order para reconstruir el bloque.';
COMMENT ON COLUMN ficha_kpis.value IS 'Valor numérico de la celda (porcentajes en decimal si la celda de Excel es %, p.ej. 0.125 = 12,5%).';
COMMENT ON COLUMN ficha_kpis.updated_at IS 'Última vez que la fila fue insertada o actualizada por el ingest.';
