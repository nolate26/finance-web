import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";
import { SECTION_NAME_MAX } from "@/lib/planning";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Sub-secciones de un sector. Crear, renombrar, reordenar y borrar: todo sólo admin.
// Las tres iniciales (Chile / Latam & Brasil / Other) las siembra el POST del sector;
// desde acá el equipo las adapta a su forma de trabajo.

// ── POST — nueva sub-sección ──────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const self = await getSessionUser();
  const { id: sectorId } = await params;

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  if (name.length > SECTION_NAME_MAX) {
    return NextResponse.json({ error: `El nombre supera ${SECTION_NAME_MAX} caracteres` }, { status: 400 });
  }

  const sector = await prisma.sector.count({ where: { id: sectorId } });
  if (!sector) return NextResponse.json({ error: "El sector no existe" }, { status: 404 });

  try {
    const last = await prisma.sectorSection.findFirst({
      where:   { sectorId },
      orderBy: { sortOrder: "desc" },
      select:  { sortOrder: true },
    });

    const section = await prisma.sectorSection.create({
      data: { sectorId, name, sortOrder: (last?.sortOrder ?? -1) + 1 },
    });

    await logAdminChanges(
      [{
        entity: ENTITY.sectorSection, entityKey: section.id, label: name,
        field: "section", oldValue: null, newValue: name, context: sectorId, action: "create",
      }],
      self?.email ?? null,
    );

    return NextResponse.json({ id: section.id, name, sortOrder: section.sortOrder }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Ese sector ya tiene una sub-sección con ese nombre" }, { status: 409 });
    }
    console.error("[planning/sectors/[id]/sections POST]", e);
    return NextResponse.json({ error: "No se pudo crear la sub-sección" }, { status: 500 });
  }
}

// ── PATCH — renombrar o reordenar ─────────────────────────────────────────────
interface PatchBody {
  sectionId?: string;
  name?:      string;
  sortOrder?: number;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const self = await getSessionUser();
  const { id: sectorId } = await params;

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.sectionId) return NextResponse.json({ error: "Falta sectionId" }, { status: 400 });

  const section = await prisma.sectorSection.findUnique({
    where:  { id: body.sectionId },
    select: { id: true, sectorId: true, name: true },
  });
  // Se verifica que la sección sea de ESTE sector: si no, un admin podría renombrar
  // por accidente la sección de otro sector pasando un id cruzado.
  if (!section || section.sectorId !== sectorId) {
    return NextResponse.json({ error: "La sub-sección no existe en este sector" }, { status: 404 });
  }

  const data: Prisma.SectorSectionUpdateInput = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
    if (name.length > SECTION_NAME_MAX) {
      return NextResponse.json({ error: `El nombre supera ${SECTION_NAME_MAX} caracteres` }, { status: 400 });
    }
    data.name = name;
  }
  if (body.sortOrder !== undefined) {
    if (!Number.isFinite(body.sortOrder)) {
      return NextResponse.json({ error: "sortOrder inválido" }, { status: 400 });
    }
    data.sortOrder = Math.trunc(body.sortOrder);
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  try {
    await prisma.sectorSection.update({ where: { id: section.id }, data });

    if (data.name && data.name !== section.name) {
      await logAdminChanges(
        [{
          entity: ENTITY.sectorSection, entityKey: section.id, label: data.name as string,
          field: "name", oldValue: section.name, newValue: data.name as string,
          context: sectorId, action: "update",
        }],
        self?.email ?? null,
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Ese sector ya tiene una sub-sección con ese nombre" }, { status: 409 });
    }
    console.error("[planning/sectors/[id]/sections PATCH]", e);
    return NextResponse.json({ error: "No se pudo actualizar la sub-sección" }, { status: 500 });
  }
}

// ── DELETE — borrar una sub-sección vacía ─────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const self = await getSessionUser();
  const { id: sectorId } = await params;

  const sectionId = new URL(req.url).searchParams.get("sectionId");
  if (!sectionId) return NextResponse.json({ error: "Falta sectionId" }, { status: 400 });

  const section = await prisma.sectorSection.findUnique({
    where:  { id: sectionId },
    select: { id: true, sectorId: true, name: true, _count: { select: { tasks: true } } },
  });
  if (!section || section.sectorId !== sectorId) {
    return NextResponse.json({ error: "La sub-sección no existe en este sector" }, { status: 404 });
  }

  // tasks.section_id es Restrict: se cuenta antes para dar un mensaje útil en vez
  // de un P2003. Vaciarla es responsabilidad del admin — mover trabajo en silencio
  // a otra sección sería peor que negarse.
  if (section._count.tasks) {
    const n = section._count.tasks;
    return NextResponse.json({
      error: `No se puede eliminar: "${section.name}" todavía tiene ${n} tarea${n === 1 ? "" : "s"}. Muévelas o bórralas primero.`,
    }, { status: 409 });
  }

  const remaining = await prisma.sectorSection.count({ where: { sectorId } });
  if (remaining <= 1) {
    return NextResponse.json({
      error: "Un sector necesita al menos una sub-sección para poder recibir tareas.",
    }, { status: 400 });
  }

  try {
    await prisma.sectorSection.delete({ where: { id: sectionId } });

    await logAdminChanges(
      [{
        entity: ENTITY.sectorSection, entityKey: sectionId, label: section.name,
        field: "section", oldValue: section.name, newValue: null,
        context: sectorId, action: "delete",
      }],
      self?.email ?? null,
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[planning/sectors/[id]/sections DELETE]", e);
    return NextResponse.json({ error: "No se pudo eliminar la sub-sección" }, { status: 500 });
  }
}
