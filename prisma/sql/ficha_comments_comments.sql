-- ═══════════════════════════════════════════════════════════════════════════════
-- ficha_comments — documentación para el servidor MCP
-- ═══════════════════════════════════════════════════════════════════════════════
-- Correr DESPUÉS de crear la tabla. Idempotente.
--
--   npx prisma db execute --file prisma/sql/ficha_comments_comments.sql
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE ficha_comments IS
'Comentarios de los analistas sobre la "Last Ficha" de una compañía (pestaña Chile → Last Ficha): el resumen de resultados que muestra los años y los últimos 5 trimestres de ficha_statements / ficha_kpis con su Var% YoY y QoQ. Una fila por (ticker, trimestre base, fuente, sección, línea, target), único. target = "line" es el comentario libre de la fila (columna de la derecha); target = "yoy" / "qoq" significa que el analista MARCÓ con un círculo la variación de esa columna y le dejó un comentario. Los comentarios cuelgan del TRIMESTRE BASE (year, quarter) que se estaba revisando, no del trimestre de carga: para leer lo que se dijo sobre los resultados del 3Q26 filtrar year = 2026 AND quarter = 3. Sin FK: se cruza con ficha_statements (source = ''statement'', line = ficha_statements.line) o ficha_kpis (source = ''kpi'', line = ficha_kpis.kpi) por ticker + section + line. Cualquier usuario autenticado escribe vía PUT /api/chile/last-ficha/comments; borrar el texto borra la fila. Cada cambio queda también en admin_change_log (entity = ''ficha_comments'').';

COMMENT ON COLUMN ficha_comments.id IS 'Autoincremental, sin significado de negocio.';
COMMENT ON COLUMN ficha_comments.ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA, igual que ficha_statements.ticker (p.ej. "ANDINAB CI EQUITY").';
COMMENT ON COLUMN ficha_comments.year IS 'Año del trimestre base comentado (p.ej. 2026 para 3Q26).';
COMMENT ON COLUMN ficha_comments.quarter IS 'Trimestre base comentado, 1 a 4 (CHECK ficha_comments_values_check). Las Var% YoY / QoQ se calculan para este trimestre: YoY contra el mismo trimestre del año anterior, QoQ contra el trimestre inmediatamente anterior.';
COMMENT ON COLUMN ficha_comments.source IS '"statement" = la fila es una línea de ficha_statements · "kpi" = la fila es un KPI de ficha_kpis.';
COMMENT ON COLUMN ficha_comments.section IS 'Sección de la fila: "Income Statement" / "Balance Sheet" / "Cash Flow" para statements; el subtítulo del bloque (p.ej. "Chile (CLP)") para KPIs.';
COMMENT ON COLUMN ficha_comments.line IS 'Nombre de la fila: ficha_statements.line o ficha_kpis.kpi, tal cual.';
COMMENT ON COLUMN ficha_comments.target IS '"line" = comentario de la fila · "yoy" = círculo + comentario sobre la Var% YoY · "qoq" = círculo + comentario sobre la Var% QoQ.';
COMMENT ON COLUMN ficha_comments.comment IS 'Texto del comentario. Nunca vacío: vaciarlo desde la vista borra la fila.';
COMMENT ON COLUMN ficha_comments.created_by IS 'Email del usuario que lo escribió primero.';
COMMENT ON COLUMN ficha_comments.updated_by IS 'Email del último usuario que lo editó.';
COMMENT ON COLUMN ficha_comments.created_at IS 'Fecha de creación.';
COMMENT ON COLUMN ficha_comments.updated_at IS 'Fecha de la última edición.';
