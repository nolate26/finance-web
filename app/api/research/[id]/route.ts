import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { normalizeTicker } from "@/lib/issuer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── PATCH — editar / mover una nota de research (solo admin) ─────────────────────
// "Mover" = cambiar `company` (reasigna la empresa) o `category` (reagrupa).
interface PatchBody {
  company?:        string;
  date?:           string;   // "YYYY-MM-DD"
  category?:       string;
  title?:          string | null;
  subject?:        string | null;
  html?:           string;   // cuerpo/contenido de la nota (HTML)
  targetPrice?:    number | string | null;
  recommendation?: string | null;
}

function numOrNull(v: number | string | null | undefined): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data: Prisma.EmailResearchUpdateInput = {};
  // `company` es el ticker Bloomberg: se guarda canónico (sin espacios, MAYÚSCULAS)
  // para que case con empresas_industrias_v2 y no vuelva a quedar huérfana.
  if (body.company !== undefined) {
    const ticker = normalizeTicker(body.company);
    if (!ticker) {
      return NextResponse.json({ error: "company no puede quedar vacío" }, { status: 400 });
    }
    data.company = ticker;
  }
  if (body.category       !== undefined) data.category       = body.category.trim();
  if (body.title          !== undefined) data.title          = body.title?.trim() || null;
  if (body.subject        !== undefined) data.subject        = body.subject?.trim() || null;
  if (body.recommendation !== undefined) data.recommendation = body.recommendation?.trim() || null;
  // El cuerpo se guarda tal cual (no se trimea); es contenido HTML editado por el admin.
  if (body.html           !== undefined) data.html           = body.html;

  const tp = numOrNull(body.targetPrice);
  if (tp !== undefined) data.targetPrice = tp;

  if (body.date !== undefined) {
    const d = new Date(body.date);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "date inválido" }, { status: 400 });
    }
    data.date = d;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  try {
    const record = await prisma.emailResearch.update({
      where: { id: numericId },
      data,
      select: {
        id: true, company: true, date: true, category: true, title: true,
        subject: true, from: true, targetPrice: true, recommendation: true,
      },
    });
    return NextResponse.json({
      record: { ...record, date: record.date.toISOString().slice(0, 10) },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
    }
    console.error("[research/[id] PATCH]", e);
    return NextResponse.json({ error: "No se pudo actualizar la nota" }, { status: 500 });
  }
}

// ── DELETE — eliminar una nota de research (solo admin) ──────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    await prisma.emailResearch.delete({ where: { id: numericId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
    }
    console.error("[research/[id] DELETE]", e);
    return NextResponse.json({ error: "No se pudo eliminar la nota" }, { status: 500 });
  }
}
