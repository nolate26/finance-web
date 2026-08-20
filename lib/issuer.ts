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

/** Normaliza un ticker: sin espacios sobrantes y en MAYÚSCULAS. */
export function normalizeTicker(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
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
