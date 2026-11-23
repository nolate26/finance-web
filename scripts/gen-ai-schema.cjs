// Genera la capa "ai" (vistas para el MCP de los analistas y el bot de Telegram):
//   prisma/sql/phase_c_ai_schema_2026-11-23.sql  ← el SQL que se aplica con `npx prisma db execute --file`
//   scripts/.ai-views.json                         ← cuerpos de las vistas, para validar
//
// Uso:  node scripts/gen-ai-schema.cjs
//       node scripts/validate-ai-schema.cjs .env scripts/.ai-views.json   (sólo lectura contra la base:
//         compila cada vista, cuenta filas y verifica que cada columna tenga comentario)
//
// Para cambiar una vista o sumar una tabla nueva: editar acá, regenerar, validar y volver a correr
// el SQL (es re-ejecutable). Ver la nota de mantenimiento en el encabezado del SQL generado.
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");

// ── SQL macros (inlined so every view only depends on public tables) ─────────────
const num = (t) => String.raw`(CASE WHEN btrim(replace(replace(${t}, '%', ''), ',', '')) ~ '^[+-]?[0-9]*\.?[0-9]+$' THEN btrim(replace(replace(${t}, '%', ''), ',', ''))::numeric END)`;
const rec = (t) => String.raw`(CASE WHEN upper(btrim(${t})) IN ('BUY','COMPRAR','OVERWEIGHT','OW','OUTPERFORM','STRONG BUY') THEN 'BUY' WHEN upper(btrim(${t})) IN ('HOLD','MANTENER','NEUTRAL','MW','MARKET WEIGHT','EQUAL WEIGHT','MARKETPERFORM') THEN 'HOLD' WHEN upper(btrim(${t})) IN ('SELL','VENDER','UNDERWEIGHT','UW','UNDERPERFORM') THEN 'SELL' END)`;
const eqTicker = (t) => String.raw`(CASE WHEN ${t} ~* ' (INDEX|CURNCY|COMDTY|CORP|GOVT|EQUITY)$' THEN upper(${t}) ELSE upper(${t}) || ' EQUITY' END)`;
const ccy = (t) => String.raw`upper(substring(btrim(${t}) from '^[A-Za-z]{3}'))`;
const userName = (t) => `(SELECT u.name FROM users u WHERE lower(u.email) = lower(${t}) LIMIT 1)`;
const nz = (t) => `NULLIF(btrim(${t}), '')`;

const TICKER = "Ticker Bloomberg canónico en MAYÚSCULA con yellow key (\"CAP CI EQUITY\"). Cruza por igualdad con securities.bbg_ticker.";
const LATEST = (scope) => `true = es la foto más reciente ${scope}. Filtrá por esto para "el dato actual".`;

const views = [];
const V = (name, comment, sql, columns) => views.push({ name, comment, sql: sql.trim(), columns });

// ════════════════════════ MAESTRA ════════════════════════
V("securities",
  "MAESTRA de papeles (= public.empresas_industrias_v2, alias \"la maestra\"). Punto de partida de casi toda consulta. OJO: UNA FILA POR PAPEL LISTADO, NO POR EMPRESA: una misma empresa puede tener varias filas (acción local A/B, ADR en US…), p.ej. GERDAU tiene 5 y SOQUIMICH 4. Para contar o agregar por empresa agrupá por company_name, y NUNCA sumes pesos/montos después de hacer JOIN por company_name (duplica). La llave de cruce con todo lo demás es bbg_ticker.",
  `
SELECT e.ticker_bloomberg                         AS bbg_ticker,
       e.nombre_latam                             AS company_name,
       ${nz("e.nombre_chile")}                    AS local_name,
       ${nz("e.isin")}                            AS isin,
       ${nz("upper(e.moneda)")}                   AS currency,
       ${nz("upper(e.country_risk)")}             AS country_code,
       ${nz("e.industria_gics")}                  AS gics_industry,
       ${nz("e.industria_chile")}                 AS cl_sector,
       ${nz("e.yahoo_finance_ticker")}            AS yahoo_ticker,
       e.company_description                      AS description,
       count(*) OVER (PARTITION BY e.nombre_latam)::int AS listings_of_company
  FROM empresas_industrias_v2 e`,
  {
    bbg_ticker: TICKER + " Único en esta vista.",
    company_name: "Nombre de la EMPRESA (no del papel). Se repite en sus distintos listados.",
    local_name: "Nombre corto que usa el equipo de Chile (\"Andina-B\", \"Aguas-A\"). NULL fuera de Chile.",
    isin: "ISIN del papel.",
    currency: "Moneda en que cotiza el papel (CLP, BRL, MXN, USD…). Es la moneda de precio, market cap y target price de ese ticker.",
    country_code: "País de riesgo, código ISO de 2 letras (CL, BR, MX, PE, CO, AR, US…; OT = otro).",
    gics_industry: "Industria GICS.",
    cl_sector: "Sector según la clasificación del equipo de Chile. NULL fuera de Chile.",
    yahoo_ticker: "Ticker de Yahoo Finance (precio en vivo de la app). NULL si no tiene.",
    description: "Descripción de la empresa (texto libre).",
    listings_of_company: "Cuántas filas (papeles) tiene la misma empresa en esta vista. >1 = cuidado con duplicar al agregar.",
  });

V("security_aliases",
  "Nombres alternativos → papel de la maestra. Hoy una sola fuente: 'track_record', los nemotécnicos/nombres viejos que usa analyst_call_history.company_alias (\"ANDINA-B\", \"NUEVAPOLAR\"). in_master = false: el papel no está en la maestra (deslistado, fusionado o fuera de cobertura) y sólo tiene isin / yahoo_ticker.",
  `
SELECT sa.alias_source,
       sa.alias,
       sa.bbg_ticker,
       COALESCE(sa.isin, ${nz("e.isin")})                     AS isin,
       COALESCE(sa.yahoo_ticker, ${nz("e.yahoo_finance_ticker")}) AS yahoo_ticker,
       (sa.bbg_ticker IS NOT NULL)                            AS in_master,
       sa.note
  FROM security_aliases sa
  LEFT JOIN empresas_industrias_v2 e ON e.ticker_bloomberg = sa.bbg_ticker`,
  {
    alias_source: "De qué fuente es el alias. Valores: 'track_record'.",
    alias: "El nombre tal como lo escribe la fuente (match exacto).",
    bbg_ticker: TICKER + " NULL si el papel no está en la maestra.",
    isin: "ISIN efectivo (el del alias o, si no tiene, el de la maestra).",
    yahoo_ticker: "Ticker Yahoo efectivo (el del alias manda sobre el de la maestra).",
    in_master: "true = el alias apunta a un papel de la maestra.",
    note: "Nota libre (p.ej. fusión que explica el vínculo).",
  });

// ════════════════════════ MERCADO (Bloomberg) ════════════════════════
V("mkt_valuation_monthly",
  "Múltiplos de valuación históricos de Bloomberg, serie MENSUAL ~10 años, por papel. Para el múltiplo actual: la fila con mayor date del ticker.",
  `
SELECT v.ticker AS bbg_ticker, v.date, v."peFwd" AS pe_fwd, v."evEbitdaFwd" AS ev_ebitda_fwd,
       v.pbv AS pb, v."roeFwd" AS roe_fwd
  FROM valuation_history v`,
  {
    bbg_ticker: TICKER, date: "Fecha de la observación (fin de mes, salvo la última que es la foto más reciente).",
    pe_fwd: "P/E forward 12 meses (veces).", ev_ebitda_fwd: "EV/EBITDA forward 12 meses (veces).",
    pb: "Precio / valor libro (veces).", roe_fwd: "ROE forward en DECIMAL (0.12 = 12%).",
  });

V("mkt_consensus_estimates",
  "Estimaciones de CONSENSO sell-side (Bloomberg) por papel, métrica y año fiscal, con historia: cada snapshot_date es una foto del consenso. Para el consenso vigente usá is_latest = true. Montos en MILLONES de la moneda de reporte de la empresa (no necesariamente la de cotización).",
  `
SELECT c.ticker AS bbg_ticker, c.date AS snapshot_date, upper(c.metric) AS metric,
       (CASE WHEN c.period ~ '^[0-9]{4}$' THEN c.period::int END) AS fiscal_year,
       c.value AS value_mn,
       (c.date = max(c.date) OVER (PARTITION BY c.ticker, c.metric, c.period)) AS is_latest
  FROM consensus_estimates c`,
  {
    bbg_ticker: TICKER, snapshot_date: "Fecha de la foto del consenso (NO el período estimado).",
    metric: "Métrica: 'REVENUE', 'EBITDA', 'NET_INCOME'.", fiscal_year: "Año fiscal estimado (2026, 2027…).",
    value_mn: "Valor estimado, en MILLONES de la moneda de reporte.", is_latest: LATEST("para (ticker, métrica, año)"),
  });

V("mkt_price_vs_earnings_monthly",
  "Precio vs utilidad blended 12 meses (consenso), serie mensual ~5 años. Alimenta el gráfico Price vs Earnings.",
  `
SELECT p.ticker AS bbg_ticker, p.date, p."pxLast" AS px_last, p.ni1bf AS net_income_blended_12m_mn
  FROM price_vs_earnings p`,
  {
    bbg_ticker: TICKER, date: "Fecha (fin de mes).", px_last: "Precio de cierre, moneda de cotización del papel.",
    net_income_blended_12m_mn: "Utilidad neta de consenso blended a 12 meses, en MILLONES de la moneda de reporte.",
  });

V("mkt_short_interest",
  "Short interest ratio (días para cubrir) por papel, fotos acumuladas.",
  `
SELECT s.ticker AS bbg_ticker, s.date, s."shortIntRatio" AS short_interest_ratio,
       (s.date = max(s.date) OVER (PARTITION BY s.ticker)) AS is_latest
  FROM short_interest s`,
  { bbg_ticker: TICKER, date: "Fecha de la foto.", short_interest_ratio: "Short interest ratio (días para cubrir).", is_latest: LATEST("del ticker") });

V("mkt_price_snapshots",
  "Fotos de precio de Bloomberg por papel (semanal aprox.): último precio, rango de 52 semanas y market cap. Para el precio actual: is_latest = true.",
  `
SELECT p.ticker AS bbg_ticker, p.date, p."pxLast" AS px_last, p."high52w" AS high_52w, p."low52w" AS low_52w,
       p."pctRange" AS pct_of_52w_range, p.market_cap,
       (p.date = max(p.date) OVER (PARTITION BY p.ticker)) AS is_latest
  FROM price_range_52w p`,
  {
    bbg_ticker: TICKER, date: "Fecha de la foto.", px_last: "Precio de cierre, en la moneda de cotización (securities.currency).",
    high_52w: "Máximo de 52 semanas.", low_52w: "Mínimo de 52 semanas.",
    pct_of_52w_range: "Posición del precio dentro del rango 52s, de 0 a 100 (0 = en el mínimo, 100 = en el máximo).",
    market_cap: "Market cap de Bloomberg en UNIDADES de la moneda de cotización (no millones). En papeles de doble serie es el de la EMPRESA consolidada. NULL en fotos antiguas.",
    is_latest: LATEST("del ticker"),
  });

V("mkt_consensus_ratings",
  "Consenso de recomendaciones sell-side (Bloomberg): cuántos analistas dicen buy/hold/sell y el target price promedio. NO confundir con analyst_call_history (recomendaciones INTERNAS del equipo).",
  `
SELECT r.ticker AS bbg_ticker, r.date, r."totAnalysts" AS n_analysts, r.buy AS n_buy, r.hold AS n_hold, r.sell AS n_sell,
       ${rec("r.consenso")} AS consensus_rating, r."targetPrice" AS consensus_target_price,
       (r.date = max(r.date) OVER (PARTITION BY r.ticker)) AS is_latest
  FROM analyst_recommendations r`,
  {
    bbg_ticker: TICKER, date: "Fecha de la foto.", n_analysts: "Analistas que cubren el papel.",
    n_buy: "Cuántos recomiendan comprar.", n_hold: "Cuántos recomiendan mantener.", n_sell: "Cuántos recomiendan vender.",
    consensus_rating: "Consenso normalizado: 'BUY' | 'HOLD' | 'SELL'.",
    consensus_target_price: "Target price promedio del consenso, moneda de cotización.", is_latest: LATEST("del ticker"),
  });

V("mkt_total_returns",
  "Retornos totales (precio + dividendos brutos reinvertidos, Bloomberg) — la ÚNICA tabla de retornos. Una sola foto vigente por ticker (se reemplaza en cada carga). Cubre el universo de Stock Selection Chile más índices (IPSA, IGPA…), monedas y commodities. Retornos en DECIMAL (0.0512 = +5,12%).",
  `
SELECT ${eqTicker("t.ticker_bbg")} AS bbg_ticker, t.ticker_bbg AS source_ticker, t.company AS label, t.as_of, t.currency,
       t.price, t.ret_month AS ret_1m, t.ret_ytd, t.ret_year AS ret_1y, t.ret_3y AS ret_3y_annualized,
       t.ret_5y AS ret_5y_annualized, t.source
  FROM ticker_return_snapshot t`,
  {
    bbg_ticker: TICKER + " Para índices/monedas/commodities queda con su yellow key (\"IPSA INDEX\", \"CLP CURNCY\").",
    source_ticker: "Ticker tal como lo carga el script (sin \" EQUITY\").", label: "Nombre informativo.",
    as_of: "Fecha a la que corresponden los retornos.", currency: "Moneda del precio.", price: "Precio de la fuente (control).",
    ret_1m: "Retorno total último mes, DECIMAL.", ret_ytd: "Retorno total en lo que va del año, DECIMAL.",
    ret_1y: "Retorno total 12 meses, DECIMAL.", ret_3y_annualized: "Retorno total 3 años ANUALIZADO (CAGR), DECIMAL.",
    ret_5y_annualized: "Retorno total 5 años ANUALIZADO (CAGR), DECIMAL.", source: "Origen de la carga (\"bloomberg\").",
  });

// ════════════════════════ MACRO ════════════════════════
V("macro_indicator_history",
  "Series históricas macro por país (diarias/mensuales según el indicador).",
  `SELECT m.date::date AS date, m.pais AS country, m.indicador AS indicator, m.valor AS value FROM "MacroHistorico" m`,
  { date: "Fecha.", country: "País (en inglés: 'Chile', 'Brazil', 'United States'…).", indicator: "Indicador, con su unidad en el nombre ('10Y Yield (%)', 'FX Spot'…).", value: "Valor, en la unidad del indicador." });

V("macro_indicator_forecasts",
  "Proyecciones macro (GDP, inflación…) por país para el año en curso y los dos siguientes, por foto. Usá is_latest = true para la vigente.",
  `
SELECT m."snapshotDate"::date AS snapshot_date, extract(year FROM m."snapshotDate")::int AS base_year,
       m.country, m.indicator,
       ${num('m."current_Y0"')} AS forecast_y0, ${num('m."current_Y1"')} AS forecast_y1, ${num('m."current_Y2"')} AS forecast_y2,
       ${num('m."prev_3mAgo"')} AS forecast_y0_3m_ago,
       (m."snapshotDate"::date = max(m."snapshotDate"::date) OVER ()) AS is_latest
  FROM "MacroForecasts" m`,
  {
    snapshot_date: "Fecha de la foto.", base_year: "Año Y0 de la foto (forecast_y0 es para este año).",
    country: "País o 'World'.", indicator: "'GDP' (crecimiento %), 'Inflation' (%), etc.",
    forecast_y0: "Proyección para base_year, en % (3.0 = 3%).", forecast_y1: "Proyección para base_year + 1, en %.",
    forecast_y2: "Proyección para base_year + 2, en %.", forecast_y0_3m_ago: "Lo que se proyectaba para base_year hace 3 meses, en %.",
    is_latest: LATEST("del set"),
  });

V("macro_commodity_prices",
  "Precios históricos de commodities e índices de commodities. La unidad va en el nombre del commodity.",
  `SELECT c.date::date AS date, c.commodity, c.precio AS price FROM "CommodityHistorico" c`,
  { date: "Fecha.", commodity: "Nombre con unidad ('Copper Spot LME (USD/t)', 'Brent Crude Oil (USD/bbl)'…).", price: "Precio en la unidad del nombre." });

V("macro_commodity_forecasts",
  "Proyecciones de commodities por trimestre: spot, curva forward y forecast de analistas, por foto. Usá is_latest = true.",
  `
SELECT c."snapshotDate"::date AS snapshot_date, c.commodity, c.quarter AS quarter_label, c."spotCurrent" AS spot_price,
       ${num('c."fwdCurve"')} AS forward_price, ${num('c."analystForecast"')} AS analyst_forecast,
       (c."snapshotDate"::date = max(c."snapshotDate"::date) OVER ()) AS is_latest
  FROM "CommodityForecasts" c`,
  {
    snapshot_date: "Fecha de la foto.", commodity: "Nombre con unidad.", quarter_label: "Trimestre proyectado, formato 'Q127' = 1T 2027.",
    spot_price: "Precio spot a la fecha de la foto.", forward_price: "Precio de la curva forward para ese trimestre.",
    analyst_forecast: "Forecast de consenso de analistas para ese trimestre.", is_latest: LATEST("del set"),
  });

V("macro_index_pe_history",
  "P/E histórico de índices bursátiles (MSCI, S&P…).",
  `SELECT p.date::date AS date, p.indice AS index_name, p."peValue" AS pe FROM "PeHistorico" p`,
  { date: "Fecha.", index_name: "Índice.", pe: "P/E (veces)." });

V("macro_index_pe_summary",
  "P/E actual de cada índice contra su historia (promedio y bandas ±1 desviación estándar), por foto. Usá is_latest = true.",
  `
SELECT p."snapshotDate"::date AS snapshot_date, p.index AS index_name, p."todayPE" AS pe_today, p."histAvg" AS pe_hist_avg,
       p."plus1Std" AS pe_plus_1sd, p."minus1Std" AS pe_minus_1sd, ${num("p.discount")} AS discount_vs_avg_pct,
       (p."snapshotDate"::date = max(p."snapshotDate"::date) OVER ()) AS is_latest
  FROM "PeSummarySnapshot" p`,
  {
    snapshot_date: "Fecha de la foto.", index_name: "Índice.", pe_today: "P/E actual.", pe_hist_avg: "P/E promedio histórico.",
    pe_plus_1sd: "Promedio + 1 desviación estándar.", pe_minus_1sd: "Promedio − 1 desviación estándar.",
    discount_vs_avg_pct: "Descuento (−) o premio (+) vs el promedio, en % (−5.2 = 5,2% de descuento).", is_latest: LATEST("del set"),
  });

V("macro_index_comps",
  "Comparables de ÍNDICES bursátiles (no acciones): nivel, retornos y múltiplos, por foto. Usá is_latest = true.",
  `
SELECT c."snapshotDate"::date AS snapshot_date, c.ticker AS index_ticker, c."indexName" AS index_name, c."priceLocal" AS index_level,
       ${num('c."ret1W"')} AS ret_1w_pct, ${num('c."ret1M"')} AS ret_1m_pct, ${num('c."ret3M"')} AS ret_3m_pct,
       ${num('c."retYTD"')} AS ret_ytd_pct, ${num('c."ret1Y"')} AS ret_1y_pct, ${num('c."ret3Y"')} AS ret_3y_pct,
       ${num('c."ret5Y"')} AS ret_5y_pct, ${num('c."ret10Y"')} AS ret_10y_pct,
       c."evEbitdaFwd" AS ev_ebitda_fwd, c."peFwd" AS pe_fwd, c."evEbitdaTrail" AS ev_ebitda_trailing,
       c."roeTrail" AS roe_trailing, c."peTrail" AS pe_trailing,
       (c."snapshotDate"::date = max(c."snapshotDate"::date) OVER ()) AS is_latest
  FROM "EquityCompsSnapshot" c`,
  {
    snapshot_date: "Fecha de la foto.", index_ticker: "Ticker Bloomberg del índice ('MXLA Index').", index_name: "Nombre del índice.",
    index_level: "Nivel del índice.", ret_1w_pct: "Retorno 1 semana en % (−5.7 = −5,7%).", ret_1m_pct: "Retorno 1 mes en %.",
    ret_3m_pct: "Retorno 3 meses en %.", ret_ytd_pct: "Retorno en el año en %.", ret_1y_pct: "Retorno 1 año en %.",
    ret_3y_pct: "Retorno ACUMULADO 3 años en % (no anualizado).", ret_5y_pct: "Retorno acumulado 5 años en %.",
    ret_10y_pct: "Retorno acumulado 10 años en %.", ev_ebitda_fwd: "EV/EBITDA forward (veces).", pe_fwd: "P/E forward (veces).",
    ev_ebitda_trailing: "EV/EBITDA trailing (veces).", roe_trailing: "ROE trailing en DECIMAL (0.17 = 17%).", pe_trailing: "P/E trailing (veces).",
    is_latest: LATEST("del set"),
  });

// ════════════════════════ MODELOS DEL ANALISTA ════════════════════════
const MODEL_AMOUNTS = "en la escala y moneda del modelo (ver model_versions.currency / unit_label; normalmente millones, a veces miles de millones — la etiqueta no siempre es confiable)";
V("model_versions",
  "Modelos financieros PROPIOS de los analistas del equipo (Excel subido por macro), uno por versión: cada carga crea una versión nueva (bbg_ticker, model_date). Incluye empresas (model_type 'company') y bancos ('bank'). Recomendación y target price oficiales del equipo. Para la vigente: is_latest = true. Los números están en model_financials / bank_model_financials / model_kpis.",
  `
SELECT 'company'::text AS model_type, h.ticker AS bbg_ticker, h.update_date AS model_date,
       ${rec("h.recc")} AS recommendation, ${nz("h.recc")} AS recommendation_raw, h.tp AS target_price, ${nz("h.analyst")} AS analyst,
       ${ccy("h.currency")} AS currency, ${nz("h.unit")} AS unit_label, h.has_series, h.thesis, h.link,
       (h.update_date = max(h.update_date) OVER (PARTITION BY h.ticker)) AS is_latest
  FROM model_headers h
UNION ALL
SELECT 'bank', b.ticker, b.update_date, ${rec("b.recc")}, ${nz("b.recc")}, b.tp, ${nz("b.analyst")},
       ${ccy("b.currency")}, ${nz("b.unit")}, false, b.thesis, b.link,
       (b.update_date = max(b.update_date) OVER (PARTITION BY b.ticker))
  FROM bank_headers b`,
  {
    model_type: "'company' (empresa no financiera) | 'bank' (banco, estructura de estados distinta).", bbg_ticker: TICKER,
    model_date: "Fecha de la versión del modelo.", recommendation: "Recomendación normalizada: 'BUY' | 'HOLD' | 'SELL' (NULL si vacía).",
    recommendation_raw: "Recomendación tal como viene del Excel.", target_price: "Target price del analista, en la moneda de cotización del papel.",
    analyst: "Iniciales o nombre del analista.", currency: "Moneda de los montos del modelo (CLP, USD, BRL, MXN…).",
    unit_label: "Etiqueta de escala del Excel ('mn', 'mm', '000 mn', 'bn'). No siempre confiable.",
    has_series: "true = empresa de doble serie (A/B).", thesis: "Tesis de inversión (texto).", link: "Link al archivo del modelo.",
    is_latest: LATEST("del ticker y tipo de modelo"),
  });

V("model_financials",
  "Estados financieros proyectados del modelo del analista para EMPRESAS (no bancos), una fila por (versión, año). Montos " + MODEL_AMOUNTS + ". Signos como en el Excel: dividendos, DPS y recompras vienen NEGATIVOS. is_latest_version = true para la versión vigente.",
  `
SELECT f.ticker AS bbg_ticker, f.update_date AS model_date, f.year AS fiscal_year,
       f.revenue, f.ebitda, f.ebit, f.d_a AS depreciation_amortization, f.tax_rate, f.taxes, f.net_fin_expenses,
       f.net_income, f.eps, f.shares_out AS shares_out_mn, f.net_debt, f.minorities, f.controlling_equity, f.tangible_equity,
       f.ppe, f.working_capital, f.fcf, f.capex, f.asset_sales, f.fcfe, f.dividend, f.payout, f.buybacks, f.dps,
       f.share_price, f.market_cap, f.fx_consensus, f.fx_eop,
       (f.update_date = max(f.update_date) OVER (PARTITION BY f.ticker)) AS is_latest_version
  FROM model_financials f`,
  {
    bbg_ticker: TICKER, model_date: "Versión del modelo (= model_versions.model_date).", fiscal_year: "Año (históricos y proyectados).",
    revenue: "Ingresos.", ebitda: "EBITDA.", ebit: "EBIT.", depreciation_amortization: "Depreciación y amortización.",
    tax_rate: "Tasa de impuesto, DECIMAL.", taxes: "Impuestos.", net_fin_expenses: "Gastos financieros netos.",
    net_income: "Utilidad neta controladora.", eps: "Utilidad por acción (moneda del modelo).", shares_out_mn: "Acciones (millones, según la planilla).",
    net_debt: "Deuda neta.", minorities: "Interés minoritario.", controlling_equity: "Patrimonio controlador.", tangible_equity: "Patrimonio tangible.",
    ppe: "Propiedades, planta y equipo.", working_capital: "Capital de trabajo.", fcf: "Flujo de caja libre.", capex: "Capex.",
    asset_sales: "Venta de activos.", fcfe: "Flujo de caja libre al accionista.", dividend: "Dividendos pagados (NEGATIVO).",
    payout: "Payout = dividendo(año) / utilidad(año−1), DECIMAL; el signo varía entre modelos.", buybacks: "Recompras (NEGATIVO).",
    dps: "Dividendo por acción (NEGATIVO).", share_price: "Precio de la acción usado en el modelo (moneda de cotización).",
    market_cap: "Market cap usado en el modelo, en la escala del modelo.", fx_consensus: "FX para llevar el modelo a la moneda del consenso.",
    fx_eop: "FX de cierre para llevar el market cap a la moneda del modelo.", is_latest_version: LATEST("del ticker (versión del modelo)"),
  });

V("bank_model_financials",
  "Estados financieros proyectados del modelo del analista para BANCOS, una fila por (versión, año). Montos " + MODEL_AMOUNTS + "; ratios en DECIMAL. Dividendos, DPS y recompras NEGATIVOS.",
  `
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
  FROM bank_financials f`,
  {
    bbg_ticker: TICKER, model_date: "Versión del modelo.", fiscal_year: "Año.",
    net_interest_income: "Margen de intereses.", net_fee_income: "Comisiones netas.", treasury_income: "Resultado de tesorería.",
    other_income: "Otros ingresos.", revenue: "Ingresos totales.", nim: "NIM, DECIMAL.", risk_adjusted_nim: "NIM ajustado por riesgo, DECIMAL.",
    provision_expenses: "Gasto en provisiones.", cost_of_risk: "Costo de riesgo, DECIMAL.", npl_ratio: "Cartera vencida / colocaciones, DECIMAL.",
    total_coverage_ratio: "Cobertura total, DECIMAL.", sga: "Gastos de apoyo (SG&A).", efficiency: "Eficiencia (gastos / ingresos), DECIMAL.",
    cost_to_assets: "Gastos / activos, DECIMAL.", ebt: "Utilidad antes de impuestos.", taxes: "Impuestos.", minority_interest: "Interés minoritario (resultado).",
    controlling_net_income: "Utilidad controladora.", eps: "Utilidad por acción.", shares_mn: "Acciones (millones).",
    gross_loans: "Colocaciones brutas.", securities: "Inversiones financieras.", interest_earning_assets: "Activos que devengan intereses.",
    avg_interest_earning_assets: "Promedio de activos que devengan intereses.", allowances_loan_losses: "Provisiones acumuladas.",
    total_assets: "Activos totales.", avg_total_assets: "Activos totales promedio.", demand_deposits: "Depósitos a la vista.",
    time_deposits: "Depósitos a plazo.", total_deposits: "Depósitos totales.", other_funding: "Otro financiamiento.",
    interest_bearing_liabilities: "Pasivos que pagan intereses.", total_funding: "Financiamiento total.", total_liabilities: "Pasivos totales.",
    minorities: "Interés minoritario (balance).", controlling_equity: "Patrimonio controlador.", avg_controlling_equity: "Patrimonio controlador promedio.",
    tangible_equity: "Patrimonio tangible.", overdue_loans: "Cartera vencida.", voluntary_provisions: "Provisiones voluntarias.",
    capex: "Capex.", dividend: "Dividendos (NEGATIVO).", payout: "Payout, DECIMAL.", buybacks: "Recompras (NEGATIVO).",
    dps: "Dividendo por acción (NEGATIVO).", share_price: "Precio usado en el modelo.", market_cap: "Market cap usado en el modelo.",
    fx_consensus: "FX modelo → moneda del consenso.", fx_eop: "FX de cierre.", is_latest_version: LATEST("del ticker"),
  });

V("model_kpis",
  "KPIs operativos específicos de cada modelo (volúmenes, precios, mismas tiendas, cartera por segmento…), por versión, sección y año. Empresas y bancos. Unidades según el KPI (ver kpi_name). display_order reproduce el orden de la planilla.",
  `
SELECT 'company'::text AS model_type, k.ticker AS bbg_ticker, k.update_date AS model_date, k.year AS fiscal_year,
       k.section_name, k.kpi_name, k.kpi_order, k.value, k.id AS display_order,
       (k.update_date = max(k.update_date) OVER (PARTITION BY k.ticker)) AS is_latest_version
  FROM model_kpis k
UNION ALL
SELECT 'bank', k.ticker, k.update_date, k.year, k.section_name, k.kpi_name, k.kpi_order, k.value, k.id,
       (k.update_date = max(k.update_date) OVER (PARTITION BY k.ticker))
  FROM bank_kpis k`,
  {
    model_type: "'company' | 'bank'.", bbg_ticker: TICKER, model_date: "Versión del modelo.", fiscal_year: "Año.",
    section_name: "Sección de la planilla (país, segmento: 'Argentina', 'Brazil Beer'…).", kpi_name: "Nombre del KPI ('Volumes', 'Var %'…). Puede repetirse dentro de una sección.",
    kpi_order: "Orden dentro de la sección.", value: "Valor del KPI (unidad implícita en el nombre; 'Var %' viene en DECIMAL).",
    display_order: "Orden de visualización de la planilla (ordená por esto).", is_latest_version: LATEST("del ticker"),
  });

V("model_hidden_tickers",
  "Modelos ocultos para los usuarios no-admin en Analyst Estimates (los datos siguen cargados).",
  `SELECT h.ticker AS bbg_ticker, h.reason, h.hidden_at FROM estimates_hidden h`,
  { bbg_ticker: TICKER, reason: "Por qué se ocultó.", hidden_at: "Cuándo." });

// ════════════════════════ FICHAS (datos REPORTADOS) ════════════════════════
const PERIOD_KIND = `(CASE x.period_type WHEN 'A' THEN 'annual' WHEN 'Q' THEN 'quarter' WHEN 'L' THEN 'ltm' WHEN 'Y' THEN 'ytd' END)`;
V("reported_financials",
  "Estados financieros REPORTADOS (reales, no proyecciones) de la \"ficha\" de cada empresa: Income Statement, Balance Sheet y Cash Flow en formato largo, una fila por (papel, período, sección, línea). Es la fuente de los fundamentales de Stock Selection Chile. Montos en la moneda reportada (currency), en MILLONES salvo líneas por acción, precios y ratios. Para convertir a USD dividí por fx_local_per_usd cuando currency es moneda local.",
  `
SELECT x.ticker AS bbg_ticker, x.currency, x.fx::float8 AS fx_local_per_usd, x.period_type, ${PERIOD_KIND} AS period_kind,
       x.year AS fiscal_year, x.quarter, x.period_end, x.section, x.line, x.line_order, x.value::float8 AS value, x.updated_at
  FROM ficha_statements x`,
  {
    bbg_ticker: TICKER, currency: "Moneda reportada ('CLP', 'USD').", fx_local_per_usd: "Tipo de cambio moneda local por USD de la última carga (p.ej. 972.6).",
    period_type: "'A' anual | 'Q' trimestre | 'L' LTM (últimos 12 meses) | 'Y' acumulado del año.", period_kind: "Lo mismo en palabras: annual / quarter / ltm / ytd.",
    fiscal_year: "Año.", quarter: "0 en anuales; 1..4 en trimestres, LTM y acumulados (trimestre al que llegan).", period_end: "Fecha de cierre del período.",
    section: "'Income Statement' | 'Balance Sheet' | 'Cash Flow'.", line: "Línea ('Revenues', 'EBITDA', 'Controlling Net Income', 'Total Net Debt', '# Shares (mn)'…).",
    line_order: "Orden dentro de la sección.", value: "Valor reportado.", updated_at: "Última carga.",
  });

V("reported_kpis",
  "KPIs operacionales REPORTADOS de la ficha de cada empresa (volúmenes, precios por segmento…), anuales y trimestrales. Mismas reglas de período que reported_financials.",
  `
SELECT x.ticker AS bbg_ticker, x.currency, x.fx::float8 AS fx_local_per_usd, x.period_type, ${PERIOD_KIND} AS period_kind,
       x.year AS fiscal_year, x.quarter, x.period_end, x.section, x.kpi, x.kpi_order, x.value::float8 AS value, x.updated_at
  FROM ficha_kpis x`,
  {
    bbg_ticker: TICKER, currency: "Moneda reportada.", fx_local_per_usd: "Tipo de cambio local por USD.", period_type: "'A' | 'Q' | 'L' | 'Y' (ver reported_financials).",
    period_kind: "annual / quarter / ltm / ytd.", fiscal_year: "Año.", quarter: "0 en anuales; 1..4 si no.", period_end: "Cierre del período.",
    section: "Subtítulo del bloque de KPIs (país/segmento).", kpi: "Nombre del KPI.", kpi_order: "Orden.", value: "Valor.", updated_at: "Última carga.",
  });

V("reported_financials_comments",
  "Comentarios de los analistas sobre la última ficha de una empresa (pestaña Chile → Last Ficha), anclados al trimestre base comentado.",
  `
SELECT c.ticker AS bbg_ticker, c.year AS fiscal_year, c.quarter, c.source, c.section, c.line, c.target, c.comment,
       ${userName("c.created_by")} AS author, c.created_at, c.updated_at
  FROM ficha_comments c`,
  {
    bbg_ticker: TICKER, fiscal_year: "Año del trimestre base.", quarter: "Trimestre base (1..4).", source: "'statement' (reported_financials) | 'kpi' (reported_kpis).",
    section: "Sección de la línea comentada.", line: "Línea o KPI comentado.",
    target: "Qué se comenta: 'line' = la fila; 'yoy'/'qoq' = variación; 'A2025' = valor anual; 'Q2026-3' = valor del 3T26.",
    comment: "Comentario.", author: "Nombre de quien lo escribió.", created_at: "Creado.", updated_at: "Última edición.",
  });

V("tearsheet_pdfs",
  "Fichas en PDF (\"ficha\" = tearsheet de resultados de una empresa) guardadas en el repositorio. Una ficha viva por papel; las multi-empresa (is_multi_company) listan sus papeles en tearsheet_pdf_securities. Los NÚMEROS de la ficha están en reported_financials / reported_kpis.",
  `
SELECT f.id, f.ticker AS bbg_ticker, (f.ticker IS NULL) AS is_multi_company, f.fiscal_year, f.quarter, f.month,
       f.title, f.description, f.file_url, ${userName("f.uploaded_by")} AS uploaded_by, f.created_at
  FROM fichas f`,
  {
    id: "Id de la ficha.", bbg_ticker: TICKER + " NULL en fichas multi-empresa.", is_multi_company: "true = cubre varias empresas.",
    fiscal_year: "Año del informe.", quarter: "Trimestre (1..4).", month: "Mes (1..12) en fichas mensuales; NULL en trimestrales.",
    title: "Título.", description: "Descripción.", file_url: "URL del PDF.", uploaded_by: "Nombre de quien la subió.", created_at: "Fecha de carga.",
  });

V("tearsheet_pdf_securities",
  "Papeles cubiertos por cada ficha PDF (incluye las de una sola empresa).",
  `
SELECT f.id AS tearsheet_id, f.ticker AS bbg_ticker FROM fichas f WHERE f.ticker IS NOT NULL
UNION ALL
SELECT t.ficha_id, t.ticker FROM ficha_tickers t`,
  { tearsheet_id: "tearsheet_pdfs.id.", bbg_ticker: TICKER });

// ════════════════════════ RECOMENDACIONES / RESEARCH ════════════════════════
V("analyst_call_history",
  "TRACK RECORD INTERNO: historial de recomendaciones de los analistas del equipo desde 2011 (mails, casos, comités, top picks). NO es consenso sell-side (eso es mkt_consensus_ratings). company_alias usa nemotécnicos chilenos o nombres viejos; bbg_ticker viene resuelto vía security_aliases (NULL si el nombre no está mapeado).",
  `
SELECT a.id, a.date AS call_date, lower(btrim(a.type)) AS source_type, upper(btrim(a.analyst)) AS analyst,
       a.company AS company_alias, sa.bbg_ticker, ${rec("a.recommendation")} AS recommendation, a.recommendation AS recommendation_raw,
       a."currentPrice" AS price_at_call, a."targetPrice" AS target_price,
       (CASE WHEN a."currentPrice" > 0 AND a."targetPrice" > 0 THEN a."targetPrice" / a."currentPrice" - 1 END) AS implied_upside
  FROM "AnalystRecommendationHistory" a
  LEFT JOIN security_aliases sa ON sa.alias_source = 'track_record' AND sa.alias = a.company`,
  {
    id: "Id.", call_date: "Fecha de la recomendación.", source_type: "Canal: 'mail', 'caso', 'top picks', 'committee'…",
    analyst: "Iniciales del analista (MAYÚSCULA).", company_alias: "Nombre como lo escribió el equipo ('ANDINA-B').", bbg_ticker: TICKER + " NULL si el alias no está mapeado.",
    recommendation: "Normalizada: 'BUY' | 'HOLD' | 'SELL' (NULL en las no estándar: 'Suscribir', 'Valoración'…).",
    recommendation_raw: "Texto original ('Comprar', 'Mantener', 'Suscribir hasta $290'…).", price_at_call: "Precio del papel al momento de la recomendación.",
    target_price: "Target price, misma moneda que price_at_call.", implied_upside: "Upside implícito = target / precio − 1, DECIMAL.",
  });

V("research_notes",
  "Notas de research del equipo recibidas por correo (updates, resultados, reuniones con compañías). Una fila por nota y por papel. is_general = nota transversal (sector/macro) sin empresa propia.",
  `
SELECT n.id, ${nz("n.company")} AS bbg_ticker, n.date AS note_date,
       regexp_replace(initcap(regexp_replace(btrim(n.category), '^(RE|FW|FWD):\\s*', '', 'i')), '^Updates$', 'Update') AS category, n.title, n.subject,
       ${rec("n.recommendation")} AS recommendation, ${nz("n.recommendation")} AS recommendation_raw, n.target_price,
       n."from" AS sender, n.received_at, (n.dismissed_at IS NOT NULL) AS is_general,
       btrim(regexp_replace(regexp_replace(n.html, '<[^>]+>', ' ', 'g'), '\\s+', ' ', 'g')) AS body_text
  FROM email_research n`,
  {
    id: "Id.", bbg_ticker: TICKER + " NULL si la nota no tiene empresa.", note_date: "Fecha de la nota.",
    category: "Tipo: 'Update', 'Earnings', 'Meetings', 'Case'…", title: "Título.", subject: "Asunto del correo.",
    recommendation: "Normalizada 'BUY'|'HOLD'|'SELL' (NULL si la nota no trae).", recommendation_raw: "Texto original.",
    target_price: "Target price mencionado en la nota.", sender: "Remitente del correo.", received_at: "Recepción del correo.",
    is_general: "true = nota general (sin empresa).", body_text: "Cuerpo de la nota en texto plano (sin HTML).",
  });

V("presentations",
  "Repositorio de presentaciones y documentos (investment cases, presentaciones a clientes, updates sectoriales, economía). Las empresas que cubre cada una están en presentation_securities.",
  `
SELECT p.id, p.title, p.description, p.file_url, p.category, p.region, p.is_sell_side, p.case_date, p.created_at,
       p.review_status, ${userName("p.uploaded_by")} AS uploaded_by
  FROM presentations p`,
  {
    id: "Id.", title: "Título.", description: "Descripción.", file_url: "URL del archivo.",
    category: "'investment_cases' | 'client_presentations' | 'sectorial_updates' | 'economics_team'…", region: "'Chile' | 'LATAM' | 'global'…",
    is_sell_side: "true = material de sell-side externo; false = propio.", case_date: "Fecha del informe (no la de carga).", created_at: "Fecha de carga.",
    review_status: "'pending' | 'approved' (los investment cases pasan por revisión).", uploaded_by: "Nombre de quien lo subió.",
  });

V("presentation_securities",
  "Empresas cubiertas por cada presentación, con el target price y la recomendación declarados en los investment cases.",
  `
SELECT t.presentation_id, t.ticker AS bbg_ticker, t.target_price, ${rec("t.recommendation")} AS recommendation
  FROM presentation_tickers t`,
  { presentation_id: "presentations.id.", bbg_ticker: TICKER, target_price: "Target price del caso (moneda de cotización).", recommendation: "'BUY'|'HOLD'|'SELL'." });

V("top_picks",
  "Top Picks del equipo por región y período (mejores ideas). company_name es un NOMBRE de la maestra (securities.company_name), no un ticker: al cruzar puede devolver varios papeles de la misma empresa.",
  `
SELECT p.id, p.region, p.period_date, p.nombre_latam AS company_name, p.comment, p.target_price, p.industry_group,
       s.name AS sector, p.author_name AS author, p.created_at, p.updated_at
  FROM top_picks p
  LEFT JOIN pick_sectors s ON s.id = p.sector_id`,
  {
    id: "Id.", region: "'CHILE' | 'LATAM'.", period_date: "Período del informe (Chile: mes del informe trimestral; LatAm: mes).",
    company_name: "Empresa (= securities.company_name).", comment: "Tesis del pick.", target_price: "Target price.",
    industry_group: "Industria (descriptivo).", sector: "Sector de Top Picks al que pertenece.", author: "Analista autor.",
    created_at: "Creado.", updated_at: "Última edición.",
  });

V("top_pick_periods",
  "Períodos de Top Picks abiertos y la fecha de cierre de cada informe.",
  `SELECT p.region, p.period_date, p.report_date FROM top_pick_periods p`,
  { region: "'CHILE' | 'LATAM'.", period_date: "Período.", report_date: "Fecha de cierre del informe (NULL si está abierto)." });

V("security_recommendations",
  "TODAS las recomendaciones del equipo sobre cada papel, de todas las fuentes, normalizadas a 'BUY'|'HOLD'|'SELL': modelo del analista, investment cases, notas de research y track record. Para \"la recomendación actual\" de un papel usá source = 'analyst_model' AND is_latest_for_source; las demás fuentes sirven de contexto/historial.",
  `
SELECT x.source, x.bbg_ticker, x.as_of_date, x.recommendation, x.target_price, x.analyst, x.reference_id,
       (row_number() OVER (PARTITION BY x.source, x.bbg_ticker ORDER BY x.as_of_date DESC, x.reference_id DESC) = 1) AS is_latest_for_source
  FROM (
    SELECT 'analyst_model'::text AS source, h.ticker AS bbg_ticker, h.update_date AS as_of_date, ${rec("h.recc")} AS recommendation,
           h.tp AS target_price, ${nz("h.analyst")} AS analyst, h.update_date::text AS reference_id
      FROM model_headers h
    UNION ALL
    SELECT 'analyst_model', b.ticker, b.update_date, ${rec("b.recc")}, b.tp, ${nz("b.analyst")}, b.update_date::text FROM bank_headers b
    UNION ALL
    SELECT 'investment_case', t.ticker, COALESCE(p.case_date, p.created_at::date), ${rec("t.recommendation")}, t.target_price,
           ${userName("p.uploaded_by")}, p.id
      FROM presentation_tickers t JOIN presentations p ON p.id = t.presentation_id
     WHERE p.review_status = 'approved'
    UNION ALL
    SELECT 'research_note', n.company, n.date, ${rec("n.recommendation")}, n.target_price, NULL, n.id::text
      FROM email_research n WHERE ${nz("n.company")} IS NOT NULL AND ${rec("n.recommendation")} IS NOT NULL
    UNION ALL
    SELECT 'analyst_call', sa.bbg_ticker, a.date, ${rec("a.recommendation")}, a."targetPrice", upper(btrim(a.analyst)), a.id::text
      FROM "AnalystRecommendationHistory" a
      JOIN security_aliases sa ON sa.alias_source = 'track_record' AND sa.alias = a.company AND sa.bbg_ticker IS NOT NULL
  ) x
 WHERE x.recommendation IS NOT NULL`,
  {
    source: "'analyst_model' (oficial vigente) | 'investment_case' | 'research_note' | 'analyst_call' (track record).",
    bbg_ticker: TICKER, as_of_date: "Fecha de la recomendación.", recommendation: "'BUY' | 'HOLD' | 'SELL'.",
    target_price: "Target price (moneda de cotización).", analyst: "Analista (iniciales o nombre), si se conoce.",
    reference_id: "Id del registro en su fuente.", is_latest_for_source: "true = la más reciente de esa fuente para el papel.",
  });

// ════════════════════════ CHILE: STOCK SELECTION ════════════════════════
V("cl_ss_universe",
  "Universo de Stock Selection Chile: las compañías de la vista, con su sección y orden. company_key es la llave que usan cl_ss_overrides; company_name se cruza con securities.local_name / company_name. is_hidden = ocultada a mano (sus datos siguen).",
  `
SELECT o.company AS company_key, o.label AS company_name, o.seccion AS section, o.seccion_pos AS section_order, o.pos AS position,
       (h.company IS NOT NULL) AS is_hidden, h.reason AS hidden_reason
  FROM stock_selection_orden o
  LEFT JOIN stock_selection_hidden h ON h.company = o.company`,
  {
    company_key: "Nombre normalizado (minúsculas).", company_name: "Nombre como se muestra ('Andina', 'CAP').", section: "Sección de la tabla.",
    section_order: "Orden de la sección.", position: "Orden dentro de la sección.", is_hidden: "true = oculta en la vista.", hidden_reason: "Motivo del ocultamiento.",
  });

V("cl_ss_overrides",
  "Correcciones manuales de admin sobre los inputs de Stock Selection Chile, por período. Ganan sobre la ficha en ese trimestre.",
  `
SELECT o.company AS company_name, lower(regexp_replace(btrim(o.company), '\\s+', ' ', 'g')) AS company_key, o.field,
       o.fiscal_year, o.quarter, o.value, o.note, ${userName("o.edited_by")} AS edited_by, o.edited_at
  FROM stock_selection_override o`,
  {
    company_name: "Compañía como la escribió el admin.", company_key: "= cl_ss_universe.company_key.", field: "Campo editado (sharesTotal, ebitdaN, debtN…).",
    fiscal_year: "Año del período al que aplica.", quarter: "Trimestre al que aplica.", value: "Valor (millones, moneda reportada; NULL = borrado).",
    note: "Nota.", edited_by: "Nombre de quien editó.", edited_at: "Cuándo.",
  });

V("cl_index_membership",
  "Pertenencia de las compañías chilenas a los índices locales (IPSA, IGPA y sub-índices, FTSE). company_name es el nombre corto de Chile (= cl_ss_universe.company_name).",
  `SELECT m.index_name, m.company AS company_name, m.weight FROM index_membership m`,
  { index_name: "'IPSA', 'IGPA', 'IGPA LC', 'IGPA MC', 'IGPA SC', 'IGPA MCSC', 'FTSE'.", company_name: "Compañía (nombre corto de Chile).", weight: "1 = pertenece (se usa como ponderador binario)." });

// ════════════════════════ FONDOS ════════════════════════
V("fund_holdings",
  "Posiciones mensuales de los fondos propios en acciones chilenas (Pionero, MRV, MCF, Orange, FIMs…): número de acciones que tiene cada fondo de cada papel. Foto por mes.",
  `
SELECT c.as_of, c.fondo AS fund, ${eqTicker("c.ticker_bbg")} AS bbg_ticker, c.company AS company_name, c.shares AS shares_mn, c.source AS source_file
  FROM carteras c`,
  {
    as_of: "Mes de la foto (primer día del mes).", fund: "Fondo.", bbg_ticker: TICKER, company_name: "Nombre informativo del Excel.",
    shares_mn: "Acciones que tiene el fondo, en MILLONES.", source_file: "Archivo cargado.",
  });

V("fund_benchmark_weights",
  "Pesos de cada fondo contra su benchmark, por papel y fecha de reporte. security es un ticker Bloomberg en algunos fondos y un nombre de empresa en otros: bbg_ticker sólo viene lleno cuando es ticker. Pesos en DECIMAL (0.08 = 8%).",
  `
SELECT w.fund_name AS fund, w.report_date, w.company AS security,
       (CASE WHEN w.company ~* ' (EQUITY|INDEX|CURNCY|COMDTY)$' THEN upper(w.company) END) AS bbg_ticker,
       w.portfolio_weight, w.benchmark_name, w.benchmark_weight, w.overweight
  FROM fund_portfolio_weights w`,
  {
    fund: "Fondo.", report_date: "Fecha del reporte.", security: "Papel (ticker o nombre).", bbg_ticker: "Ticker si security es un ticker; si no, NULL (cruzar por nombre con securities.company_name, con cuidado).",
    portfolio_weight: "Peso en el fondo, DECIMAL.", benchmark_name: "Benchmark.", benchmark_weight: "Peso en el benchmark, DECIMAL.", overweight: "Sobre/sub-ponderación, DECIMAL.",
  });

V("fund_peer_returns",
  "Retornos y métricas de fondos de Moneda, fondos pares e índices (informe semanal de rentabilidades). Granularidad: fondo/serie, no acción. Retornos en % (68.6 = 68,6%).",
  `
SELECT (CASE WHEN r.report_date ~ '^[0-9]{1,2}/[A-Za-z]{3}/[0-9]{4}$' THEN to_date(r.report_date, 'DD/Mon/YYYY') END) AS report_date,
       r.report_date AS report_date_raw, r.currency, r.fund, r.fund_group, ${nz("r.manager")} AS manager, ${num("r.mgmt_fee")} AS mgmt_fee_pct,
       r.nav, r.aum_usd_mm, r.mtd AS ret_mtd_pct, r.ytd AS ret_ytd_pct, r.ret_1y AS ret_1y_pct, r.ret_3y AS ret_3y_pct,
       r.ret_5y AS ret_5y_pct, r.ret_10y AS ret_10y_pct, r.incep AS ret_since_inception_pct, ${nz("r.inception_date")} AS inception_date_raw,
       r.dyn_1_label, r.dyn_1, r.dyn_2_label, r.dyn_2, r.dyn_3_label, r.dyn_3, r.sigma, r.sharpe, r.alpha, r.beta
  FROM moneda_fund_returns r`,
  {
    report_date: "Fecha del informe.", report_date_raw: "Fecha como texto original ('9/Oct/2026').", currency: "Moneda del fondo/serie.",
    fund: "Fondo o serie ('Pionero A').", fund_group: "Grupo ('Moneda', pares, índices).", manager: "Administradora.", mgmt_fee_pct: "Comisión de administración, %.",
    nav: "Valor cuota.", aum_usd_mm: "Patrimonio en MILLONES de USD.", ret_mtd_pct: "Retorno del mes, %.", ret_ytd_pct: "Retorno del año, %.",
    ret_1y_pct: "Retorno 12 meses, %.", ret_3y_pct: "Retorno 3 años, %.", ret_5y_pct: "Retorno 5 años, %.", ret_10y_pct: "Retorno 10 años, %.",
    ret_since_inception_pct: "Retorno desde el inicio, %.", inception_date_raw: "Fecha de inicio (texto).",
    dyn_1_label: "Etiqueta de la métrica dinámica 1 (cambia por tabla del informe).", dyn_1: "Valor de la métrica dinámica 1.",
    dyn_2_label: "Etiqueta de la métrica dinámica 2.", dyn_2: "Valor de la métrica dinámica 2.", dyn_3_label: "Etiqueta de la métrica dinámica 3.", dyn_3: "Valor de la métrica dinámica 3.",
    sigma: "Volatilidad.", sharpe: "Sharpe.", alpha: "Alpha.", beta: "Beta.",
  });

// ════════════════════════ EQUIPO / PLANIFICACIÓN ════════════════════════
V("analysts",
  "Personas del equipo (usuarios de la app). Sin credenciales ni emails.",
  `SELECT u.id, u.name, u.initials, u.role FROM users u`,
  { id: "Id (referenciado por planning_tasks).", name: "Nombre.", initials: "Siglas usadas en el calendario ('DM', 'AP').", role: "'admin' | 'user'." });

V("planning_calendar_items",
  "Calendario macro de research del equipo: actividades agendadas por región y semana (updates, resultados, top picks…).",
  `
SELECT w.id, w.region, w.week_start, w.topic, w.category, w.all_analysts, w.highlighted, w.notes, w.sort_order,
       (SELECT string_agg(u.initials, ' / ' ORDER BY u.initials) FROM weekly_plan_analysts a JOIN users u ON u.id = a.user_id WHERE a.weekly_plan_id = w.id) AS analysts,
       w.updated_at
  FROM weekly_plan w`,
  {
    id: "Id.", region: "'CHILE' | 'LATAM'.", week_start: "Lunes de la semana.", topic: "Actividad ('Update: Hapag-Vapores').",
    category: "'update' | 'banks' | 'top_picks' | 'results' | 'alert' | 'holiday' | 'none'.", all_analysts: "true = semana de todo el equipo.",
    highlighted: "true = semana a vigilar.", notes: "Notas.", sort_order: "Orden dentro de la celda (región × semana).",
    analysts: "Siglas de los analistas a cargo, unidas por ' / '.", updated_at: "Última edición.",
  });

V("planning_tasks",
  "Tareas del equipo (Team Planning), por sector y sub-sección.",
  `
SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, t.completed_at, s.name AS sector, ss.name AS section,
       ua.name AS assignee, ua.initials AS assignee_initials, uc.name AS created_by, t.company AS company_name,
       t.weekly_plan_id AS calendar_item_id, t.created_at, t.updated_at
  FROM tasks t
  JOIN sector_sections ss ON ss.id = t.section_id
  JOIN sectors s ON s.id = ss.sector_id
  LEFT JOIN users ua ON ua.id = t.assignee_id
  LEFT JOIN users uc ON uc.id = t.created_by_id`,
  {
    id: "Id.", title: "Título.", description: "Descripción.", status: "'todo' | 'in_progress' | 'done'.", priority: "'low' | 'medium' | 'high'.",
    due_date: "Fecha límite.", completed_at: "Cuándo se completó.", sector: "Sector del equipo.", section: "Sub-sección del sector.",
    assignee: "Nombre del responsable.", assignee_initials: "Siglas del responsable.", created_by: "Nombre de quien la creó.",
    company_name: "Empresa relacionada (= securities.company_name), si aplica.", calendar_item_id: "planning_calendar_items.id, si cuelga del calendario.",
    created_at: "Creada.", updated_at: "Última edición.",
  });

V("planning_task_comments",
  "Comentarios en las tareas (revisiones y avances).",
  `
SELECT c.id, c.task_id, u.name AS author, c.body, c.created_at
  FROM task_comments c LEFT JOIN users u ON u.id = c.author_id`,
  { id: "Id.", task_id: "planning_tasks.id.", author: "Nombre del autor.", body: "Comentario.", created_at: "Fecha." });

V("useful_links",
  "Links a herramientas y ejercicios del equipo (vista Useful Links).",
  `
SELECT l.id, l.name, l.url, l.description, s.name AS section, l.sort_order, l.created_at
  FROM analyst_links l LEFT JOIN link_sections s ON s.id = l.section_id`,
  { id: "Id.", name: "Nombre.", url: "URL.", description: "Descripción.", section: "Sección.", sort_order: "Orden.", created_at: "Creado." });

// ════════════════════════ OUTPUT ════════════════════════
const q = (s) => "'" + s.replace(/'/g, "''") + "'";

const publicTableComments = {
  admin_change_log: "Bitácora append-only de todo cambio que un admin hace desde la web (entidad, llave, campo, valor anterior/nuevo, quién y cuándo). Permite revertir. No es data de negocio.",
  fichas: "Fichas en PDF (tearsheets) de una empresa o multi-empresa, guardadas en R2. Una viva por ticker. Vista para IA: ai.tearsheet_pdfs.",
  ficha_tickers: "Empresas de cada ficha PDF multi-empresa. Vista para IA: ai.tearsheet_pdf_securities.",
  pick_sectors: "Sectores de Top Picks, por región (CHILE / LATAM).",
  pick_sector_members: "Analistas de cada sector de Top Picks (quién puede agregar picks; picks de no-miembros quedan legacy).",
  sectors: "Sectores del Team Planning (grilla de tareas). is_general = Coordinación General.",
  sector_members: "Analistas de cada sector del Team Planning (miembro = puede escribir).",
  sector_sections: "Sub-secciones de cada sector del Team Planning; las tareas cuelgan de una sub-sección.",
  stock_selection_hidden: "Compañías de Stock Selection Chile ocultadas a mano (capa de visibilidad, no borra datos). Llave = stock_selection_orden.company.",
  ticker_return_snapshot: "Retornos totales (Bloomberg, dividendos brutos) — única tabla de retornos. Snapshot: cada carga reemplaza la tabla. Ticker sin \" Equity\". Retornos en decimal; 3y/5y anualizados. Vista para IA: ai.mkt_total_returns.",
  top_pick_periods: "Cabecera de cada período de Top Picks (región, período, fecha de cierre del informe). Vista para IA: ai.top_pick_periods.",
};

const lines = [];
lines.push(String.raw`-- Auditoría de BDD 2026-11 — FASE C: capa "ai" para el MCP de los analistas y el bot de Telegram.
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
`);
for (const v of views) {
  lines.push(`-- ── ai.${v.name} ${"─".repeat(Math.max(3, 70 - v.name.length))}`);
  lines.push(`CREATE VIEW ai.${v.name} AS\n${v.sql};`);
  lines.push(`COMMENT ON VIEW ai.${v.name} IS ${q(v.comment)};`);
  for (const [col, c] of Object.entries(v.columns)) lines.push(`COMMENT ON COLUMN ai.${v.name}.${col} IS ${q(c)};`);
  lines.push("");
}
lines.push(`-- ── Comentarios que faltaban en tablas de public (documentación para desarrollo) ──`);
for (const [t, c] of Object.entries(publicTableComments)) lines.push(`COMMENT ON TABLE public.${t} IS ${q(c)};`);
lines.push(String.raw`
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

COMMIT;

-- Verificación (deben dar: N vistas / false / true):
--   SELECT count(*) FROM information_schema.views WHERE table_schema = 'ai';
--   SELECT has_table_privilege('claude_ro', 'public.model_headers', 'SELECT');
--   SELECT has_table_privilege('claude_ro', 'ai.securities', 'SELECT');
`);

fs.writeFileSync(path.join(root, "prisma/sql/phase_c_ai_schema_2026-11-23.sql"), lines.join("\n"));
fs.writeFileSync(path.join(__dirname, ".ai-views.json"), JSON.stringify(views.map((v) => ({ name: v.name, sql: v.sql, columns: Object.keys(v.columns) })), null, 1));
console.log(views.length, "views written");
