// Campos editables de proyecciones_financieras + la regla de precedencia entre el Excel y
// las ediciones web. Vive en lib/ porque lo comparten TRES consumidores: la API de
// proyecciones, la API de stock-selection-v1 y el componente de la tabla — y Next no deja
// exportar valores desde un route handler.
//
// Regla única de precedencia (GANA LA FOTO MÁS FRESCA):
//   valor efectivo = override si edited_at > generated_at del snapshot vigente, si no el
//   valor del Excel.
// Correr de nuevo el script publica un snapshot con generated_at = ahora, así que pisa las
// ediciones previas — que es el comportamiento pedido para la transformación híbrida. Las
// ediciones pisadas NO se borran: quedan en proyecciones_override y en admin_change_log, y
// se cuentan aparte (`superseded`) para poder avisarlo en la vista.

export type ProyeccionMetric =
  | "ingresos" | "ebitda" | "ebit" | "utilidad"   // por año calendario
  | "moneda" | "analyst" | "pool_div";            // de fila (calendar_year = 0)

export interface ProyeccionFieldDef {
  key:   ProyeccionMetric;
  label: string;
  kind:  "number" | "text";
  scope: "year" | "row";   // year → una celda por año calendario; row → una sola celda
  group: string;           // agrupador visual del panel de edición
}

export const PROY_FIELDS: ProyeccionFieldDef[] = [
  { key: "ingresos", label: "Ingresos", kind: "number", scope: "year", group: "Estado de resultados" },
  { key: "ebitda",   label: "EBITDA",   kind: "number", scope: "year", group: "Estado de resultados" },
  { key: "ebit",     label: "EBIT",     kind: "number", scope: "year", group: "Estado de resultados" },
  { key: "utilidad", label: "Utilidad", kind: "number", scope: "year", group: "Estado de resultados" },
  { key: "moneda",   label: "Moneda",       kind: "text",   scope: "row", group: "Ficha" },
  { key: "analyst",  label: "Analista",     kind: "text",   scope: "row", group: "Ficha" },
  { key: "pool_div", label: "Payout (div.)",kind: "number", scope: "row", group: "Ficha" },
];

export const PROY_FIELD_MAP = new Map<string, ProyeccionFieldDef>(PROY_FIELDS.map((f) => [f.key, f]));

/** Las 4 métricas que viven por año calendario, en el orden en que se muestran. */
export const YEAR_METRICS = ["ingresos", "ebitda", "ebit", "utilidad"] as const;
export type YearMetric = (typeof YEAR_METRICS)[number];

/** calendar_year de los campos de fila. Postgres no admite NULL en la PK, de ahí el 0. */
export const ROW_YEAR = 0;

/** Rango aceptado al escribir. Se permite editar AÑOS FUERA DEL WINDOW del snapshot para
 *  tapar baches (una empresa que no proyectó 2028 igual puede recibir un 2028 a mano). */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

export const normEmpresa = (s: string | null | undefined): string =>
  (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** Clave de celda dentro de una empresa. */
export const cellKey = (metric: string, calendarYear: number): string => `${metric}|${calendarYear}`;

// ── Registro tal como sale de Prisma (subset que se usa acá) ───────────────────

export interface OverrideRecord {
  empresa:      string;
  metric:       string;
  calendarYear: number;
  value:        number | null;
  textValue:    string | null;
  baseValue:    number | null;
  baseText:     string | null;
  baseAt:       Date | null;
  editedBy:     string | null;
  editedAt:     Date;
}

export interface OverrideIndex {
  /** empresa(norm) → cellKey → override vigente (sólo los que le ganan al snapshot). */
  applied: Map<string, Map<string, OverrideRecord>>;
  /** empresa(norm) → nº de ediciones que el último snapshot del Excel dejó atrás. */
  superseded: Map<string, number>;
}

/**
 * Arma el índice de overrides aplicables.
 *
 * @param rows        filas de proyecciones_override
 * @param snapshotAt  empresa(norm) → generated_at del snapshot vigente de esa empresa
 *                    (null si la empresa no está en el Excel: ahí el override aplica siempre,
 *                    porque no hay foto contra la cual competir)
 */
export function buildOverrideIndex(
  rows: OverrideRecord[],
  snapshotAt: (empresaKey: string) => Date | null,
): OverrideIndex {
  const applied = new Map<string, Map<string, OverrideRecord>>();
  const superseded = new Map<string, number>();

  for (const r of rows) {
    // value y textValue nulos = celda revertida al Excel; no debería existir la fila, pero
    // si quedó (borrado a medias), se ignora en vez de pintar un hueco.
    if (r.value == null && r.textValue == null) continue;

    const key = normEmpresa(r.empresa);
    const snap = snapshotAt(key);

    if (snap != null && r.editedAt.getTime() <= snap.getTime()) {
      superseded.set(key, (superseded.get(key) ?? 0) + 1);
      continue;
    }
    let m = applied.get(key);
    if (!m) { m = new Map(); applied.set(key, m); }
    m.set(cellKey(r.metric, r.calendarYear), r);
  }
  return { applied, superseded };
}

export function getOverride(
  index: OverrideIndex,
  empresaKey: string,
  metric: string,
  calendarYear: number,
): OverrideRecord | null {
  return index.applied.get(empresaKey)?.get(cellKey(metric, calendarYear)) ?? null;
}

/** Variación porcentual contra el valor previo. null si no hay base o la base es 0. */
export function pctChange(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr / prev) - 1) * 100;
}
