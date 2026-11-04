import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth, getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Secciones de la vista Useful Links. POST para cualquier sesión; PATCH (renombrar),
// PUT (ordenar) y DELETE sólo admin. La lectura va junto con los links en GET /api/links.

const cleanName = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null;

// El @unique de Postgres distingue mayúsculas: "Banks" y "banks" serían dos secciones.
async function nameTaken(name: string, exceptId?: number): Promise<boolean> {
  const hit = await prisma.linkSection.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return hit !== null;
}

const TAKEN = { error: "A section with that name already exists." };

export async function POST(request: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = cleanName(body.name);
  if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });
  if (await nameTaken(name)) return NextResponse.json(TAKEN, { status: 409 });

  const user = await getSessionUser();
  const last = await prisma.linkSection.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const created = await prisma.linkSection.create({
    data: { name, sortOrder: (last?.sortOrder ?? -1) + 1, createdBy: user?.email ?? null },
  });
  await prisma.adminChangeLog.create({
    data: {
      entity: "link_sections", entityKey: String(created.id), label: name, field: "name",
      oldValue: null, newValue: name, action: "create", editedBy: user?.email ?? null,
    },
  });
  return NextResponse.json({ section: { id: created.id, name: created.name } });
}

export async function PATCH(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "number" ? body.id : NaN;
  const name = cleanName(body.name);
  if (!Number.isInteger(id) || !name) return NextResponse.json({ error: "A name is required." }, { status: 400 });
  const before = await prisma.linkSection.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "This section no longer exists." }, { status: 404 });
  if (await nameTaken(name, id)) return NextResponse.json(TAKEN, { status: 409 });

  const user = await getSessionUser();
  await prisma.$transaction([
    prisma.linkSection.update({ where: { id }, data: { name } }),
    prisma.adminChangeLog.create({
      data: {
        entity: "link_sections", entityKey: String(id), label: name, field: "name",
        oldValue: before.name, newValue: name, action: "update", editedBy: user?.email ?? null,
      },
    }),
  ]);
  return NextResponse.json({ section: { id, name } });
}

// Orden de las secciones: `ids` en el orden final.
export async function PUT(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (!ids.length || !ids.every(Number.isInteger)) {
    return NextResponse.json({ error: "ids is required." }, { status: 400 });
  }
  await prisma.$transaction(
    (ids as number[]).map((id, sortOrder) => prisma.linkSection.updateMany({ where: { id }, data: { sortOrder } })),
  );
  return NextResponse.json({ ok: true });
}

// Borra la sección y, por cascada, sus links. Cada link queda en admin_change_log con su
// URL, para poder reconstruirlo si se borró por error.
export async function DELETE(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const id = parseInt(request.nextUrl.searchParams.get("id") ?? "", 10);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const before = await prisma.linkSection.findUnique({ where: { id }, include: { links: true } });
  if (!before) return NextResponse.json({ ok: true });

  const user = await getSessionUser();
  const editedBy = user?.email ?? null;
  const context = before.name.slice(0, 60);
  await prisma.$transaction([
    prisma.linkSection.delete({ where: { id } }),
    prisma.adminChangeLog.createMany({
      data: [
        { entity: "link_sections", entityKey: String(id), label: before.name, field: "name", oldValue: before.name, newValue: null, action: "delete", editedBy },
        ...before.links.map((l) => ({
          entity: "analyst_links", entityKey: String(l.id), label: l.name, field: "url",
          oldValue: l.url.slice(0, 300), newValue: null, context, action: "delete", editedBy,
        })),
      ],
    }),
  ]);
  return NextResponse.json({ ok: true });
}
