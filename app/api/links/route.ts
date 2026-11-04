import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth, getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Links a herramientas y ejercicios de los analistas (vista Useful Links, /links).
// GET y POST para cualquier sesión; PATCH/PUT/DELETE sólo admin. Las secciones viven en
// /api/links/sections. Altas, ediciones y bajas quedan en admin_change_log.

export interface LinkSectionRow {
  id: number;
  name: string;
}

export interface AnalystLinkRow {
  id: number;
  sectionId: number | null; // null = anterior a las secciones ("Unassigned")
  name: string;
  url: string;
  description: string | null;
  createdBy: string | null;
  createdAt: string; // ISO
}

function toRow(r: { id: number; sectionId: number | null; name: string; url: string; description: string | null; createdBy: string | null; createdAt: Date }): AnalystLinkRow {
  return {
    id: r.id, sectionId: r.sectionId, name: r.name, url: r.url, description: r.description,
    createdBy: r.createdBy, createdAt: r.createdAt.toISOString(),
  };
}

// Acepta "sharepoint.com/..." sin esquema (lo más común al pegar) y rechaza javascript: & co.
function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString().slice(0, 1000) : null;
  } catch {
    return null;
  }
}

const cleanText = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

// Posición al final de la sección.
async function nextSortOrder(sectionId: number): Promise<number> {
  const last = await prisma.analystLink.findFirst({
    where: { sectionId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}

export async function GET() {
  try {
    const [sections, links] = await Promise.all([
      prisma.linkSection.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, name: true } }),
      prisma.analystLink.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    ]);
    return NextResponse.json({ sections, links: links.map(toRow) });
  } catch (err) {
    console.warn("[links GET]", String(err).slice(0, 160));
    return NextResponse.json({ sections: [], links: [], unavailable: "The link_sections table does not exist yet (run `npx prisma db push`)." });
  }
}

export async function POST(request: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const sectionId = typeof body.sectionId === "number" ? body.sectionId : NaN;
  const name = cleanText(body.name, 120);
  const url = cleanUrl(body.url);
  if (!Number.isInteger(sectionId) || !name || !url) {
    return NextResponse.json({ error: "A title and a valid http(s) link are required." }, { status: 400 });
  }
  const section = await prisma.linkSection.findUnique({ where: { id: sectionId } });
  if (!section) return NextResponse.json({ error: "This section no longer exists." }, { status: 404 });

  const user = await getSessionUser();
  const created = await prisma.analystLink.create({
    data: {
      sectionId, name, url, description: cleanText(body.description, 300),
      sortOrder: await nextSortOrder(sectionId), createdBy: user?.email ?? null,
    },
  });
  await prisma.adminChangeLog.create({
    data: {
      entity: "analyst_links", entityKey: String(created.id), label: name, field: "url",
      oldValue: null, newValue: url.slice(0, 300), context: section.name.slice(0, 60), action: "create", editedBy: user?.email ?? null,
    },
  });
  return NextResponse.json({ link: toRow(created) });
}

export async function PATCH(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "number" ? body.id : NaN;
  const sectionId = typeof body.sectionId === "number" ? body.sectionId : null;
  const name = cleanText(body.name, 120);
  const url = cleanUrl(body.url);
  if (!Number.isInteger(id) || !name || !url) {
    return NextResponse.json({ error: "A title and a valid http(s) link are required." }, { status: 400 });
  }
  const before = await prisma.analystLink.findUnique({ where: { id }, include: { section: true } });
  if (!before) return NextResponse.json({ error: "This link no longer exists." }, { status: 404 });
  const section = sectionId === null ? null : await prisma.linkSection.findUnique({ where: { id: sectionId } });
  if (sectionId !== null && !section) return NextResponse.json({ error: "This section no longer exists." }, { status: 404 });

  const user = await getSessionUser();
  const description = cleanText(body.description, 300);
  const moved = sectionId !== before.sectionId;
  const updated = await prisma.analystLink.update({
    where: { id },
    data: { name, url, description, sectionId, ...(moved && sectionId !== null ? { sortOrder: await nextSortOrder(sectionId) } : {}) },
  });

  const diffs = ([
    ["name", before.name, name], ["url", before.url, url], ["description", before.description, description],
    ["section", before.section?.name ?? null, section?.name ?? null],
  ] as const).filter(([, a, b]) => (a ?? null) !== (b ?? null));
  if (diffs.length) {
    await prisma.adminChangeLog.createMany({
      data: diffs.map(([field, oldValue, newValue]) => ({
        entity: "analyst_links", entityKey: String(id), label: name, field,
        oldValue: oldValue?.slice(0, 300) ?? null, newValue: newValue?.slice(0, 300) ?? null,
        context: (section?.name ?? before.section?.name)?.slice(0, 60) ?? null, action: "update", editedBy: user?.email ?? null,
      })),
    });
  }
  return NextResponse.json({ link: toRow(updated) });
}

// Orden de los links dentro de una sección: `ids` en el orden final. El filtro por sección
// deja sin efecto un id que otro admin haya movido o borrado mientras tanto.
export async function PUT(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const sectionId = typeof body.sectionId === "number" ? body.sectionId : NaN;
  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (!Number.isInteger(sectionId) || !ids.length || !ids.every(Number.isInteger)) {
    return NextResponse.json({ error: "sectionId and ids are required." }, { status: 400 });
  }
  await prisma.$transaction(
    (ids as number[]).map((id, sortOrder) => prisma.analystLink.updateMany({ where: { id, sectionId }, data: { sortOrder } })),
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const id = parseInt(request.nextUrl.searchParams.get("id") ?? "", 10);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const before = await prisma.analystLink.findUnique({ where: { id }, include: { section: true } });
  if (!before) return NextResponse.json({ ok: true });

  const user = await getSessionUser();
  await prisma.$transaction([
    prisma.analystLink.delete({ where: { id } }),
    prisma.adminChangeLog.create({
      data: {
        entity: "analyst_links", entityKey: String(id), label: before.name, field: "url",
        oldValue: before.url.slice(0, 300), newValue: null, context: before.section?.name.slice(0, 60) ?? null, action: "delete", editedBy: user?.email ?? null,
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
