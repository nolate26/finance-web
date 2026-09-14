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

// field → columna (clave del value bag) que se pinta de naranja cuando el campo tiene
// un valor editado a mano.
//
// Se pinta SÓLO la celda directa del campo, nunca los múltiplos ni las derivadas: antes
// editar las acciones teñía M.Cap, FV, tres FV/EBITDA, tres P/U, P/BV, FV/S, FV/IC y el
// yield — media fila naranja por un solo número, y el ojo ya no distinguía QUÉ se tocó.
//
// Regla: se pinta el nivel, no el ratio. Acciones no tiene columna propia, así que su
// celda directa es M.Cap (precio × acciones, el producto inmediato). Los campos sin ninguna
// celda de nivel en la tabla (deuda n-4, patrimonio, minoritarios, ventas, EBIT) no pintan
// nada: quedan a la vista en el badge "N ed." del nombre y en el panel de edición.
export const FIELD_AFFECTS: Record<string, string[]> = {
  sharesTotal: ["mcap"],
  sharesA: ["mcap"],
  sharesB: ["mcap"],
  debtN: ["dn"],
  debtN4: [],
  equityN: [],
  equityN4: [],
  minorityN: [],
  minorityN4: [],
  ebitdaN: ["ebitdaN"],
  ebitdaN4: ["ebitdaN4"],
  ebitdaLtm: ["ebitdaLtmUsd"],
  ebitda2026E: ["ebitda26Usd"],
  ebitda2027E: ["ebitda27Usd"],
  utilidadN: ["utilidadN"],
  utilidadN4: ["utilidadN4"],
  utilidadLtm: ["utilLtmUsd"],
  utilidad2026E: ["util26Usd"],
  utilidad2027E: ["util27Usd"],
  revenueLtm: [],
  ebitLtm: [],
};

/**
 * Columnas a pintar en UNA fila, dada la lista de campos editados de su compañía.
 *
 * Es por fila y no por compañía porque en una doble serie las acciones se editan por
 * clase: sharesA cambia el M.Cap de la fila A y de la consolidada, pero el de la fila B
 * no se movió y no debe teñirse. `seriesLabel` = "A" | "B" en las filas de serie, null en
 * la consolidada o simple.
 */
export function affectedCols(overrides: string[] | undefined, seriesLabel: string | null): Set<string> {
  const s = new Set<string>();
  for (const f of overrides ?? []) {
    if (seriesLabel && ((f === "sharesA" && seriesLabel !== "A") || (f === "sharesB" && seriesLabel !== "B"))) continue;
    for (const c of FIELD_AFFECTS[f] ?? []) s.add(c);
  }
  return s;
}
