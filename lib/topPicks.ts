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
