import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY, type AdminLogEntry } from "@/lib/adminLog";
import { mondayOf, isoDate } from "@/lib/planning";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mover una celda del calendario a otra casilla (drag & drop). Si el destino ya
// tiene celda, las dos se intercambian. La fila conserva su id: los analistas y
// las tareas colgadas (tasks.weekly_plan_id) viajan con ella sin tocar nada más.
// Sólo admin, igual que el PUT/DELETE de la celda.

interface SlotBody { region?: string; weekStart?: string }
interface MoveBody { from?: SlotBody; to?: SlotBody }

interface Slot { region: string; weekStart: Date }

function parseSlot(s: SlotBody | undefined): Slot | null {
  const region = s?.region?.trim().toUpperCase();
  if (!region || !s?.weekStart) return null;
  const weekStart = mondayOf(s.weekStart);
  if (Number.isNaN(weekStart.getTime())) return null;
  return { region, weekStart };
}

const slotKey = (s: Slot) => `${s.region}|${isoDate(s.weekStart)}`;

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

  const from = parseSlot(body.from);
  const to   = parseSlot(body.to);
  if (!from || !to) {
    return NextResponse.json({ error: "from y to necesitan region y weekStart" }, { status: 400 });
  }
  if (slotKey(from) === slotKey(to)) return NextResponse.json({ ok: true, swapped: false });

  const stamp = { updatedBy: self?.email ?? null };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const src = await tx.weeklyPlan.findUnique({
        where:  { region_weekStart: from },
        select: { id: true, topic: true, category: true },
      });
      if (!src) return null;

      const dst = await tx.weeklyPlan.findUnique({
        where:  { region_weekStart: to },
        select: { id: true, topic: true, category: true },
      });

      if (!dst) {
        await tx.weeklyPlan.update({ where: { id: src.id }, data: { ...to, ...stamp } });
        return { src, dst: null };
      }

      // Intercambio. (region, weekStart) es único y Postgres lo chequea en cada
      // UPDATE, así que el origen pasa por una región temporal (derivada de su
      // propio id para que dos swaps simultáneos no choquen) mientras el destino
      // ocupa su casilla.
      await tx.weeklyPlan.update({ where: { id: src.id }, data: { region: `~${src.id}`.slice(0, 40) } });
      await tx.weeklyPlan.update({ where: { id: dst.id }, data: { ...from, ...stamp } });
      await tx.weeklyPlan.update({ where: { id: src.id }, data: { ...to,   ...stamp } });
      return { src, dst };
    });

    if (!result) return NextResponse.json({ error: "La celda de origen ya no existe" }, { status: 404 });

    const entries: AdminLogEntry[] = [{
      entity:    ENTITY.weeklyPlan,
      entityKey: slotKey(to),
      label:     result.src.topic,
      field:     "week",
      oldValue:  slotKey(from),
      newValue:  slotKey(to),
      context:   isoDate(to.weekStart),
      action:    "update",
    }];
    if (result.dst) {
      entries.push({
        entity:    ENTITY.weeklyPlan,
        entityKey: slotKey(from),
        label:     result.dst.topic,
        field:     "week",
        oldValue:  slotKey(to),
        newValue:  slotKey(from),
        context:   isoDate(from.weekStart),
        action:    "update",
      });
    }
    await logAdminChanges(entries, self?.email ?? null);

    return NextResponse.json({ ok: true, swapped: !!result.dst });
  } catch (e) {
    console.error("[planning/weekly/move POST]", e);
    return NextResponse.json({ error: "No se pudo mover la celda" }, { status: 500 });
  }
}
