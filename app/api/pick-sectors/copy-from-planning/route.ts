import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Atajo de setup: copia los sectores de Team Planning a Top Picks.
//
// Es una COPIA DE UNA VEZ, no un vínculo. Las dos listas siguen siendo independientes:
// después de esto, renombrar o repartir un sector en Planning no toca nada acá. Existe
// sólo porque arrancar con la pantalla en blanco cuando ya tienes los sectores
// definidos al lado es trabajo repetido sin sentido.
//
// Idempotente: los sectores cuyo nombre ya existe en Top Picks se SALTAN enteros
// (no se les tocan los miembros), así que se puede correr dos veces sin duplicar ni
// pisar cambios locales.

export async function POST(req: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const self = await getSessionUser();

  // Los sectores son por región, así que la copia también: se pide desde Chile o
  // desde LatAm y sólo se crean ahí.
  let body: { region?: string } = {};
  try { body = await req.json(); } catch { /* sin cuerpo → se valida abajo */ }
  const region = body.region?.trim().toUpperCase();
  if (region !== "CHILE" && region !== "LATAM") {
    return NextResponse.json({ error: "region debe ser CHILE o LATAM" }, { status: 400 });
  }

  try {
    const [planning, existing] = await Promise.all([
      prisma.sector.findMany({
        // "Coordinación General" no es un sector de cobertura: es el espacio
        // transversal de tareas del equipo y no tiene sentido como sector de picks.
        where:   { isGeneral: false },
        orderBy: { sortOrder: "asc" },
        include: { members: { select: { userId: true } } },
      }),
      prisma.pickSector.findMany({ where: { region }, select: { name: true } }),
    ]);

    const taken = new Set(existing.map((s) => s.name.toLowerCase()));
    const toCopy = planning.filter((s) => !taken.has(s.name.toLowerCase()));

    if (toCopy.length === 0) {
      return NextResponse.json({
        created: 0,
        skipped: planning.length,
        message: planning.length
          ? `Los sectores de Team Planning ya existen en ${region}.`
          : "Team Planning no tiene sectores que copiar.",
      });
    }

    const last = await prisma.pickSector.findFirst({
      where: { region },
      orderBy: { sortOrder: "desc" }, select: { sortOrder: true },
    });
    let order = (last?.sortOrder ?? 0) + 1;

    const created: { id: string; name: string; members: number }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const src of toCopy) {
        const sector = await tx.pickSector.create({
          data: {
            region,
            name:        src.name,
            description: src.description,
            sortOrder:   order++,
            updatedBy:   self?.email ?? null,
          },
        });
        if (src.members.length) {
          await tx.pickSectorMember.createMany({
            data: src.members.map((m) => ({ sectorId: sector.id, userId: m.userId })),
          });
        }
        created.push({ id: sector.id, name: sector.name, members: src.members.length });
      }
    });

    await logAdminChanges(
      created.map((s) => ({
        entity: ENTITY.pickSector, entityKey: s.id, label: s.name,
        field: "sector", oldValue: null,
        newValue: `copiado de Team Planning · ${s.members} miembro(s)`,
        action: "create" as const,
      })),
      self?.email ?? null,
    );

    return NextResponse.json({
      created: created.length,
      skipped: planning.length - created.length,
      sectors: created.map((s) => s.name),
    });
  } catch (e) {
    console.error("[pick-sectors/copy-from-planning]", e);
    return NextResponse.json({ error: "No se pudieron copiar los sectores" }, { status: 500 });
  }
}
