// Formas compartidas de Top Picks entre las rutas de API y los componentes.
//
// Vive en lib/ y no en el route handler porque Next.js sólo deja exportar los verbos
// HTTP y su config desde un app/api/**/route.ts.

export interface PickUser {
  id:       string;
  name:     string | null;
  email:    string | null;
  initials: string | null;
}

/** Alguien con picks en el sector que ya NO es miembro: sus picks se ven en gris. */
export interface FormerAnalyst {
  name:   string;
  /** null = ya no existe como usuario; entonces no se puede reincorporar de un click. */
  userId: string | null;
  picks:  number;
}

export interface PickSectorDTO {
  id:          string;
  /** CHILE | LATAM — los sectores son propios de cada región. */
  region:      string;
  name:        string;
  description: string | null;
  sortOrder:   number;
  members:     PickUser[];
  /**
   * Analistas anteriores del sector. Existe para que el gris no sea magia: el admin
   * ve quién dejó picks acá, cuántos, y puede devolverlo al sector de un click.
   */
  former:      FormerAnalyst[];
  /** true si la sesión actual puede escribir acá (miembro, o admin). */
  canWrite:    boolean;
}

export interface PickSectorsPayload {
  sectors: PickSectorDTO[];
  isAdmin: boolean;
}

export interface TopPickDTO {
  id:            string;
  region:        string;
  periodDate:    string;        // ISO YYYY-MM-DD
  nombreLatam:   string;
  comment:       string;
  targetPrice:   number | null;
  sectorId:      string | null;
  sectorName:    string | null;  // null = sin clasificar ("Unassigned")
  authorId:      string | null;
  authorName:    string | null;
  authorInitials: string | null;
  industryGroup: string | null;
  /**
   * DERIVADO, no guardado: el pick tiene un autor identificado que ya NO es miembro
   * del sector (o el usuario ya no existe). La UI lo pinta gris.
   */
  isLegacy:      boolean;
}

export interface TopPicksPayload {
  picks: TopPickDTO[];
}

/**
 * Un período de la grilla. `declared` distingue los que alguien abrió a propósito
 * (fila en top_pick_periods) de los que existen sólo porque tienen picks: un período
 * declarado se muestra aunque esté vacío — si no, abrir el siguiente quarter no se
 * vería hasta cargarle el primer pick.
 */
export interface TopPickPeriodDTO {
  period:     string;          // "YYYY-MM"
  reportDate: string | null;   // "YYYY-MM-DD" — día en que se cerró la selección
  declared:   boolean;
}

export interface TopPickPeriodsPayload {
  periods: TopPickPeriodDTO[];
}

// ── Períodos ──────────────────────────────────────────────────────────────────
// Chile trabaja por trimestre y LatAm por mes; toda la aritmética de períodos vive
// acá porque la usan por igual la grilla y la validación del servidor.

/** Meses válidos de inicio de trimestre. */
const QUARTER_MONTHS = [1, 4, 7, 10];

/** "2026-07" → "Q3 2026" en Chile, "July 2026" en LatAm. */
export function periodLabel(ym: string, isChile: boolean): string {
  const [year, month] = ym.split("-").map(Number);
  if (isChile) return `Q${Math.ceil(month / 3)} ${year}`;
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** El período del calendario de hoy. */
export function currentPeriod(isChile: boolean): string {
  const d = new Date();
  const m = isChile ? Math.floor(d.getMonth() / 3) * 3 : d.getMonth();
  return `${d.getFullYear()}-${String(m + 1).padStart(2, "0")}`;
}

/** El período siguiente: +1 trimestre en Chile, +1 mes en LatAm. */
export function nextPeriod(ym: string, isChile: boolean): string {
  const [year, month] = ym.split("-").map(Number);
  const idx = month - 1 + (isChile ? 3 : 1);
  return `${year + Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** ¿Tiene "YYYY-MM" la forma de un período? */
export function isPeriodShape(ym: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

/**
 * ¿Se puede ABRIR este período? En Chile, sólo los meses que abren trimestre.
 *
 * Ojo: es una regla para períodos NUEVOS, no una descripción de los que ya hay. Los
 * quarters históricos de Chile están guardados con el mes del informe (2025-12 es
 * Q4 2025, 2026-03 es Q1 2026), así que exigirles esto los dejaría sin poder editar.
 * Sobre los existentes sólo se valida la forma.
 */
export function canOpenPeriod(ym: string, isChile: boolean): boolean {
  if (!isPeriodShape(ym)) return false;
  return !isChile || QUARTER_MONTHS.includes(Number(ym.slice(5, 7)));
}

/**
 * Lleva un período de Chile al primer mes de su trimestre; en LatAm no cambia nada.
 * Es lo que permite calcular el siguiente a partir de uno histórico: el que sigue a
 * 2025-12 (Q4 2025) es Q1 2026, y sumarle tres meses a diciembre daría marzo — la
 * etiqueta sería correcta pero el mes no sería uno que se pueda abrir.
 */
export function normalizePeriod(ym: string, isChile: boolean): string {
  if (!isChile || !isPeriodShape(ym)) return ym;
  const [year, month] = ym.split("-").map(Number);
  const first = Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${String(first).padStart(2, "0")}`;
}

/** "YYYY-MM" → "YYYY-MM-01", que es como viajan las fechas de período en la API. */
export const periodToIso = (ym: string) => `${ym}-01`;

/**
 * Resuelve el usuario de un pick tolerando que el enlace no exista.
 *
 * authorId sólo se escribe al CREAR el pick. Si el analista se dio de alta en la
 * plataforma después —pasó con Arthur Piccoli: sus picks se migraron cuando todavía
 * no tenía cuenta— el enlace queda NULL para siempre y sus picks saldrían grises
 * estando él en el equipo. Por eso, cuando falta el id, se busca por nombre: el
 * authorName congelado es justamente lo que sobrevive.
 */
export function resolveAuthorId(
  authorId: string | null,
  authorName: string | null,
  usersByName: Map<string, string>,
): string | null {
  if (authorId) return authorId;
  if (!authorName) return null;
  return usersByName.get(authorName.trim().toLowerCase()) ?? null;
}

/** Clave de membresía para el Set que resuelve `isLegacy` sin N consultas. */
export const memberKey = (sectorId: string, userId: string) => `${sectorId}|${userId}`;

/**
 * ¿Este pick quedó huérfano de su analista?
 *
 * Reglas, en orden:
 *   · Sin sector  → NO es legacy. Está sin clasificar, que es otra cosa: un pick
 *                   heredado esperando que el admin lo reparta.
 *   · Sin autor identificado → tampoco. No se puede afirmar que sea de alguien que
 *                   se fue si nunca se supo de quién era.
 *   · Con sector y autor → es legacy si ese autor ya no figura en los miembros del
 *                   sector, sea porque lo sacaron o porque el usuario se borró
 *                   (authorId queda NULL por el SetNull y authorName sobrevive).
 */
export function computeIsLegacy(
  sectorId: string | null,
  authorId: string | null,
  authorName: string | null,
  members: Set<string>,
): boolean {
  if (!sectorId) return false;
  if (!authorName) return false;
  if (!authorId) return true;
  return !members.has(memberKey(sectorId, authorId));
}
