/**
 * Forma canónica del ticker Bloomberg.
 *
 * El ticker es la clave primaria de una compañía en la plataforma
 * (`empresas_industrias_v2.ticker_bloomberg`, único y en MAYÚSCULAS). Todo lo que
 * escriba `email_research.company` tiene que pasar por acá: el origen de correos
 * manda a veces varios tickers en un string separado por comas y, al partirlo sin
 * trim, todos menos el primero quedaban con un espacio inicial que rompía el match
 * contra la maestra.
 *
 * Nota de diseño: una nota pertenece SOLO al ticker con el que se creó. No se
 * replica a otras líneas del mismo emisor (ADR, doble clase): si el analista la
 * mandó a BCH US, vive en BCH US aunque CHILE CI quede sin notas.
 */

/**
 * Lleva un ticker a la forma canónica de la base.
 *
 * Tiene que ser el equivalente EXACTO del SQL con el que se normalizó la data:
 *   UPPER(regexp_replace(BTRIM(x), '[[:space:]]+', ' ', 'g'))
 *
 * Es la única transformación que queda: se aplica UNA vez sobre el valor que
 * entra (parámetro de ruta, query string, payload) y de ahí en adelante las
 * queries comparan con igualdad directa. Nada de UPPER() sobre la columna: eso
 * anulaba los índices y obligaba a escanear las tablas enteras.
 */
export function normalizeTicker(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Ticker → segmento de URL para /api/companies/[ticker]/…
 *
 * Tickers como "AGUAS/A CI EQUITY" traen "/". encodeURIComponent la deja en %2F, pero el
 * router de Next la decodifica antes de matchear y la URL cae en
 * /api/companies/AGUAS/A CI EQUITY → 404. Se reemplaza por "|", que ningún ticker
 * Bloomberg usa, y tickerFromPath lo revierte en el servidor.
 */
export function tickerPath(ticker: string): string {
  return encodeURIComponent(ticker.replace(/\//g, "|"));
}

/** Inverso de tickerPath: parámetro de ruta → ticker canónico. */
export function tickerFromPath(raw: string): string {
  return normalizeTicker(decodeURIComponent(raw).replace(/\|/g, "/"));
}

/**
 * Normaliza el campo `company` que llega desde el ingest de correos.
 *
 * Acepta un string, un string con varios tickers separados por coma, o un array
 * de cualquiera de los dos. Devuelve tickers canónicos, sin vacíos ni repetidos.
 */
export function normalizeTickerList(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw : [raw];
  const out = parts
    .flatMap((v) => String(v ?? "").split(","))
    .map(normalizeTicker)
    .filter(Boolean);
  return [...new Set(out)];
}
