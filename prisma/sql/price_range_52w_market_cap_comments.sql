-- ═══════════════════════════════════════════════════════════════════════════════
-- price_range_52w.market_cap — documentación para el servidor MCP
-- ═══════════════════════════════════════════════════════════════════════════════
-- Correr DESPUÉS de `npx prisma db push` (que es quien crea la columna).
-- Idempotente: COMMENT ON reemplaza el comentario anterior, se puede re-ejecutar.
--
--   psql "$DATABASE_URL" -f prisma/sql/price_range_52w_market_cap_comments.sql
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE price_range_52w IS
'Foto diaria de precio por ticker Bloomberg (px_last, máximo/mínimo 52 semanas y posición en el rango) cargada por el script de Bloomberg vía POST /api/ingest (table PriceRange52w). El ticker se guarda canónico (UPPER, espacios colapsados) y cruza por igualdad con model_headers / bank_headers / empresas_industrias_v2. Es la ÚNICA fuente de precio vivo de la plataforma: el deep-dive (GET /api/companies/[ticker]/model y /bank-model) toma la última fila del ticker para re-marcar el market cap de los años proyectados y calcular EV/EBITDA, P/E y yields, y la tabla Estimates (GET /api/latam/consensus-check) usa la misma fila para el Upside Live y los múltiplos. Insert-only con PK (ticker, date): re-enviar una fecha existente no la actualiza.';

COMMENT ON COLUMN price_range_52w.market_cap IS
'Market cap de Bloomberg del mismo día y en la misma moneda/escala en que lo entrega el script (no se re-escala en el ingest). Opcional: NULL en todo el histórico anterior a 2026-09-16 y en cualquier carga que no lo traiga; sólo se rellena en las fechas nuevas porque la tabla es insert-only. El ingest acepta `marketCap` o `market_cap` en el payload. Todavía no lo consume ninguna vista: los múltiplos siguen usando precio × acciones del modelo del analista (lib/modelMultiples).';
