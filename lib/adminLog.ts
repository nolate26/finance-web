import { prisma } from "@/lib/prisma";

// Bitácora de cambios de admin (tabla admin_change_log). La escritura NUNCA hace fallar
// la operación de negocio: si la tabla todavía no existe (falta `prisma db push`) o la
// inserción revienta, se avisa por consola y el cambio principal igual queda guardado.
// Perder una línea de log es molesto; perder el cambio del usuario, no.

export const ENTITY = {
  empresas: "empresas_industrias_v2",
  ssOverride: "stock_selection_override",
  indexMembership: "index_membership",
} as const;

export interface AdminLogEntry {
  entity: string;
  entityKey: string;
  field: string;
  label?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  context?: string | null;
  action?: "create" | "update" | "delete";
}

// VarChar(300) en oldValue/newValue y (200) en label/entityKey: se recorta acá para que
// un texto largo no tumbe el insert entero.
const cut = (s: string | null | undefined, n: number): string | null =>
  s == null ? null : s.length > n ? s.slice(0, n) : s;

export async function logAdminChanges(entries: AdminLogEntry[], editedBy: string | null): Promise<void> {
  if (!entries.length) return;
  try {
    await prisma.adminChangeLog.createMany({
      data: entries.map((e) => ({
        entity: e.entity,
        entityKey: cut(e.entityKey, 200) ?? "",
        label: cut(e.label, 200),
        field: cut(e.field, 60) ?? "",
        oldValue: cut(e.oldValue, 300),
        newValue: cut(e.newValue, 300),
        context: cut(e.context, 60),
        action: e.action ?? "update",
        editedBy: cut(editedBy, 200),
      })),
    });
  } catch (err) {
    console.warn("[adminLog] no se pudo registrar el cambio (¿falta `prisma db push`?):", String(err).slice(0, 160));
  }
}

/** Número → texto para el log, sin notación científica ni ceros de más. */
export const numToLog = (v: number | null | undefined): string | null =>
  v == null || !Number.isFinite(v) ? null : String(v);
