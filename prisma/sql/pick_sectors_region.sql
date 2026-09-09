-- ═══════════════════════════════════════════════════════════════════════════════
-- pick_sectors: los sectores pasan a ser POR REGIÓN
-- ═══════════════════════════════════════════════════════════════════════════════
-- Correr ANTES de `npx prisma db push` — este script deja la tabla exactamente como
-- la espera el schema, así que después el push no tiene nada que hacer sobre ella.
--
--   psql "$DATABASE_URL" -f prisma/sql/pick_sectors_region.sql
--
-- POR QUÉ. name era único a nivel global, así que Chile y LatAm competían por el
-- mismo nombre: el sector "Banks" de Chile obligó a bautizar "Bank" al de LatAm. Y
-- borrar un sector desde una región lo eliminaba también de la otra.
--
-- Se hace en SQL y no con db push porque agregar una columna NOT NULL sin default a
-- una tabla con 20 filas falla: hay que crearla, rellenarla y recién ahí exigirla.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Columna, primero nullable ───────────────────────────────────────────────
ALTER TABLE pick_sectors ADD COLUMN IF NOT EXISTS region VARCHAR(20);

-- ── 2. Región deducida de sus propios picks ────────────────────────────────────
-- Verificado antes de correr esto: ningún sector tiene picks de más de una región,
-- así que el MIN no está eligiendo entre alternativas, sólo desempaqueta el único
-- valor que hay.
UPDATE pick_sectors s
   SET region = sub.region
  FROM (
    SELECT sector_id, min(region) AS region
    FROM top_picks
    WHERE sector_id IS NOT NULL
    GROUP BY sector_id
  ) sub
 WHERE s.id = sub.sector_id
   AND s.region IS NULL;

-- Un sector sin picks no tiene de dónde deducir la región. Cae en CHILE, que es la
-- región que se abre por defecto, y se puede mover o borrar desde la interfaz.
UPDATE pick_sectors SET region = 'CHILE' WHERE region IS NULL;

-- ── 3. Recién ahora se exige ───────────────────────────────────────────────────
ALTER TABLE pick_sectors ALTER COLUMN region SET NOT NULL;

-- ── 4. El nombre pasa a ser único DENTRO de la región ──────────────────────────
DROP INDEX IF EXISTS pick_sectors_name_key;
ALTER TABLE pick_sectors DROP CONSTRAINT IF EXISTS pick_sectors_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS pick_sectors_region_name_key
  ON pick_sectors (region, name);

DROP INDEX IF EXISTS pick_sectors_sort_order_idx;
CREATE INDEX IF NOT EXISTS pick_sectors_region_sort_order_idx
  ON pick_sectors (region, sort_order);

COMMIT;

-- ── Verificación ───────────────────────────────────────────────────────────────
--   SELECT region, count(*) FROM pick_sectors GROUP BY 1;
--   -- y que ya se pueda repetir un nombre entre regiones:
--   SELECT name, count(*) FROM pick_sectors GROUP BY 1 HAVING count(*) > 1;
