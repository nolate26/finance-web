-- =============================================================================
-- DROP: Earnings Surprises (vista LATAM eliminada)
-- =============================================================================
-- Ambas tablas quedaron huérfanas tras eliminar la pestaña "Earnings Surprises"
-- de /latam y sus rutas API (/api/earnings, /api/quant/earnings-surprises,
-- /api/companies/[ticker]/earnings-surprises). Ningún otro módulo las consulta.
--
-- Ejecutar UNA vez contra la base de datos. Es irreversible: respalda antes si
-- quieres conservar el histórico de sorpresas trimestrales.
--
--   pg_dump -t earnings_surprise -t quarterly_fx_rates "$DATABASE_URL" > earnings_backup.sql
-- =============================================================================

DROP TABLE IF EXISTS earnings_surprise;
DROP TABLE IF EXISTS quarterly_fx_rates;
