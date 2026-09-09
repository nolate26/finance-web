import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";
import type { FormerAnalyst, PickSectorDTO, PickSectorsPayload } from "@/lib/topPicks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Sectores de Top Picks. Lista PROPIA, separada de la de Team Planning: los dos ejes
// se parecen hoy pero evolucionan por su cuenta, y acoplarlos haría que sacar a
// alguien de un sector de tareas le apagara los picks sin que nadie lo pidiera.
//
// PERMISOS: leer es abierto a cualquier autenticado; crear/renombrar/borrar sectores
// y repartir miembros es sólo admin. Quién puede agregar PICKS dentro de un sector lo
// decide la membresía (ver canWrite).

const NAME_MAX = 120;

export async function GET(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;
  const self = await getSessionUser();
  if (!self) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const isAdmin = self.role === "admin";
  // Sin ?region se devuelven todos; la vista siempre lo manda, así cada región ve
  // y administra sólo sus propios sectores.
  const region = req.nextUrl.searchParams.get("region")?.trim().toUpperCase() || null;

  try {
    const [rows, authorRows, users] = await Promise.all([
      prisma.pickSector.findMany({
        where:   region ? { region } : undefined,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          members: { include: { user: { select: { id: true, name: true, email: true, initials: true } } } },
        },
      }),
      // Quién dejó picks en cada sector, con cuántos. De acá salen los "analistas
      // anteriores": los que aparecen acá pero no en members son los que tienen sus
      // picks en gris.
      prisma.topPick.groupBy({
        by:    ["sectorId", "authorName"],
        where: { sectorId: { not: null }, authorName: { not: null } },
        _count: { _all: true },
      }),
      prisma.user.findMany({ select: { id: true, name: true } }),
    ]);

    const byName = new Map(
      users.filter((u) => u.name).map((u) => [u.name!.trim().toLowerCase(), u.id]),
    );

    const sectors: PickSectorDTO[] = rows.map((s) => {
      const memberIds = new Set(s.members.map((m) => m.userId));

      // Un autor es "anterior" si tiene picks acá y su usuario NO está entre los
      // miembros — sea porque lo sacaron o porque ya no existe en la plataforma.
      const former: FormerAnalyst[] = authorRows
        .filter((a) => a.sectorId === s.id && a.authorName)
        .map((a) => ({
          name:   a.authorName!,
          userId: byName.get(a.authorName!.trim().toLowerCase()) ?? null,
          picks:  a._count._all,
        }))
        .filter((f) => !f.userId || !memberIds.has(f.userId))
        .sort((a, b) => b.picks - a.picks);

      return {
        id:          s.id,
        region:      s.region,
        name:        s.name,
        description: s.description,
        sortOrder:   s.sortOrder,
        members:     s.members.map((m) => m.user),
        former,
        canWrite:    isAdmin || memberIds.has(self.id),
      };
    });

    return NextResponse.json({ sectors, isAdmin } satisfies PickSectorsPayload);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
      return NextResponse.json(
        { error: "Las tablas de sectores de Top Picks no existen todavía. Falta correr `npx prisma db push`." },
        { status: 503 },
      );
    }
    console.error("[pick-sectors GET]", e);
    return NextResponse.json({ error: "No se pudieron cargar los sectores" }, { status: 500 });
  }
}

// ── POST — crear sector (sólo admin) ──────────────────────────────────────────
interface CreateBody {
  region?:      string;
  name?:        string;
  description?: string | null;
  memberIds?:   string[];
}

export async function POST(req: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const self = await getSessionUser();

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  if (name.length > NAME_MAX) {
    return NextResponse.json({ error: `El nombre supera ${NAME_MAX} caracteres` }, { status: 400 });
  }

  const region = body.region?.trim().toUpperCase();
  if (region !== "CHILE" && region !== "LATAM") {
    return NextResponse.json({ error: "region debe ser CHILE o LATAM" }, { status: 400 });
  }

  const memberIds = [...new Set(body.memberIds ?? [])];
  if (memberIds.length) {
    const found = await prisma.user.count({ where: { id: { in: memberIds } } });
    if (found !== memberIds.length) {
      return NextResponse.json({ error: "Hay analistas que ya no existen" }, { status: 400 });
    }
  }

  try {
    // El orden se numera dentro de la región, no global.
    const last = await prisma.pickSector.findFirst({
      where: { region },
      orderBy: { sortOrder: "desc" }, select: { sortOrder: true },
    });

    const sector = await prisma.$transaction(async (tx) => {
      const created = await tx.pickSector.create({
        data: {
          region,
          name,
          description: body.description?.trim() || null,
          sortOrder:   (last?.sortOrder ?? 0) + 1,
          updatedBy:   self?.email ?? null,
        },
      });
      if (memberIds.length) {
        await tx.pickSectorMember.createMany({
          data: memberIds.map((userId) => ({ sectorId: created.id, userId })),
        });
      }
      return created;
    });

    await logAdminChanges(
      [{
        entity: ENTITY.pickSector, entityKey: sector.id, label: name,
        field: "sector", oldValue: null,
        newValue: `${name} · ${memberIds.length} miembro(s)`, action: "create",
      }],
      self?.email ?? null,
    );

    return NextResponse.json({ id: sector.id }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: `Ya existe un sector "${name}" en ${region}` }, { status: 409 });
    }
    console.error("[pick-sectors POST]", e);
    return NextResponse.json({ error: "No se pudo crear el sector" }, { status: 500 });
  }
}
