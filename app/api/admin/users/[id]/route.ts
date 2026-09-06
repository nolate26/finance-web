import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BCRYPT_ROUNDS = 10;
const ROLES = ["admin", "user"] as const;

// ── PATCH — actualizar rol / nombre / contraseña (solo admin) ───────────────────
interface PatchBody {
  name?:     string;
  role?:     string;
  password?: string;   // si viene, resetea la contraseña
  initials?: string;   // sigla del calendario semanal ("DM", "AP"); "" la borra
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const { id } = await params;

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data: Prisma.UserUpdateInput = {};

  if (body.name !== undefined) data.name = body.name.trim() || null;

  if (body.role !== undefined) {
    const role = body.role.trim();
    if (!ROLES.includes(role as (typeof ROLES)[number])) {
      return NextResponse.json({ error: `Rol inválido (${ROLES.join(" | ")})` }, { status: 400 });
    }
    // Evitar que el admin se quite a sí mismo el rol admin (se quedaría sin acceso).
    const self = await getSessionUser();
    if (self?.id === id && role !== "admin") {
      return NextResponse.json({ error: "No puedes quitarte a ti mismo el rol de admin" }, { status: 400 });
    }
    data.role = role;
  }

  if (body.password !== undefined) {
    if (body.password.length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
    }
    data.password = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
  }

  if (body.initials !== undefined) {
    const initials = body.initials.trim().toUpperCase();
    if (initials && !/^[A-Z]{1,8}$/.test(initials)) {
      return NextResponse.json({ error: "La sigla debe ser 1 a 8 letras" }, { status: 400 });
    }
    data.initials = initials || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where:  { id },
      data,
      select: { id: true, email: true, name: true, role: true, initials: true },
    });
    return NextResponse.json({ user });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") {
        return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
      }
      // users.initials es único: dos analistas con la misma sigla harían ambigua la grilla.
      if (e.code === "P2002") {
        return NextResponse.json({ error: "Esa sigla ya la usa otro analista" }, { status: 409 });
      }
    }
    console.error("[admin/users/[id] PATCH]", e);
    return NextResponse.json({ error: "No se pudo actualizar el usuario" }, { status: 500 });
  }
}

// ── DELETE — eliminar usuario (solo admin) ──────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const { id } = await params;

  // Bloquear que el admin se borre a sí mismo.
  const self = await getSessionUser();
  if (self?.id === id) {
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 400 });
  }

  // tasks.assignee_id y created_by_id son onDelete: Restrict — borrar a alguien con
  // tareas vivas falla a nivel de FK. Se chequea acá para devolver un mensaje que se
  // entienda (y el número exacto) en vez del P2003 crudo, que saldría como 500.
  const [assigned, authored, comments] = await Promise.all([
    prisma.task.count({ where: { assigneeId: id } }),
    prisma.task.count({ where: { createdById: id, assigneeId: { not: id } } }),
    prisma.taskComment.count({ where: { authorId: id } }),
  ]);

  if (assigned || authored || comments) {
    const parts: string[] = [];
    if (assigned) parts.push(`${assigned} tarea${assigned === 1 ? "" : "s"} asignada${assigned === 1 ? "" : "s"}`);
    if (authored) parts.push(`${authored} creada${authored === 1 ? "" : "s"} para otros`);
    if (comments) parts.push(`${comments} comentario${comments === 1 ? "" : "s"}`);
    return NextResponse.json({
      error: `No se puede eliminar: tiene ${parts.join(", ")}. Reasigna o borra ese trabajo primero.`,
    }, { status: 409 });
  }

  try {
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") {
        return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
      }
      if (e.code === "P2003") {
        return NextResponse.json(
          { error: "No se puede eliminar: el usuario todavía tiene trabajo asociado" },
          { status: 409 },
        );
      }
    }
    console.error("[admin/users/[id] DELETE]", e);
    return NextResponse.json({ error: "No se pudo eliminar el usuario" }, { status: 500 });
  }
}
