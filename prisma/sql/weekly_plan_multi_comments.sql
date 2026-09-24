-- ═══════════════════════════════════════════════════════════════════════════════
-- weekly_plan — varias actividades por día: documentación para el servidor MCP
-- ═══════════════════════════════════════════════════════════════════════════════
-- Correr DESPUÉS de `npx prisma db push` (que es quien quita la unicidad y crea
-- sort_order). Idempotente: COMMENT ON reemplaza el comentario anterior.
--
--   psql "$DATABASE_URL" -f prisma/sql/weekly_plan_multi_comments.sql
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE weekly_plan IS
'Calendario macro de research: una fila por ACTIVIDAD agendada, no por semana. La casilla de la grilla es (region, week_start) y puede tener VARIAS filas — un mismo día admite dos o más actividades y la grilla estira la fila para mostrarlas todas, ordenadas por sort_order. Hasta antes de este cambio había un UNIQUE (region, week_start) que forzaba una sola por casilla; se eliminó, y con él el "intercambio" de celdas del drag & drop, que existía sólo porque dos no cabían en el mismo lugar. La identidad de una actividad es su id: por ahí la direccionan el PUT, el DELETE y el endpoint de movimiento. week_start es SIEMPRE el lunes de la semana (se normaliza al escribir); el día que se MUESTRA sale de un offset por región en lib/planning.ts (Chile martes, LatAm jueves) y no está guardado. Lectura abierta a cualquier autenticado, escritura sólo admin; el historial queda en admin_change_log con entity = ''weekly_plan''.';

-- Estos dos describían el mundo de "una actividad por semana" y quedaron al revés de
-- la realidad con el cambio, así que se reescriben acá y no en otro archivo: el que
-- lea la tabla desde el MCP tiene que ver la regla nueva, no la anterior.
COMMENT ON COLUMN weekly_plan.id IS
'cuid. Es LA llave de negocio de una actividad: (region, week_start) identifica la casilla de la grilla y puede contener varias filas, así que ya no distingue una actividad de otra — el PUT, el DELETE y el endpoint de movimiento direccionan todos por id. También es el destino de la FK tasks.weekly_plan_id.';

COMMENT ON COLUMN weekly_plan.topic IS
'El evento, tal como se lee en la grilla: "Update: Hapag-Vapores / Quiñenco", "Chile Banks (4/6)", "Results 3Q26". UN tópico por fila. Si un día tiene dos actividades ya NO se meten separadas por " / " en este texto —ése era el workaround mientras sólo cabía una fila por casilla—: se cargan como dos filas con el mismo (region, week_start) y distinto sort_order, cada una con su categoría, sus analistas y sus tareas. NULL o vacío = actividad sin título.';

COMMENT ON COLUMN weekly_plan.region IS
'CHILE o LATAM: la columna de la grilla. Una región que aparezca acá y no esté en PLAN_REGIONS (lib/planning.ts) se renderiza igual, al final y en orden alfabético.';

COMMENT ON COLUMN weekly_plan.week_start IS
'Lunes de la semana, siempre (se normaliza con mondayOf al escribir, así el cliente puede mandar cualquier día). Junto con region forma la casilla de la grilla, que ya NO es única: varias actividades pueden compartirla.';

COMMENT ON COLUMN weekly_plan.sort_order IS
'Posición dentro de la casilla (region, week_start), de arriba hacia abajo, empezando en 0. NO es único: al mover o borrar se renumera la casilla entera 0..n-1 dentro de una transacción, que sale más barato que sostener un índice único con pocas filas por casilla. Las filas anteriores a esta columna quedaron todas en 0 — era correcto, porque entonces había como mucho una por casilla.';

COMMENT ON COLUMN weekly_plan.category IS
'Color de la celda: update | banks | top_picks | results | alert | holiday | none. Mapea los colores del Excel original a la paleta PATRIA (el manual no tiene verde ni rojo). Los valores válidos se definen en PLAN_CATEGORIES (lib/planning.ts), no en la base.';

COMMENT ON COLUMN weekly_plan.all_analysts IS
'true = "All" en la grilla: la actividad es de todo el equipo y se ignoran las filas de weekly_plan_analysts. false y sin analistas = sin dueño, se pinta "-".';
