import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Links a herramientas y ejercicios de los analistas (pestaña "Useful Links" de Chile y
// LatAm). GET para cualquier sesión (el middleware ya exige login); POST/PATCH/DELETE
// sólo admin. Altas y bajas quedan en admin_change_log.

export interface AnalystLinkRow {
  id: number;
  region: string;
  name: string;
  url: string;
  description: string | null;
  createdBy: string | null;
  createdAt: string; // ISO
}

const REGIONS = new Set(["CHILE", "LATAM"]);

function toRow(r: { id: number; region: string; name: string; url: string; description: string | null; createdBy: string | null; createdAt: Date }): AnalystLinkRow {
  return { ...r, createdAt: r.createdAt.toISOString() };
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

export async function GET(request: NextRequest) {
  const region = (request.nextUrl.searchParams.get("region") ?? "").toUpperCase();
  if (!REGIONS.has(region)) return NextResponse.json({ error: "region debe ser CHILE o LATAM" }, { status: 400 });
  try {
    const rows = await prisma.analystLink.findMany({
      where: { region },
      orderBy: [{ name: "asc" }],
    });
    return NextResponse.json({ links: rows.map(toRow) });
  } catch (err) {
    console.warn("[links GET]", String(err).slice(0, 160));
    return NextResponse.json({ links: [], unavailable: "La tabla analyst_links todavía no existe (falta `npx prisma db push`)." });
  }
}

export async function POST(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const region = typeof body.region === "string" ? body.region.toUpperCase() : "";
  const name = cleanText(body.name, 120);
  const url = cleanUrl(body.url);
  if (!REGIONS.has(region) || !name || !url) {
    return NextResponse.json({ error: "Nombre y un link http(s) válido son obligatorios." }, { status: 400 });
  }
  const user = await getSessionUser();
  const created = await prisma.analystLink.create({
    data: { region, name, url, description: cleanText(body.description, 300), createdBy: user?.email ?? null },
  });
  await prisma.adminChangeLog.create({
    data: {
      entity: "analyst_links", entityKey: String(created.id), label: name, field: "url",
      oldValue: null, newValue: url.slice(0, 300), context: region, action: "create", editedBy: user?.email ?? null,
    },
  });
  return NextResponse.json({ link: toRow(created) });
}

export async function PATCH(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "number" ? body.id : NaN;
  const name = cleanText(body.name, 120);
  const url = cleanUrl(body.url);
  if (!Number.isInteger(id) || !name || !url) {
    return NextResponse.json({ error: "Nombre y un link http(s) válido son obligatorios." }, { status: 400 });
  }
  const before = await prisma.analystLink.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "El link ya no existe." }, { status: 404 });

  const user = await getSessionUser();
  const description = cleanText(body.description, 300);
  const updated = await prisma.analystLink.update({ where: { id }, data: { name, url, description } });

  const diffs = ([["name", before.name, name], ["url", before.url, url], ["description", before.description, description]] as const)
    .filter(([, a, b]) => (a ?? null) !== (b ?? null));
  if (diffs.length) {
    await prisma.adminChangeLog.createMany({
      data: diffs.map(([field, oldValue, newValue]) => ({
        entity: "analyst_links", entityKey: String(id), label: name, field,
        oldValue: oldValue?.slice(0, 300) ?? null, newValue: newValue?.slice(0, 300) ?? null,
        context: before.region, action: "update", editedBy: user?.email ?? null,
      })),
    });
  }
  return NextResponse.json({ link: toRow(updated) });
}

export async function DELETE(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const id = parseInt(request.nextUrl.searchParams.get("id") ?? "", 10);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const before = await prisma.analystLink.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ ok: true });

  const user = await getSessionUser();
  await prisma.$transaction([
    prisma.analystLink.delete({ where: { id } }),
    prisma.adminChangeLog.create({
      data: {
        entity: "analyst_links", entityKey: String(id), label: before.name, field: "url",
        oldValue: before.url.slice(0, 300), newValue: null, context: before.region, action: "delete", editedBy: user?.email ?? null,
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
