// Parche en CÓDIGO para tickers Yahoo mal cargados en empresas_industrias_v2.yahoo_finance_ticker.
//
// Vivía dentro de app/api/chile/stock-selection-v1/route.ts, pero Next no deja exportar
// valores desde un route handler y el panel de admin necesita mostrar qué filas están
// siendo reescritas por acá (si no, el admin edita la base y "no le pasa nada" porque el
// parche la pisa de vuelta). Fuente única de verdad: este archivo.
//
// Clave = valor tal como está en la tabla, en MAYÚSCULAS. Los de abajo devolvían
// "No data found, symbol may be delisted" → la fila quedaba sin precio ni retornos.
// Los símbolos nuevos fueron verificados contra el precio de referencia.
//
// Un parche es DEUDA: lo correcto es guardar el símbolo bueno en la base desde el panel
// de admin (botón "Aplicar parche"), con lo que la clave deja de machear y esta entrada
// queda inerte. Se puede borrar de acá una vez que la base esté limpia.
export const YAHOO_TICKER_FIXES: Record<string, string> = {
  "POTASIO-A.SN": "POTASIOS-A.SN",
  "POTASIO-B.SN": "POTASIOS-B.SN",
  "BICECORP.SN": "BICE.SN",           // Bicecorp
  "CENCOMALL.SN": "CENCOMALLS.SN",    // Cencosud Shopping
  "OROBLANCO.SN": "ORO-BLANCO.SN",    // Oro Blanco
  "MULTIX.SN": "MULTI-X.SN",          // MultiX (ex Multiexport Foods)
  "LASCONDES.SN": "LAS-CONDES.SN",    // Clínica Las Condes
  "SANTARITA.SN": "SANTA-RITA.SN",    // Viña Santa Rita
};

/** Símbolo que el parche sustituiría por `raw`, o null si `raw` pasa sin tocar. */
export function codePatchFor(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  const fixed = YAHOO_TICKER_FIXES[t.toUpperCase()];
  return fixed && fixed !== t ? fixed : null;
}

/** Ticker efectivo (con parche aplicado). Vacío/null → null. */
export function fixYahooTicker(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  return YAHOO_TICKER_FIXES[t.toUpperCase()] ?? t;
}
