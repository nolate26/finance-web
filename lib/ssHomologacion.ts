// Homologación de nombres de Stock Selection — fuente única de verdad.
//
// La vista (app/api/chile/stock-selection-v1/route.ts) y el panel de admin
// (app/api/admin/ss-rows/route.ts) tienen que resolver los nombres EXACTAMENTE igual:
// si divergen, el panel diría que una compañía se ve y la vista la estaría descartando.
// Por eso estas constantes viven acá y no dentro de un route (Next tampoco deja
// exportar valores desde un route handler).

/** Nombre normalizado: minúsculas, espacios colapsados, sin bordes. */
export const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** "CAP CI Equity" → "CAP CI" (conserva mayúsculas/minúsculas originales). */
export const cleanBBG = (t: string | null | undefined) => (t ? t.replace(/\s+EQUITY$/i, "").trim() : null);

// Nombres de stock_selection_v1 que no calzan con ninguna fila de empresas_industrias_v2
// y se redirigen a mano. Clave y valor van normalizados.
export const NAME_OVERRIDES: Record<string, string> = {
  aguas: "aguas-a", andina: "andina-b", "las condes": "clinica las condes", potasios: "potasios-b",
};

// Compañías de doble serie (A/B): nombre_chile de cada serie en empresas_industrias_v2.
// El ticker Yahoo y BBG por serie se sacan de esa tabla (no se hardcodean).
export const SERIES_NAMES: Record<string, { A: string; B: string }> = {
  aguas:     { A: "aguas-a",    B: "aguas-b" },
  andina:    { A: "andina-a",   B: "andina-b" },
  embonor:   { A: "embonor-a",  B: "embonor-b" },
  potasios:  { A: "potasios-a", B: "potasios-b" },
  soquimich: { A: "sqm-a",      B: "sqm-b" },
};

// ── Ticker Bloomberg → unidad agregable de Stock Selection ────────────────────
// Lo usa el preview de carga de carteras para decir, ANTES de escribir nada, qué
// tickers del Excel no cruzan. Vive acá porque tiene que resolver igual que la vista:
// si divergieran, el preview diría "calza" y la tabla después ignoraría la posición.
//
// Regla clave: una compañía de doble serie se direcciona por el ticker de CADA SERIE
// (ANDINAA CI / ANDINAB CI), nunca por el de la compañía. El ticker de compañía de una
// dual es el de una de sus series (NAME_OVERRIDES manda andina → andina-b), así que
// registrarlo colisionaría con esa serie y la posición se cargaría contra la unidad
// equivocada.

/** Clave de unidad: "watts" (simple) · "andina-a" / "andina-b" (serie). */
export interface TickerUnit {
  unitKey: string;
  /** Nombre de la compañía en stock_selection_v1 — para mensajes legibles. */
  company: string;
  /** "TOTAL" | "A" | "B" */
  series: string;
}

export interface TickerUnitInput {
  /** Compañías de stock_selection_v1 con su ticker de compañía ya resuelto. */
  company: string;
  tickerBBG: string | null;
  /** true si la vista la muestra con series A/B (tiene shares de ambas). */
  dual: boolean;
  /** Ticker Bloomberg de cada serie, sólo si `dual`. */
  bbgA: string | null;
  bbgB: string | null;
}

/**
 * Índice ticker(normalizado) → unidad. Devuelve también las colisiones, que no deberían
 * existir: dos unidades compartiendo ticker significa que la homologación está rota y
 * cualquier posición cargada contra ese ticker sería ambigua.
 */
export function buildTickerUnits(
  rows: TickerUnitInput[],
  normBBG: (t: string | null | undefined) => string | null,
): { units: Map<string, TickerUnit>; collisions: string[] } {
  const units = new Map<string, TickerUnit>();
  const collisions: string[] = [];
  const put = (bbg: string | null, u: TickerUnit) => {
    const k = normBBG(bbg);
    if (!k) return;
    const prev = units.get(k);
    if (prev && prev.unitKey !== u.unitKey) { collisions.push(k); return; }
    units.set(k, u);
  };
  for (const r of rows) {
    const base = norm(r.company);
    if (!base) continue;
    if (r.dual) {
      put(r.bbgA, { unitKey: `${base}-a`, company: r.company, series: "A" });
      put(r.bbgB, { unitKey: `${base}-b`, company: r.company, series: "B" });
    } else {
      put(r.tickerBBG, { unitKey: base, company: r.company, series: "TOTAL" });
    }
  }
  return { units, collisions };
}
