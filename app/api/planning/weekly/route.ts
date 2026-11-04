import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { mondayOf, isoDate } from "@/lib/planning";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Calendario macro (weekly_plan). Lectura para cualquier usuario autenticado. La
// escritura vive en /api/planning/weekly/publish: el admin arma un borrador y lo guarda
// de una vez, y ese guardado es el que avisa al equipo.
//
// UNA CASILLA, VARIAS ACTIVIDADES: (region, weekStart) ya no identifica una celda —
// un mismo día puede tener dos o más y la grilla se estira para mostrarlas. La
// identidad es el `id`. `sortOrder` decide el orden dentro de la casilla.

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
    return NextResponse.json({ error: "Could not load the calendar" }, { status: 500 });
  }
}
