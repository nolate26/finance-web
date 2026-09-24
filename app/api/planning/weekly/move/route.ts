import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";
import { mondayOf, isoDate, orderWithInserted } from "@/lib/planning";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mover una actividad del calendario a otra casilla (drag & drop), o reordenarla
// dentro de la suya. La fila conserva su id: los analistas y las tareas colgadas
// (tasks.weekly_plan_id) viajan con ella sin tocar nada más. Sólo admin.
//
// QUÉ CAMBIÓ Y POR QUÉ. Antes una casilla tenía como mucho una celda, así que esto
// recibía (origen, destino) y, si el destino estaba ocupado, INTERCAMBIABA las dos —
// era la única salida cuando no cabían las dos en el mismo lugar. Ahora sí caben: se
// manda el `id` de la que se arrastra y soltar sobre una casilla ocupada la suma a la
// lista en vez de desplazar a nadie. `beforeId` dice delante de cuál entra; sin él va
// al final.

interface MoveBody {
  id?:       string;
  to?:       { region?: string; weekStart?: string };
  /** Id de la actividad del destino delante de la cual insertar. null/ausente = al final. */
  beforeId?: string | null;
}

/** Reescribe sort_order 0..n-1 en el orden dado. */
async function renumber(tx: Prisma.TransactionClient, ids: string[]) {
  for (let i = 0; i < ids.length; i++) {
    await tx.weeklyPlan.update({ where: { id: ids[i] }, data: { sortOrder: i } });
  }
}

export async function POST(req: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const self = await getSessionUser();

  let body: MoveBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const id     = body.id?.trim();
  const region = body.to?.region?.trim().toUpperCase();
  if (!id)     return NextResponse.json({ error: "id es obligatorio" }, { status: 400 });
  if (!region || !body.to?.weekStart) {
    return NextResponse.json({ error: "to necesita region y weekStart" }, { status: 400 });
  }
  const weekStart = mondayOf(body.to.weekStart);
  if (Number.isNaN(weekStart.getTime())) {
    return NextResponse.json({ error: "weekStart inválida" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const cell = await tx.weeklyPlan.findUnique({
        where:  { id },
        select: { id: true, region: true, weekStart: true, topic: true },
      });
      if (!cell) return null;

      const fromKey = `${cell.region}|${isoDate(cell.weekStart)}`;
      const toKey   = `${region}|${isoDate(weekStart)}`;

      // Las que ya están en el destino, en orden. orderWithInserted saca la que se
      // mueve si estaba entre ellas (reordenamiento dentro de la misma casilla).
      const target = await tx.weeklyPlan.findMany({
        where:   { region, weekStart },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select:  { id: true },
      });
      const ordered = orderWithInserted(target.map((r) => r.id), id, body.beforeId);

      await tx.weeklyPlan.update({
        where: { id },
        data:  { region, weekStart, updatedBy: self?.email ?? null },
      });
      await renumber(tx, ordered);

      // Si salió de otra casilla, la de origen queda con huecos en el orden.
      if (fromKey !== toKey) {
        const rest = await tx.weeklyPlan.findMany({
          where:   { region: cell.region, weekStart: cell.weekStart },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select:  { id: true },
        });
        await renumber(tx, rest.map((r) => r.id));
      }

      return { topic: cell.topic, fromKey, toKey };
    });

    if (!result) return NextResponse.json({ error: "La actividad ya no existe" }, { status: 404 });

    // Un reordenamiento dentro de la misma casilla no ensucia la bitácora: no cambió
    // ni la fecha ni la región, que es lo que el log de esta entidad registra.
    if (result.fromKey !== result.toKey) {
      await logAdminChanges(
        [{
          entity:    ENTITY.weeklyPlan,
          entityKey: result.toKey,
          label:     result.topic,
          field:     "week",
          oldValue:  result.fromKey,
          newValue:  result.toKey,
          context:   isoDate(weekStart),
          action:    "update",
        }],
        self?.email ?? null,
      );
    }

    return NextResponse.json({ ok: true, moved: result.fromKey !== result.toKey });
  } catch (e) {
    console.error("[planning/weekly/move POST]", e);
    return NextResponse.json({ error: "No se pudo mover la actividad" }, { status: 500 });
  }
}
