-- Comentarios para el MCP de la tabla link_sections y de analyst_links, que cambió con ella.
-- Reemplaza el bloque analyst_links de estimates_hidden_analyst_links_comments.sql.
-- Idempotente (COMMENT ON reemplaza). Correr DESPUÉS de `npx prisma db push`:
--   psql "$DATABASE_URL" -f prisma/sql/link_sections_comments.sql

COMMENT ON TABLE link_sections IS 'Secciones de la vista Useful Links (/links), típicamente por sector. Cualquier usuario las crea; sólo el admin las renombra, ordena y borra. Borrar una sección borra sus links en analyst_links. Auditado en admin_change_log (entity = link_sections).';
COMMENT ON COLUMN link_sections.id         IS 'Id autoincremental. PK.';
COMMENT ON COLUMN link_sections.name       IS 'Nombre visible de la sección. Único, sin distinguir mayúsculas (validado en la API).';
COMMENT ON COLUMN link_sections.sort_order IS 'Posición de la sección en la vista, ascendente. La define el admin.';
COMMENT ON COLUMN link_sections.created_by IS 'Email del usuario que la creó.';
COMMENT ON COLUMN link_sections.created_at IS 'Fecha y hora de creación.';

COMMENT ON TABLE analyst_links IS 'Links a herramientas y ejercicios de los analistas, mostrados en la vista Useful Links (/links) agrupados por link_sections. Cualquier usuario agrega; edición, orden y borrado sólo admin (auditado en admin_change_log, entity = analyst_links).';
COMMENT ON COLUMN analyst_links.id          IS 'Id autoincremental. PK.';
COMMENT ON COLUMN analyst_links.region      IS 'Legado: pestaña de origen, CHILE o LATAM, de los links anteriores a las secciones. Null en los links nuevos.';
COMMENT ON COLUMN analyst_links.section_id  IS 'FK a link_sections.id, con borrado en cascada. Null = link anterior a las secciones, aparece en "Unassigned".';
COMMENT ON COLUMN analyst_links.sort_order  IS 'Posición del link dentro de su sección, ascendente. La define el admin.';
COMMENT ON COLUMN analyst_links.name        IS 'Título visible del link.';
COMMENT ON COLUMN analyst_links.url         IS 'URL http(s) de destino; se abre en pestaña nueva.';
COMMENT ON COLUMN analyst_links.description IS 'Descripción corta opcional.';
COMMENT ON COLUMN analyst_links.created_by  IS 'Email del usuario que lo creó.';
COMMENT ON COLUMN analyst_links.created_at  IS 'Fecha y hora de creación.';
