// Campos del modelo de Stock Selection que un admin puede sobrescribir, + el mapa de
// dependencias para pintar de amarillo lo editado y lo que depende de ello.
// Compartido entre la API (validación/overlay) y el componente (panel + highlight).
// No vive en el route.ts porque Next no permite exportar valores desde un route handler.

export interface OverrideFieldDef {
  key: string;                       // campo de SsV1Company
  label: string;                     // etiqueta en el panel
  group: string;                     // agrupador visual del panel
  scope: "single" | "dual" | "both"; // en qué compañías aplica (single, doble serie, o ambas)
}

// Todos los valores están en la moneda reportada, en MILLONES (igual que el dato base).
export const OVERRIDE_FIELDS: OverrideFieldDef[] = [
  { key: "sharesTotal", label: "Acciones (total)", group: "Acciones", scope: "single" },
  { key: "sharesA",     label: "Acciones serie A", group: "Acciones", scope: "dual" },
  { key: "sharesB",     label: "Acciones serie B", group: "Acciones", scope: "dual" },

  { key: "debtN",       label: "Deuda neta (n)",        group: "Balance", scope: "both" },
  { key: "debtN4",      label: "Deuda neta (n-4)",      group: "Balance", scope: "both" },
  { key: "equityN",     label: "Patrimonio (n)",        group: "Balance", scope: "both" },
  { key: "equityN4",    label: "Patrimonio (n-4)",      group: "Balance", scope: "both" },
  { key: "minorityN",   label: "Int. minoritario (n)",  group: "Balance", scope: "both" },
  { key: "minorityN4",  label: "Int. minoritario (n-4)",group: "Balance", scope: "both" },

  // Los EBITDA / Utilidad editables acá son los HISTÓRICOS: salen de stock_selection_v1
  // (trimestrales). Los proyectados (2026E/2027E) NO están en esta lista a propósito —
  // ver PROJECTION_FIELDS abajo.
  { key: "ebitdaN",     label: "EBITDA (Ac, n)",   group: "EBITDA", scope: "both" },
  { key: "ebitdaN4",    label: "EBITDA (Ac-1, n-4)",group: "EBITDA", scope: "both" },
  { key: "ebitdaLtm",   label: "EBITDA LTM",       group: "EBITDA", scope: "both" },

  { key: "utilidadN",     label: "Utilidad (Ac, n)",    group: "Utilidad", scope: "both" },
  { key: "utilidadN4",    label: "Utilidad (Ac-1, n-4)",group: "Utilidad", scope: "both" },
  { key: "utilidadLtm",   label: "Utilidad LTM",        group: "Utilidad", scope: "both" },

  { key: "revenueLtm",  label: "Ventas LTM", group: "Otros", scope: "both" },
  { key: "ebitLtm",     label: "EBIT LTM",   group: "Otros", scope: "both" },
];

export const OVERRIDE_FIELD_KEYS = new Set(OVERRIDE_FIELDS.map((f) => f.key));

/**
 * Campos de esta vista cuya fuente de verdad es PROYECCIONES, no Stock Selection.
 * Son de sólo lectura acá: la única forma de editarlos a mano es /projections, que aplica
 * su propia capa (proyecciones_override) con la regla "gana la foto más fresca". Esta vista
 * se limita a mostrar el valor ganador.
 *
 * No están en OVERRIDE_FIELDS, así que:
 *   · el panel de edición no les dibuja input (los muestra en un bloque de sólo lectura),
 *   · PUT /api/chile/stock-selection-v1/overrides los rechaza con 400,
 *   · cualquier override viejo que haya quedado en la base para estos campos se ignora al
 *     leer (el filtro por OVERRIDE_FIELD_KEYS lo descarta), sin necesidad de migrar nada.
 *
 * Siguen en FIELD_AFFECTS porque el pintado de las columnas derivadas (FV/EBITDA, P/U…)
 * sí aplica cuando el valor viene de una edición manual hecha en Proyecciones.
 */
export const PROJECTION_FIELDS: { key: string; label: string }[] = [
  { key: "ebitda2026E",   label: "EBITDA 2026E" },
  { key: "ebitda2027E",   label: "EBITDA 2027E" },
  { key: "utilidad2026E", label: "Utilidad 2026E" },
  { key: "utilidad2027E", label: "Utilidad 2027E" },
];
export const PROJECTION_FIELD_KEYS = new Set(PROJECTION_FIELDS.map((f) => f.key));

// field → columnas (claves del value bag) que quedan afectadas y se pintan de amarillo.
// Incluye la columna propia del campo (si se muestra) y todas las derivadas.
const SHARES_AFFECTS = ["mcap", "fv", "fvEbitdaLtm", "fvEbitda26", "fvEbitda27", "puLtm", "pu26", "pu27", "pbv", "fvs", "fvic", "divYield"];
export const FIELD_AFFECTS: Record<string, string[]> = {
  sharesTotal: SHARES_AFFECTS,
  sharesA: SHARES_AFFECTS,
  sharesB: SHARES_AFFECTS,
  debtN: ["dn", "fv", "fvEbitdaLtm", "fvEbitda26", "fvEbitda27", "fvs", "fvic"],
  debtN4: ["roic"],
  equityN: ["pbv", "roe26", "fvic"],
  equityN4: ["roeLtm", "roic"],
  minorityN: ["fvic"],
  minorityN4: ["roic"],
  ebitdaN: ["ebitdaN", "ebitdaVar"],
  ebitdaN4: ["ebitdaN4", "ebitdaVar"],
  ebitdaLtm: ["ebitdaLtmUsd", "fvEbitdaLtm"],
  ebitda2026E: ["ebitda26Usd", "fvEbitda26"],
  ebitda2027E: ["ebitda27Usd", "fvEbitda27"],
  utilidadN: ["utilidadN", "utilVar"],
  utilidadN4: ["utilidadN4", "utilVar"],
  utilidadLtm: ["utilLtmUsd", "puLtm", "roeLtm"],
  utilidad2026E: ["util26Usd", "pu26", "roe26", "divYield"],
  utilidad2027E: ["util27Usd", "pu27"],
  revenueLtm: ["fvs"],
  ebitLtm: ["roic"],
};
