-- Elimina las tablas que sólo alimentaban la pestaña Scorecard de Company Info
-- (sacada el 2026-11-18). Correr ANTES del próximo deploy: `prisma db push`
-- (en npm run build) se niega a borrar tablas con datos sin --accept-data-loss
-- y el build fallaría.
--   npx prisma db execute --file prisma/sql/drop_scorecard_signals.sql
DROP TABLE IF EXISTS signals_raw;
DROP TABLE IF EXISTS momentum_signals;
