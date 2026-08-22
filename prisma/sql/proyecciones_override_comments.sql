-- ═══════════════════════════════════════════════════════════════════════════════
-- proyecciones_override — documentación para el servidor MCP
-- ═══════════════════════════════════════════════════════════════════════════════
-- Correr DESPUÉS de `npx prisma db push` (que es quien crea la tabla).
-- Idempotente: COMMENT ON reemplaza el comentario anterior, se puede re-ejecutar.
--
--   psql "$DATABASE_URL" -f prisma/sql/proyecciones_override_comments.sql
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE proyecciones_override IS
'Capa de ediciones manuales sobre proyecciones_financieras, hecha desde la vista /projections. Cualquier usuario autenticado (rol user o admin) puede editar; cada celda queda firmada con su email. NO reemplaza a proyecciones_financieras: esa tabla sigue siendo el historial inmutable de snapshots del Excel y nunca se escribe desde la web. PRECEDENCIA: una edición aplica sólo si edited_at es posterior al generated_at del snapshot vigente de esa empresa; volver a correr el script del Excel publica una foto más fresca y por lo tanto pisa las ediciones anteriores, que quedan guardadas pero dejan de aplicarse. La misma regla la usan la vista de proyecciones y la de stock selection, para que las dos nunca muestren números distintos de la misma celda. El historial completo (valores previos, autor, fecha) vive en admin_change_log con entity = ''proyecciones_override''.';

COMMENT ON COLUMN proyecciones_override.empresa IS
'Nombre de la empresa, exactamente como aparece en proyecciones_financieras.empresa (VarChar 200). Es la llave de cruce con el Excel y, vía empresas_industrias_v2, con el ticker Bloomberg.';

COMMENT ON COLUMN proyecciones_override.metric IS
'Campo editado. Por año calendario: ingresos | ebitda | ebit | utilidad (montos en la moneda reportada, en MILLONES, igual que la tabla base). De ficha (calendar_year = 0): moneda | analyst | pool_div.';

COMMENT ON COLUMN proyecciones_override.calendar_year IS
'AÑO CALENDARIO de la celda (2026, 2027, 2028…), no el offset y0/y1/y2 del Excel. Se indexa así a propósito: si el Excel mueve base_year, un override guardado como "ebitda_y1" pasaría a apuntar a otro año. Se aceptan años fuera del window del snapshot (para tapar baches de una empresa que no proyectó ese año). 0 es el centinela de los campos de ficha (moneda, analyst, pool_div), que no cuelgan de un año — Postgres no admite NULL en la PK.';

COMMENT ON COLUMN proyecciones_override.value IS
'Valor numérico editado, para metric en (ingresos, ebitda, ebit, utilidad, pool_div). NULL cuando el campo es de texto. Montos en la moneda reportada y en MILLONES.';

COMMENT ON COLUMN proyecciones_override.text_value IS
'Valor de texto editado, para metric en (moneda, analyst). NULL cuando el campo es numérico. Si value y text_value son ambos NULL la fila se ignora (la celda vuelve al valor del Excel); el borrado normal elimina la fila.';

COMMENT ON COLUMN proyecciones_override.base_value IS
'Valor numérico que la celda tenía JUSTO ANTES de esta edición: el del Excel si es la primera edición, o el de la edición anterior si ya había una vigente. Es la base contra la que se calcula la variación que se muestra al pasar por encima de la celda.';

COMMENT ON COLUMN proyecciones_override.base_text IS
'Equivalente de base_value para los campos de texto (moneda, analyst).';

COMMENT ON COLUMN proyecciones_override.base_at IS
'Fecha del valor previo: generated_at del snapshot del Excel, o edited_at de la edición anterior. Es "la fecha anterior" contra la que se compara la variación en el tooltip.';

COMMENT ON COLUMN proyecciones_override.edited_by IS
'Email del usuario de la sesión que hizo el cambio (users.email). NULL sólo si la sesión no traía email.';

COMMENT ON COLUMN proyecciones_override.edited_at IS
'Fecha/hora del cambio. Es el criterio de precedencia contra proyecciones_financieras.generated_at y contra stock_selection_override.edited_at: gana el más reciente.';

COMMENT ON COLUMN proyecciones_override.note IS
'Comentario opcional del usuario sobre por qué cambió el valor.';
