import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Editar y borrar un sector de Top Picks. Todo exclusivo de admin.

const NAME_MAX = 120;

interface PatchBody {
  name?:        string;
  description?: string | null;
  sortOrder?:   number;
  memberIds?:   string[];   // reemplaza la membresía completa
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const self = await getSessionUser();
  const { id } = await params;

  let body: PatchBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const sector = await prisma.pickSector.findUnique({
    where: { id }, include: { members: { select: { userId: true } } },
  });
  if (!sector) return NextResponse.json({ error: "El sector no existe" }, { status: 404 });

  const data: Prisma.PickSectorUpdateInput = { updatedBy: self?.email ?? null };
  const log: { field: string; oldValue: string | null; newValue: string | null }[] = [];

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
    if (name.length > NAME_MAX) {
      return NextResponse.json({ error: `El nombre supera ${NAME_MAX} caracteres` }, { status: 400 });
    }
    if (name !== sector.name) log.push({ field: "name", oldValue: sector.name, newValue: name });
    data.name = name;
  }

  if (body.description !== undefined) data.description = body.description?.trim() || null;

  if (body.sortOrder !== undefined) {
    if (!Number.isFinite(body.sortOrder)) {
      return NextResponse.json({ error: "sortOrder inválido" }, { status: 400 });
    }
    data.sortOrder = Math.trunc(body.sortOrder);
  }

  // La membresía se reemplaza en bloque: es corta y así el PATCH es idempotente.
  // OJO: cambiarla mueve picks entre activo y legacy sin tocar top_picks — ése es
  // justamente el punto del estado derivado.
  let memberIds: string[] | null = null;
  if (body.memberIds !== undefined) {
    memberIds = [...new Set(body.memberIds)];
    if (memberIds.length) {
      const found = await prisma.user.count({ where: { id: { in: memberIds } } });
      if (found !== memberIds.length) {
        return NextResponse.json({ error: "Hay analistas que ya no existen" }, { status: 400 });
      }
    }
    const before = sector.members.map((m) => m.userId).sort().join(",");
    const after  = [...memberIds].sort().join(",");
    if (before !== after) {
      log.push({ field: "members", oldValue: `${sector.members.length} miembro(s)`, newValue: `${memberIds.length} miembro(s)` });
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.pickSector.update({ where: { id }, data });
      if (memberIds !== null) {
        await tx.pickSectorMember.deleteMany({ where: { sectorId: id } });
        if (memberIds.length) {
          await tx.pickSectorMember.createMany({
            data: memberIds.map((userId) => ({ sectorId: id, userId })),
          });
        }
      }
    });

    if (log.length) {
      await logAdminChanges(
        log.map((l) => ({
          entity: ENTITY.pickSector, entityKey: id,
          label: (data.name as string) ?? sector.name,
          field: l.field, oldValue: l.oldValue, newValue: l.newValue, action: "update" as const,
        })),
        self?.email ?? null,
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Ya existe un sector con ese nombre" }, { status: 409 });
    }
    console.error("[pick-sectors/[id] PATCH]", e);
    return NextResponse.json({ error: "No se pudo actualizar el sector" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const self = await getSessionUser();
  const { id } = await params;

  const sector = await prisma.pickSector.findUnique({
    where: { id }, select: { id: true, name: true, _count: { select: { picks: true } } },
  });
  if (!sector) return NextResponse.json({ error: "El sector no existe" }, { status: 404 });

  try {
    // top_picks.sector_id es SetNull, así que borrar el sector NO borra los picks:
    // vuelven al bucket "Unassigned". Se avisa cuántos para que no sea una sorpresa.
    await prisma.pickSector.delete({ where: { id } });

    await logAdminChanges(
      [{
        entity: ENTITY.pickSector, entityKey: id, label: sector.name,
        field: "sector", oldValue: sector.name, newValue: null, action: "delete",
      }],
      self?.email ?? null,
    );

    return NextResponse.json({ ok: true, unassignedPicks: sector._count.picks });
  } catch (e) {
    console.error("[pick-sectors/[id] DELETE]", e);
    return NextResponse.json({ error: "No se pudo eliminar el sector" }, { status: 500 });
  }
}
