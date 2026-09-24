-- ═══════════════════════════════════════════════════════════════════════════════
-- presentations (revisión de investment cases) + presentation_tickers
-- ═══════════════════════════════════════════════════════════════════════════════
-- Correr DESPUÉS de `npx prisma db push` (que es quien crea la tabla y las columnas).
-- Idempotente: COMMENT ON reemplaza el comentario anterior, se puede re-ejecutar.
--
--   psql "$DATABASE_URL" -f prisma/sql/presentations_review_comments.sql
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN presentations.case_date IS
'Fecha del INFORME para los investment cases (columna DATE, sin hora). NO es la fecha de carga: para eso está created_at. NULL en el resto de las categorías, que no la piden. La lista de /presentations muestra esta fecha cuando existe y cae a created_at si no.';

COMMENT ON COLUMN presentations.uploaded_by IS
'Email de quien subió el documento (users.email al momento de la carga). Existe desde que subir a Presentations dejó de ser exclusivo de admin: es a quién le pregunta el admin al revisar un caso. NULL en las filas cargadas antes de ese cambio.';

COMMENT ON COLUMN presentations.review_status IS
'Estado de revisión: "pending" | "approved". Sólo los investment cases (category = ''investment_cases'') nacen en "pending" — POST /api/presentations los marca así y el admin los aprueba con PATCH /api/presentations/[id] {approve:true}. Todo el resto (y todo lo cargado antes de este flujo) queda en "approved" por el DEFAULT. Un caso pendiente SE VE igual en la lista, con el badge "Pending review": el estado es una señal de verificación, no un filtro de visibilidad.';

COMMENT ON COLUMN presentations.reviewed_by IS
'Email del admin que aprobó el caso. NULL mientras está pendiente o si nunca pasó por revisión.';

COMMENT ON COLUMN presentations.reviewed_at IS
'Momento de la aprobación. NULL mientras está pendiente.';

COMMENT ON TABLE presentation_tickers IS
'Empresas que cubre una presentación (hoy: los investment cases), con la tesis declarada para CADA una. Es una tabla aparte y no columnas en presentations porque un caso puede cubrir varias empresas, y el target price y la recomendación son de la ACCIÓN, no del documento: un caso sobre CCU y Andina lleva un TP por cada una. Reemplaza al texto libre presentations.company_name, que se conserva sólo para las filas viejas y para el ticker suelto opcional de las otras categorías. Se escribe entera en cada guardado: POST /api/presentations la crea y PATCH /api/presentations/[id] la reemplaza en bloque (delete + createMany dentro de una transacción). Borrar la presentación se lleva sus filas en cascada.';

COMMENT ON COLUMN presentation_tickers.presentation_id IS
'FK a presentations.id, ON DELETE CASCADE: estas filas no tienen vida propia fuera de su presentación.';

COMMENT ON COLUMN presentation_tickers.ticker IS
'Ticker Bloomberg de la empresa cubierta (p.ej. "CCU CI EQUITY"). FK a empresas_industrias_v2.ticker_bloomberg con ON DELETE RESTRICT, igual que fichas: la maestra no se borra si alguien la referencia. Se guarda en mayúsculas. Único por (presentation_id, ticker): una empresa no se repite dentro del mismo caso.';

COMMENT ON COLUMN presentation_tickers.target_price IS
'Precio objetivo que declara el caso para ESA acción, en la moneda del documento (no se normaliza). NULL si el caso no da TP.';

COMMENT ON COLUMN presentation_tickers.recommendation IS
'Posición del caso sobre esa acción: BUY | HOLD | SELL, valores cerrados que elige quien sube desde un selector (lib/recommendations.ts). Se guarda ya canonizado, a diferencia del texto libre de model_headers.recc ("Buy", "OW", "Outperform"). NULL si el caso no declara rating.';
