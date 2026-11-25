-- Auditoría de BDD 2026-11 — FASE C: capa "ai" para el MCP de los analistas y el bot de Telegram.
-- GENERADO por scripts/gen-ai-schema.cjs (editar ahí y regenerar): vistas en inglés, limpias y documentadas,
-- sobre las tablas de public. El rol claude_ro pasa a leer SÓLO este schema.
--
--   npx prisma db execute --file prisma/sql/phase_c_ai_schema_2026-11-23.sql
--
-- Re-ejecutable: borra y recrea el schema ai entero (DROP SCHEMA ai CASCADE) y vuelve a dar los
-- permisos. Las vistas leen public con los privilegios de su dueño (postgres), así que claude_ro
-- no necesita ningún permiso sobre public.
--
-- ⚠ Mantenimiento: Postgres no deja cambiar el tipo ni borrar una columna que use una vista. Si un
-- cambio de schema.prisma toca una columna que aparece acá, el "prisma db push" del build falla.
-- Procedimiento: (1) DROP SCHEMA ai CASCADE; (2) deploy; (3) volver a correr este archivo
-- (ajustado a la columna nueva). Una tabla nueva que deba ver la IA necesita su vista acá.

BEGIN;

DROP SCHEMA IF EXISTS ai CASCADE;
CREATE SCHEMA ai;
COMMENT ON SCHEMA ai IS 'Capa de lectura para IA (MCP de los analistas, bot de Telegram): vistas en inglés, con nombres autodescriptivos, valores normalizados y comentarios en cada tabla y columna. Llave universal de cruce: bbg_ticker (ticker Bloomberg canónico, "CAP CI EQUITY"), que existe en ai.securities. Recomendaciones normalizadas a BUY/HOLD/SELL. Las vistas con historia traen is_latest para el dato vigente.';

-- ── ai.securities ────────────────────────────────────────────────────────────
CREATE VIEW ai.securities AS
SELECT e.ticker_bloomberg                         AS bbg_ticker,
       e.nombre_latam                             AS company_name,
       NULLIF(btrim(e.nombre_chile), '')                    AS local_name,
       NULLIF(btrim(e.isin), '')                            AS isin,
       NULLIF(btrim(upper(e.moneda)), '')                   AS currency,
       NULLIF(btrim(upper(e.country_risk)), '')             AS country_code,
       NULLIF(btrim(e.industria_gics), '')                  AS gics_industry,
       NULLIF(btrim(e.industria_chile), '')                 AS cl_sector,
       NULLIF(btrim(e.yahoo_finance_ticker), '')            AS yahoo_ticker,
       e.company_description                      AS description,
       count(*) OVER (PARTITION BY e.nombre_latam)::int AS listings_of_company
  FROM empresas_industrias_v2 e;
COMMENT ON VIEW ai.securities IS 'MAESTRA de papeles (= public.empresas_industrias_v2, alias "la maestra"). Punto de partida de casi toda consulta. OJO: UNA FILA POR PAPEL LISTADO, NO POR EMPRESA: una misma empresa puede tener varias filas (acción local A/B, ADR en US…), p.ej. GERDAU tiene 5 y SOQUIMICH 4. Para contar o agregar por empresa agrupá por company_name, y NUNCA sumes pesos/montos después de hacer JOIN por company_name (duplica). La llave de cruce con todo lo demás es bbg_ticker.';
COMMENT ON COLUMN ai.securities.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker. Único en esta vista.';
COMMENT ON COLUMN ai.securities.company_name IS 'Nombre de la EMPRESA (no del papel). Se repite en sus distintos listados.';
COMMENT ON COLUMN ai.securities.local_name IS 'Nombre corto que usa el equipo de Chile ("Andina-B", "Aguas-A"). NULL fuera de Chile.';
COMMENT ON COLUMN ai.securities.isin IS 'ISIN del papel.';
COMMENT ON COLUMN ai.securities.currency IS 'Moneda en que cotiza el papel (CLP, BRL, MXN, USD…). Es la moneda de precio, market cap y target price de ese ticker.';
COMMENT ON COLUMN ai.securities.country_code IS 'País de riesgo, código ISO de 2 letras (CL, BR, MX, PE, CO, AR, US…; OT = otro).';
COMMENT ON COLUMN ai.securities.gics_industry IS 'Industria GICS.';
COMMENT ON COLUMN ai.securities.cl_sector IS 'Sector según la clasificación del equipo de Chile. NULL fuera de Chile.';
COMMENT ON COLUMN ai.securities.yahoo_ticker IS 'Ticker de Yahoo Finance (precio en vivo de la app). NULL si no tiene.';
COMMENT ON COLUMN ai.securities.description IS 'Descripción de la empresa (texto libre).';
COMMENT ON COLUMN ai.securities.listings_of_company IS 'Cuántas filas (papeles) tiene la misma empresa en esta vista. >1 = cuidado con duplicar al agregar.';

-- ── ai.security_aliases ──────────────────────────────────────────────────────
CREATE VIEW ai.security_aliases AS
SELECT sa.alias_source,
       sa.alias,
       sa.bbg_ticker,
       COALESCE(sa.isin, NULLIF(btrim(e.isin), ''))                     AS isin,
       COALESCE(sa.yahoo_ticker, NULLIF(btrim(e.yahoo_finance_ticker), '')) AS yahoo_ticker,
       (sa.bbg_ticker IS NOT NULL)                            AS in_master,
       sa.note
  FROM security_aliases sa
  LEFT JOIN empresas_industrias_v2 e ON e.ticker_bloomberg = sa.bbg_ticker;
COMMENT ON VIEW ai.security_aliases IS 'Nombres alternativos → papel de la maestra. Hoy una sola fuente: ''track_record'', los nemotécnicos/nombres viejos que usa analyst_call_history.company_alias ("ANDINA-B", "NUEVAPOLAR"). in_master = false: el papel no está en la maestra (deslistado, fusionado o fuera de cobertura) y sólo tiene isin / yahoo_ticker.';
COMMENT ON COLUMN ai.security_aliases.alias_source IS 'De qué fuente es el alias. Valores: ''track_record''.';
COMMENT ON COLUMN ai.security_aliases.alias IS 'El nombre tal como lo escribe la fuente (match exacto).';
COMMENT ON COLUMN ai.security_aliases.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker. NULL si el papel no está en la maestra.';
COMMENT ON COLUMN ai.security_aliases.isin IS 'ISIN efectivo (el del alias o, si no tiene, el de la maestra).';
COMMENT ON COLUMN ai.security_aliases.yahoo_ticker IS 'Ticker Yahoo efectivo (el del alias manda sobre el de la maestra).';
COMMENT ON COLUMN ai.security_aliases.in_master IS 'true = el alias apunta a un papel de la maestra.';
COMMENT ON COLUMN ai.security_aliases.note IS 'Nota libre (p.ej. fusión que explica el vínculo).';

-- ── ai.mkt_valuation_monthly ─────────────────────────────────────────────────
CREATE VIEW ai.mkt_valuation_monthly AS
SELECT v.ticker AS bbg_ticker, v.date, v."peFwd" AS pe_fwd, v."evEbitdaFwd" AS ev_ebitda_fwd,
       v.pbv AS pb, v."roeFwd" AS roe_fwd
  FROM valuation_history v;
COMMENT ON VIEW ai.mkt_valuation_monthly IS 'Múltiplos de valuación históricos de Bloomberg, serie MENSUAL ~10 años, por papel. Para el múltiplo actual: la fila con mayor date del ticker.';
COMMENT ON COLUMN ai.mkt_valuation_monthly.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.mkt_valuation_monthly.date IS 'Fecha de la observación (fin de mes, salvo la última que es la foto más reciente).';
COMMENT ON COLUMN ai.mkt_valuation_monthly.pe_fwd IS 'P/E forward 12 meses (veces).';
COMMENT ON COLUMN ai.mkt_valuation_monthly.ev_ebitda_fwd IS 'EV/EBITDA forward 12 meses (veces).';
COMMENT ON COLUMN ai.mkt_valuation_monthly.pb IS 'Precio / valor libro (veces).';
COMMENT ON COLUMN ai.mkt_valuation_monthly.roe_fwd IS 'ROE forward en DECIMAL (0.12 = 12%).';

-- ── ai.mkt_consensus_estimates ───────────────────────────────────────────────
CREATE VIEW ai.mkt_consensus_estimates AS
SELECT c.ticker AS bbg_ticker, c.date AS snapshot_date, upper(c.metric) AS metric,
       (CASE WHEN c.period ~ '^[0-9]{4}$' THEN c.period::int END) AS fiscal_year,
       c.value AS value_mn,
       (c.date = max(c.date) OVER (PARTITION BY c.ticker, c.metric, c.period)) AS is_latest
  FROM consensus_estimates c;
COMMENT ON VIEW ai.mkt_consensus_estimates IS 'Estimaciones de CONSENSO sell-side (Bloomberg) por papel, métrica y año fiscal, con historia: cada snapshot_date es una foto del consenso. Para el consenso vigente usá is_latest = true. Montos en MILLONES de la moneda de reporte de la empresa (no necesariamente la de cotización).';
COMMENT ON COLUMN ai.mkt_consensus_estimates.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.mkt_consensus_estimates.snapshot_date IS 'Fecha de la foto del consenso (NO el período estimado).';
COMMENT ON COLUMN ai.mkt_consensus_estimates.metric IS 'Métrica: ''REVENUE'', ''EBITDA'', ''NET_INCOME''.';
COMMENT ON COLUMN ai.mkt_consensus_estimates.fiscal_year IS 'Año fiscal estimado (2026, 2027…).';
COMMENT ON COLUMN ai.mkt_consensus_estimates.value_mn IS 'Valor estimado, en MILLONES de la moneda de reporte.';
COMMENT ON COLUMN ai.mkt_consensus_estimates.is_latest IS 'true = es la foto más reciente para (ticker, métrica, año). Filtrá por esto para "el dato actual".';

-- ── ai.mkt_price_vs_earnings_monthly ─────────────────────────────────────────
CREATE VIEW ai.mkt_price_vs_earnings_monthly AS
SELECT p.ticker AS bbg_ticker, p.date, p."pxLast" AS px_last, p.ni1bf AS net_income_blended_12m_mn
  FROM price_vs_earnings p;
COMMENT ON VIEW ai.mkt_price_vs_earnings_monthly IS 'Precio vs utilidad blended 12 meses (consenso), serie mensual ~5 años. Alimenta el gráfico Price vs Earnings.';
COMMENT ON COLUMN ai.mkt_price_vs_earnings_monthly.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.mkt_price_vs_earnings_monthly.date IS 'Fecha (fin de mes).';
COMMENT ON COLUMN ai.mkt_price_vs_earnings_monthly.px_last IS 'Precio de cierre, moneda de cotización del papel.';
COMMENT ON COLUMN ai.mkt_price_vs_earnings_monthly.net_income_blended_12m_mn IS 'Utilidad neta de consenso blended a 12 meses, en MILLONES de la moneda de reporte.';

-- ── ai.mkt_short_interest ────────────────────────────────────────────────────
CREATE VIEW ai.mkt_short_interest AS
SELECT s.ticker AS bbg_ticker, s.date, s."shortIntRatio" AS short_interest_ratio,
       (s.date = max(s.date) OVER (PARTITION BY s.ticker)) AS is_latest
  FROM short_interest s;
COMMENT ON VIEW ai.mkt_short_interest IS 'Short interest ratio (días para cubrir) por papel, fotos acumuladas.';
COMMENT ON COLUMN ai.mkt_short_interest.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.mkt_short_interest.date IS 'Fecha de la foto.';
COMMENT ON COLUMN ai.mkt_short_interest.short_interest_ratio IS 'Short interest ratio (días para cubrir).';
COMMENT ON COLUMN ai.mkt_short_interest.is_latest IS 'true = es la foto más reciente del ticker. Filtrá por esto para "el dato actual".';

-- ── ai.mkt_price_snapshots ───────────────────────────────────────────────────
CREATE VIEW ai.mkt_price_snapshots AS
SELECT p.ticker AS bbg_ticker, p.date, p."pxLast" AS px_last, p."high52w" AS high_52w, p."low52w" AS low_52w,
       p."pctRange" AS pct_of_52w_range, p.market_cap,
       (p.date = max(p.date) OVER (PARTITION BY p.ticker)) AS is_latest
  FROM price_range_52w p;
COMMENT ON VIEW ai.mkt_price_snapshots IS 'Fotos de precio de Bloomberg por papel (semanal aprox.): último precio, rango de 52 semanas y market cap. Para el precio actual: is_latest = true.';
COMMENT ON COLUMN ai.mkt_price_snapshots.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.mkt_price_snapshots.date IS 'Fecha de la foto.';
COMMENT ON COLUMN ai.mkt_price_snapshots.px_last IS 'Precio de cierre, en la moneda de cotización (securities.currency).';
COMMENT ON COLUMN ai.mkt_price_snapshots.high_52w IS 'Máximo de 52 semanas.';
COMMENT ON COLUMN ai.mkt_price_snapshots.low_52w IS 'Mínimo de 52 semanas.';
COMMENT ON COLUMN ai.mkt_price_snapshots.pct_of_52w_range IS 'Posición del precio dentro del rango 52s, de 0 a 100 (0 = en el mínimo, 100 = en el máximo).';
COMMENT ON COLUMN ai.mkt_price_snapshots.market_cap IS 'Market cap de Bloomberg en UNIDADES de la moneda de cotización (no millones). En papeles de doble serie es el de la EMPRESA consolidada. NULL en fotos antiguas.';
COMMENT ON COLUMN ai.mkt_price_snapshots.is_latest IS 'true = es la foto más reciente del ticker. Filtrá por esto para "el dato actual".';

-- ── ai.mkt_consensus_ratings ─────────────────────────────────────────────────
CREATE VIEW ai.mkt_consensus_ratings AS
SELECT r.ticker AS bbg_ticker, r.date, r."totAnalysts" AS n_analysts, r.buy AS n_buy, r.hold AS n_hold, r.sell AS n_sell,
       (CASE WHEN upper(btrim(r.consenso)) IN ('BUY','COMPRAR','OVERWEIGHT','OW','OUTPERFORM','STRONG BUY') THEN 'BUY' WHEN upper(btrim(r.consenso)) IN ('HOLD','MANTENER','NEUTRAL','MW','MARKET WEIGHT','EQUAL WEIGHT','MARKETPERFORM') THEN 'HOLD' WHEN upper(btrim(r.consenso)) IN ('SELL','VENDER','UNDERWEIGHT','UW','UNDERPERFORM') THEN 'SELL' END) AS consensus_rating, r."targetPrice" AS consensus_target_price,
       (r.date = max(r.date) OVER (PARTITION BY r.ticker)) AS is_latest
  FROM analyst_recommendations r;
COMMENT ON VIEW ai.mkt_consensus_ratings IS 'Consenso de recomendaciones sell-side (Bloomberg): cuántos analistas dicen buy/hold/sell y el target price promedio. NO confundir con analyst_call_history (recomendaciones INTERNAS del equipo).';
COMMENT ON COLUMN ai.mkt_consensus_ratings.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.mkt_consensus_ratings.date IS 'Fecha de la foto.';
COMMENT ON COLUMN ai.mkt_consensus_ratings.n_analysts IS 'Analistas que cubren el papel.';
COMMENT ON COLUMN ai.mkt_consensus_ratings.n_buy IS 'Cuántos recomiendan comprar.';
COMMENT ON COLUMN ai.mkt_consensus_ratings.n_hold IS 'Cuántos recomiendan mantener.';
COMMENT ON COLUMN ai.mkt_consensus_ratings.n_sell IS 'Cuántos recomiendan vender.';
COMMENT ON COLUMN ai.mkt_consensus_ratings.consensus_rating IS 'Consenso normalizado: ''BUY'' | ''HOLD'' | ''SELL''.';
COMMENT ON COLUMN ai.mkt_consensus_ratings.consensus_target_price IS 'Target price promedio del consenso, moneda de cotización.';
COMMENT ON COLUMN ai.mkt_consensus_ratings.is_latest IS 'true = es la foto más reciente del ticker. Filtrá por esto para "el dato actual".';

-- ── ai.mkt_total_returns ─────────────────────────────────────────────────────
CREATE VIEW ai.mkt_total_returns AS
SELECT (CASE WHEN t.ticker_bbg ~* ' (INDEX|CURNCY|COMDTY|CORP|GOVT|EQUITY)$' THEN upper(t.ticker_bbg) ELSE upper(t.ticker_bbg) || ' EQUITY' END) AS bbg_ticker, t.ticker_bbg AS source_ticker, t.company AS label, t.as_of, t.currency,
       t.price, t.ret_month AS ret_1m, t.ret_ytd, t.ret_year AS ret_1y, t.ret_3y AS ret_3y_annualized,
       t.ret_5y AS ret_5y_annualized, t.source
  FROM ticker_return_snapshot t;
COMMENT ON VIEW ai.mkt_total_returns IS 'Retornos totales (precio + dividendos brutos reinvertidos, Bloomberg) — la ÚNICA tabla de retornos. Una sola foto vigente por ticker (se reemplaza en cada carga). Cubre el universo de Stock Selection Chile más índices (IPSA, IGPA…), monedas y commodities. Retornos en DECIMAL (0.0512 = +5,12%).';
COMMENT ON COLUMN ai.mkt_total_returns.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker. Para índices/monedas/commodities queda con su yellow key ("IPSA INDEX", "CLP CURNCY").';
COMMENT ON COLUMN ai.mkt_total_returns.source_ticker IS 'Ticker tal como lo carga el script (sin " EQUITY").';
COMMENT ON COLUMN ai.mkt_total_returns.label IS 'Nombre informativo.';
COMMENT ON COLUMN ai.mkt_total_returns.as_of IS 'Fecha a la que corresponden los retornos.';
COMMENT ON COLUMN ai.mkt_total_returns.currency IS 'Moneda del precio.';
COMMENT ON COLUMN ai.mkt_total_returns.price IS 'Precio de la fuente (control).';
COMMENT ON COLUMN ai.mkt_total_returns.ret_1m IS 'Retorno total último mes, DECIMAL.';
COMMENT ON COLUMN ai.mkt_total_returns.ret_ytd IS 'Retorno total en lo que va del año, DECIMAL.';
COMMENT ON COLUMN ai.mkt_total_returns.ret_1y IS 'Retorno total 12 meses, DECIMAL.';
COMMENT ON COLUMN ai.mkt_total_returns.ret_3y_annualized IS 'Retorno total 3 años ANUALIZADO (CAGR), DECIMAL.';
COMMENT ON COLUMN ai.mkt_total_returns.ret_5y_annualized IS 'Retorno total 5 años ANUALIZADO (CAGR), DECIMAL.';
COMMENT ON COLUMN ai.mkt_total_returns.source IS 'Origen de la carga ("bloomberg").';

-- ── ai.macro_indicator_history ───────────────────────────────────────────────
CREATE VIEW ai.macro_indicator_history AS
SELECT m.date::date AS date, m.pais AS country, m.indicador AS indicator, m.valor AS value FROM "MacroHistorico" m;
COMMENT ON VIEW ai.macro_indicator_history IS 'Series históricas macro por país (diarias/mensuales según el indicador).';
COMMENT ON COLUMN ai.macro_indicator_history.date IS 'Fecha.';
COMMENT ON COLUMN ai.macro_indicator_history.country IS 'País (en inglés: ''Chile'', ''Brazil'', ''United States''…).';
COMMENT ON COLUMN ai.macro_indicator_history.indicator IS 'Indicador, con su unidad en el nombre (''10Y Yield (%)'', ''FX Spot''…).';
COMMENT ON COLUMN ai.macro_indicator_history.value IS 'Valor, en la unidad del indicador.';

-- ── ai.macro_indicator_forecasts ─────────────────────────────────────────────
CREATE VIEW ai.macro_indicator_forecasts AS
SELECT m."snapshotDate"::date AS snapshot_date, extract(year FROM m."snapshotDate")::int AS base_year,
       m.country, m.indicator,
       (CASE WHEN btrim(replace(replace(m."current_Y0", '%', ''), ',', '')) ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN btrim(replace(replace(m."current_Y0", '%', ''), ',', ''))::numeric END) AS forecast_y0, (CASE WHEN btrim(replace(replace(m."current_Y1", '%', ''), ',', '')) ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN btrim(replace(replace(m."current_Y1", '%', ''), ',', ''))::numeric END) AS forecast_y1, (CASE WHEN btrim(replace(replace(m."current_Y2", '%', ''), ',', '')) ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN btrim(replace(replace(m."current_Y2", '%', ''), ',', ''))::numeric END) AS forecast_y2,
       (CASE WHEN btrim(replace(replace(m."prev_3mAgo", '%', ''), ',', '')) ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN btrim(replace(replace(m."prev_3mAgo", '%', ''), ',', ''))::numeric END) AS forecast_y0_3m_ago,
       (m."snapshotDate"::date = max(m."snapshotDate"::date) OVER ()) AS is_latest
  FROM "MacroForecasts" m;
COMMENT ON VIEW ai.macro_indicator_forecasts IS 'Proyecciones macro (GDP, inflación…) por país para el año en curso y los dos siguientes, por foto. Usá is_latest = true para la vigente.';
COMMENT ON COLUMN ai.macro_indicator_forecasts.snapshot_date IS 'Fecha de la foto.';
COMMENT ON COLUMN ai.macro_indicator_forecasts.base_year IS 'Año Y0 de la foto (forecast_y0 es para este año).';
COMMENT ON COLUMN ai.macro_indicator_forecasts.country IS 'País o ''World''.';
COMMENT ON COLUMN ai.macro_indicator_forecasts.indicator IS '''GDP'' (crecimiento %), ''Inflation'' (%), etc.';
COMMENT ON COLUMN ai.macro_indicator_forecasts.forecast_y0 IS 'Proyección para base_year, en % (3.0 = 3%).';
COMMENT ON COLUMN ai.macro_indicator_forecasts.forecast_y1 IS 'Proyección para base_year + 1, en %.';
COMMENT ON COLUMN ai.macro_indicator_forecasts.forecast_y2 IS 'Proyección para base_year + 2, en %.';
COMMENT ON COLUMN ai.macro_indicator_forecasts.forecast_y0_3m_ago IS 'Lo que se proyectaba para base_year hace 3 meses, en %.';
COMMENT ON COLUMN ai.macro_indicator_forecasts.is_latest IS 'true = es la foto más reciente del set. Filtrá por esto para "el dato actual".';

-- ── ai.macro_commodity_prices ────────────────────────────────────────────────
CREATE VIEW ai.macro_commodity_prices AS
SELECT c.date::date AS date, c.commodity, c.precio AS price FROM "CommodityHistorico" c;
COMMENT ON VIEW ai.macro_commodity_prices IS 'Precios históricos de commodities e índices de commodities. La unidad va en el nombre del commodity.';
COMMENT ON COLUMN ai.macro_commodity_prices.date IS 'Fecha.';
COMMENT ON COLUMN ai.macro_commodity_prices.commodity IS 'Nombre con unidad (''Copper Spot LME (USD/t)'', ''Brent Crude Oil (USD/bbl)''…).';
COMMENT ON COLUMN ai.macro_commodity_prices.price IS 'Precio en la unidad del nombre.';

-- ── ai.macro_commodity_forecasts ─────────────────────────────────────────────
CREATE VIEW ai.macro_commodity_forecasts AS
SELECT c."snapshotDate"::date AS snapshot_date, c.commodity, c.quarter AS quarter_label, c."spotCurrent" AS spot_price,
       (CASE WHEN btrim(replace(replace(c."fwdCurve", '%', ''), ',', '')) ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN btrim(replace(replace(c."fwdCurve", '%', ''), ',', ''))::numeric END) AS forward_price, (CASE WHEN btrim(replace(replace(c."analystForecast", '%', ''), ',', '')) ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN btrim(replace(replace(c."analystForecast", '%', ''), ',', ''))::numeric END) AS analyst_forecast,
       (c."snapshotDate"::date = max(c."snapshotDate"::date) OVER ()) AS is_latest
  FROM "CommodityForecasts" c;
COMMENT ON VIEW ai.macro_commodity_forecasts IS 'Proyecciones de commodities por trimestre: spot, curva forward y forecast de analistas, por foto. Usá is_latest = true.';
COMMENT ON COLUMN ai.macro_commodity_forecasts.snapshot_date IS 'Fecha de la foto.';
COMMENT ON COLUMN ai.macro_commodity_forecasts.commodity IS 'Nombre con unidad.';
COMMENT ON COLUMN ai.macro_commodity_forecasts.quarter_label IS 'Trimestre proyectado, formato ''Q127'' = 1T 2027.';
COMMENT ON COLUMN ai.macro_commodity_forecasts.spot_price IS 'Precio spot a la fecha de la foto.';
COMMENT ON COLUMN ai.macro_commodity_forecasts.forward_price IS 'Precio de la curva forward para ese trimestre.';
COMMENT ON COLUMN ai.macro_commodity_forecasts.analyst_forecast IS 'Forecast de consenso de analistas para ese trimestre.';
COMMENT ON COLUMN ai.macro_commodity_forecasts.is_latest IS 'true = es la foto más reciente del set. Filtrá por esto para "el dato actual".';

-- ── ai.macro_index_pe_history ────────────────────────────────────────────────
CREATE VIEW ai.macro_index_pe_history AS
SELECT p.date::date AS date, p.indice AS index_name, p."peValue" AS pe FROM "PeHistorico" p;
COMMENT ON VIEW ai.macro_index_pe_history IS 'P/E histórico de índices bursátiles (MSCI, S&P…).';
COMMENT ON COLUMN ai.macro_index_pe_history.date IS 'Fecha.';
COMMENT ON COLUMN ai.macro_index_pe_history.index_name IS 'Índice.';
COMMENT ON COLUMN ai.macro_index_pe_history.pe IS 'P/E (veces).';

-- ── ai.macro_index_pe_summary ────────────────────────────────────────────────
CREATE VIEW ai.macro_index_pe_summary AS
SELECT p."snapshotDate"::date AS snapshot_date, p.index AS index_name, p."todayPE" AS pe_today, p."histAvg" AS pe_hist_avg,
       p."plus1Std" AS pe_plus_1sd, p."minus1Std" AS pe_minus_1sd, (CASE WHEN btrim(replace(replace(p.discount, '%', ''), ',', '')) ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN btrim(replace(replace(p.discount, '%', ''), ',', ''))::numeric END) AS discount_vs_avg_pct,
       (p."snapshotDate"::date = max(p."snapshotDate"::date) OVER ()) AS is_latest
  FROM "PeSummarySnapshot" p;
COMMENT ON VIEW ai.macro_index_pe_summary IS 'P/E actual de cada índice contra su historia (promedio y bandas ±1 desviación estándar), por foto. Usá is_latest = true.';
COMMENT ON COLUMN ai.macro_index_pe_summary.snapshot_date IS 'Fecha de la foto.';
COMMENT ON COLUMN ai.macro_index_pe_summary.index_name IS 'Índice.';
COMMENT ON COLUMN ai.macro_index_pe_summary.pe_today IS 'P/E actual.';
COMMENT ON COLUMN ai.macro_index_pe_summary.pe_hist_avg IS 'P/E promedio histórico.';
COMMENT ON COLUMN ai.macro_index_pe_summary.pe_plus_1sd IS 'Promedio + 1 desviación estándar.';
COMMENT ON COLUMN ai.macro_index_pe_summary.pe_minus_1sd IS 'Promedio − 1 desviación estándar.';
COMMENT ON COLUMN ai.macro_index_pe_summary.discount_vs_avg_pct IS 'Descuento (−) o premio (+) vs el promedio, en % (−5.2 = 5,2% de descuento).';
COMMENT ON COLUMN ai.macro_index_pe_summary.is_latest IS 'true = es la foto más reciente del set. Filtrá por esto para "el dato actual".';

-- ── ai.macro_index_comps ─────────────────────────────────────────────────────
CREATE VIEW ai.macro_index_comps AS
SELECT c."snapshotDate"::date AS snapshot_date, c.ticker AS index_ticker, c."indexName" AS index_name, c."priceLocal" AS index_level,
       (CASE WHEN btrim(replace(replace(c."ret1W", '%', ''), ',', '')) ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN btrim(replace(replace(c."ret1W", '%', ''), ',', ''))::numeric END) AS ret_1w_pct, (CASE WHEN btrim(replace(replace(c."ret1M", '%', ''), ',', '')) ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN btrim(replace(replace(c."ret1M", '%', ''), ',', ''))::numeric END) AS ret_1m_pct, (CASE WHEN btrim(replace(replace(c."ret3M", '%', ''), ',', '')) ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN btrim(replace(replace(c."ret3M", '%', ''), ',', ''))::numeric END) AS ret_3m_pct,
       (CASE WHEN btrim(replace(replace(c."retYTD", '%', ''), ',', '')) ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN btrim(replace(replace(c."retYTD", '%', ''), ',', ''))::numeric END) AS ret_ytd_pct, (CASE WHEN btrim(replace(replace(c."ret1Y", '%', ''), ',', '')) ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN btrim(replace(replace(c."ret1Y", '%', ''), ',', ''))::numeric END) AS ret_1y_pct, (CASE WHEN btrim(replace(replace(c."ret3Y", '%', ''), ',', '')) ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN btrim(replace(replace(c."ret3Y", '%', ''), ',', ''))::numeric END) AS ret_3y_pct,
       (CASE WHEN btrim(replace(replace(c."ret5Y", '%', ''), ',', '')) ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN btrim(replace(replace(c."ret5Y", '%', ''), ',', ''))::numeric END) AS ret_5y_pct, (CASE WHEN btrim(replace(replace(c."ret10Y", '%', ''), ',', '')) ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN btrim(replace(replace(c."ret10Y", '%', ''), ',', ''))::numeric END) AS ret_10y_pct,
       c."evEbitdaFwd" AS ev_ebitda_fwd, c."peFwd" AS pe_fwd, c."evEbitdaTrail" AS ev_ebitda_trailing,
       c."roeTrail" AS roe_trailing, c."peTrail" AS pe_trailing,
       (c."snapshotDate"::date = max(c."snapshotDate"::date) OVER ()) AS is_latest
  FROM "EquityCompsSnapshot" c;
COMMENT ON VIEW ai.macro_index_comps IS 'Comparables de ÍNDICES bursátiles (no acciones): nivel, retornos y múltiplos, por foto. Usá is_latest = true.';
COMMENT ON COLUMN ai.macro_index_comps.snapshot_date IS 'Fecha de la foto.';
COMMENT ON COLUMN ai.macro_index_comps.index_ticker IS 'Ticker Bloomberg del índice (''MXLA Index'').';
COMMENT ON COLUMN ai.macro_index_comps.index_name IS 'Nombre del índice.';
COMMENT ON COLUMN ai.macro_index_comps.index_level IS 'Nivel del índice.';
COMMENT ON COLUMN ai.macro_index_comps.ret_1w_pct IS 'Retorno 1 semana en % (−5.7 = −5,7%).';
COMMENT ON COLUMN ai.macro_index_comps.ret_1m_pct IS 'Retorno 1 mes en %.';
COMMENT ON COLUMN ai.macro_index_comps.ret_3m_pct IS 'Retorno 3 meses en %.';
COMMENT ON COLUMN ai.macro_index_comps.ret_ytd_pct IS 'Retorno en el año en %.';
COMMENT ON COLUMN ai.macro_index_comps.ret_1y_pct IS 'Retorno 1 año en %.';
COMMENT ON COLUMN ai.macro_index_comps.ret_3y_pct IS 'Retorno ACUMULADO 3 años en % (no anualizado).';
COMMENT ON COLUMN ai.macro_index_comps.ret_5y_pct IS 'Retorno acumulado 5 años en %.';
COMMENT ON COLUMN ai.macro_index_comps.ret_10y_pct IS 'Retorno acumulado 10 años en %.';
COMMENT ON COLUMN ai.macro_index_comps.ev_ebitda_fwd IS 'EV/EBITDA forward (veces).';
COMMENT ON COLUMN ai.macro_index_comps.pe_fwd IS 'P/E forward (veces).';
COMMENT ON COLUMN ai.macro_index_comps.ev_ebitda_trailing IS 'EV/EBITDA trailing (veces).';
COMMENT ON COLUMN ai.macro_index_comps.roe_trailing IS 'ROE trailing en DECIMAL (0.17 = 17%).';
COMMENT ON COLUMN ai.macro_index_comps.pe_trailing IS 'P/E trailing (veces).';
COMMENT ON COLUMN ai.macro_index_comps.is_latest IS 'true = es la foto más reciente del set. Filtrá por esto para "el dato actual".';

-- ── ai.model_versions ────────────────────────────────────────────────────────
CREATE VIEW ai.model_versions AS
SELECT 'company'::text AS model_type, h.ticker AS bbg_ticker, h.update_date AS model_date,
       (CASE WHEN upper(btrim(h.recc)) IN ('BUY','COMPRAR','OVERWEIGHT','OW','OUTPERFORM','STRONG BUY') THEN 'BUY' WHEN upper(btrim(h.recc)) IN ('HOLD','MANTENER','NEUTRAL','MW','MARKET WEIGHT','EQUAL WEIGHT','MARKETPERFORM') THEN 'HOLD' WHEN upper(btrim(h.recc)) IN ('SELL','VENDER','UNDERWEIGHT','UW','UNDERPERFORM') THEN 'SELL' END) AS recommendation, NULLIF(btrim(h.recc), '') AS recommendation_raw, h.tp AS target_price, NULLIF(btrim(h.analyst), '') AS analyst,
       upper(substring(btrim(h.currency) from '^[A-Za-z]{3}')) AS currency, NULLIF(btrim(h.unit), '') AS unit_label, h.has_series, h.thesis, h.link,
       (h.update_date = max(h.update_date) OVER (PARTITION BY h.ticker)) AS is_latest
  FROM model_headers h
UNION ALL
SELECT 'bank', b.ticker, b.update_date, (CASE WHEN upper(btrim(b.recc)) IN ('BUY','COMPRAR','OVERWEIGHT','OW','OUTPERFORM','STRONG BUY') THEN 'BUY' WHEN upper(btrim(b.recc)) IN ('HOLD','MANTENER','NEUTRAL','MW','MARKET WEIGHT','EQUAL WEIGHT','MARKETPERFORM') THEN 'HOLD' WHEN upper(btrim(b.recc)) IN ('SELL','VENDER','UNDERWEIGHT','UW','UNDERPERFORM') THEN 'SELL' END), NULLIF(btrim(b.recc), ''), b.tp, NULLIF(btrim(b.analyst), ''),
       upper(substring(btrim(b.currency) from '^[A-Za-z]{3}')), NULLIF(btrim(b.unit), ''), false, b.thesis, b.link,
       (b.update_date = max(b.update_date) OVER (PARTITION BY b.ticker))
  FROM bank_headers b;
COMMENT ON VIEW ai.model_versions IS 'Modelos financieros PROPIOS de los analistas del equipo (Excel subido por macro), uno por versión: cada carga crea una versión nueva (bbg_ticker, model_date). Incluye empresas (model_type ''company'') y bancos (''bank''). Recomendación y target price oficiales del equipo. Para la vigente: is_latest = true. Los números están en model_financials / bank_model_financials / model_kpis.';
COMMENT ON COLUMN ai.model_versions.model_type IS '''company'' (empresa no financiera) | ''bank'' (banco, estructura de estados distinta).';
COMMENT ON COLUMN ai.model_versions.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.model_versions.model_date IS 'Fecha de la versión del modelo.';
COMMENT ON COLUMN ai.model_versions.recommendation IS 'Recomendación normalizada: ''BUY'' | ''HOLD'' | ''SELL'' (NULL si vacía).';
COMMENT ON COLUMN ai.model_versions.recommendation_raw IS 'Recomendación tal como viene del Excel.';
COMMENT ON COLUMN ai.model_versions.target_price IS 'Target price del analista, en la moneda de cotización del papel.';
COMMENT ON COLUMN ai.model_versions.analyst IS 'Iniciales o nombre del analista.';
COMMENT ON COLUMN ai.model_versions.currency IS 'Moneda de los montos del modelo (CLP, USD, BRL, MXN…).';
COMMENT ON COLUMN ai.model_versions.unit_label IS 'Etiqueta de escala del Excel (''mn'', ''mm'', ''000 mn'', ''bn''). No siempre confiable.';
COMMENT ON COLUMN ai.model_versions.has_series IS 'true = empresa de doble serie (A/B).';
COMMENT ON COLUMN ai.model_versions.thesis IS 'Tesis de inversión (texto).';
COMMENT ON COLUMN ai.model_versions.link IS 'Link al archivo del modelo.';
COMMENT ON COLUMN ai.model_versions.is_latest IS 'true = es la foto más reciente del ticker y tipo de modelo. Filtrá por esto para "el dato actual".';

-- ── ai.model_financials ──────────────────────────────────────────────────────
CREATE VIEW ai.model_financials AS
SELECT f.ticker AS bbg_ticker, f.update_date AS model_date, f.year AS fiscal_year,
       f.revenue, f.ebitda, f.ebit, f.d_a AS depreciation_amortization, f.tax_rate, f.taxes, f.net_fin_expenses,
       f.net_income, f.eps, f.shares_out AS shares_out_mn, f.net_debt, f.minorities, f.controlling_equity, f.tangible_equity,
       f.ppe, f.working_capital, f.fcf, f.capex, f.asset_sales, f.fcfe, f.dividend, f.payout, f.buybacks, f.dps,
       f.share_price, f.market_cap, f.fx_consensus, f.fx_eop,
       (f.update_date = max(f.update_date) OVER (PARTITION BY f.ticker)) AS is_latest_version
  FROM model_financials f;
COMMENT ON VIEW ai.model_financials IS 'Estados financieros proyectados del modelo del analista para EMPRESAS (no bancos), una fila por (versión, año). Montos en la escala y moneda del modelo (ver model_versions.currency / unit_label; normalmente millones, a veces miles de millones — la etiqueta no siempre es confiable). Signos como en el Excel: dividendos, DPS y recompras vienen NEGATIVOS. is_latest_version = true para la versión vigente.';
COMMENT ON COLUMN ai.model_financials.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.model_financials.model_date IS 'Versión del modelo (= model_versions.model_date).';
COMMENT ON COLUMN ai.model_financials.fiscal_year IS 'Año (históricos y proyectados).';
COMMENT ON COLUMN ai.model_financials.revenue IS 'Ingresos.';
COMMENT ON COLUMN ai.model_financials.ebitda IS 'EBITDA.';
COMMENT ON COLUMN ai.model_financials.ebit IS 'EBIT.';
COMMENT ON COLUMN ai.model_financials.depreciation_amortization IS 'Depreciación y amortización.';
COMMENT ON COLUMN ai.model_financials.tax_rate IS 'Tasa de impuesto, DECIMAL.';
COMMENT ON COLUMN ai.model_financials.taxes IS 'Impuestos.';
COMMENT ON COLUMN ai.model_financials.net_fin_expenses IS 'Gastos financieros netos.';
COMMENT ON COLUMN ai.model_financials.net_income IS 'Utilidad neta controladora.';
COMMENT ON COLUMN ai.model_financials.eps IS 'Utilidad por acción (moneda del modelo).';
COMMENT ON COLUMN ai.model_financials.shares_out_mn IS 'Acciones (millones, según la planilla).';
COMMENT ON COLUMN ai.model_financials.net_debt IS 'Deuda neta.';
COMMENT ON COLUMN ai.model_financials.minorities IS 'Interés minoritario.';
COMMENT ON COLUMN ai.model_financials.controlling_equity IS 'Patrimonio controlador.';
COMMENT ON COLUMN ai.model_financials.tangible_equity IS 'Patrimonio tangible.';
COMMENT ON COLUMN ai.model_financials.ppe IS 'Propiedades, planta y equipo.';
COMMENT ON COLUMN ai.model_financials.working_capital IS 'Capital de trabajo.';
COMMENT ON COLUMN ai.model_financials.fcf IS 'Flujo de caja libre.';
COMMENT ON COLUMN ai.model_financials.capex IS 'Capex.';
COMMENT ON COLUMN ai.model_financials.asset_sales IS 'Venta de activos.';
COMMENT ON COLUMN ai.model_financials.fcfe IS 'Flujo de caja libre al accionista.';
COMMENT ON COLUMN ai.model_financials.dividend IS 'Dividendos pagados (NEGATIVO).';
COMMENT ON COLUMN ai.model_financials.payout IS 'Payout = dividendo(año) / utilidad(año−1), DECIMAL; el signo varía entre modelos.';
COMMENT ON COLUMN ai.model_financials.buybacks IS 'Recompras (NEGATIVO).';
COMMENT ON COLUMN ai.model_financials.dps IS 'Dividendo por acción (NEGATIVO).';
COMMENT ON COLUMN ai.model_financials.share_price IS 'Precio de la acción usado en el modelo (moneda de cotización).';
COMMENT ON COLUMN ai.model_financials.market_cap IS 'Market cap usado en el modelo, en la escala del modelo.';
COMMENT ON COLUMN ai.model_financials.fx_consensus IS 'FX para llevar el modelo a la moneda del consenso.';
COMMENT ON COLUMN ai.model_financials.fx_eop IS 'FX de cierre para llevar el market cap a la moneda del modelo.';
COMMENT ON COLUMN ai.model_financials.is_latest_version IS 'true = es la foto más reciente del ticker (versión del modelo). Filtrá por esto para "el dato actual".';

-- ── ai.bank_model_financials ─────────────────────────────────────────────────
CREATE VIEW ai.bank_model_financials AS
SELECT f.ticker AS bbg_ticker, f.update_date AS model_date, f.year AS fiscal_year,
       f.net_interest_income, f.net_fee_income, f.treasury_income, f.other_income, f.revenue, f.nim, f.risk_adjusted_nim,
       f.provision_expenses, f.cor AS cost_of_risk, f.npl_ratio, f.total_coverage_ratio, f.sga, f.efficiency, f.cost_to_assets,
       f.ebt, f.taxes, f.minority_interest, f.controlling_net_income, f.eps, f.shares AS shares_mn,
       f.gross_loans, f.securities, f.interest_earning_assets, f.avg_interest_earning_assets, f.allowances_loan_losses,
       f.total_assets, f.avg_total_assets, f.demand_deposits, f.time_deposits, f.total_deposits, f.other_funding,
       f.interest_bearing_liabilities, f.total_funding, f.total_liabilities, f.minorities, f.controlling_equity,
       f.avg_controlling_equity, f.tangible_equity, f.overdue_loans, f.voluntary_provisions,
       f.capex, f.dividend, f.payout, f.buybacks, f.dps, f.share_price, f.market_cap, f.fx_consensus, f.fx_eop,
       (f.update_date = max(f.update_date) OVER (PARTITION BY f.ticker)) AS is_latest_version
  FROM bank_financials f;
COMMENT ON VIEW ai.bank_model_financials IS 'Estados financieros proyectados del modelo del analista para BANCOS, una fila por (versión, año). Montos en la escala y moneda del modelo (ver model_versions.currency / unit_label; normalmente millones, a veces miles de millones — la etiqueta no siempre es confiable); ratios en DECIMAL. Dividendos, DPS y recompras NEGATIVOS.';
COMMENT ON COLUMN ai.bank_model_financials.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.bank_model_financials.model_date IS 'Versión del modelo.';
COMMENT ON COLUMN ai.bank_model_financials.fiscal_year IS 'Año.';
COMMENT ON COLUMN ai.bank_model_financials.net_interest_income IS 'Margen de intereses.';
COMMENT ON COLUMN ai.bank_model_financials.net_fee_income IS 'Comisiones netas.';
COMMENT ON COLUMN ai.bank_model_financials.treasury_income IS 'Resultado de tesorería.';
COMMENT ON COLUMN ai.bank_model_financials.other_income IS 'Otros ingresos.';
COMMENT ON COLUMN ai.bank_model_financials.revenue IS 'Ingresos totales.';
COMMENT ON COLUMN ai.bank_model_financials.nim IS 'NIM, DECIMAL.';
COMMENT ON COLUMN ai.bank_model_financials.risk_adjusted_nim IS 'NIM ajustado por riesgo, DECIMAL.';
COMMENT ON COLUMN ai.bank_model_financials.provision_expenses IS 'Gasto en provisiones.';
COMMENT ON COLUMN ai.bank_model_financials.cost_of_risk IS 'Costo de riesgo, DECIMAL.';
COMMENT ON COLUMN ai.bank_model_financials.npl_ratio IS 'Cartera vencida / colocaciones, DECIMAL.';
COMMENT ON COLUMN ai.bank_model_financials.total_coverage_ratio IS 'Cobertura total, DECIMAL.';
COMMENT ON COLUMN ai.bank_model_financials.sga IS 'Gastos de apoyo (SG&A).';
COMMENT ON COLUMN ai.bank_model_financials.efficiency IS 'Eficiencia (gastos / ingresos), DECIMAL.';
COMMENT ON COLUMN ai.bank_model_financials.cost_to_assets IS 'Gastos / activos, DECIMAL.';
COMMENT ON COLUMN ai.bank_model_financials.ebt IS 'Utilidad antes de impuestos.';
COMMENT ON COLUMN ai.bank_model_financials.taxes IS 'Impuestos.';
COMMENT ON COLUMN ai.bank_model_financials.minority_interest IS 'Interés minoritario (resultado).';
COMMENT ON COLUMN ai.bank_model_financials.controlling_net_income IS 'Utilidad controladora.';
COMMENT ON COLUMN ai.bank_model_financials.eps IS 'Utilidad por acción.';
COMMENT ON COLUMN ai.bank_model_financials.shares_mn IS 'Acciones (millones).';
COMMENT ON COLUMN ai.bank_model_financials.gross_loans IS 'Colocaciones brutas.';
COMMENT ON COLUMN ai.bank_model_financials.securities IS 'Inversiones financieras.';
COMMENT ON COLUMN ai.bank_model_financials.interest_earning_assets IS 'Activos que devengan intereses.';
COMMENT ON COLUMN ai.bank_model_financials.avg_interest_earning_assets IS 'Promedio de activos que devengan intereses.';
COMMENT ON COLUMN ai.bank_model_financials.allowances_loan_losses IS 'Provisiones acumuladas.';
COMMENT ON COLUMN ai.bank_model_financials.total_assets IS 'Activos totales.';
COMMENT ON COLUMN ai.bank_model_financials.avg_total_assets IS 'Activos totales promedio.';
COMMENT ON COLUMN ai.bank_model_financials.demand_deposits IS 'Depósitos a la vista.';
COMMENT ON COLUMN ai.bank_model_financials.time_deposits IS 'Depósitos a plazo.';
COMMENT ON COLUMN ai.bank_model_financials.total_deposits IS 'Depósitos totales.';
COMMENT ON COLUMN ai.bank_model_financials.other_funding IS 'Otro financiamiento.';
COMMENT ON COLUMN ai.bank_model_financials.interest_bearing_liabilities IS 'Pasivos que pagan intereses.';
COMMENT ON COLUMN ai.bank_model_financials.total_funding IS 'Financiamiento total.';
COMMENT ON COLUMN ai.bank_model_financials.total_liabilities IS 'Pasivos totales.';
COMMENT ON COLUMN ai.bank_model_financials.minorities IS 'Interés minoritario (balance).';
COMMENT ON COLUMN ai.bank_model_financials.controlling_equity IS 'Patrimonio controlador.';
COMMENT ON COLUMN ai.bank_model_financials.avg_controlling_equity IS 'Patrimonio controlador promedio.';
COMMENT ON COLUMN ai.bank_model_financials.tangible_equity IS 'Patrimonio tangible.';
COMMENT ON COLUMN ai.bank_model_financials.overdue_loans IS 'Cartera vencida.';
COMMENT ON COLUMN ai.bank_model_financials.voluntary_provisions IS 'Provisiones voluntarias.';
COMMENT ON COLUMN ai.bank_model_financials.capex IS 'Capex.';
COMMENT ON COLUMN ai.bank_model_financials.dividend IS 'Dividendos (NEGATIVO).';
COMMENT ON COLUMN ai.bank_model_financials.payout IS 'Payout, DECIMAL.';
COMMENT ON COLUMN ai.bank_model_financials.buybacks IS 'Recompras (NEGATIVO).';
COMMENT ON COLUMN ai.bank_model_financials.dps IS 'Dividendo por acción (NEGATIVO).';
COMMENT ON COLUMN ai.bank_model_financials.share_price IS 'Precio usado en el modelo.';
COMMENT ON COLUMN ai.bank_model_financials.market_cap IS 'Market cap usado en el modelo.';
COMMENT ON COLUMN ai.bank_model_financials.fx_consensus IS 'FX modelo → moneda del consenso.';
COMMENT ON COLUMN ai.bank_model_financials.fx_eop IS 'FX de cierre.';
COMMENT ON COLUMN ai.bank_model_financials.is_latest_version IS 'true = es la foto más reciente del ticker. Filtrá por esto para "el dato actual".';

-- ── ai.model_kpis ────────────────────────────────────────────────────────────
CREATE VIEW ai.model_kpis AS
SELECT 'company'::text AS model_type, k.ticker AS bbg_ticker, k.update_date AS model_date, k.year AS fiscal_year,
       k.section_name, k.kpi_name, k.kpi_order, k.value, k.id AS display_order,
       (k.update_date = max(k.update_date) OVER (PARTITION BY k.ticker)) AS is_latest_version
  FROM model_kpis k
UNION ALL
SELECT 'bank', k.ticker, k.update_date, k.year, k.section_name, k.kpi_name, k.kpi_order, k.value, k.id,
       (k.update_date = max(k.update_date) OVER (PARTITION BY k.ticker))
  FROM bank_kpis k;
COMMENT ON VIEW ai.model_kpis IS 'KPIs operativos específicos de cada modelo (volúmenes, precios, mismas tiendas, cartera por segmento…), por versión, sección y año. Empresas y bancos. Unidades según el KPI (ver kpi_name). display_order reproduce el orden de la planilla.';
COMMENT ON COLUMN ai.model_kpis.model_type IS '''company'' | ''bank''.';
COMMENT ON COLUMN ai.model_kpis.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.model_kpis.model_date IS 'Versión del modelo.';
COMMENT ON COLUMN ai.model_kpis.fiscal_year IS 'Año.';
COMMENT ON COLUMN ai.model_kpis.section_name IS 'Sección de la planilla (país, segmento: ''Argentina'', ''Brazil Beer''…).';
COMMENT ON COLUMN ai.model_kpis.kpi_name IS 'Nombre del KPI (''Volumes'', ''Var %''…). Puede repetirse dentro de una sección.';
COMMENT ON COLUMN ai.model_kpis.kpi_order IS 'Orden dentro de la sección.';
COMMENT ON COLUMN ai.model_kpis.value IS 'Valor del KPI (unidad implícita en el nombre; ''Var %'' viene en DECIMAL).';
COMMENT ON COLUMN ai.model_kpis.display_order IS 'Orden de visualización de la planilla (ordená por esto).';
COMMENT ON COLUMN ai.model_kpis.is_latest_version IS 'true = es la foto más reciente del ticker. Filtrá por esto para "el dato actual".';

-- ── ai.model_hidden_tickers ──────────────────────────────────────────────────
CREATE VIEW ai.model_hidden_tickers AS
SELECT h.ticker AS bbg_ticker, h.reason, h.hidden_at FROM estimates_hidden h;
COMMENT ON VIEW ai.model_hidden_tickers IS 'Modelos ocultos para los usuarios no-admin en Analyst Estimates (los datos siguen cargados).';
COMMENT ON COLUMN ai.model_hidden_tickers.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.model_hidden_tickers.reason IS 'Por qué se ocultó.';
COMMENT ON COLUMN ai.model_hidden_tickers.hidden_at IS 'Cuándo.';

-- ── ai.reported_financials ───────────────────────────────────────────────────
CREATE VIEW ai.reported_financials AS
SELECT x.ticker AS bbg_ticker, x.currency, x.fx::float8 AS fx_local_per_usd, x.period_type, (CASE x.period_type WHEN 'A' THEN 'annual' WHEN 'Q' THEN 'quarter' WHEN 'L' THEN 'ltm' WHEN 'Y' THEN 'ytd' END) AS period_kind,
       x.year AS fiscal_year, x.quarter, x.period_end, x.section, x.line, x.line_order, x.value::float8 AS value, x.updated_at
  FROM ficha_statements x;
COMMENT ON VIEW ai.reported_financials IS 'Estados financieros REPORTADOS (reales, no proyecciones) de la "ficha" de cada empresa: Income Statement, Balance Sheet y Cash Flow en formato largo, una fila por (papel, período, sección, línea). Es la fuente de los fundamentales de Stock Selection Chile. Montos en la moneda reportada (currency), en MILLONES salvo líneas por acción, precios y ratios. Para convertir a USD dividí por fx_local_per_usd cuando currency es moneda local.';
COMMENT ON COLUMN ai.reported_financials.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.reported_financials.currency IS 'Moneda reportada (''CLP'', ''USD'').';
COMMENT ON COLUMN ai.reported_financials.fx_local_per_usd IS 'Tipo de cambio moneda local por USD de la última carga (p.ej. 972.6).';
COMMENT ON COLUMN ai.reported_financials.period_type IS '''A'' anual | ''Q'' trimestre | ''L'' LTM (últimos 12 meses) | ''Y'' acumulado del año.';
COMMENT ON COLUMN ai.reported_financials.period_kind IS 'Lo mismo en palabras: annual / quarter / ltm / ytd.';
COMMENT ON COLUMN ai.reported_financials.fiscal_year IS 'Año.';
COMMENT ON COLUMN ai.reported_financials.quarter IS '0 en anuales; 1..4 en trimestres, LTM y acumulados (trimestre al que llegan).';
COMMENT ON COLUMN ai.reported_financials.period_end IS 'Fecha de cierre del período.';
COMMENT ON COLUMN ai.reported_financials.section IS '''Income Statement'' | ''Balance Sheet'' | ''Cash Flow''.';
COMMENT ON COLUMN ai.reported_financials.line IS 'Línea (''Revenues'', ''EBITDA'', ''Controlling Net Income'', ''Total Net Debt'', ''# Shares (mn)''…).';
COMMENT ON COLUMN ai.reported_financials.line_order IS 'Orden dentro de la sección.';
COMMENT ON COLUMN ai.reported_financials.value IS 'Valor reportado.';
COMMENT ON COLUMN ai.reported_financials.updated_at IS 'Última carga.';

-- ── ai.reported_kpis ─────────────────────────────────────────────────────────
CREATE VIEW ai.reported_kpis AS
SELECT x.ticker AS bbg_ticker, x.currency, x.fx::float8 AS fx_local_per_usd, x.period_type, (CASE x.period_type WHEN 'A' THEN 'annual' WHEN 'Q' THEN 'quarter' WHEN 'L' THEN 'ltm' WHEN 'Y' THEN 'ytd' END) AS period_kind,
       x.year AS fiscal_year, x.quarter, x.period_end, x.section, x.kpi, x.kpi_order, x.value::float8 AS value, x.updated_at
  FROM ficha_kpis x;
COMMENT ON VIEW ai.reported_kpis IS 'KPIs operacionales REPORTADOS de la ficha de cada empresa (volúmenes, precios por segmento…), anuales y trimestrales. Mismas reglas de período que reported_financials.';
COMMENT ON COLUMN ai.reported_kpis.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.reported_kpis.currency IS 'Moneda reportada.';
COMMENT ON COLUMN ai.reported_kpis.fx_local_per_usd IS 'Tipo de cambio local por USD.';
COMMENT ON COLUMN ai.reported_kpis.period_type IS '''A'' | ''Q'' | ''L'' | ''Y'' (ver reported_financials).';
COMMENT ON COLUMN ai.reported_kpis.period_kind IS 'annual / quarter / ltm / ytd.';
COMMENT ON COLUMN ai.reported_kpis.fiscal_year IS 'Año.';
COMMENT ON COLUMN ai.reported_kpis.quarter IS '0 en anuales; 1..4 si no.';
COMMENT ON COLUMN ai.reported_kpis.period_end IS 'Cierre del período.';
COMMENT ON COLUMN ai.reported_kpis.section IS 'Subtítulo del bloque de KPIs (país/segmento).';
COMMENT ON COLUMN ai.reported_kpis.kpi IS 'Nombre del KPI.';
COMMENT ON COLUMN ai.reported_kpis.kpi_order IS 'Orden.';
COMMENT ON COLUMN ai.reported_kpis.value IS 'Valor.';
COMMENT ON COLUMN ai.reported_kpis.updated_at IS 'Última carga.';

-- ── ai.reported_financials_comments ──────────────────────────────────────────
CREATE VIEW ai.reported_financials_comments AS
SELECT c.ticker AS bbg_ticker, c.year AS fiscal_year, c.quarter, c.source, c.section, c.line, c.target, c.comment,
       (SELECT u.name FROM users u WHERE lower(u.email) = lower(c.created_by) LIMIT 1) AS author, c.created_at, c.updated_at
  FROM ficha_comments c;
COMMENT ON VIEW ai.reported_financials_comments IS 'Comentarios de los analistas sobre la última ficha de una empresa (pestaña Chile → Last Ficha), anclados al trimestre base comentado.';
COMMENT ON COLUMN ai.reported_financials_comments.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.reported_financials_comments.fiscal_year IS 'Año del trimestre base.';
COMMENT ON COLUMN ai.reported_financials_comments.quarter IS 'Trimestre base (1..4).';
COMMENT ON COLUMN ai.reported_financials_comments.source IS '''statement'' (reported_financials) | ''kpi'' (reported_kpis).';
COMMENT ON COLUMN ai.reported_financials_comments.section IS 'Sección de la línea comentada.';
COMMENT ON COLUMN ai.reported_financials_comments.line IS 'Línea o KPI comentado.';
COMMENT ON COLUMN ai.reported_financials_comments.target IS 'Qué se comenta: ''line'' = la fila; ''yoy''/''qoq'' = variación; ''A2025'' = valor anual; ''Q2026-3'' = valor del 3T26.';
COMMENT ON COLUMN ai.reported_financials_comments.comment IS 'Comentario.';
COMMENT ON COLUMN ai.reported_financials_comments.author IS 'Nombre de quien lo escribió.';
COMMENT ON COLUMN ai.reported_financials_comments.created_at IS 'Creado.';
COMMENT ON COLUMN ai.reported_financials_comments.updated_at IS 'Última edición.';

-- ── ai.tearsheet_pdfs ────────────────────────────────────────────────────────
CREATE VIEW ai.tearsheet_pdfs AS
SELECT f.id, f.ticker AS bbg_ticker, (f.ticker IS NULL) AS is_multi_company, f.fiscal_year, f.quarter, f.month,
       f.title, f.description, f.file_url, (SELECT u.name FROM users u WHERE lower(u.email) = lower(f.uploaded_by) LIMIT 1) AS uploaded_by, f.created_at
  FROM fichas f;
COMMENT ON VIEW ai.tearsheet_pdfs IS 'Fichas en PDF ("ficha" = tearsheet de resultados de una empresa) guardadas en el repositorio. Una ficha viva por papel; las multi-empresa (is_multi_company) listan sus papeles en tearsheet_pdf_securities. Los NÚMEROS de la ficha están en reported_financials / reported_kpis.';
COMMENT ON COLUMN ai.tearsheet_pdfs.id IS 'Id de la ficha.';
COMMENT ON COLUMN ai.tearsheet_pdfs.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker. NULL en fichas multi-empresa.';
COMMENT ON COLUMN ai.tearsheet_pdfs.is_multi_company IS 'true = cubre varias empresas.';
COMMENT ON COLUMN ai.tearsheet_pdfs.fiscal_year IS 'Año del informe.';
COMMENT ON COLUMN ai.tearsheet_pdfs.quarter IS 'Trimestre (1..4).';
COMMENT ON COLUMN ai.tearsheet_pdfs.month IS 'Mes (1..12) en fichas mensuales; NULL en trimestrales.';
COMMENT ON COLUMN ai.tearsheet_pdfs.title IS 'Título.';
COMMENT ON COLUMN ai.tearsheet_pdfs.description IS 'Descripción.';
COMMENT ON COLUMN ai.tearsheet_pdfs.file_url IS 'URL del PDF.';
COMMENT ON COLUMN ai.tearsheet_pdfs.uploaded_by IS 'Nombre de quien la subió.';
COMMENT ON COLUMN ai.tearsheet_pdfs.created_at IS 'Fecha de carga.';

-- ── ai.tearsheet_pdf_securities ──────────────────────────────────────────────
CREATE VIEW ai.tearsheet_pdf_securities AS
SELECT f.id AS tearsheet_id, f.ticker AS bbg_ticker FROM fichas f WHERE f.ticker IS NOT NULL
UNION ALL
SELECT t.ficha_id, t.ticker FROM ficha_tickers t;
COMMENT ON VIEW ai.tearsheet_pdf_securities IS 'Papeles cubiertos por cada ficha PDF (incluye las de una sola empresa).';
COMMENT ON COLUMN ai.tearsheet_pdf_securities.tearsheet_id IS 'tearsheet_pdfs.id.';
COMMENT ON COLUMN ai.tearsheet_pdf_securities.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';

-- ── ai.analyst_call_history ──────────────────────────────────────────────────
CREATE VIEW ai.analyst_call_history AS
SELECT a.id, a.date AS call_date, lower(btrim(a.type)) AS source_type, upper(btrim(a.analyst)) AS analyst,
       a.company AS company_alias, sa.bbg_ticker, (CASE WHEN upper(btrim(a.recommendation)) IN ('BUY','COMPRAR','OVERWEIGHT','OW','OUTPERFORM','STRONG BUY') THEN 'BUY' WHEN upper(btrim(a.recommendation)) IN ('HOLD','MANTENER','NEUTRAL','MW','MARKET WEIGHT','EQUAL WEIGHT','MARKETPERFORM') THEN 'HOLD' WHEN upper(btrim(a.recommendation)) IN ('SELL','VENDER','UNDERWEIGHT','UW','UNDERPERFORM') THEN 'SELL' END) AS recommendation, a.recommendation AS recommendation_raw,
       a."currentPrice" AS price_at_call, a."targetPrice" AS target_price,
       (CASE WHEN a."currentPrice" > 0 AND a."targetPrice" > 0 THEN a."targetPrice" / a."currentPrice" - 1 END) AS implied_upside
  FROM "AnalystRecommendationHistory" a
  LEFT JOIN security_aliases sa ON sa.alias_source = 'track_record' AND sa.alias = a.company;
COMMENT ON VIEW ai.analyst_call_history IS 'TRACK RECORD INTERNO: historial de recomendaciones de los analistas del equipo desde 2011 (mails, casos, comités, top picks). NO es consenso sell-side (eso es mkt_consensus_ratings). company_alias usa nemotécnicos chilenos o nombres viejos; bbg_ticker viene resuelto vía security_aliases (NULL si el nombre no está mapeado).';
COMMENT ON COLUMN ai.analyst_call_history.id IS 'Id.';
COMMENT ON COLUMN ai.analyst_call_history.call_date IS 'Fecha de la recomendación.';
COMMENT ON COLUMN ai.analyst_call_history.source_type IS 'Canal: ''mail'', ''caso'', ''top picks'', ''committee''…';
COMMENT ON COLUMN ai.analyst_call_history.analyst IS 'Iniciales del analista (MAYÚSCULA).';
COMMENT ON COLUMN ai.analyst_call_history.company_alias IS 'Nombre como lo escribió el equipo (''ANDINA-B'').';
COMMENT ON COLUMN ai.analyst_call_history.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker. NULL si el alias no está mapeado.';
COMMENT ON COLUMN ai.analyst_call_history.recommendation IS 'Normalizada: ''BUY'' | ''HOLD'' | ''SELL'' (NULL en las no estándar: ''Suscribir'', ''Valoración''…).';
COMMENT ON COLUMN ai.analyst_call_history.recommendation_raw IS 'Texto original (''Comprar'', ''Mantener'', ''Suscribir hasta $290''…).';
COMMENT ON COLUMN ai.analyst_call_history.price_at_call IS 'Precio del papel al momento de la recomendación.';
COMMENT ON COLUMN ai.analyst_call_history.target_price IS 'Target price, misma moneda que price_at_call.';
COMMENT ON COLUMN ai.analyst_call_history.implied_upside IS 'Upside implícito = target / precio − 1, DECIMAL.';

-- ── ai.research_notes ────────────────────────────────────────────────────────
CREATE VIEW ai.research_notes AS
SELECT n.id, NULLIF(btrim(n.company), '') AS bbg_ticker, n.date AS note_date,
       regexp_replace(initcap(regexp_replace(btrim(n.category), '^(RE|FW|FWD):\s*', '', 'i')), '^Updates$', 'Update') AS category, n.title, n.subject,
       (CASE WHEN upper(btrim(n.recommendation)) IN ('BUY','COMPRAR','OVERWEIGHT','OW','OUTPERFORM','STRONG BUY') THEN 'BUY' WHEN upper(btrim(n.recommendation)) IN ('HOLD','MANTENER','NEUTRAL','MW','MARKET WEIGHT','EQUAL WEIGHT','MARKETPERFORM') THEN 'HOLD' WHEN upper(btrim(n.recommendation)) IN ('SELL','VENDER','UNDERWEIGHT','UW','UNDERPERFORM') THEN 'SELL' END) AS recommendation, NULLIF(btrim(n.recommendation), '') AS recommendation_raw, n.target_price,
       n."from" AS sender, n.received_at, (n.dismissed_at IS NOT NULL) AS is_general,
       btrim(regexp_replace(regexp_replace(n.html, '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g')) AS body_text
  FROM email_research n;
COMMENT ON VIEW ai.research_notes IS 'Notas de research del equipo recibidas por correo (updates, resultados, reuniones con compañías). Una fila por nota y por papel. is_general = nota transversal (sector/macro) sin empresa propia.';
COMMENT ON COLUMN ai.research_notes.id IS 'Id.';
COMMENT ON COLUMN ai.research_notes.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker. NULL si la nota no tiene empresa.';
COMMENT ON COLUMN ai.research_notes.note_date IS 'Fecha de la nota.';
COMMENT ON COLUMN ai.research_notes.category IS 'Tipo: ''Update'', ''Earnings'', ''Meetings'', ''Case''…';
COMMENT ON COLUMN ai.research_notes.title IS 'Título.';
COMMENT ON COLUMN ai.research_notes.subject IS 'Asunto del correo.';
COMMENT ON COLUMN ai.research_notes.recommendation IS 'Normalizada ''BUY''|''HOLD''|''SELL'' (NULL si la nota no trae).';
COMMENT ON COLUMN ai.research_notes.recommendation_raw IS 'Texto original.';
COMMENT ON COLUMN ai.research_notes.target_price IS 'Target price mencionado en la nota.';
COMMENT ON COLUMN ai.research_notes.sender IS 'Remitente del correo.';
COMMENT ON COLUMN ai.research_notes.received_at IS 'Recepción del correo.';
COMMENT ON COLUMN ai.research_notes.is_general IS 'true = nota general (sin empresa).';
COMMENT ON COLUMN ai.research_notes.body_text IS 'Cuerpo de la nota en texto plano (sin HTML).';

-- ── ai.presentations ─────────────────────────────────────────────────────────
CREATE VIEW ai.presentations AS
SELECT p.id, p.title, p.description, p.file_url, p.category, p.region, p.is_sell_side, p.case_date, p.created_at,
       p.review_status, (SELECT u.name FROM users u WHERE lower(u.email) = lower(p.uploaded_by) LIMIT 1) AS uploaded_by
  FROM presentations p;
COMMENT ON VIEW ai.presentations IS 'Repositorio de presentaciones y documentos (investment cases, presentaciones a clientes, updates sectoriales, economía). Las empresas que cubre cada una están en presentation_securities.';
COMMENT ON COLUMN ai.presentations.id IS 'Id.';
COMMENT ON COLUMN ai.presentations.title IS 'Título.';
COMMENT ON COLUMN ai.presentations.description IS 'Descripción.';
COMMENT ON COLUMN ai.presentations.file_url IS 'URL del archivo.';
COMMENT ON COLUMN ai.presentations.category IS '''investment_cases'' | ''client_presentations'' | ''sectorial_updates'' | ''economics_team''…';
COMMENT ON COLUMN ai.presentations.region IS '''Chile'' | ''LATAM'' | ''global''…';
COMMENT ON COLUMN ai.presentations.is_sell_side IS 'true = material de sell-side externo; false = propio.';
COMMENT ON COLUMN ai.presentations.case_date IS 'Fecha del informe (no la de carga).';
COMMENT ON COLUMN ai.presentations.created_at IS 'Fecha de carga.';
COMMENT ON COLUMN ai.presentations.review_status IS '''pending'' | ''approved'' (los investment cases pasan por revisión).';
COMMENT ON COLUMN ai.presentations.uploaded_by IS 'Nombre de quien lo subió.';

-- ── ai.presentation_securities ───────────────────────────────────────────────
CREATE VIEW ai.presentation_securities AS
SELECT t.presentation_id, t.ticker AS bbg_ticker, t.target_price, (CASE WHEN upper(btrim(t.recommendation)) IN ('BUY','COMPRAR','OVERWEIGHT','OW','OUTPERFORM','STRONG BUY') THEN 'BUY' WHEN upper(btrim(t.recommendation)) IN ('HOLD','MANTENER','NEUTRAL','MW','MARKET WEIGHT','EQUAL WEIGHT','MARKETPERFORM') THEN 'HOLD' WHEN upper(btrim(t.recommendation)) IN ('SELL','VENDER','UNDERWEIGHT','UW','UNDERPERFORM') THEN 'SELL' END) AS recommendation
  FROM presentation_tickers t;
COMMENT ON VIEW ai.presentation_securities IS 'Empresas cubiertas por cada presentación, con el target price y la recomendación declarados en los investment cases.';
COMMENT ON COLUMN ai.presentation_securities.presentation_id IS 'presentations.id.';
COMMENT ON COLUMN ai.presentation_securities.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.presentation_securities.target_price IS 'Target price del caso (moneda de cotización).';
COMMENT ON COLUMN ai.presentation_securities.recommendation IS '''BUY''|''HOLD''|''SELL''.';

-- ── ai.top_picks ─────────────────────────────────────────────────────────────
CREATE VIEW ai.top_picks AS
SELECT p.id, p.region, p.period_date, p.nombre_latam AS company_name, p.comment, p.target_price, p.industry_group,
       s.name AS sector, p.author_name AS author, p.created_at, p.updated_at
  FROM top_picks p
  LEFT JOIN pick_sectors s ON s.id = p.sector_id;
COMMENT ON VIEW ai.top_picks IS 'Top Picks del equipo por región y período (mejores ideas). company_name es un NOMBRE de la maestra (securities.company_name), no un ticker: al cruzar puede devolver varios papeles de la misma empresa.';
COMMENT ON COLUMN ai.top_picks.id IS 'Id.';
COMMENT ON COLUMN ai.top_picks.region IS '''CHILE'' | ''LATAM''.';
COMMENT ON COLUMN ai.top_picks.period_date IS 'Período del informe (Chile: mes del informe trimestral; LatAm: mes).';
COMMENT ON COLUMN ai.top_picks.company_name IS 'Empresa (= securities.company_name).';
COMMENT ON COLUMN ai.top_picks.comment IS 'Tesis del pick.';
COMMENT ON COLUMN ai.top_picks.target_price IS 'Target price.';
COMMENT ON COLUMN ai.top_picks.industry_group IS 'Industria (descriptivo).';
COMMENT ON COLUMN ai.top_picks.sector IS 'Sector de Top Picks al que pertenece.';
COMMENT ON COLUMN ai.top_picks.author IS 'Analista autor.';
COMMENT ON COLUMN ai.top_picks.created_at IS 'Creado.';
COMMENT ON COLUMN ai.top_picks.updated_at IS 'Última edición.';

-- ── ai.top_pick_periods ──────────────────────────────────────────────────────
CREATE VIEW ai.top_pick_periods AS
SELECT p.region, p.period_date, p.report_date FROM top_pick_periods p;
COMMENT ON VIEW ai.top_pick_periods IS 'Períodos de Top Picks abiertos y la fecha de cierre de cada informe.';
COMMENT ON COLUMN ai.top_pick_periods.region IS '''CHILE'' | ''LATAM''.';
COMMENT ON COLUMN ai.top_pick_periods.period_date IS 'Período.';
COMMENT ON COLUMN ai.top_pick_periods.report_date IS 'Fecha de cierre del informe (NULL si está abierto).';

-- ── ai.security_recommendations ──────────────────────────────────────────────
CREATE VIEW ai.security_recommendations AS
SELECT x.source, x.bbg_ticker, x.as_of_date, x.recommendation, x.target_price, x.analyst, x.reference_id,
       (row_number() OVER (PARTITION BY x.source, x.bbg_ticker ORDER BY x.as_of_date DESC, x.reference_id DESC) = 1) AS is_latest_for_source
  FROM (
    SELECT 'analyst_model'::text AS source, h.ticker AS bbg_ticker, h.update_date AS as_of_date, (CASE WHEN upper(btrim(h.recc)) IN ('BUY','COMPRAR','OVERWEIGHT','OW','OUTPERFORM','STRONG BUY') THEN 'BUY' WHEN upper(btrim(h.recc)) IN ('HOLD','MANTENER','NEUTRAL','MW','MARKET WEIGHT','EQUAL WEIGHT','MARKETPERFORM') THEN 'HOLD' WHEN upper(btrim(h.recc)) IN ('SELL','VENDER','UNDERWEIGHT','UW','UNDERPERFORM') THEN 'SELL' END) AS recommendation,
           h.tp AS target_price, NULLIF(btrim(h.analyst), '') AS analyst, h.update_date::text AS reference_id
      FROM model_headers h
    UNION ALL
    SELECT 'analyst_model', b.ticker, b.update_date, (CASE WHEN upper(btrim(b.recc)) IN ('BUY','COMPRAR','OVERWEIGHT','OW','OUTPERFORM','STRONG BUY') THEN 'BUY' WHEN upper(btrim(b.recc)) IN ('HOLD','MANTENER','NEUTRAL','MW','MARKET WEIGHT','EQUAL WEIGHT','MARKETPERFORM') THEN 'HOLD' WHEN upper(btrim(b.recc)) IN ('SELL','VENDER','UNDERWEIGHT','UW','UNDERPERFORM') THEN 'SELL' END), b.tp, NULLIF(btrim(b.analyst), ''), b.update_date::text FROM bank_headers b
    UNION ALL
    SELECT 'investment_case', t.ticker, COALESCE(p.case_date, p.created_at::date), (CASE WHEN upper(btrim(t.recommendation)) IN ('BUY','COMPRAR','OVERWEIGHT','OW','OUTPERFORM','STRONG BUY') THEN 'BUY' WHEN upper(btrim(t.recommendation)) IN ('HOLD','MANTENER','NEUTRAL','MW','MARKET WEIGHT','EQUAL WEIGHT','MARKETPERFORM') THEN 'HOLD' WHEN upper(btrim(t.recommendation)) IN ('SELL','VENDER','UNDERWEIGHT','UW','UNDERPERFORM') THEN 'SELL' END), t.target_price,
           (SELECT u.name FROM users u WHERE lower(u.email) = lower(p.uploaded_by) LIMIT 1), p.id
      FROM presentation_tickers t JOIN presentations p ON p.id = t.presentation_id
     WHERE p.review_status = 'approved'
    UNION ALL
    SELECT 'research_note', n.company, n.date, (CASE WHEN upper(btrim(n.recommendation)) IN ('BUY','COMPRAR','OVERWEIGHT','OW','OUTPERFORM','STRONG BUY') THEN 'BUY' WHEN upper(btrim(n.recommendation)) IN ('HOLD','MANTENER','NEUTRAL','MW','MARKET WEIGHT','EQUAL WEIGHT','MARKETPERFORM') THEN 'HOLD' WHEN upper(btrim(n.recommendation)) IN ('SELL','VENDER','UNDERWEIGHT','UW','UNDERPERFORM') THEN 'SELL' END), n.target_price, NULL, n.id::text
      FROM email_research n WHERE NULLIF(btrim(n.company), '') IS NOT NULL AND (CASE WHEN upper(btrim(n.recommendation)) IN ('BUY','COMPRAR','OVERWEIGHT','OW','OUTPERFORM','STRONG BUY') THEN 'BUY' WHEN upper(btrim(n.recommendation)) IN ('HOLD','MANTENER','NEUTRAL','MW','MARKET WEIGHT','EQUAL WEIGHT','MARKETPERFORM') THEN 'HOLD' WHEN upper(btrim(n.recommendation)) IN ('SELL','VENDER','UNDERWEIGHT','UW','UNDERPERFORM') THEN 'SELL' END) IS NOT NULL
    UNION ALL
    SELECT 'analyst_call', sa.bbg_ticker, a.date, (CASE WHEN upper(btrim(a.recommendation)) IN ('BUY','COMPRAR','OVERWEIGHT','OW','OUTPERFORM','STRONG BUY') THEN 'BUY' WHEN upper(btrim(a.recommendation)) IN ('HOLD','MANTENER','NEUTRAL','MW','MARKET WEIGHT','EQUAL WEIGHT','MARKETPERFORM') THEN 'HOLD' WHEN upper(btrim(a.recommendation)) IN ('SELL','VENDER','UNDERWEIGHT','UW','UNDERPERFORM') THEN 'SELL' END), a."targetPrice", upper(btrim(a.analyst)), a.id::text
      FROM "AnalystRecommendationHistory" a
      JOIN security_aliases sa ON sa.alias_source = 'track_record' AND sa.alias = a.company AND sa.bbg_ticker IS NOT NULL
  ) x
 WHERE x.recommendation IS NOT NULL;
COMMENT ON VIEW ai.security_recommendations IS 'TODAS las recomendaciones del equipo sobre cada papel, de todas las fuentes, normalizadas a ''BUY''|''HOLD''|''SELL'': modelo del analista, investment cases, notas de research y track record. Para "la recomendación actual" de un papel usá source = ''analyst_model'' AND is_latest_for_source; las demás fuentes sirven de contexto/historial.';
COMMENT ON COLUMN ai.security_recommendations.source IS '''analyst_model'' (oficial vigente) | ''investment_case'' | ''research_note'' | ''analyst_call'' (track record).';
COMMENT ON COLUMN ai.security_recommendations.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.security_recommendations.as_of_date IS 'Fecha de la recomendación.';
COMMENT ON COLUMN ai.security_recommendations.recommendation IS '''BUY'' | ''HOLD'' | ''SELL''.';
COMMENT ON COLUMN ai.security_recommendations.target_price IS 'Target price (moneda de cotización).';
COMMENT ON COLUMN ai.security_recommendations.analyst IS 'Analista (iniciales o nombre), si se conoce.';
COMMENT ON COLUMN ai.security_recommendations.reference_id IS 'Id del registro en su fuente.';
COMMENT ON COLUMN ai.security_recommendations.is_latest_for_source IS 'true = la más reciente de esa fuente para el papel.';

-- ── ai.cl_ss_universe ────────────────────────────────────────────────────────
CREATE VIEW ai.cl_ss_universe AS
SELECT o.company AS company_key, o.label AS company_name, o.seccion AS section, o.seccion_pos AS section_order, o.pos AS position,
       (h.company IS NOT NULL) AS is_hidden, h.reason AS hidden_reason
  FROM stock_selection_orden o
  LEFT JOIN stock_selection_hidden h ON h.company = o.company;
COMMENT ON VIEW ai.cl_ss_universe IS 'Universo de Stock Selection Chile: las compañías de la vista, con su sección y orden. company_key es la llave que usan cl_ss_overrides; company_name se cruza con securities.local_name / company_name. is_hidden = ocultada a mano (sus datos siguen).';
COMMENT ON COLUMN ai.cl_ss_universe.company_key IS 'Nombre normalizado (minúsculas).';
COMMENT ON COLUMN ai.cl_ss_universe.company_name IS 'Nombre como se muestra (''Andina'', ''CAP'').';
COMMENT ON COLUMN ai.cl_ss_universe.section IS 'Sección de la tabla.';
COMMENT ON COLUMN ai.cl_ss_universe.section_order IS 'Orden de la sección.';
COMMENT ON COLUMN ai.cl_ss_universe.position IS 'Orden dentro de la sección.';
COMMENT ON COLUMN ai.cl_ss_universe.is_hidden IS 'true = oculta en la vista.';
COMMENT ON COLUMN ai.cl_ss_universe.hidden_reason IS 'Motivo del ocultamiento.';

-- ── ai.cl_ss_overrides ───────────────────────────────────────────────────────
CREATE VIEW ai.cl_ss_overrides AS
SELECT o.company AS company_name, lower(regexp_replace(btrim(o.company), '\s+', ' ', 'g')) AS company_key, o.field,
       o.fiscal_year, o.quarter, o.value, o.note, (SELECT u.name FROM users u WHERE lower(u.email) = lower(o.edited_by) LIMIT 1) AS edited_by, o.edited_at
  FROM stock_selection_override o;
COMMENT ON VIEW ai.cl_ss_overrides IS 'Correcciones manuales de admin sobre los inputs de Stock Selection Chile, por período. Ganan sobre la ficha en ese trimestre.';
COMMENT ON COLUMN ai.cl_ss_overrides.company_name IS 'Compañía como la escribió el admin.';
COMMENT ON COLUMN ai.cl_ss_overrides.company_key IS '= cl_ss_universe.company_key.';
COMMENT ON COLUMN ai.cl_ss_overrides.field IS 'Campo editado (sharesTotal, ebitdaN, debtN…).';
COMMENT ON COLUMN ai.cl_ss_overrides.fiscal_year IS 'Año del período al que aplica.';
COMMENT ON COLUMN ai.cl_ss_overrides.quarter IS 'Trimestre al que aplica.';
COMMENT ON COLUMN ai.cl_ss_overrides.value IS 'Valor (millones, moneda reportada; NULL = borrado).';
COMMENT ON COLUMN ai.cl_ss_overrides.note IS 'Nota.';
COMMENT ON COLUMN ai.cl_ss_overrides.edited_by IS 'Nombre de quien editó.';
COMMENT ON COLUMN ai.cl_ss_overrides.edited_at IS 'Cuándo.';

-- ── ai.cl_index_membership ───────────────────────────────────────────────────
CREATE VIEW ai.cl_index_membership AS
SELECT m.index_name, m.company AS company_name, m.weight FROM index_membership m;
COMMENT ON VIEW ai.cl_index_membership IS 'Pertenencia de las compañías chilenas a los índices locales (IPSA, IGPA y sub-índices, FTSE). company_name es el nombre corto de Chile (= cl_ss_universe.company_name).';
COMMENT ON COLUMN ai.cl_index_membership.index_name IS '''IPSA'', ''IGPA'', ''IGPA LC'', ''IGPA MC'', ''IGPA SC'', ''IGPA MCSC'', ''FTSE''.';
COMMENT ON COLUMN ai.cl_index_membership.company_name IS 'Compañía (nombre corto de Chile).';
COMMENT ON COLUMN ai.cl_index_membership.weight IS '1 = pertenece (se usa como ponderador binario).';

-- ── ai.fund_holdings ─────────────────────────────────────────────────────────
CREATE VIEW ai.fund_holdings AS
SELECT c.as_of, c.fondo AS fund, (CASE WHEN c.ticker_bbg ~* ' (INDEX|CURNCY|COMDTY|CORP|GOVT|EQUITY)$' THEN upper(c.ticker_bbg) ELSE upper(c.ticker_bbg) || ' EQUITY' END) AS bbg_ticker, c.company AS company_name, c.shares AS shares_mn, c.source AS source_file
  FROM carteras c;
COMMENT ON VIEW ai.fund_holdings IS 'Posiciones mensuales de los fondos propios en acciones chilenas (Pionero, MRV, MCF, Orange, FIMs…): número de acciones que tiene cada fondo de cada papel. Foto por mes.';
COMMENT ON COLUMN ai.fund_holdings.as_of IS 'Mes de la foto (primer día del mes).';
COMMENT ON COLUMN ai.fund_holdings.fund IS 'Fondo.';
COMMENT ON COLUMN ai.fund_holdings.bbg_ticker IS 'Ticker Bloomberg canónico en MAYÚSCULA con yellow key ("CAP CI EQUITY"). Cruza por igualdad con securities.bbg_ticker.';
COMMENT ON COLUMN ai.fund_holdings.company_name IS 'Nombre informativo del Excel.';
COMMENT ON COLUMN ai.fund_holdings.shares_mn IS 'Acciones que tiene el fondo, en MILLONES.';
COMMENT ON COLUMN ai.fund_holdings.source_file IS 'Archivo cargado.';

-- ── ai.fund_benchmark_weights ────────────────────────────────────────────────
CREATE VIEW ai.fund_benchmark_weights AS
SELECT w.fund_name AS fund, w.report_date, w.company AS security,
       (CASE WHEN w.company ~* ' (EQUITY|INDEX|CURNCY|COMDTY)$' THEN upper(w.company) END) AS bbg_ticker,
       w.portfolio_weight, w.benchmark_name, w.benchmark_weight, w.overweight
  FROM fund_portfolio_weights w;
COMMENT ON VIEW ai.fund_benchmark_weights IS 'Pesos de cada fondo contra su benchmark, por papel y fecha de reporte. security es un ticker Bloomberg en algunos fondos y un nombre de empresa en otros: bbg_ticker sólo viene lleno cuando es ticker. Pesos en DECIMAL (0.08 = 8%).';
COMMENT ON COLUMN ai.fund_benchmark_weights.fund IS 'Fondo.';
COMMENT ON COLUMN ai.fund_benchmark_weights.report_date IS 'Fecha del reporte.';
COMMENT ON COLUMN ai.fund_benchmark_weights.security IS 'Papel (ticker o nombre).';
COMMENT ON COLUMN ai.fund_benchmark_weights.bbg_ticker IS 'Ticker si security es un ticker; si no, NULL (cruzar por nombre con securities.company_name, con cuidado).';
COMMENT ON COLUMN ai.fund_benchmark_weights.portfolio_weight IS 'Peso en el fondo, DECIMAL.';
COMMENT ON COLUMN ai.fund_benchmark_weights.benchmark_name IS 'Benchmark.';
COMMENT ON COLUMN ai.fund_benchmark_weights.benchmark_weight IS 'Peso en el benchmark, DECIMAL.';
COMMENT ON COLUMN ai.fund_benchmark_weights.overweight IS 'Sobre/sub-ponderación, DECIMAL.';

-- ── ai.fund_peer_returns ─────────────────────────────────────────────────────
CREATE VIEW ai.fund_peer_returns AS
SELECT r.report_date, r.familia AS family, r.currency, r.fund, r.subfamilia AS fund_group, (r.subfamilia = 'Moneda Funds') AS is_moneda,
       NULLIF(btrim(r.code), '') AS code, NULLIF(btrim(r.manager), '') AS manager, r.mgmt_fee AS mgmt_fee_pct, r.nav, r.aum_usd_mm,
       r.mtd AS ret_mtd_pct, r.ytd AS ret_ytd_pct, r.ret_1y AS ret_1y_pct, r.ret_2y AS ret_2y_ann_pct, r.cum_2y AS ret_2y_cum_pct,
       r.ret_3y AS ret_3y_ann_pct, r.ret_5y AS ret_5y_ann_pct, r.ret_10y AS ret_10y_ann_pct,
       r.si1_cum AS since_inception_1_cum_pct, r.si1_ann AS since_inception_1_ann_pct, r.si2_ann AS since_inception_2_ann_pct,
       r.sigma AS volatility_pct, r.sharpe, r.alpha AS alpha_pct, r.beta,
       (r.report_date = max(r.report_date) OVER (PARTITION BY r.familia)) AS is_latest
  FROM moneda_fund_returns r;
COMMENT ON VIEW ai.fund_peer_returns IS 'Retornos y métricas de fondos de Moneda, fondos pares, índices y monedas (Excel de rentabilidades, varios informes por semana). Granularidad: fondo/serie DENTRO DE UNA FAMILIA (estrategia de comparación). OJO: el mismo índice (IPSA, Ibovespa, CEMBI…) se repite en varias familias con since-inception distinto → filtrá por family y no sumes/promedies entre familias. Retornos, sigma, alpha y fee en % (68.6 = 68,6%); beta como ratio.';
COMMENT ON COLUMN ai.fund_peer_returns.report_date IS 'Fecha del informe.';
COMMENT ON COLUMN ai.fund_peer_returns.family IS 'Familia (estrategia) del informe: ''Chilean Equities SC'' (Pionero), ''Chilean Equities LC'' (MRV, Orange), ''Latam Equities LC'' (MLE), ''Latam Equities SC'' (MSC), ''Latam Equities LC - Glory'', ''Latam Equities LC - MDELA'' (Mercer), ''Brazil Long Bias'', ''Brazil Long Only'', renta fija, CLO, etc.';
COMMENT ON COLUMN ai.fund_peer_returns.currency IS 'Moneda en que están medidos los retornos de la fila.';
COMMENT ON COLUMN ai.fund_peer_returns.fund IS 'Fondo, serie o índice (''Pionero A'', ''IPSA'').';
COMMENT ON COLUMN ai.fund_peer_returns.fund_group IS 'Subfamilia: ''Moneda Funds'', ''Peer Group (…)'', ''Indices'', ''Currencies''.';
COMMENT ON COLUMN ai.fund_peer_returns.is_moneda IS 'true = fondo/serie de Moneda.';
COMMENT ON COLUMN ai.fund_peer_returns.code IS 'Código Bloomberg o interno de la fila (''CFIPIONERO'', ''IPSA Index'').';
COMMENT ON COLUMN ai.fund_peer_returns.manager IS 'Administradora.';
COMMENT ON COLUMN ai.fund_peer_returns.mgmt_fee_pct IS 'Comisión de administración, %.';
COMMENT ON COLUMN ai.fund_peer_returns.nav IS 'Valor cuota (o nivel del índice).';
COMMENT ON COLUMN ai.fund_peer_returns.aum_usd_mm IS 'Patrimonio en MILLONES de USD.';
COMMENT ON COLUMN ai.fund_peer_returns.ret_mtd_pct IS 'Retorno del mes, %.';
COMMENT ON COLUMN ai.fund_peer_returns.ret_ytd_pct IS 'Retorno del año, %.';
COMMENT ON COLUMN ai.fund_peer_returns.ret_1y_pct IS 'Retorno 12 meses, %.';
COMMENT ON COLUMN ai.fund_peer_returns.ret_2y_ann_pct IS 'Retorno 2 años ANUALIZADO, %.';
COMMENT ON COLUMN ai.fund_peer_returns.ret_2y_cum_pct IS 'Retorno 2 años ACUMULADO, %.';
COMMENT ON COLUMN ai.fund_peer_returns.ret_3y_ann_pct IS 'Retorno 3 años anualizado, %.';
COMMENT ON COLUMN ai.fund_peer_returns.ret_5y_ann_pct IS 'Retorno 5 años anualizado, %.';
COMMENT ON COLUMN ai.fund_peer_returns.ret_10y_ann_pct IS 'Retorno 10 años anualizado, %.';
COMMENT ON COLUMN ai.fund_peer_returns.since_inception_1_cum_pct IS 'Retorno ACUMULADO desde el inicio de referencia 1 de la familia, %.';
COMMENT ON COLUMN ai.fund_peer_returns.since_inception_1_ann_pct IS 'Retorno ANUALIZADO desde el inicio de referencia 1 de la familia, %.';
COMMENT ON COLUMN ai.fund_peer_returns.since_inception_2_ann_pct IS 'Retorno ANUALIZADO desde el inicio de referencia 2 de la familia (p.ej. el de Orange en Chilean Equities LC), %.';
COMMENT ON COLUMN ai.fund_peer_returns.volatility_pct IS 'Volatilidad (sigma), %.';
COMMENT ON COLUMN ai.fund_peer_returns.sharpe IS 'Sharpe.';
COMMENT ON COLUMN ai.fund_peer_returns.alpha_pct IS 'Alpha, %.';
COMMENT ON COLUMN ai.fund_peer_returns.beta IS 'Beta (ratio, 0.98).';
COMMENT ON COLUMN ai.fund_peer_returns.is_latest IS 'true = es la foto más reciente de esa familia (último informe cargado). Filtrá por esto para "el dato actual".';

-- ── ai.analysts ──────────────────────────────────────────────────────────────
CREATE VIEW ai.analysts AS
SELECT u.id, u.name, u.initials, u.role FROM users u;
COMMENT ON VIEW ai.analysts IS 'Personas del equipo (usuarios de la app). Sin credenciales ni emails.';
COMMENT ON COLUMN ai.analysts.id IS 'Id (referenciado por planning_tasks).';
COMMENT ON COLUMN ai.analysts.name IS 'Nombre.';
COMMENT ON COLUMN ai.analysts.initials IS 'Siglas usadas en el calendario (''DM'', ''AP'').';
COMMENT ON COLUMN ai.analysts.role IS '''admin'' | ''user''.';

-- ── ai.planning_calendar_items ───────────────────────────────────────────────
CREATE VIEW ai.planning_calendar_items AS
SELECT w.id, w.region, w.week_start, w.topic, w.category, w.all_analysts, w.highlighted, w.notes, w.sort_order,
       (SELECT string_agg(u.initials, ' / ' ORDER BY u.initials) FROM weekly_plan_analysts a JOIN users u ON u.id = a.user_id WHERE a.weekly_plan_id = w.id) AS analysts,
       w.updated_at
  FROM weekly_plan w;
COMMENT ON VIEW ai.planning_calendar_items IS 'Calendario macro de research del equipo: actividades agendadas por región y semana (updates, resultados, top picks…).';
COMMENT ON COLUMN ai.planning_calendar_items.id IS 'Id.';
COMMENT ON COLUMN ai.planning_calendar_items.region IS '''CHILE'' | ''LATAM''.';
COMMENT ON COLUMN ai.planning_calendar_items.week_start IS 'Lunes de la semana.';
COMMENT ON COLUMN ai.planning_calendar_items.topic IS 'Actividad (''Update: Hapag-Vapores'').';
COMMENT ON COLUMN ai.planning_calendar_items.category IS '''update'' | ''banks'' | ''top_picks'' | ''results'' | ''alert'' | ''holiday'' | ''none''.';
COMMENT ON COLUMN ai.planning_calendar_items.all_analysts IS 'true = semana de todo el equipo.';
COMMENT ON COLUMN ai.planning_calendar_items.highlighted IS 'true = semana a vigilar.';
COMMENT ON COLUMN ai.planning_calendar_items.notes IS 'Notas.';
COMMENT ON COLUMN ai.planning_calendar_items.sort_order IS 'Orden dentro de la celda (región × semana).';
COMMENT ON COLUMN ai.planning_calendar_items.analysts IS 'Siglas de los analistas a cargo, unidas por '' / ''.';
COMMENT ON COLUMN ai.planning_calendar_items.updated_at IS 'Última edición.';

-- ── ai.planning_tasks ────────────────────────────────────────────────────────
CREATE VIEW ai.planning_tasks AS
SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, t.completed_at, s.name AS sector, ss.name AS section,
       ua.name AS assignee, ua.initials AS assignee_initials, uc.name AS created_by, t.company AS company_name,
       t.weekly_plan_id AS calendar_item_id, t.created_at, t.updated_at
  FROM tasks t
  JOIN sector_sections ss ON ss.id = t.section_id
  JOIN sectors s ON s.id = ss.sector_id
  LEFT JOIN users ua ON ua.id = t.assignee_id
  LEFT JOIN users uc ON uc.id = t.created_by_id;
COMMENT ON VIEW ai.planning_tasks IS 'Tareas del equipo (Team Planning), por sector y sub-sección.';
COMMENT ON COLUMN ai.planning_tasks.id IS 'Id.';
COMMENT ON COLUMN ai.planning_tasks.title IS 'Título.';
COMMENT ON COLUMN ai.planning_tasks.description IS 'Descripción.';
COMMENT ON COLUMN ai.planning_tasks.status IS '''todo'' | ''in_progress'' | ''done''.';
COMMENT ON COLUMN ai.planning_tasks.priority IS '''low'' | ''medium'' | ''high''.';
COMMENT ON COLUMN ai.planning_tasks.due_date IS 'Fecha límite.';
COMMENT ON COLUMN ai.planning_tasks.completed_at IS 'Cuándo se completó.';
COMMENT ON COLUMN ai.planning_tasks.sector IS 'Sector del equipo.';
COMMENT ON COLUMN ai.planning_tasks.section IS 'Sub-sección del sector.';
COMMENT ON COLUMN ai.planning_tasks.assignee IS 'Nombre del responsable.';
COMMENT ON COLUMN ai.planning_tasks.assignee_initials IS 'Siglas del responsable.';
COMMENT ON COLUMN ai.planning_tasks.created_by IS 'Nombre de quien la creó.';
COMMENT ON COLUMN ai.planning_tasks.company_name IS 'Empresa relacionada (= securities.company_name), si aplica.';
COMMENT ON COLUMN ai.planning_tasks.calendar_item_id IS 'planning_calendar_items.id, si cuelga del calendario.';
COMMENT ON COLUMN ai.planning_tasks.created_at IS 'Creada.';
COMMENT ON COLUMN ai.planning_tasks.updated_at IS 'Última edición.';

-- ── ai.planning_task_comments ────────────────────────────────────────────────
CREATE VIEW ai.planning_task_comments AS
SELECT c.id, c.task_id, u.name AS author, c.body, c.created_at
  FROM task_comments c LEFT JOIN users u ON u.id = c.author_id;
COMMENT ON VIEW ai.planning_task_comments IS 'Comentarios en las tareas (revisiones y avances).';
COMMENT ON COLUMN ai.planning_task_comments.id IS 'Id.';
COMMENT ON COLUMN ai.planning_task_comments.task_id IS 'planning_tasks.id.';
COMMENT ON COLUMN ai.planning_task_comments.author IS 'Nombre del autor.';
COMMENT ON COLUMN ai.planning_task_comments.body IS 'Comentario.';
COMMENT ON COLUMN ai.planning_task_comments.created_at IS 'Fecha.';

-- ── ai.useful_links ──────────────────────────────────────────────────────────
CREATE VIEW ai.useful_links AS
SELECT l.id, l.name, l.url, l.description, s.name AS section, l.sort_order, l.created_at
  FROM analyst_links l LEFT JOIN link_sections s ON s.id = l.section_id;
COMMENT ON VIEW ai.useful_links IS 'Links a herramientas y ejercicios del equipo (vista Useful Links).';
COMMENT ON COLUMN ai.useful_links.id IS 'Id.';
COMMENT ON COLUMN ai.useful_links.name IS 'Nombre.';
COMMENT ON COLUMN ai.useful_links.url IS 'URL.';
COMMENT ON COLUMN ai.useful_links.description IS 'Descripción.';
COMMENT ON COLUMN ai.useful_links.section IS 'Sección.';
COMMENT ON COLUMN ai.useful_links.sort_order IS 'Orden.';
COMMENT ON COLUMN ai.useful_links.created_at IS 'Creado.';

-- ── Comentarios que faltaban en tablas de public (documentación para desarrollo) ──
COMMENT ON TABLE public.admin_change_log IS 'Bitácora append-only de todo cambio que un admin hace desde la web (entidad, llave, campo, valor anterior/nuevo, quién y cuándo). Permite revertir. No es data de negocio.';
COMMENT ON TABLE public.fichas IS 'Fichas en PDF (tearsheets) de una empresa o multi-empresa, guardadas en R2. Una viva por ticker. Vista para IA: ai.tearsheet_pdfs.';
COMMENT ON TABLE public.ficha_tickers IS 'Empresas de cada ficha PDF multi-empresa. Vista para IA: ai.tearsheet_pdf_securities.';
COMMENT ON TABLE public.pick_sectors IS 'Sectores de Top Picks, por región (CHILE / LATAM).';
COMMENT ON TABLE public.pick_sector_members IS 'Analistas de cada sector de Top Picks (quién puede agregar picks; picks de no-miembros quedan legacy).';
COMMENT ON TABLE public.sectors IS 'Sectores del Team Planning (grilla de tareas). is_general = Coordinación General.';
COMMENT ON TABLE public.sector_members IS 'Analistas de cada sector del Team Planning (miembro = puede escribir).';
COMMENT ON TABLE public.sector_sections IS 'Sub-secciones de cada sector del Team Planning; las tareas cuelgan de una sub-sección.';
COMMENT ON TABLE public.stock_selection_hidden IS 'Compañías de Stock Selection Chile ocultadas a mano (capa de visibilidad, no borra datos). Llave = stock_selection_orden.company.';
COMMENT ON TABLE public.ticker_return_snapshot IS 'Retornos totales (Bloomberg, dividendos brutos) — única tabla de retornos. Snapshot: cada carga reemplaza la tabla. Ticker sin " Equity". Retornos en decimal; 3y/5y anualizados. Vista para IA: ai.mkt_total_returns.';
COMMENT ON TABLE public.top_pick_periods IS 'Cabecera de cada período de Top Picks (región, período, fecha de cierre del informe). Vista para IA: ai.top_pick_periods.';

-- ── Permisos: claude_ro lee SÓLO ai ─────────────────────────────────────────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM claude_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM claude_ro;
REVOKE ALL ON SCHEMA public FROM claude_ro;
-- El DEFAULT PRIVILEGES heredado le daba SELECT en toda tabla nueva de public: se cierra.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE SELECT ON TABLES FROM claude_ro;

GRANT USAGE ON SCHEMA ai TO claude_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA ai TO claude_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ai GRANT SELECT ON TABLES TO claude_ro;
-- Nombres sin prefijo ("SELECT * FROM securities") resuelven a ai. Aplica a sesiones nuevas.
ALTER ROLE claude_ro SET search_path = ai;

-- Bot de Q&A de Telegram (lib/qaBot): mismo alcance que claude_ro, con su propio usuario. El
-- DROP SCHEMA de arriba le borra los permisos, así que se le vuelven a dar si el rol existe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qa_bot_ro') THEN
    GRANT USAGE ON SCHEMA ai TO qa_bot_ro;
    GRANT SELECT ON ALL TABLES IN SCHEMA ai TO qa_bot_ro;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ai GRANT SELECT ON TABLES TO qa_bot_ro;
  END IF;
END $$;

COMMIT;

-- Verificación (deben dar: N vistas / false / true):
--   SELECT count(*) FROM information_schema.views WHERE table_schema = 'ai';
--   SELECT has_table_privilege('claude_ro', 'public.model_headers', 'SELECT');
--   SELECT has_table_privilege('claude_ro', 'ai.securities', 'SELECT');
