-- Comentarios de moneda_fund_returns (rediseño 2026-11-25). Correr después del db push:
--   npx prisma db execute --file prisma/sql/moneda_fund_returns_comments.sql

COMMENT ON TABLE moneda_fund_returns IS 'Excel Reporte-Rentabilidades-DD-MM-YYYY.xlsx (rentabilidades_to_db.py → /api/ingest MonedaFundReturns, reemplazo por fecha). Una fila por fondo/índice y familia. Retornos, sigma, alpha y fee en puntos % (3.5 = 3,5%); beta como ratio.';
COMMENT ON COLUMN moneda_fund_returns.report_date IS 'Fecha del informe (del nombre del archivo).';
COMMENT ON COLUMN moneda_fund_returns.familia IS 'FAMILIA del Excel (estrategia): Chilean Equities SC/LC, Latam Equities LC/SC, Brazil Long Bias/Only… Parte de la clave: el mismo índice se repite entre familias.';
COMMENT ON COLUMN moneda_fund_returns.currency IS 'FAMILY CURRENCY: moneda en que se miden los retornos.';
COMMENT ON COLUMN moneda_fund_returns.fund IS 'FUND: fondo, serie o índice.';
COMMENT ON COLUMN moneda_fund_returns.subfamilia IS 'SUBFAMILIA: Moneda Funds, Peer Group (…), Indices, Currencies.';
COMMENT ON COLUMN moneda_fund_returns.code IS 'CODE: ticker Bloomberg o código interno.';
COMMENT ON COLUMN moneda_fund_returns.manager IS 'Administradora.';
COMMENT ON COLUMN moneda_fund_returns.source_file IS 'Nombre del Excel de origen.';
COMMENT ON COLUMN moneda_fund_returns.nav IS 'Valor cuota / nivel del índice.';
COMMENT ON COLUMN moneda_fund_returns.aum_usd_mm IS 'Patrimonio, millones de USD.';
COMMENT ON COLUMN moneda_fund_returns.mtd IS 'Retorno del mes, %.';
COMMENT ON COLUMN moneda_fund_returns.ytd IS 'Retorno del año, %.';
COMMENT ON COLUMN moneda_fund_returns.ret_1y IS 'Retorno 1 año, %.';
COMMENT ON COLUMN moneda_fund_returns.ret_2y IS 'Retorno 2 años anualizado, %.';
COMMENT ON COLUMN moneda_fund_returns.cum_2y IS 'Retorno 2 años acumulado, %.';
COMMENT ON COLUMN moneda_fund_returns.ret_3y IS 'Retorno 3 años anualizado, %.';
COMMENT ON COLUMN moneda_fund_returns.ret_5y IS 'Retorno 5 años anualizado, %.';
COMMENT ON COLUMN moneda_fund_returns.ret_10y IS 'Retorno 10 años anualizado, %.';
COMMENT ON COLUMN moneda_fund_returns.si1_cum IS 'SINCE INCEPTION 1 acumulado, %.';
COMMENT ON COLUMN moneda_fund_returns.si1_ann IS 'SINCE INCEPTION 1 anualizado, %.';
COMMENT ON COLUMN moneda_fund_returns.si2_ann IS 'SINCE INCEPTION 2 anualizado, %.';
COMMENT ON COLUMN moneda_fund_returns.sigma IS 'Volatilidad, %.';
COMMENT ON COLUMN moneda_fund_returns.sharpe IS 'Sharpe ratio.';
COMMENT ON COLUMN moneda_fund_returns.alpha IS 'Alpha, %.';
COMMENT ON COLUMN moneda_fund_returns.beta IS 'Beta, ratio.';
COMMENT ON COLUMN moneda_fund_returns.mgmt_fee IS 'Comisión de administración, %.';
