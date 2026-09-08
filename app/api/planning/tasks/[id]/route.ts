import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUser, canWriteSector } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";
import { TASK_STATUSES, TASK_PRIORITIES, type TaskStatus, type TaskPriority } from "@/lib/planning";
import { TASK_INCLUDE, toTaskDTO } from "@/lib/planningTasks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Detalle, edición y borrado de una tarea.
//   · GET    — cualquier autenticado: la lectura es abierta a todo el equipo.
//   · PATCH  — sólo si puedes escribir en el sector de la tarea (miembro, o admin).
//   · DELETE — igual que PATCH.

type TaskRow = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;
type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

// Unión discriminada explícita: sin el `error: null` del caso feliz, TypeScript no
// puede estrechar el tipo tras `if (ctx.error) return ctx.error` y `task` queda
// posiblemente undefined en todo el handler.
type Loaded    = { error: NextResponse; task: null } | { error: null; task: TaskRow };
type Writable  = { error: NextResponse; task: null; self: null }
               | { error: null; task: TaskRow; self: SessionUser };

/** Carga la tarea. NO chequea permisos: leer es abierto a cualquier autenticado. */
async function load(id: string): Promise<Loaded> {
  const task = await prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
  if (!task) {
    return { error: NextResponse.json({ error: "La tarea no existe" }, { status: 404 }), task: null };
  }
  return { error: null, task };
}

/** Como load(), pero además exige permiso de escritura sobre el sector de la tarea. */
async function loadWritable(id: string): Promise<Writable> {
  const self = await getSessionUser();
  if (!self) {
    return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }), task: null, self: null };
  }

  const loaded = await load(id);
  if (loaded.error) return { error: loaded.error, task: null, self: null };

  if (!(await canWriteSector(loaded.task.section.sectorId))) {
    return {
      error: NextResponse.json(
        { error: "No eres miembro de este sector: solo puedes verlo." },
        { status: 403 },
      ),
      task: null, self: null,
    };
  }
  return { error: null, task: loaded.task, self };
}

// ── GET — detalle con feed de comentarios ─────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireAuth();
  if (deny) return deny;
  const { id } = await params;

  const loaded = await load(id);
  if (loaded.error) return loaded.error;

  const comments = await prisma.taskComment.findMany({
    where:   { taskId: id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true, email: true, initials: true } } },
  });

  return NextResponse.json({
    task: toTaskDTO(loaded.task),
    // El cliente usa esto para decidir si pinta el modal en modo lectura.
    canWrite: await canWriteSector(loaded.task.section.sectorId),
    comments: comments.map((c) => ({
      id:        c.id,
      body:      c.body,
      author:    c.author,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  });
}

// ── PATCH — editar campos, mover de sección, completar ────────────────────────
interface PatchBody {
  title?:        string;
  description?:  string | null;
  status?:       string;
  priority?:     string;
  dueDate?:      string | null;
  sectionId?:    string;
  assigneeId?:   string | null;
  company?:      string | null;
  weeklyPlanId?: string | null;
  sortOrder?:    number;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireAuth();
  if (deny) return deny;
  const { id } = await params;

  const ctx = await loadWritable(id);
  if (ctx.error) return ctx.error;
  const { self, task } = ctx;

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

  // Mover de sección puede significar mover de SECTOR. En ese caso hace falta permiso
  // en los dos extremos: en el de origen (ya validado por loadWritable) y en el destino,
  // o si no un miembro podría empujar trabajo a un sector ajeno.
  if (body.sectionId !== undefined && body.sectionId !== task.sectionId) {
    const target = await prisma.sectorSection.findUnique({
      where:  { id: body.sectionId },
      select: { id: true, name: true, sectorId: true, sector: { select: { name: true } } },
    });
    if (!target) return NextResponse.json({ error: "La sub-sección destino no existe" }, { status: 404 });

    if (target.sectorId !== task.section.sectorId && !(await canWriteSector(target.sectorId))) {
      return NextResponse.json(
        { error: `No eres miembro de "${target.sector.name}": no puedes mover tareas hacia allá.` },
        { status: 403 },
      );
    }
    log.push({ field: "section", oldValue: task.sectionId, newValue: `${target.sector.name} / ${target.name}` });
    data.section = { connect: { id: target.id } };
  }

  if (body.assigneeId !== undefined) {
    const next = body.assigneeId?.trim() || null;
    if (next) {
      const exists = await prisma.user.count({ where: { id: next } });
      if (!exists) return NextResponse.json({ error: "El analista no existe" }, { status: 400 });
      data.assignee = { connect: { id: next } };
    } else {
      data.assignee = { disconnect: true };
    }
    if (next !== task.assigneeId) {
      log.push({
        field:    "assignee",
        oldValue: task.assignee?.initials ?? task.assignee?.email ?? null,
        newValue: next,
      });
    }
  }

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

    // Sólo se registran cambios de fondo; el reordenamiento no aporta a la bitácora.
    if (log.length) {
      await logAdminChanges(
        log.map((l) => ({
          entity:    ENTITY.task,
          entityKey: id,
          label:     updated.title,
          field:     l.field,
          oldValue:  l.oldValue,
          newValue:  l.newValue,
          context:   updated.section.sectorId,
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

  const ctx = await loadWritable(id);
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
        oldValue:  task.status,
        newValue:  null,
        context:   task.section.sectorId,
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
