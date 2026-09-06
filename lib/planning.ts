/**
 * Constantes compartidas del módulo de Planificación (calendario macro + Analyst Grid).
 *
 * Vive en lib/ porque lo consumen tanto las API routes (validación de payloads) como
 * los componentes de cliente (render). Las listas de valores válidos son la única
 * definición: schema.prisma guarda VarChar y es acá donde se valida el contenido.
 */
import { PATRIA, TEXT } from "@/lib/patriaTheme";

// ── Categorías de la grilla semanal ───────────────────────────────────────────
// El Excel original usa verde/azul/amarillo/gris/rojo. El manual PATRIA no incluye
// verde ni rojo, así que cada categoría se remapea al tono corporativo más cercano
// conservando la MISMA función semántica (distinguir tipos de semana de un vistazo).

export const PLAN_CATEGORIES = [
  "update",
  "banks",
  "top_picks",
  "results",
  "alert",
  "holiday",
  "none",
] as const;

export type PlanCategory = (typeof PLAN_CATEGORIES)[number];

export interface CategoryStyle {
  label:  string;
  bg:     string;
  border: string;
  text:   string;
}

export const CATEGORY_STYLE: Record<PlanCategory, CategoryStyle> = {
  // verde del Excel → sky blue
  update:    { label: "Update",    bg: "rgba(136,170,255,0.22)", border: "rgba(69,113,255,0.38)",  text: "#001EAF" },
  // azul del Excel → king blue
  banks:     { label: "Banks",     bg: "rgba(32,68,220,0.16)",   border: "rgba(32,68,220,0.40)",   text: "#001EAF" },
  // amarillo del Excel → naranjo corporativo
  top_picks: { label: "Top Picks", bg: "rgba(255,187,141,0.34)", border: "rgba(255,107,6,0.42)",   text: "#8A3A00" },
  // gris oscuro del Excel → dark blue con alpha
  results:   { label: "Results",   bg: "rgba(13,13,56,0.14)",    border: "rgba(13,13,56,0.30)",    text: PATRIA.darkBlue },
  // rojo del Excel → pink corporativo (el "negativo" del manual)
  alert:     { label: "Alert",     bg: "rgba(248,72,94,0.16)",   border: "rgba(248,72,94,0.42)",   text: "#B01029" },
  // gris claro del Excel → gris muy suave
  holiday:   { label: "Holiday",   bg: "rgba(13,13,56,0.05)",    border: "rgba(13,13,56,0.12)",    text: TEXT.muted },
  none:      { label: "No color",  bg: "transparent",            border: "rgba(13,13,56,0.10)",    text: TEXT.label },
};

export function categoryStyle(c: string | null | undefined): CategoryStyle {
  return CATEGORY_STYLE[(c ?? "none") as PlanCategory] ?? CATEGORY_STYLE.none;
}

// ── Regiones ──────────────────────────────────────────────────────────────────
// El orden de las columnas de la grilla. Una región que aparezca en la DB pero no
// acá se renderiza igual, al final y en orden alfabético.

export const PLAN_REGIONS = ["CHILE", "LATAM"] as const;

export const REGION_LABEL: Record<string, string> = {
  CHILE: "Chile",
  LATAM: "Latam / Brazil",
};

export function regionLabel(r: string): string {
  return REGION_LABEL[r] ?? r;
}

/**
 * Día de la semana en que cae cada región, como offset desde el lunes.
 *
 * La llave de weekly_plan sigue siendo el LUNES (mondayOf) — eso no cambia, porque
 * es lo que hace que una semana sea una sola fila por región. Esto es capa de
 * presentación: la grilla renderiza lunes + offset, así la columna de Chile muestra
 * martes y la de LatAm jueves, que es como el equipo agenda de verdad.
 *
 * Una región sin entrada acá cae en 0 (lunes).
 */
export const REGION_DAY_OFFSET: Record<string, number> = {
  CHILE: 1,   // martes
  LATAM: 3,   // jueves
};

export function regionDayOffset(region: string): number {
  return REGION_DAY_OFFSET[region] ?? 0;
}

/** Fecha ISO que se muestra en la grilla para esa región: su lunes + el offset. */
export function displayDate(region: string, weekIso: string): string {
  const d = new Date(weekIso + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + regionDayOffset(region));
  return isoDate(d);
}

/** Nombre del día que le toca a la región ("Tuesday", "Thursday"). */
export function regionDayName(region: string): string {
  return DAYS_EN[regionDayOffset(region) % 7];
}

// ── Tareas ────────────────────────────────────────────────────────────────────

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo:        "To do",
  in_progress: "In progress",
  done:        "Done",
};

export const STATUS_ACCENT: Record<TaskStatus, string> = {
  todo:        "rgba(13,13,56,0.38)",
  in_progress: PATRIA.kingBlue,
  done:        PATRIA.turquoise,
};

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PRIORITY_STYLE: Record<TaskPriority, { label: string; bg: string; border: string; text: string }> = {
  low:    { label: "Low",    bg: "rgba(13,13,56,0.05)",  border: "rgba(13,13,56,0.14)",  text: TEXT.muted },
  medium: { label: "Medium", bg: "rgba(32,68,220,0.09)", border: "rgba(32,68,220,0.26)", text: "#001EAF" },
  high:   { label: "High",   bg: "rgba(248,72,94,0.11)", border: "rgba(248,72,94,0.34)", text: "#B01029" },
};

/** Peso de la prioridad para ordenar listas: primero lo más urgente. */
export const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

// ── Fechas ────────────────────────────────────────────────────────────────────

/**
 * Normaliza cualquier fecha al LUNES de su semana, en UTC puro.
 *
 * Todo el módulo indexa las semanas por su lunes: es la llave de weekly_plan junto
 * con la región. Se trabaja en UTC (y las columnas son @db.Date) para que la semana
 * no se corra un día según el huso del navegador que hizo la edición.
 */
export function mondayOf(date: Date | string): Date {
  const d = typeof date === "string" ? new Date(date + (date.length === 10 ? "T00:00:00.000Z" : "")) : date;
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = utc.getUTCDay();              // 0 = domingo
  const delta = dow === 0 ? -6 : 1 - dow;   // domingo pertenece a la semana que empezó el lunes anterior
  utc.setUTCDate(utc.getUTCDate() + delta);
  return utc;
}

/** "2026-09-08" a partir de un Date, sin pasar por el huso local. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS_EN   = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "08-Sep", igual que la primera columna de la planilla. */
export function dateLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}-${MONTHS_EN[Number(m) - 1]}`;
}

/**
 * Etiqueta de la celda para una región: la fecha que le toca, no el lunes.
 * Chile muestra el martes de esa semana, LatAm el jueves.
 */
export function cellDateLabel(region: string, weekIso: string): string {
  return dateLabel(displayDate(region, weekIso));
}

/** Lista de lunes consecutivos entre dos fechas, ambas inclusive. */
export function weekRange(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const end = mondayOf(toIso);
  const cur = mondayOf(fromIso);
  while (cur <= end && out.length < 200) {
    out.push(isoDate(cur));
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return out;
}
