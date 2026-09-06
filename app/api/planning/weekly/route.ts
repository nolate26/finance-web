import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";
import { PLAN_CATEGORIES, mondayOf, isoDate, type PlanCategory } from "@/lib/planning";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Calendario macro (weekly_plan). Lectura para cualquier usuario autenticado;
// escritura sólo admin. La llave de una celda es (region, weekStart) y weekStart
// SIEMPRE se normaliza al lunes, así el cliente puede mandar cualquier día.

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
      orderBy: [{ weekStart: "asc" }, { region: "asc" }],
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

// ── PUT — crear o actualizar una celda (upsert por region + semana) ────────────
interface CellBody {
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
    const before = await prisma.weeklyPlan.findUnique({
      where:  { region_weekStart: { region, weekStart } },
      select: { id: true, topic: true, category: true },
    });

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
      const saved = await tx.weeklyPlan.upsert({
        where:  { region_weekStart: { region, weekStart } },
        create: { region, weekStart, ...data },
        update: data,
      });

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
    console.error("[planning/weekly PUT]", e);
    return NextResponse.json({ error: "No se pudo guardar la celda" }, { status: 500 });
  }
}

// ── DELETE — vaciar una celda ─────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const self = await getSessionUser();

  const { searchParams } = new URL(req.url);
  const region    = searchParams.get("region")?.trim().toUpperCase();
  const weekParam = searchParams.get("weekStart");
  if (!region || !weekParam) {
    return NextResponse.json({ error: "region y weekStart son obligatorias" }, { status: 400 });
  }
  const weekStart = mondayOf(weekParam);

  try {
    const cell = await prisma.weeklyPlan.findUnique({
      where:  { region_weekStart: { region, weekStart } },
      select: { id: true, topic: true, category: true, _count: { select: { tasks: true } } },
    });
    if (!cell) return NextResponse.json({ error: "La celda no existe" }, { status: 404 });

    // Las tareas colgadas sobreviven (weekly_plan_id → SetNull), no se borra trabajo
    // por vaciar una celda del calendario.
    await prisma.weeklyPlan.delete({ where: { id: cell.id } });

    await logAdminChanges(
      [{
        entity:    ENTITY.weeklyPlan,
        entityKey: `${region}|${isoDate(weekStart)}`,
        label:     cell.topic,
        field:     "cell",
        oldValue:  `${cell.category}: ${cell.topic ?? "—"}`,
        newValue:  null,
        context:   isoDate(weekStart),
        action:    "delete",
      }],
      self?.email ?? null,
    );

    return NextResponse.json({ ok: true, detachedTasks: cell._count.tasks });
  } catch (e) {
    console.error("[planning/weekly DELETE]", e);
    return NextResponse.json({ error: "No se pudo borrar la celda" }, { status: 500 });
  }
}
