import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";
import { PLAN_CATEGORIES, mondayOf, isoDate, type PlanCategory } from "@/lib/planning";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Calendario macro (weekly_plan). Lectura para cualquier usuario autenticado;
// escritura sólo admin. weekStart SIEMPRE se normaliza al lunes, así el cliente puede
// mandar cualquier día.
//
// UNA CASILLA, VARIAS ACTIVIDADES: (region, weekStart) ya no identifica una celda —
// un mismo día puede tener dos o más y la grilla se estira para mostrarlas. La
// identidad es el `id`: el PUT actualiza por id (sin id, CREA otra en la casilla), y
// el DELETE también borra por id. `sortOrder` decide el orden dentro de la casilla.

export interface WeeklyAnalyst {
  id:       string;
  initials: string | null;
  name:     string | null;
}

export interface WeeklyCell {
  id:          string;
  region:      string;
  weekStart:   string;   // ISO "2026-09-08" — lunes
  topic:       string | null;
  category:    string;
  allAnalysts: boolean;
  highlighted: boolean;
  notes:       string | null;
  /** Posición dentro de la casilla; varias celdas pueden compartir región y semana. */
  sortOrder:   number;
  analysts:    WeeklyAnalyst[];
  taskCount:   number;
  updatedBy:   string | null;
  updatedAt:   string;
}

export interface WeeklyPayload {
  cells:   WeeklyCell[];
  regions: string[];
}

// ── GET — celdas del rango pedido ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to   = searchParams.get("to");

  const where: { weekStart?: { gte?: Date; lte?: Date } } = {};
  if (from || to) {
    where.weekStart = {};
    if (from) where.weekStart.gte = mondayOf(from);
    if (to)   where.weekStart.lte = mondayOf(to);
  }

  try {
    const rows = await prisma.weeklyPlan.findMany({
      where,
      // createdAt desempata: las filas anteriores a sort_order comparten el 0 del
      // default y sin un segundo criterio su orden sería el que quiera Postgres.
      orderBy: [{ weekStart: "asc" }, { region: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        analysts: {
          include: { user: { select: { id: true, initials: true, name: true } } },
        },
        _count: { select: { tasks: true } },
      },
    });

    const cells: WeeklyCell[] = rows.map((r) => ({
      id:          r.id,
      region:      r.region,
      weekStart:   isoDate(r.weekStart),
      topic:       r.topic,
      category:    r.category,
      allAnalysts: r.allAnalysts,
      highlighted: r.highlighted,
      notes:       r.notes,
      sortOrder:   r.sortOrder,
      analysts:    r.analysts
                     .map((a) => ({ id: a.user.id, initials: a.user.initials, name: a.user.name }))
                     .sort((a, b) => (a.initials ?? "").localeCompare(b.initials ?? "")),
      taskCount:   r._count.tasks,
      updatedBy:   r.updatedBy,
      updatedAt:   r.updatedAt.toISOString(),
    }));

    const regions = [...new Set(cells.map((c) => c.region))];

    return NextResponse.json({ cells, regions } satisfies WeeklyPayload);
  } catch (e) {
    console.error("[planning/weekly GET]", e);
    return NextResponse.json({ error: "No se pudo cargar el calendario" }, { status: 500 });
  }
}

// ── PUT — crear o actualizar una actividad ────────────────────────────────────
interface CellBody {
  /**
   * Cuál se edita. SIN id se CREA una actividad nueva en la casilla, que es como se
   * agrega la segunda de un mismo día. Antes esto era un upsert por (región, semana)
   * y por eso no había manera de tener dos: guardar la segunda pisaba la primera.
   */
  id?:          string;
  region?:      string;
  weekStart?:   string;
  topic?:       string | null;
  category?:    string;
  allAnalysts?: boolean;
  highlighted?: boolean;
  notes?:       string | null;
  analystIds?:  string[];
}

export async function PUT(req: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const self = await getSessionUser();

  let body: CellBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const region = body.region?.trim().toUpperCase();
  if (!region) return NextResponse.json({ error: "region es obligatoria" }, { status: 400 });
  if (!body.weekStart) return NextResponse.json({ error: "weekStart es obligatoria" }, { status: 400 });

  const weekStart = mondayOf(body.weekStart);
  if (Number.isNaN(weekStart.getTime())) {
    return NextResponse.json({ error: "weekStart inválida" }, { status: 400 });
  }

  const category = (body.category ?? "update").trim();
  if (!PLAN_CATEGORIES.includes(category as PlanCategory)) {
    return NextResponse.json(
      { error: `category inválida (${PLAN_CATEGORIES.join(" | ")})` },
      { status: 400 },
    );
  }

  const topic = body.topic?.trim() || null;
  const notes = body.notes?.trim() || null;
  const analystIds = [...new Set(body.analystIds ?? [])];

  // Los ids tienen que ser usuarios reales: un id inventado reventaría el connect
  // con un P2025 opaco en vez de un 400 que se entiende.
  if (analystIds.length) {
    const found = await prisma.user.count({ where: { id: { in: analystIds } } });
    if (found !== analystIds.length) {
      return NextResponse.json({ error: "Hay analistas que ya no existen" }, { status: 400 });
    }
  }

  try {
    const before = body.id
      ? await prisma.weeklyPlan.findUnique({
          where:  { id: body.id },
          select: { id: true, topic: true, category: true },
        })
      : null;
    if (body.id && !before) {
      return NextResponse.json({ error: "La actividad ya no existe" }, { status: 404 });
    }

    const data = {
      topic,
      category,
      allAnalysts: body.allAnalysts ?? false,
      highlighted: body.highlighted ?? false,
      notes,
      updatedBy:   self?.email ?? null,
    };

    // Los analistas se reemplazan en bloque (deleteMany + createMany): es una lista
    // corta y así el PUT es idempotente sin tener que diffear la selección.
    const cell = await prisma.$transaction(async (tx) => {
      let saved;
      if (before) {
        // Se actualiza por id, y se deja mover de casilla en el mismo PUT: el modal
        // no la mueve, pero region/weekStart son parte del cuerpo y ignorarlas haría
        // que el PUT dependiera de dónde estaba la fila.
        saved = await tx.weeklyPlan.update({
          where: { id: before.id },
          data:  { region, weekStart, ...data },
        });
      } else {
        // Nueva: al final de su casilla. `last` puede no existir (casilla vacía).
        const last = await tx.weeklyPlan.findFirst({
          where:   { region, weekStart },
          orderBy: { sortOrder: "desc" },
          select:  { sortOrder: true },
        });
        saved = await tx.weeklyPlan.create({
          data: { region, weekStart, sortOrder: (last?.sortOrder ?? -1) + 1, ...data },
        });
      }

      await tx.weeklyPlanAnalyst.deleteMany({ where: { weeklyPlanId: saved.id } });
      if (analystIds.length) {
        await tx.weeklyPlanAnalyst.createMany({
          data: analystIds.map((userId) => ({ weeklyPlanId: saved.id, userId })),
        });
      }
      return saved;
    });

    await logAdminChanges(
      [{
        entity:    ENTITY.weeklyPlan,
        entityKey: `${region}|${isoDate(weekStart)}`,
        label:     topic,
        field:     "cell",
        oldValue:  before ? `${before.category}: ${before.topic ?? "—"}` : null,
        newValue:  `${category}: ${topic ?? "—"}`,
        context:   isoDate(weekStart),
        action:    before ? "update" : "create",
      }],
      self?.email ?? null,
    );

    return NextResponse.json({ ok: true, id: cell.id });
  } catch (e) {
    // La unicidad (region, week_start) se quitó del schema justo para permitir varias
    // actividades por día. Si sigue viva en la base es que falta aplicar el cambio, y
    // el P2002 pelado —"Unique constraint failed"— no dice ni qué falta ni qué hacer.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "La base todavía permite una sola actividad por día. Corre `npx prisma db push`." },
        { status: 503 },
      );
    }
    console.error("[planning/weekly PUT]", e);
    return NextResponse.json({ error: "No se pudo guardar la actividad" }, { status: 500 });
  }
}

// ── DELETE — borrar UNA actividad ─────────────────────────────────────────────
// Por id: con varias actividades por casilla, (region, weekStart) ya no dice cuál.
export async function DELETE(req: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const self = await getSessionUser();

  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id es obligatorio" }, { status: 400 });

  try {
    const cell = await prisma.weeklyPlan.findUnique({
      where:  { id },
      select: {
        id: true, region: true, weekStart: true, topic: true, category: true,
        _count: { select: { tasks: true } },
      },
    });
    if (!cell) return NextResponse.json({ error: "La actividad no existe" }, { status: 404 });

    // Las tareas colgadas sobreviven (weekly_plan_id → SetNull), no se borra trabajo
    // por vaciar una celda del calendario.
    // Las que quedan en la casilla se renumeran para que no queden huecos en el orden.
    await prisma.$transaction(async (tx) => {
      await tx.weeklyPlan.delete({ where: { id: cell.id } });
      const rest = await tx.weeklyPlan.findMany({
        where:   { region: cell.region, weekStart: cell.weekStart },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select:  { id: true },
      });
      for (let i = 0; i < rest.length; i++) {
        await tx.weeklyPlan.update({ where: { id: rest[i].id }, data: { sortOrder: i } });
      }
    });

    await logAdminChanges(
      [{
        entity:    ENTITY.weeklyPlan,
        entityKey: `${cell.region}|${isoDate(cell.weekStart)}`,
        label:     cell.topic,
        field:     "cell",
        oldValue:  `${cell.category}: ${cell.topic ?? "—"}`,
        newValue:  null,
        context:   isoDate(cell.weekStart),
        action:    "delete",
      }],
      self?.email ?? null,
    );

    return NextResponse.json({ ok: true, detachedTasks: cell._count.tasks });
  } catch (e) {
    console.error("[planning/weekly DELETE]", e);
    return NextResponse.json({ error: "No se pudo borrar la actividad" }, { status: 500 });
  }
}
