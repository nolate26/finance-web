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

  { key: "ebitdaN",     label: "EBITDA (Ac, n)",   group: "EBITDA", scope: "both" },
  { key: "ebitdaN4",    label: "EBITDA (Ac-1, n-4)",group: "EBITDA", scope: "both" },
  { key: "ebitdaLtm",   label: "EBITDA LTM",       group: "EBITDA", scope: "both" },
  { key: "ebitda2026E", label: "EBITDA 2026E",     group: "EBITDA", scope: "both" },
  { key: "ebitda2027E", label: "EBITDA 2027E",     group: "EBITDA", scope: "both" },

  { key: "utilidadN",     label: "Utilidad (Ac, n)",    group: "Utilidad", scope: "both" },
  { key: "utilidadN4",    label: "Utilidad (Ac-1, n-4)",group: "Utilidad", scope: "both" },
  { key: "utilidadLtm",   label: "Utilidad LTM",        group: "Utilidad", scope: "both" },
  { key: "utilidad2026E", label: "Utilidad 2026E",      group: "Utilidad", scope: "both" },
  { key: "utilidad2027E", label: "Utilidad 2027E",      group: "Utilidad", scope: "both" },

  { key: "revenueLtm",  label: "Ventas LTM", group: "Otros", scope: "both" },
  { key: "ebitLtm",     label: "EBIT LTM",   group: "Otros", scope: "both" },
];

export const OVERRIDE_FIELD_KEYS = new Set(OVERRIDE_FIELDS.map((f) => f.key));

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
