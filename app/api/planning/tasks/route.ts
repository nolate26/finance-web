import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";
import { TASK_STATUSES, TASK_PRIORITIES, type TaskStatus, type TaskPriority } from "@/lib/planning";
import { TASK_INCLUDE, toTaskDTO, type TasksPayload } from "@/lib/planningTasks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Tareas del Analyst Grid: una caja por analista con su lista.
//
// PERMISOS (los mismos en GET y POST):
//   · admin   — ve y escribe el tablero de cualquiera; puede asignar a terceros.
//   · usuario — ve y escribe SÓLO su propio tablero; al crear, se auto-asigna.
// El chequeo vive acá y no en requireAdmin() porque no es "admin sí / user no",
// sino "cada quien lo suyo, el admin todo".

// ── GET — tareas del tablero ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;
  const self = await getSessionUser();
  if (!self) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const isAdmin = self.role === "admin";
  const { searchParams } = new URL(req.url);
  const assignee     = searchParams.get("assigneeId");
  const region       = searchParams.get("region");
  const weeklyPlanId = searchParams.get("weeklyPlanId");

  // Un no-admin queda encerrado en su propio id, ignore lo que pida por query.
  const where: Prisma.TaskWhereInput = {
    assigneeId: isAdmin ? (assignee && assignee !== "all" ? assignee : undefined) : self.id,
  };
  if (region)       where.region       = region;
  if (weeklyPlanId) where.weeklyPlanId = weeklyPlanId;

  try {
    const rows = await prisma.task.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: TASK_INCLUDE,
    });

    return NextResponse.json({
      tasks: rows.map(toTaskDTO),
      canSeeAll: isAdmin,
    } satisfies TasksPayload);
  } catch (e) {
    console.error("[planning/tasks GET]", e);
    return NextResponse.json({ error: "No se pudieron cargar las tareas" }, { status: 500 });
  }
}

// ── POST — crear tarea ────────────────────────────────────────────────────────
interface CreateBody {
  title?:        string;
  description?:  string | null;
  status?:       string;
  priority?:     string;
  dueDate?:      string | null;
  assigneeId?:   string;
  region?:       string | null;
  company?:      string | null;
  weeklyPlanId?: string | null;
}

export async function POST(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;
  const self = await getSessionUser();
  if (!self) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const isAdmin = self.role === "admin";

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "El título es obligatorio" }, { status: 400 });

  const status   = (body.status   ?? "todo").trim();
  const priority = (body.priority ?? "medium").trim();
  if (!TASK_STATUSES.includes(status as TaskStatus)) {
    return NextResponse.json({ error: `status inválido (${TASK_STATUSES.join(" | ")})` }, { status: 400 });
  }
  if (!TASK_PRIORITIES.includes(priority as TaskPriority)) {
    return NextResponse.json({ error: `priority inválida (${TASK_PRIORITIES.join(" | ")})` }, { status: 400 });
  }

  // Sólo el admin asigna a terceros; el analista siempre crea para sí mismo.
  const assigneeId = isAdmin ? (body.assigneeId?.trim() || self.id) : self.id;

  if (assigneeId !== self.id) {
    const exists = await prisma.user.count({ where: { id: assigneeId } });
    if (!exists) return NextResponse.json({ error: "El analista no existe" }, { status: 400 });
  }

  const dueDate = body.dueDate ? new Date(body.dueDate + "T00:00:00.000Z") : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: "dueDate inválida" }, { status: 400 });
  }

  try {
    // La tarjeta nueva entra arriba de su columna: sortOrder = (mínimo actual) - 1.
    const top = await prisma.task.findFirst({
      where:   { assigneeId, status },
      orderBy: { sortOrder: "asc" },
      select:  { sortOrder: true },
    });

    const task = await prisma.task.create({
      data: {
        title,
        description:  body.description?.trim() || null,
        status,
        priority,
        dueDate,
        assigneeId,
        createdById:  self.id,
        region:       body.region?.trim().toUpperCase() || null,
        company:      body.company?.trim() || null,
        weeklyPlanId: body.weeklyPlanId || null,
        sortOrder:    (top?.sortOrder ?? 0) - 1,
        completedAt:  status === "done" ? new Date() : null,
      },
      include: TASK_INCLUDE,
    });

    await logAdminChanges(
      [{
        entity:    ENTITY.task,
        entityKey: task.id,
        label:     title,
        field:     "task",
        oldValue:  null,
        newValue:  `${status} · ${task.assignee.initials ?? task.assignee.email ?? assigneeId}`,
        action:    "create",
      }],
      self.email ?? null,
    );

    return NextResponse.json({ task: toTaskDTO(task) }, { status: 201 });
  } catch (e) {
    console.error("[planning/tasks POST]", e);
    return NextResponse.json({ error: "No se pudo crear la tarea" }, { status: 500 });
  }
}
