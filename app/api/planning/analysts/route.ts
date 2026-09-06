import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Lista de personas asignables (calendario y Analyst Grid). Abierta a cualquier usuario
// autenticado a propósito: un analista necesita ver de quién es cada tablero y a
// quién menciona un comentario. Devuelve sólo campos públicos — nunca el hash de
// contraseña ni nada que /api/admin/users sí expone bajo rol admin.

export interface AnalystOption {
  id:       string;
  name:     string | null;
  email:    string | null;
  initials: string | null;
  role:     string;
  openTasks: number;
}

export async function GET() {
  const deny = await requireAuth();
  if (deny) return deny;

  try {
    const users = await prisma.user.findMany({
      orderBy: [{ initials: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, email: true, initials: true, role: true,
        _count: { select: { tasksAssigned: { where: { status: { not: "done" } } } } },
      },
    });

    const analysts: AnalystOption[] = users.map((u) => ({
      id:        u.id,
      name:      u.name,
      email:     u.email,
      initials:  u.initials,
      role:      u.role,
      openTasks: u._count.tasksAssigned,
    }));

    return NextResponse.json({ analysts });
  } catch (e) {
    console.error("[planning/analysts GET]", e);
    return NextResponse.json({ error: "No se pudieron cargar los analistas" }, { status: 500 });
  }
}
