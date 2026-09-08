import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUser, canWriteSector } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Feed de comentarios de una tarea.
//
//   · LEER      es abierto: cualquier autenticado ve el hilo de cualquier tarea, igual
//               que ve la tarea misma.
//   · COMENTAR  sigue la misma regla que editar — miembros del sector, o admin. Ver una
//               tarea ajena no habilita a intervenir en su hilo.
//   · BORRAR    un comentario: su autor, o un admin.
//
// El autor sale SIEMPRE de la sesión, nunca del body — si no, cualquiera podría firmar
// un comentario con el nombre de otro.

export interface CommentDTO {
  id:        string;
  body:      string;
  author:    { id: string; name: string | null; email: string | null; initials: string | null };
  createdAt: string;
  updatedAt: string;
}

const MAX_BODY = 4000;

/** Carga la tarea con su sector. No exige permiso de escritura: leer es abierto. */
async function loadTask(taskId: string) {
  const self = await getSessionUser();
  if (!self) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };

  const task = await prisma.task.findUnique({
    where:  { id: taskId },
    select: { id: true, title: true, section: { select: { sectorId: true } } },
  });
  if (!task) return { error: NextResponse.json({ error: "La tarea no existe" }, { status: 404 }) };

  return { self, task };
}

// ── GET — feed completo, más antiguo primero ─────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireAuth();
  if (deny) return deny;
  const { id } = await params;

  const ctx = await loadTask(id);
  if (ctx.error) return ctx.error;

  try {
    const rows = await prisma.taskComment.findMany({
      where:   { taskId: id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, name: true, email: true, initials: true } } },
    });

    const comments: CommentDTO[] = rows.map((c) => ({
      id:        c.id,
      body:      c.body,
      author:    c.author,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    return NextResponse.json({ comments });
  } catch (e) {
    console.error("[planning/tasks/[id]/comments GET]", e);
    return NextResponse.json({ error: "No se pudieron cargar los comentarios" }, { status: 500 });
  }
}

// ── POST — dejar un comentario ───────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireAuth();
  if (deny) return deny;
  const { id } = await params;

  const ctx = await loadTask(id);
  if (ctx.error) return ctx.error;
  const { self, task } = ctx;

  if (!(await canWriteSector(task.section.sectorId))) {
    return NextResponse.json(
      { error: "No eres miembro de este sector: puedes leer el hilo, pero no comentar." },
      { status: 403 },
    );
  }

  let body: { body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const text = body.body?.trim();
  if (!text) return NextResponse.json({ error: "El comentario está vacío" }, { status: 400 });
  if (text.length > MAX_BODY) {
    return NextResponse.json({ error: `El comentario supera ${MAX_BODY} caracteres` }, { status: 400 });
  }

  try {
    const created = await prisma.taskComment.create({
      data:    { taskId: id, authorId: self.id, body: text },
      include: { author: { select: { id: true, name: true, email: true, initials: true } } },
    });

    return NextResponse.json({
      comment: {
        id:        created.id,
        body:      created.body,
        author:    created.author,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      } satisfies CommentDTO,
    }, { status: 201 });
  } catch (e) {
    console.error("[planning/tasks/[id]/comments POST]", e);
    return NextResponse.json({ error: "No se pudo guardar el comentario" }, { status: 500 });
  }
}

// ── DELETE — borrar un comentario propio (o cualquiera, si es admin) ─────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireAuth();
  if (deny) return deny;
  const { id } = await params;

  const ctx = await loadTask(id);
  if (ctx.error) return ctx.error;
  const { self } = ctx;

  const commentId = new URL(req.url).searchParams.get("commentId");
  if (!commentId) return NextResponse.json({ error: "Falta commentId" }, { status: 400 });

  try {
    const comment = await prisma.taskComment.findUnique({
      where:  { id: commentId },
      select: { id: true, taskId: true, authorId: true },
    });
    if (!comment || comment.taskId !== id) {
      return NextResponse.json({ error: "El comentario no existe" }, { status: 404 });
    }
    if (self.role !== "admin" && comment.authorId !== self.id) {
      return NextResponse.json({ error: "Sólo puedes borrar tus propios comentarios" }, { status: 403 });
    }

    await prisma.taskComment.delete({ where: { id: commentId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[planning/tasks/[id]/comments DELETE]", e);
    return NextResponse.json({ error: "No se pudo borrar el comentario" }, { status: 500 });
  }
}
