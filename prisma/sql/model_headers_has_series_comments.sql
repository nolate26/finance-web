-- ═══════════════════════════════════════════════════════════════════════════════
-- model_headers.has_series — documentación para el servidor MCP
-- ═══════════════════════════════════════════════════════════════════════════════
-- Correr DESPUÉS de `npx prisma db push` (que es quien crea la columna).
-- Idempotente: COMMENT ON reemplaza el comentario anterior, se puede re-ejecutar.
--
--   psql "$DATABASE_URL" -f prisma/sql/model_headers_has_series_comments.sql
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN model_headers.has_series IS
'Flag booleano que declara el analista en la celda C9 del Excel del modelo y que la macro SubirModeloAPI manda como `hasSeries` en el header de POST /api/ingest (table AnalystModel). NOT NULL, default false: todos los modelos cargados antes de 2026-09-16 quedaron en false, y un payload que no traiga el campo (macro vieja) también se guarda en false. Se reemplaza en cada snapshot (ticker, update_date) igual que el resto del header. Se expone tal cual en GET /api/companies/[ticker]/model (header.hasSeries); su uso funcional en la UI está por definirse a partir del primer modelo cargado en true.';
