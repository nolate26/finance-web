import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUser, canWriteSector } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";
import { TASK_STATUSES, TASK_PRIORITIES, type TaskStatus, type TaskPriority } from "@/lib/planning";
import { TASK_INCLUDE, toTaskDTO, type TasksPayload } from "@/lib/planningTasks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Tareas del panel de sectores.
//
// PERMISOS — la regla del módulo, distinta a la del resto de la app:
//   · LEER    es abierto. Cualquier usuario autenticado ve TODAS las tareas de TODOS
//             los sectores, incluida la Coordinación General. No hay aislamiento.
//   · ESCRIBIR depende de la membresía al sector (sector_members), no de a quién esté
//             asignada la tarea. Un admin escribe en todo; un `user` sólo dentro de
//             los sectores donde es miembro. El chequeo vive en canWriteSector().

// ── GET — todas las tareas ────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;

  const { searchParams } = new URL(req.url);
  const sectorId     = searchParams.get("sectorId");
  const weeklyPlanId = searchParams.get("weeklyPlanId");

  // Los filtros son de conveniencia (el calendario salta a una semana concreta), NO
  // de seguridad: sin ellos se devuelve el universo completo, que es lo que se quiere.
  const where: Prisma.TaskWhereInput = {};
  if (sectorId)     where.section      = { sectorId };
  if (weeklyPlanId) where.weeklyPlanId = weeklyPlanId;

  try {
    const rows = await prisma.task.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: TASK_INCLUDE,
    });

    return NextResponse.json({ tasks: rows.map(toTaskDTO) } satisfies TasksPayload);
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
  sectionId?:    string;
  assigneeId?:   string | null;
  company?:      string | null;
  weeklyPlanId?: string | null;
}

export async function POST(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;
  const self = await getSessionUser();
  if (!self) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "El título es obligatorio" }, { status: 400 });
  if (!body.sectionId) return NextResponse.json({ error: "Falta la sub-sección" }, { status: 400 });

  // La sección determina el sector, y el sector determina el permiso.
  const section = await prisma.sectorSection.findUnique({
    where:  { id: body.sectionId },
    select: { id: true, sectorId: true, sector: { select: { name: true } } },
  });
  if (!section) return NextResponse.json({ error: "La sub-sección no existe" }, { status: 404 });

  if (!(await canWriteSector(section.sectorId))) {
    return NextResponse.json(
      { error: `No eres miembro de "${section.sector.name}": solo puedes verlo.` },
      { status: 403 },
    );
  }

  const status   = (body.status   ?? "todo").trim();
  const priority = (body.priority ?? "medium").trim();
  if (!TASK_STATUSES.includes(status as TaskStatus)) {
    return NextResponse.json({ error: `status inválido (${TASK_STATUSES.join(" | ")})` }, { status: 400 });
  }
  if (!TASK_PRIORITIES.includes(priority as TaskPriority)) {
    return NextResponse.json({ error: `priority inválida (${TASK_PRIORITIES.join(" | ")})` }, { status: 400 });
  }

  // El asignado es una etiqueta opcional, no un permiso: cualquiera con escritura en
  // el sector puede poner a cualquier miembro (o a nadie).
  const assigneeId = body.assigneeId?.trim() || null;
  if (assigneeId) {
    const exists = await prisma.user.count({ where: { id: assigneeId } });
    if (!exists) return NextResponse.json({ error: "El analista no existe" }, { status: 400 });
  }

  const dueDate = body.dueDate ? new Date(body.dueDate + "T00:00:00.000Z") : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: "dueDate inválida" }, { status: 400 });
  }

  try {
    // La tarea nueva entra arriba de su sección: sortOrder = (mínimo actual) - 1.
    const top = await prisma.task.findFirst({
      where:   { sectionId: section.id },
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
        sectionId:    section.id,
        assigneeId,
        createdById:  self.id,
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
        newValue:  `${status} · ${section.sector.name}`,
        context:   section.sectorId,
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
