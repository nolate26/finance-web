-- ═══════════════════════════════════════════════════════════════════════════════
-- ficha_comments — migración
-- ═══════════════════════════════════════════════════════════════════════════════
-- DDL generada con `prisma migrate diff` (= lo que crea `prisma db push`). Sólo crea.
-- Los CHECK no los maneja Prisma: van acá a mano.
--
--   npx prisma db execute --file prisma/sql/ficha_comments_migration.sql
--   npx prisma db execute --file prisma/sql/ficha_comments_comments.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS "ficha_comments" (
    "id" SERIAL NOT NULL,
    "ticker" VARCHAR(100) NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "section" VARCHAR(255) NOT NULL,
    "line" VARCHAR(255) NOT NULL,
    "target" VARCHAR(10) NOT NULL,
    "comment" TEXT NOT NULL,
    "created_by" VARCHAR(200),
    "updated_by" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ficha_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ficha_comments_ticker_year_quarter_idx" ON "ficha_comments"("ticker", "year", "quarter");
CREATE UNIQUE INDEX IF NOT EXISTS "ficha_comments_ticker_year_quarter_source_section_line_targ_key" ON "ficha_comments"("ticker", "year", "quarter", "source", "section", "line", "target");

ALTER TABLE "ficha_comments" DROP CONSTRAINT IF EXISTS "ficha_comments_values_check";
ALTER TABLE "ficha_comments" ADD CONSTRAINT "ficha_comments_values_check"
  CHECK (quarter BETWEEN 1 AND 4 AND source IN ('statement', 'kpi') AND target IN ('line', 'yoy', 'qoq'));

COMMIT;
