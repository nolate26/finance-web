-- Comentarios para el MCP de las tablas estimates_hidden y analyst_links.
-- Idempotente (COMMENT ON reemplaza). Correr DESPUÉS de `npx prisma db push`:
--   psql "$DATABASE_URL" -f prisma/sql/estimates_hidden_analyst_links_comments.sql

COMMENT ON TABLE estimates_hidden IS 'Compañías de Analyst Estimates ocultas para usuarios no-admin. /api/latam/consensus-check excluye estas filas de la respuesta salvo para admin (que las ve atenuadas). No borra ni modifica el modelo. Cambios auditados en admin_change_log (entity = estimates_hidden).';
COMMENT ON COLUMN estimates_hidden.ticker    IS 'Ticker del modelo en MAYÚSCULAS, igual a model_headers.ticker / bank_headers.ticker (ej. "ENAEX CI EQUITY"). PK.';
COMMENT ON COLUMN estimates_hidden.reason    IS 'Motivo opcional por el que se ocultó.';
COMMENT ON COLUMN estimates_hidden.hidden_by IS 'Email del admin que la ocultó.';
COMMENT ON COLUMN estimates_hidden.hidden_at IS 'Fecha y hora en que se ocultó.';

COMMENT ON TABLE analyst_links IS 'Links a herramientas y ejercicios de los analistas, mostrados en la pestaña "Useful Links" de Chile y LatAm. Lectura para todos; alta, edición y borrado sólo admin (auditado en admin_change_log, entity = analyst_links).';
COMMENT ON COLUMN analyst_links.id          IS 'Id autoincremental. PK.';
COMMENT ON COLUMN analyst_links.region      IS 'Pestaña donde aparece: CHILE o LATAM.';
COMMENT ON COLUMN analyst_links.name        IS 'Nombre visible del link.';
COMMENT ON COLUMN analyst_links.url         IS 'URL http(s) de destino; se abre en pestaña nueva.';
COMMENT ON COLUMN analyst_links.description IS 'Descripción corta opcional.';
COMMENT ON COLUMN analyst_links.created_by  IS 'Email del admin que lo creó.';
COMMENT ON COLUMN analyst_links.created_at  IS 'Fecha y hora de creación.';
