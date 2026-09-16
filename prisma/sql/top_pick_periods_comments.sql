-- ═══════════════════════════════════════════════════════════════════════════════
-- top_pick_periods — documentación para el servidor MCP
-- ═══════════════════════════════════════════════════════════════════════════════
-- Correr DESPUÉS de `npx prisma db push` (que es quien crea la tabla).
-- Idempotente: COMMENT ON reemplaza el comentario anterior, se puede re-ejecutar.
--
--   psql "$DATABASE_URL" -f prisma/sql/top_pick_periods_comments.sql
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE top_pick_periods IS
'Cabecera de los períodos de Top Picks: una fila por (región, período). Existe para dos cosas que top_picks no puede sostener sola. (1) ABRIR EL PERÍODO SIGUIENTE: antes el único período disponible en la vista era el del calendario, así que el trimestre entrante no existía hasta que llegaba su fecha y no había dónde empezar a cargarlo; una fila acá lo declara y lo hace visible en la grilla aunque todavía no tenga un solo pick. (2) LA FECHA DEL INFORME (report_date), que NO es deducible de los picks: los históricos entraron en una sola carga y comparten created_at al milisegundo, así que el mínimo daría la fecha de la migración y no la del informe. Un período puede existir SIN fila acá —los que ya tenían picks antes de esta tabla—: la vista une los períodos de top_picks con los de acá, por eso no hay FK entre ambas. Sólo un admin crea períodos o cambia fechas; el historial queda en admin_change_log con entity = ''top_pick_periods'' y entity_key = ''REGION|YYYY-MM''.';

COMMENT ON COLUMN top_pick_periods.region IS
'CHILE o LATAM. Los períodos son propios de cada región y tienen cadencia distinta: Chile trabaja por TRIMESTRE, LatAm por MES.';

COMMENT ON COLUMN top_pick_periods.period_date IS
'Primer día del período, en la misma convención que top_picks.period_date: el primer día del trimestre en Chile (siempre 01-01, 04-01, 07-01 o 10-01) y el primer día del mes en LatAm. Es la llave de cruce con top_picks.period_date para la misma región.';

COMMENT ON COLUMN top_pick_periods.report_date IS
'Día en que se cerró la selección de ese período — la fecha que se muestra al lado del quarter en la grilla y en el Excel exportado. NULL = período abierto sin fecha todavía. NO tiene relación con created_at: éste es el día del informe, aquél el día en que se creó la fila.';

COMMENT ON COLUMN top_pick_periods.updated_by IS
'Email del admin que abrió el período o cambió su fecha por última vez.';
