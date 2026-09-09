import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Editar y borrar UN pick. El permiso lo decide el SECTOR del pick, no su autor: un
// miembro puede corregir o sacar el pick de un compañero del mismo sector, que es como
// trabaja el equipo. Un pick sin sector sólo lo toca un admin.

type Ctx = { params: Promise<{ id: string }> };

async function loadWritable(id: string) {
  const self = await getSessionUser();
  if (!self) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }), pick: null, self: null };

  const pick = await prisma.topPick.findUnique({
    where: { id },
    include: { sector: { select: { id: true, name: true, members: { select: { userId: true } } } } },
  });
  if (!pick) return { error: NextResponse.json({ error: "El pick no existe" }, { status: 404 }), pick: null, self: null };

  const isAdmin = self.role === "admin";
  if (!isAdmin) {
    if (!pick.sector) {
      return { error: NextResponse.json({ error: "Este pick no tiene sector: sólo un admin puede tocarlo." }, { status: 403 }), pick: null, self: null };
    }
    if (!pick.sector.members.some((m) => m.userId === self.id)) {
      return { error: NextResponse.json({ error: `No eres miembro de "${pick.sector.name}": solo puedes verlo.` }, { status: 403 }), pick: null, self: null };
    }
  }
  return { error: null, pick, self };
}

interface PatchBody {
  comment?:      string;
  targetPrice?:  number | null;
  sectorId?:     string | null;
  industryGroup?: string | null;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const deny = await requireAuth();
  if (deny) return deny;
  const { id } = await params;

  const ctx = await loadWritable(id);
  if (ctx.error) return ctx.error;
  const { pick, self } = ctx;

  let body: PatchBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const data: Prisma.TopPickUpdateInput = {};

  if (body.comment !== undefined)     data.comment     = body.comment.trim();
  if (body.targetPrice !== undefined) data.targetPrice = body.targetPrice;
  if (body.industryGroup !== undefined) data.industryGroup = body.industryGroup?.trim() || null;

  // Mover de sector exige permiso en el DESTINO además del origen; si no, un miembro
  // podría empujar picks a un sector ajeno. Y NO se reescribe la autoría: el pick
  // sigue siendo de quien lo escribió, aunque cambie de sector.
  if (body.sectorId !== undefined && body.sectorId !== pick.sectorId) {
    if (body.sectorId) {
      const target = await prisma.pickSector.findUnique({
        where: { id: body.sectorId },
        select: { id: true, name: true, members: { select: { userId: true } } },
      });
      if (!target) return NextResponse.json({ error: "El sector destino no existe" }, { status: 404 });
      if (self.role !== "admin" && !target.members.some((m) => m.userId === self.id)) {
        return NextResponse.json({ error: `No eres miembro de "${target.name}".` }, { status: 403 });
      }
      data.sector = { connect: { id: target.id } };
    } else {
      if (self.role !== "admin") {
        return NextResponse.json({ error: "Sólo un admin puede dejar un pick sin sector" }, { status: 403 });
      }
      data.sector = { disconnect: true };
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  try {
    await prisma.topPick.update({ where: { id }, data });
    await logAdminChanges(
      [{
        entity: ENTITY.topPick, entityKey: id, label: pick.nombreLatam,
        field: "pick", oldValue: pick.sector?.name ?? "Unassigned",
        newValue: "actualizado", context: pick.periodDate.toISOString().slice(0, 10),
        action: "update",
      }],
      self.email ?? null,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[top-picks/[id] PATCH]", e);
    return NextResponse.json({ error: "No se pudo actualizar el pick" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const deny = await requireAuth();
  if (deny) return deny;
  const { id } = await params;

  const ctx = await loadWritable(id);
  if (ctx.error) return ctx.error;
  const { pick, self } = ctx;

  try {
    await prisma.topPick.delete({ where: { id } });
    await logAdminChanges(
      [{
        entity: ENTITY.topPick, entityKey: id, label: pick.nombreLatam,
        field: "pick", oldValue: `${pick.region} · ${pick.sector?.name ?? "Unassigned"}`,
        newValue: null, context: pick.periodDate.toISOString().slice(0, 10), action: "delete",
      }],
      self.email ?? null,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[top-picks/[id] DELETE]", e);
    return NextResponse.json({ error: "No se pudo borrar el pick" }, { status: 500 });
  }
}
