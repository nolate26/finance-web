-- ═══════════════════════════════════════════════════════════════════════════════
-- email_research.dismissed_at — documentación para el servidor MCP
-- ═══════════════════════════════════════════════════════════════════════════════
-- Correr DESPUÉS de `npx prisma db push` (que es quien crea la columna).
-- Idempotente: COMMENT ON reemplaza el comentario anterior, se puede re-ejecutar.
--
--   psql "$DATABASE_URL" -f prisma/sql/email_research_dismissed_comments.sql
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE email_research IS
'Notas de research ingestadas por correo vía POST /api/ingest_email (una fila por nota y por ticker: un correo con varios tickers genera varias filas, y el índice único (message_id, company) impide cargar dos veces la misma nota). `company` es el ticker Bloomberg canónico y cruza con empresas_industrias_v2.ticker_bloomberg; cuando no cruza, la nota es huérfana y no se ve desde ninguna compañía (bandeja de admin en GET /api/research/orphans). Se lee desde el feed /research y desde el panel de research del deep-dive por compañía.';

COMMENT ON COLUMN email_research.dismissed_at IS
'Dismiss del admin: si no es NULL, la nota es GENERAL y no cuelga de ninguna compañía. Es para notas cuyo `company` no es (ni va a ser) un ticker de la maestra —un sector, un macro, un "LATAM"— y que igual valen como lectura transversal. Efectos: la nota sale de la bandeja de huérfanas y del listado por ticker (GET /api/research?company=…), pero sigue en el feed completo marcada como "General". Guarda la fecha/hora del dismiss. Es reversible (volver a NULL) y NO altera `company`: se conserva el valor original del correo, tanto para no romper la llave (message_id, company) de la ingesta como para poder revincular la nota si ese ticker entra después a empresas_industrias_v2. Se escribe sólo desde PATCH /api/research/[id] con {dismissed: true|false}, y asignar una company en ese mismo endpoint lo limpia.';
