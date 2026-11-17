-- ═══════════════════════════════════════════════════════════════════════════════
-- ficha_statements / ficha_kpis — migración
-- ═══════════════════════════════════════════════════════════════════════════════
-- DDL generada con `prisma migrate diff` contra el schema anterior: es exactamente lo
-- que crea `prisma db push`, así que da lo mismo cuál de los dos corra primero
-- (después de este script, db push no ve diferencias). Solo CREA; no toca nada existente.
-- Los CHECK no los maneja Prisma (igual que fichas_quarter_range): van acá a mano.
--
--   psql "$DATABASE_URL" -f prisma/sql/ficha_statements_kpis_migration.sql
--   psql "$DATABASE_URL" -f prisma/sql/ficha_statements_kpis_comments.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ficha_statements" (
    "id" SERIAL NOT NULL,
    "ticker" VARCHAR(100) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "fx" DECIMAL(18,6) NOT NULL,
    "period_type" VARCHAR(1) NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "period_end" DATE NOT NULL,
    "section" VARCHAR(50) NOT NULL,
    "line" VARCHAR(255) NOT NULL,
    "line_order" INTEGER NOT NULL,
    "value" DECIMAL(24,6) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ficha_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ficha_kpis" (
    "id" SERIAL NOT NULL,
    "ticker" VARCHAR(100) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "fx" DECIMAL(18,6) NOT NULL,
    "period_type" VARCHAR(1) NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "period_end" DATE NOT NULL,
    "section" VARCHAR(255) NOT NULL,
    "kpi" VARCHAR(255) NOT NULL,
    "kpi_order" INTEGER NOT NULL,
    "value" DECIMAL(24,6) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ficha_kpis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ficha_statements_ticker_period_type_year_quarter_idx" ON "ficha_statements"("ticker", "period_type", "year", "quarter");
CREATE INDEX IF NOT EXISTS "ficha_statements_ticker_period_end_idx" ON "ficha_statements"("ticker", "period_end");
CREATE UNIQUE INDEX IF NOT EXISTS "ficha_statements_ticker_period_type_year_quarter_section_li_key" ON "ficha_statements"("ticker", "period_type", "year", "quarter", "section", "line");

CREATE INDEX IF NOT EXISTS "ficha_kpis_ticker_period_type_year_quarter_idx" ON "ficha_kpis"("ticker", "period_type", "year", "quarter");
CREATE INDEX IF NOT EXISTS "ficha_kpis_ticker_period_end_idx" ON "ficha_kpis"("ticker", "period_end");
CREATE UNIQUE INDEX IF NOT EXISTS "ficha_kpis_ticker_period_type_year_quarter_section_kpi_key" ON "ficha_kpis"("ticker", "period_type", "year", "quarter", "section", "kpi");

-- Reglas de período (las mismas que valida zod en /api/ficha/ingest):
-- "A" ⇒ quarter = 0 · "Q" ⇒ quarter 1..4
ALTER TABLE "ficha_statements" DROP CONSTRAINT IF EXISTS "ficha_statements_period_check";
ALTER TABLE "ficha_statements" ADD CONSTRAINT "ficha_statements_period_check"
  CHECK ((period_type = 'A' AND quarter = 0) OR (period_type = 'Q' AND quarter BETWEEN 1 AND 4));

ALTER TABLE "ficha_kpis" DROP CONSTRAINT IF EXISTS "ficha_kpis_period_check";
ALTER TABLE "ficha_kpis" ADD CONSTRAINT "ficha_kpis_period_check"
  CHECK ((period_type = 'A' AND quarter = 0) OR (period_type = 'Q' AND quarter BETWEEN 1 AND 4));

COMMIT;
