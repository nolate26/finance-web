import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";
import { DEFAULT_SECTIONS, SECTOR_NAME_MAX } from "@/lib/planning";
import type { SectorDTO, SectorsPayload } from "@/lib/planningTasks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Sectores del módulo de planificación.
//
//   GET  — abierto a cualquier autenticado: devuelve TODOS los sectores con sus
//          miembros y sub-secciones, más un `canWrite` por sector calculado en el
//          servidor. La visibilidad es total; lo que cambia es qué puedes tocar.
//   POST — sólo admin.

// Las tablas de sectores llegaron en un refactor posterior al resto del módulo, así
// que es esperable toparse con una base a medio migrar. Prisma devuelve P2021 y sin
// este mensaje el usuario ve un 500 sin pista de qué hacer.
const MIGRATION_HINT =
  "Las tablas de sectores no existen todavía en esta base. Falta correr `npx prisma db push` (ver prisma/sql/planning_comments.sql para los comentarios del MCP).";

// ── GET — todos los sectores ──────────────────────────────────────────────────
export async function GET() {
  const deny = await requireAuth();
  if (deny) return deny;
  const self = await getSessionUser();
  if (!self) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const isAdmin = self.role === "admin";

  try {
    const rows = await prisma.sector.findMany({
      // isGeneral primero: "Coordinación General" siempre encabeza la pantalla.
      orderBy: [{ isGeneral: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: {
        members:  { include: { user: { select: { id: true, name: true, email: true, initials: true } } } },
        sections: { orderBy: { sortOrder: "asc" } },
      },
    });

    const sectors: SectorDTO[] = rows.map((s) => ({
      id:          s.id,
      name:        s.name,
      description: s.description,
      isGeneral:   s.isGeneral,
      sortOrder:   s.sortOrder,
      members:     s.members.map((m) => m.user),
      sections:    s.sections.map((sec) => ({ id: sec.id, name: sec.name, sortOrder: sec.sortOrder })),
      canWrite:    isAdmin || s.members.some((m) => m.userId === self.id),
    }));

    return NextResponse.json({ sectors, isAdmin } satisfies SectorsPayload);
  } catch (e) {
    // P2021 = la tabla no existe. No es un fallo interno sino una migración pendiente,
    // así que se responde con la instrucción concreta en vez de un 500 opaco.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
      return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
    }
    console.error("[planning/sectors GET]", e);
    return NextResponse.json({ error: "No se pudieron cargar los sectores" }, { status: 500 });
  }
}

// ── POST — crear sector (sólo admin) ──────────────────────────────────────────
interface CreateBody {
  name?:        string;
  description?: string | null;
  isGeneral?:   boolean;
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
  if (name.length > SECTOR_NAME_MAX) {
    return NextResponse.json({ error: `El nombre supera ${SECTOR_NAME_MAX} caracteres` }, { status: 400 });
  }

  const isGeneral = body.isGeneral === true;
  if (isGeneral) {
    // Coordinación General es un singleton: un segundo espacio transversal no
    // significaría nada y rompería el layout (va arriba de la grilla, solo).
    const exists = await prisma.sector.count({ where: { isGeneral: true } });
    if (exists) {
      return NextResponse.json({ error: "Ya existe la Coordinación General" }, { status: 409 });
    }
  }

  const memberIds = [...new Set(body.memberIds ?? [])];
  if (memberIds.length) {
    const found = await prisma.user.count({ where: { id: { in: memberIds } } });
    if (found !== memberIds.length) {
      return NextResponse.json({ error: "Hay analistas que ya no existen" }, { status: 400 });
    }
  }

  try {
    const last = await prisma.sector.findFirst({
      orderBy: { sortOrder: "desc" },
      select:  { sortOrder: true },
    });

    // Sector + sus tres sub-secciones por defecto + miembros, todo o nada: un sector
    // sin secciones no admitiría ni una tarea, así que no puede quedar a medias.
    const sector = await prisma.$transaction(async (tx) => {
      const created = await tx.sector.create({
        data: {
          name,
          description: body.description?.trim() || null,
          isGeneral,
          sortOrder:   (last?.sortOrder ?? 0) + 1,
          updatedBy:   self?.email ?? null,
        },
      });

      await tx.sectorSection.createMany({
        data: DEFAULT_SECTIONS.map((n, i) => ({ sectorId: created.id, name: n, sortOrder: i })),
      });

      if (memberIds.length) {
        await tx.sectorMember.createMany({
          data: memberIds.map((userId) => ({ sectorId: created.id, userId })),
        });
      }
      return created;
    });

    await logAdminChanges(
      [{
        entity:    ENTITY.sector,
        entityKey: sector.id,
        label:     name,
        field:     "sector",
        oldValue:  null,
        newValue:  `${name}${isGeneral ? " (general)" : ""} · ${memberIds.length} miembro(s)`,
        action:    "create",
      }],
      self?.email ?? null,
    );

    return NextResponse.json({ id: sector.id }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return NextResponse.json({ error: "Ya existe un sector con ese nombre" }, { status: 409 });
      }
      if (e.code === "P2021") {
        return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
      }
    }
    console.error("[planning/sectors POST]", e);
    return NextResponse.json({ error: "No se pudo crear el sector" }, { status: 500 });
  }
}
