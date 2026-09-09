-- ═══════════════════════════════════════════════════════════════════════════════
-- Top Picks — migración de la estructura existente a sectores
-- ═══════════════════════════════════════════════════════════════════════════════
-- Correr UNA vez, DESPUÉS de `npx prisma db push`.
-- Idempotente: re-ejecutarlo no duplica sectores ni pisa asignaciones ya hechas.
--
--   psql "$DATABASE_URL" -f prisma/sql/top_picks_backfill.sql
--
-- ── QUÉ HACE Y POR QUÉ ────────────────────────────────────────────────────────
-- La columna industry_group venía cargando DOS ejes distintos, uno por región:
--
--   CHILE  → los 6 grupos son PERSONAS (Arthur Piccoli, Daniela Benavides,
--            Daniel Vallenas, Diego Muniz, Harry Klenner, Rodrigo Zanella).
--   LATAM  → los 14 grupos son industrias GICS reales (Banks, Materials, Energy…).
--
-- Los dos son estructuras válidas que el equipo ya usa, así que ninguna se descarta:
-- cada grupo se convierte en un SECTOR con su nombre y su posición original, y cada
-- pick queda dentro del suyo. Resultado: NADA cae en "Unassigned". Desde la UI el
-- admin después renombra los sectores y les asigna analistas.
--
-- El orden replica el que ya veían: alfabético dentro de cada región, que es lo que
-- hacía la tabla anterior.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Un sector por cada grupo original ───────────────────────────────────────
-- ORDEN: por región (Chile antes que LatAm) y dentro de cada una ALFABÉTICAMENTE,
-- con COLLATE "C" para ordenar por code point igual que el .sort() de JavaScript.
-- Ése es literalmente el orden que el equipo veía: la tabla anterior agrupaba con
-- Array.from(new Set(...)).sort(). NO se usa created_at porque los 27 picks de Chile
-- entraron en una sola carga y los seis grupos comparten el mismo timestamp al
-- milisegundo — ordenar por ahí daría un resultado arbitrario y distinto cada vez.
--
-- El sort_order arranca después del máximo existente, para no chocar con los sectores
-- que ya hayas creado a mano.
INSERT INTO pick_sectors (id, name, sort_order, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  g.industry_group,
  (SELECT coalesce(max(sort_order), 0) FROM pick_sectors)
    + row_number() OVER (ORDER BY g.region, g.industry_group COLLATE "C"),
  now(),
  now()
FROM (
  SELECT region, industry_group
  FROM top_picks
  WHERE industry_group IS NOT NULL
  GROUP BY region, industry_group
) g
WHERE NOT EXISTS (
  SELECT 1 FROM pick_sectors s
  WHERE lower(trim(s.name)) = lower(trim(g.industry_group))
);


-- ── 2. Cada pick a su sector ───────────────────────────────────────────────────
-- Sólo toca los que todavía no tienen sector, así que no pisa nada que hayas movido
-- a mano desde la interfaz.
UPDATE top_picks t
   SET sector_id = s.id
  FROM pick_sectors s
 WHERE t.sector_id IS NULL
   AND t.industry_group IS NOT NULL
   AND lower(trim(s.name)) = lower(trim(t.industry_group));


-- ── 3. Autoría, sólo donde el grupo era una PERSONA ────────────────────────────
-- Es lo que hace funcionar el estado legacy: al pick le queda grabado quién lo
-- escribió. Harry Klenner y Arthur Piccoli ya no están en users, así que su nombre
-- sobrevive en author_name con author_id NULL — y como tampoco son miembros de su
-- sector, sus picks salen en gris solos, sin marcarlos a mano.
--
-- La lista va enumerada y no con una heurística: una industria de dos palabras
-- ("Financial Services") se confundiría con un nombre propio.
UPDATE top_picks
   SET author_name = industry_group
 WHERE author_name IS NULL
   AND industry_group IN (
     'Arthur Piccoli',     -- 3 picks · fuera del equipo
     'Harry Klenner',      -- 6 picks · fuera del equipo
     'Daniel Vallenas',    -- 6 picks
     'Daniela Benavides',  -- 5 picks
     'Diego Muniz',        -- 4 picks
     'Rodrigo Zanella'     -- 3 picks
   );

UPDATE top_picks t
   SET author_id = u.id
  FROM users u
 WHERE t.author_id IS NULL
   AND t.author_name IS NOT NULL
   AND lower(trim(u.name)) = lower(trim(t.author_name));


-- ── 4. Cada analista, miembro de su propio sector ──────────────────────────────
-- Sin esto sus propios picks aparecerían legacy, que es exactamente lo contrario de
-- lo que pasa: siguen en el equipo. A los dos que se fueron no se les agrega nada.
INSERT INTO pick_sector_members (sector_id, user_id, added_at)
SELECT DISTINCT s.id, u.id, now()
FROM pick_sectors s
JOIN users u ON lower(trim(u.name)) = lower(trim(s.name))
WHERE NOT EXISTS (
  SELECT 1 FROM pick_sector_members m
  WHERE m.sector_id = s.id AND m.user_id = u.id
);


-- ── 5. Limpiar industry_group donde guardaba una persona ───────────────────────
-- Sin pérdida: el nombre ya quedó en author_name (paso 3) y en el nombre del sector
-- (paso 1). Si no se limpiara, la columna seguiría diciendo que "Harry Klenner" es
-- una industria GICS. Los 74 de LatAm conservan su industria intacta.
UPDATE top_picks
   SET industry_group = NULL
 WHERE author_name IS NOT NULL
   AND industry_group = author_name;


-- ── Verificación ───────────────────────────────────────────────────────────────
-- Esperado: 101 picks, 0 sin sector, 27 con autor, 18 enlazados a un usuario,
-- 9 sin usuario (Harry Klenner + Arthur Piccoli) que se verán en gris.
--
--   SELECT
--     count(*)                                          AS picks,
--     count(*) FILTER (WHERE sector_id   IS NULL)       AS sin_sector,
--     count(*) FILTER (WHERE author_name IS NOT NULL)   AS con_autor,
--     count(*) FILTER (WHERE author_id   IS NOT NULL)   AS enlazados,
--     count(*) FILTER (WHERE author_name IS NOT NULL
--                        AND author_id   IS NULL)       AS legacy
--   FROM top_picks;
