// Normalización del ticker Bloomberg — llave de cruce entre la vista y las tablas que
// se cargan por fuera (hoy ticker_return_snapshot).
//
// Bloomberg exporta "CAP CI Equity"; empresas_industrias_v2 guarda a veces con y a veces
// sin el sufijo, y con espaciado irregular. Si cada lado normaliza distinto, el join
// falla en silencio y la columna queda vacía sin que nadie se entere. Una sola función.
//
// La usan el ingest (app/api/ingest/route.ts, caso TickerReturnSnapshot) al escribir y la
// vista (app/api/chile/stock-selection-v1/route.ts) al leer, así que el script de Python
// puede mandar el ticker en cualquier forma: se normaliza del lado del servidor.

/** "CAP CI Equity" → "CAP CI". null/vacío → null. */
export function normBBG(t: string | null | undefined): string | null {
  if (!t) return null;
  const s = t.replace(/\s+equity\s*$/i, "").replace(/\s+/g, " ").trim().toUpperCase();
  return s || null;
}
