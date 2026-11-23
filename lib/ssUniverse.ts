import { prisma } from "@/lib/prisma";
import { norm } from "@/lib/ssHomologacion";
import { SEED_ORDEN } from "@/lib/chileCompanyOrder";

// Universo de Stock Selection (Chile): QUÉ compañías tiene la vista.
//
// Desde que se eliminó stock_selection_v1 (limpieza de la BDD, B5) la lista sale de
// stock_selection_orden —la misma tabla que define el orden y las secciones— más las compañías
// SEMBRADAS: las que tienen valores en stock_selection_override sin estar en el orden. Lo
// comparten la vista, el panel de Filas y la carga de carteras para que no puedan divergir.
//
// Consecuencia: sacar una empresa del orden (Administración → Orden y secciones) la saca de la
// vista. Para esconderla sin perder su lugar está "Ocultar" (stock_selection_hidden).
//
// Si stock_selection_orden está vacía se usa la semilla de lib/chileCompanyOrder, igual que
// GET /api/chile/orden.

export interface SsUniverseEntry {
  company: string;        // nombre tal como se muestra (label del orden / el que escribió el admin)
  key: string;            // norm(company): llave de overrides, ocultamiento y homologación
  seccion: string | null; // sección del orden; null = sembrada (fuera del orden)
  seeded: boolean;
}

/** Sección donde caen las compañías que se suman desde el panel. */
export const SECCION_NUEVAS = "Otros";

export async function loadSsUniverse(): Promise<SsUniverseEntry[]> {
  const [orden, overrides] = await Promise.all([
    prisma.stockSelectionOrden.findMany({
      orderBy: [{ seccionPos: "asc" }, { pos: "asc" }],
      select: { label: true, seccion: true },
    }).catch(() => [] as { label: string; seccion: string }[]),
    // Resiliente como en la vista: si la tabla no existe, sin sembradas.
    prisma.stockSelectionOverride.findMany({ distinct: ["company"], select: { company: true } }).catch(() => []),
  ]);

  const base = orden.length
    ? orden.map((o) => ({ company: o.label, seccion: o.seccion }))
    : SEED_ORDEN.secciones.flatMap((s) => s.empresas.map((company) => ({ company, seccion: s.nombre })));

  const out: SsUniverseEntry[] = [];
  const seen = new Set<string>();
  for (const b of base) {
    const key = norm(b.company);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ company: b.company, key, seccion: b.seccion, seeded: false });
  }
  for (const o of overrides) {
    const key = norm(o.company);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ company: o.company, key, seccion: null, seeded: true });
  }
  return out;
}

/**
 * Suma una compañía al final del orden (sección SECCION_NUEVAS, que se crea si no existe).
 * Devuelve false si ya estaba. Con la tabla vacía (vista usando la semilla) no escribe: guardar
 * una sola fila haría que el orden pasara a tener sólo esa compañía.
 */
export async function addToSsOrden(label: string, updatedBy: string | null): Promise<"added" | "exists" | "seed"> {
  const company = norm(label);
  return prisma.$transaction(async (tx) => {
    if (!(await tx.stockSelectionOrden.count())) return "seed";
    if (await tx.stockSelectionOrden.findUnique({ where: { company }, select: { company: true } })) return "exists";
    const seccion = await tx.stockSelectionOrden.findFirst({
      where: { seccion: SECCION_NUEVAS }, select: { seccionPos: true },
    });
    const seccionPos = seccion?.seccionPos
      ?? ((await tx.stockSelectionOrden.aggregate({ _max: { seccionPos: true } }))._max.seccionPos ?? -1) + 1;
    const pos = ((await tx.stockSelectionOrden.aggregate({ where: { seccionPos }, _max: { pos: true } }))._max.pos ?? -1) + 1;
    await tx.stockSelectionOrden.create({
      data: { company, label: label.trim(), seccion: SECCION_NUEVAS, seccionPos, pos, updatedBy },
    });
    return "added";
  });
}
