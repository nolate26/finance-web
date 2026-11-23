-- Auditoría de BDD 2026-11 — FASE B5: stock_selection_v1 y total_return_index.
--   · stock_selection_v1 → fuera. Fundamentales: ficha_statements. Acciones: cascada ficha →
--     modelo → Bloomberg (lib/ssShares.ts). Universo: stock_selection_orden (lib/ssUniverse.ts).
--   · total_return_index → fuera. La única tabla de retornos es ticker_return_snapshot (Stock
--     Selection y deep-dive).
-- Aplicar ANTES de desplegar el commit que saca StockSelectionV1 / TotalReturnIndex del schema
-- (el build corre `prisma db push`, que se negaría a dropear tablas con datos).
--   npx prisma db execute --file prisma/sql/phase_b5_drop_2026-11-23.sql
-- Respaldos: backups/stock_selection_v1_2026-11-23.json (8.609 filas),
--            backups/total_return_index_2026-11-23.json (5.313),
--            backups/stock_selection_orden_before_b5_2026-11-23.json (89).
-- Entre este SQL y el deploy, Stock Selection, el panel de admin de Chile, la carga de carteras
-- y el deep-dive de compañías dan error. Desplegar inmediatamente después.

BEGIN;

-- 1. Las 10 compañías de stock_selection_v1 que no estaban en el orden. Desde B5 el orden define
--    el universo, así que sin esto desaparecerían de la vista. Van a una sección nueva "Otros"
--    al final (como se veían antes: las no asignadas caían al final). GeoPark y Cementos siguen
--    ocultas (stock_selection_hidden): entran al orden para no perder la fila al desocultarlas.
INSERT INTO stock_selection_orden (company, label, seccion, seccion_pos, pos, updated_at, updated_by)
SELECT lower(regexp_replace(btrim(v.label), '\s+', ' ', 'g')),
       v.label,
       'Otros',
       (SELECT coalesce(max(seccion_pos), -1) + 1 FROM stock_selection_orden),
       v.pos,
       CURRENT_TIMESTAMP,
       'migracion-b5'
  FROM (VALUES ('AesAndes', 0), ('Calichera', 1), ('Cementos', 2), ('Enlasa', 3), ('GeoPark', 4),
               ('HF', 5), ('Nitratos', 6), ('Pasur', 7), ('Security', 8), ('Zofri', 9)) AS v(label, pos)
 WHERE NOT EXISTS (SELECT 1 FROM stock_selection_orden o
                    WHERE o.company = lower(regexp_replace(btrim(v.label), '\s+', ' ', 'g')));

-- 2. Tablas fuera.
DROP TABLE IF EXISTS stock_selection_v1;
DROP TABLE IF EXISTS total_return_index;

-- 3. Comentario de stock_selection_orden: ahora también define el universo.
COMMENT ON TABLE stock_selection_orden IS 'Orden, secciones y UNIVERSO de Stock Selection (Chile): una fila por compañía de la vista. Una compañía que no está acá no aparece en Stock Selection (salvo que tenga valores manuales en stock_selection_override para el trimestre). Se edita en Administración → Orden y secciones; "Sumar compañía" la agrega a la sección Otros. company = nombre normalizado (minúsculas, espacios colapsados), que es la llave que comparten stock_selection_hidden y stock_selection_override; label = nombre tal como se muestra. Las compañías se cruzan con empresas_industrias_v2 por nombre (nombre_chile / nombre_latam).';

COMMIT;

-- Verificación:
--   SELECT count(*) FROM stock_selection_orden;                                   -- 99
--   SELECT count(*) FROM information_schema.tables
--    WHERE table_name IN ('stock_selection_v1', 'total_return_index');            -- 0
