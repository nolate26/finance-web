import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";
import { TASK_STATUSES, TASK_PRIORITIES, type TaskStatus, type TaskPriority } from "@/lib/planning";
import { TASK_INCLUDE, toTaskDTO } from "@/lib/planningTasks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Detalle, edición y borrado de una tarea.
//   · admin   — cualquier tarea; además es el único que puede reasignarla.
//   · usuario — sólo las suyas (assigneeId === self.id).

/** Devuelve la tarea si el usuario puede tocarla, o la NextResponse de error. */
async function loadAuthorized(id: string) {
  const self = await getSessionUser();
  if (!self) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };

  const task = await prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
  if (!task) return { error: NextResponse.json({ error: "La tarea no existe" }, { status: 404 }) };

  const isAdmin = self.role === "admin";
  if (!isAdmin && task.assigneeId !== self.id) {
    return { error: NextResponse.json({ error: "Esta tarea no es tuya" }, { status: 403 }) };
  }
  return { self, task, isAdmin };
}

// ── GET — detalle con feed de comentarios ─────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireAuth();
  if (deny) return deny;
  const { id } = await params;

  const ctx = await loadAuthorized(id);
  if (ctx.error) return ctx.error;

  const comments = await prisma.taskComment.findMany({
    where:   { taskId: id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true, email: true, initials: true } } },
  });

  return NextResponse.json({
    task: toTaskDTO(ctx.task),
    comments: comments.map((c) => ({
      id:        c.id,
      body:      c.body,
      author:    c.author,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  });
}

// ── PATCH — editar campos, mover de columna, reordenar ────────────────────────
interface PatchBody {
  title?:        string;
  description?:  string | null;
  status?:       string;
  priority?:     string;
  dueDate?:      string | null;
  assigneeId?:   string;
  region?:       string | null;
  company?:      string | null;
  weeklyPlanId?: string | null;
  sortOrder?:    number;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireAuth();
  if (deny) return deny;
  const { id } = await params;

  const ctx = await loadAuthorized(id);
  if (ctx.error) return ctx.error;
  const { self, task, isAdmin } = ctx;

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data: Prisma.TaskUpdateInput = {};
  const log: { field: string; oldValue: string | null; newValue: string | null }[] = [];

  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: "El título no puede quedar vacío" }, { status: 400 });
    if (title !== task.title) log.push({ field: "title", oldValue: task.title, newValue: title });
    data.title = title;
  }

  if (body.description !== undefined) data.description = body.description?.trim() || null;

  if (body.status !== undefined) {
    const status = body.status.trim();
    if (!TASK_STATUSES.includes(status as TaskStatus)) {
      return NextResponse.json({ error: `status inválido (${TASK_STATUSES.join(" | ")})` }, { status: 400 });
    }
    if (status !== task.status) {
      log.push({ field: "status", oldValue: task.status, newValue: status });
      // completedAt sigue al status en ambos sentidos: reabrir una tarea la limpia.
      data.completedAt = status === "done" ? new Date() : null;
    }
    data.status = status;
  }

  if (body.priority !== undefined) {
    const priority = body.priority.trim();
    if (!TASK_PRIORITIES.includes(priority as TaskPriority)) {
      return NextResponse.json({ error: `priority inválida (${TASK_PRIORITIES.join(" | ")})` }, { status: 400 });
    }
    if (priority !== task.priority) log.push({ field: "priority", oldValue: task.priority, newValue: priority });
    data.priority = priority;
  }

  if (body.dueDate !== undefined) {
    if (body.dueDate === null || body.dueDate === "") {
      data.dueDate = null;
    } else {
      const d = new Date(body.dueDate + "T00:00:00.000Z");
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "dueDate inválida" }, { status: 400 });
      data.dueDate = d;
    }
  }

  // Reasignar es privilegio de admin: un analista no puede sacarse trabajo de encima.
  if (body.assigneeId !== undefined && body.assigneeId !== task.assigneeId) {
    if (!isAdmin) {
      return NextResponse.json({ error: "Sólo un admin puede reasignar tareas" }, { status: 403 });
    }
    const exists = await prisma.user.count({ where: { id: body.assigneeId } });
    if (!exists) return NextResponse.json({ error: "El analista no existe" }, { status: 400 });
    log.push({ field: "assignee", oldValue: task.assignee.initials ?? task.assignee.email, newValue: body.assigneeId });
    data.assignee = { connect: { id: body.assigneeId } };
  }

  if (body.region  !== undefined) data.region  = body.region?.trim().toUpperCase() || null;
  if (body.company !== undefined) data.company = body.company?.trim() || null;

  if (body.weeklyPlanId !== undefined) {
    data.weeklyPlan = body.weeklyPlanId
      ? { connect: { id: body.weeklyPlanId } }
      : { disconnect: true };
  }

  if (body.sortOrder !== undefined) {
    if (!Number.isFinite(body.sortOrder)) {
      return NextResponse.json({ error: "sortOrder inválido" }, { status: 400 });
    }
    data.sortOrder = body.sortOrder;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  try {
    const updated = await prisma.task.update({ where: { id }, data, include: TASK_INCLUDE });

    // Sólo se registran cambios de fondo. Reordenar dentro de una columna es ruido
    // puro (un drag genera un PATCH) y llenaría la bitácora sin aportar nada.
    if (log.length) {
      await logAdminChanges(
        log.map((l) => ({
          entity:    ENTITY.task,
          entityKey: id,
          label:     updated.title,
          field:     l.field,
          oldValue:  l.oldValue,
          newValue:  l.newValue,
          context:   updated.assignee.initials ?? null,
          action:    "update" as const,
        })),
        self.email ?? null,
      );
    }

    return NextResponse.json({ task: toTaskDTO(updated) });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "La tarea o el destino ya no existen" }, { status: 404 });
    }
    console.error("[planning/tasks/[id] PATCH]", e);
    return NextResponse.json({ error: "No se pudo actualizar la tarea" }, { status: 500 });
  }
}

// ── DELETE — borrar tarea (arrastra sus comentarios) ──────────────────────────
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireAuth();
  if (deny) return deny;
  const { id } = await params;

  const ctx = await loadAuthorized(id);
  if (ctx.error) return ctx.error;
  const { self, task } = ctx;

  try {
    await prisma.task.delete({ where: { id } });

    await logAdminChanges(
      [{
        entity:    ENTITY.task,
        entityKey: id,
        label:     task.title,
        field:     "task",
        oldValue:  `${task.status} · ${task.assignee.initials ?? task.assignee.email ?? ""}`,
        newValue:  null,
        action:    "delete",
      }],
      self.email ?? null,
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[planning/tasks/[id] DELETE]", e);
    return NextResponse.json({ error: "No se pudo borrar la tarea" }, { status: 500 });
  }
}
