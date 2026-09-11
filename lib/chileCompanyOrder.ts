// Orden fijo por sector de las compañías chilenas.
//
// Vive en lib/ porque lo comparten Stock Selection (/chile) y Proyecciones (/projections):
// las dos vistas tienen que listar las empresas exactamente en el mismo orden, y con una
// sola definición agregar una empresa acá las mueve a las dos a la vez.
//
// Cada sub-array es una SECCIÓN; entre secciones las vistas dibujan un borde. Las empresas
// que no están en la lista caen al final con orden alfabético (el sort es estable y las
// dos fuentes llegan ordenadas por nombre). Hoy eso pasa con 29 de las 116 filas de
// proyecciones —Antofagasta, Geopark, Banmedica, Zofri…— que no forman parte del universo
// de Stock Selection.

export const normName = (s: string | null | undefined): string =>
  (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export const FIXED_SECTIONS: string[][] = [
  ["CAP", "Cintac"],
  ["Provida", "Habitat", "AFPCapital", "Cuprum"],
  ["Watts", "Carozzi"],
  ["Bsantander", "Chile", "BCI", "Itaucl", "Nubank"],
  ["ILC", "Bicecorp", "Banvida"],
  ["Andina", "CCU", "Embonor"],
  ["Cencosud", "Falabella", "Mercado Libre", "SMU", "Ripley", "Nuevapolar", "Hites", "Forus", "Tricot"],
  ["Mallplaza", "Cencoshopp", "Parauco"],
  ["Quinenco", "SK", "Cristales", "Elecmetal"],
  ["Salfacorp", "Besalco", "EISA"],
  ["Socovesa", "Paz", "Manquehue", "Ingevec", "Moller", "Enjoy"],
  ["EnelAM", "EnelChile", "EnelGxCh", "Colbun", "ECL", "Pehuenche", "Edelpa"],
  ["Enaex"],
  ["Copec", "CMPC", "Masisa"],
  ["Antarchile", "Almendral", "Minera", "IAM", "Naviera", "Vapores", "Invercap", "Nortegran", "Oro Blanco", "Potasios"],
  ["Molymet"],
  ["Pucobre", "Soquimich", "Soquicom"],
  ["MultiX", "Salmocam", "Camanchaca", "Blumar"],
  ["Las Condes", "Indisa"],
  ["Gasco", "Aguas", "Lipigas"],
  ["Sonda"],
  ["Entel"],
  ["LTM", "SMSAAM", "Ventanas", "Fepasa"],
  ["ConchaToro", "VSPT", "Santa Rita"],
];

const FIXED_ORDER = new Map<string, number>();   // norm(name) → posición global
const FIXED_SECTION = new Map<string, number>(); // norm(name) → índice de sección
FIXED_SECTIONS.forEach((sec, si) =>
  sec.forEach((nm) => { FIXED_ORDER.set(normName(nm), FIXED_ORDER.size); FIXED_SECTION.set(normName(nm), si); }),
);

export const OTHERS_SECTION = FIXED_SECTIONS.length;

/** Posición global. Las no listadas van al final (1e6) y quedan alfabéticas por el sort estable. */
export const orderIdx = (name: string): number => FIXED_ORDER.get(normName(name)) ?? 1e6;

/** Índice de sección, para dibujar el separador entre bloques. */
export const sectionIdx = (name: string): number => FIXED_SECTION.get(normName(name)) ?? OTHERS_SECTION;

/** Clave centinela del "orden fijo" en el estado de sort de las tablas. */
export const FIXED_KEY = "__order__";

// ── Orden editable desde el panel ───────────────────────────────────────────────
// La lista de arriba dejó de ser la única fuente: ahora es la SEMILLA. El orden vigente
// vive en stock_selection_orden y se sirve por GET /api/chile/orden; las vistas lo piden y
// arman sus comparadores con buildOrder(). Si la tabla está vacía, el endpoint devuelve
// esta misma lista, así que sin tocar nada las tablas se ordenan igual que siempre.

export interface OrdenSeccion { nombre: string; empresas: string[] }
export interface OrdenPayload {
  secciones: OrdenSeccion[];
  /** "db" = guardado desde el panel · "codigo" = todavía la semilla de este archivo. */
  fuente: "db" | "codigo";
}

export interface OrdenIndex {
  /** Posición global; las no listadas al final (sort estable → quedan alfabéticas). */
  orderIdx: (name: string) => number;
  /** Índice de sección, para el separador entre bloques. */
  sectionIdx: (name: string) => number;
  /** Nombre de la sección de una empresa, o null si no está asignada. */
  sectionName: (name: string) => string | null;
  secciones: OrdenSeccion[];
}

/** La semilla del código, con la forma del payload (secciones sin nombre propio todavía). */
export const SEED_ORDEN: OrdenPayload = {
  fuente: "codigo",
  secciones: FIXED_SECTIONS.map((empresas, i) => ({ nombre: `Sección ${i + 1}`, empresas })),
};

/** Comparadores a partir de un orden concreto. `null` → la semilla del código. */
export function buildOrder(p: OrdenPayload | null | undefined): OrdenIndex {
  const secciones = p?.secciones?.length ? p.secciones : SEED_ORDEN.secciones;
  const pos = new Map<string, number>();
  const sec = new Map<string, number>();
  const secName = new Map<string, string>();
  secciones.forEach((s, si) =>
    s.empresas.forEach((nm) => {
      const k = normName(nm);
      if (!k || pos.has(k)) return;  // un nombre repetido se queda con su primera posición
      pos.set(k, pos.size);
      sec.set(k, si);
      secName.set(k, s.nombre);
    }),
  );
  const others = secciones.length;
  return {
    orderIdx:    (name) => pos.get(normName(name)) ?? 1e6,
    sectionIdx:  (name) => sec.get(normName(name)) ?? others,
    sectionName: (name) => secName.get(normName(name)) ?? null,
    secciones,
  };
}
