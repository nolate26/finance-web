import { NextResponse, NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";
import {
  canOpenPeriod, currentPeriod, isPeriodShape, periodLabel,
  type TopPickPeriodDTO, type TopPickPeriodsPayload,
} from "@/lib/topPicks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Los períodos de una región, con la fecha en que se cerró cada uno.
//
// Un período existe por DOS vías, y las dos cuentan:
//   · tiene picks cargados  → viene de top_picks (así eran todos antes de esta ruta),
//   · alguien lo abrió      → tiene fila en top_pick_periods, y se muestra aunque
//                             esté vacío. Ésa es la única forma de empezar a cargar
//                             el trimestre siguiente antes de que llegue en el
//                             calendario.
//
// PERMISOS: leer, cualquier autenticado. Abrir un período o cambiarle la fecha, sólo
// admin: es la estructura de la grilla, no el contenido de un sector.

/** Fecha de columna @db.Date → "YYYY-MM-DD" sin que el huso la corra un día. */
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(request: NextRequest) {
  const region = request.nextUrl.searchParams.get("region")?.trim().toUpperCase();

  if (!region) {
    return NextResponse.json({ periods: [] } satisfies TopPickPeriodsPayload);
  }

  try {
    const [pickRows, headerRows] = await Promise.all([
      prisma.topPick.findMany({
        where:    { region },
        select:   { periodDate: true },
        distinct: ["periodDate"],
        orderBy:  { periodDate: "desc" },
      }),
      // Degrada solo si la tabla todavía no existe (falta el `prisma db push`): la
      // grilla sigue funcionando con los períodos que tienen picks, sin fechas.
      prisma.topPickPeriod
        .findMany({ where: { region }, select: { periodDate: true, reportDate: true } })
        .catch((e: unknown) => {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") return [];
          throw e;
        }),
    ]);

    const declared = new Map(
      headerRows.map((r) => [isoDay(r.periodDate).slice(0, 7), r.reportDate ? isoDay(r.reportDate) : null]),
    );

    const all = new Set<string>([
      ...pickRows.map((r) => isoDay(r.periodDate).slice(0, 7)),
      ...declared.keys(),
    ]);

    const periods: TopPickPeriodDTO[] = [...all]
      .sort()
      .reverse()
      .map((period) => ({
        period,
        reportDate: declared.get(period) ?? null,
        declared:   declared.has(period),
      }));

    return NextResponse.json({ periods } satisfies TopPickPeriodsPayload);
  } catch (err) {
    console.error("[top-picks/periods GET]", err);
    return NextResponse.json({ error: "Failed to fetch periods" }, { status: 500 });
  }
}

// ── Cuerpo común de POST y PATCH ──────────────────────────────────────────────
interface PeriodBody {
  region?:      string;
  /** "YYYY-MM" o "YYYY-MM-01": se acepta cualquiera de las dos formas. */
  period?:      string;
  period_date?: string;
  /** "YYYY-MM-DD" o null para borrarla. */
  reportDate?:  string | null;
}

interface Parsed {
  region:     "CHILE" | "LATAM";
  period:     string;   // "YYYY-MM"
  periodDate: Date;
  reportDate: Date | null;
  hasReportDate: boolean;
}

/**
 * `opening` = true sólo al ABRIR un período: ahí Chile exige mes de inicio de
 * trimestre. Para editar la fecha de uno que ya existe basta la forma — los quarters
 * históricos están guardados con el mes del informe (2025-12 es Q4 2025) y esa regla
 * los dejaría sin poder editar.
 */
function parseBody(body: PeriodBody, opening: boolean): Parsed | string {
  const region = body.region?.trim().toUpperCase();
  if (region !== "CHILE" && region !== "LATAM") return "region debe ser CHILE o LATAM";

  const period = (body.period ?? body.period_date ?? "").trim().slice(0, 7);
  if (!isPeriodShape(period)) return "Período inválido: se espera YYYY-MM";
  if (opening && !canOpenPeriod(period, region === "CHILE")) {
    return "El quarter debe empezar en enero, abril, julio u octubre";
  }

  const hasReportDate = body.reportDate !== undefined;
  let reportDate: Date | null = null;
  if (body.reportDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.reportDate)) return "La fecha debe tener formato YYYY-MM-DD";
    reportDate = new Date(`${body.reportDate}T00:00:00Z`);
    if (isNaN(reportDate.getTime())) return "Fecha inválida";
  }

  return { region, period, periodDate: new Date(`${period}-01T00:00:00Z`), reportDate, hasReportDate };
}

// ── POST — abrir un período nuevo ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const self = await getSessionUser();

  let body: PeriodBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = parseBody(body, true);
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });
  const { region, period, periodDate, reportDate } = parsed;
  const label = periodLabel(period, region === "CHILE");

  try {
    // Un período que ya tiene picks existe aunque no tenga fila: crearlo "de nuevo"
    // no es un error, pero tampoco debe pisarle la fecha en silencio.
    const existing = await prisma.topPickPeriod.findUnique({
      where: { region_periodDate: { region, periodDate } },
    });
    if (existing) {
      return NextResponse.json({ error: `${label} ya está abierto` }, { status: 409 });
    }

    // En Chile un trimestre es UNA columna de la grilla. Si ya hay picks en otro mes
    // del mismo trimestre —los históricos usan el mes del informe— abrirlo dejaría
    // dos columnas rotuladas igual, cada una con la mitad de los picks.
    if (region === "CHILE") {
      const [y, m] = period.split("-").map(Number);
      const clash = await prisma.topPick.findFirst({
        where: {
          region,
          periodDate: {
            gte: new Date(Date.UTC(y, m - 1, 1)),
            lt:  new Date(Date.UTC(y, m + 2, 1)),
            not: periodDate,
          },
        },
        select: { periodDate: true },
      });
      if (clash) {
        return NextResponse.json(
          { error: `${label} ya existe: tiene picks cargados en ${isoDay(clash.periodDate).slice(0, 7)}` },
          { status: 409 },
        );
      }
    }

    await prisma.topPickPeriod.create({
      data: { region, periodDate, reportDate, updatedBy: self?.email ?? null },
    });

    await logAdminChanges(
      [{
        entity: ENTITY.topPickPeriod, entityKey: `${region}|${period}`, label,
        field: "period", oldValue: null,
        newValue: reportDate ? `${label} · ${isoDay(reportDate)}` : label,
        context: `${period}-01`, action: "create",
      }],
      self?.email ?? null,
    );

    return NextResponse.json({ period, reportDate: reportDate ? isoDay(reportDate) : null }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
      return NextResponse.json(
        { error: "Falta la tabla top_pick_periods. Corre `npx prisma db push`." },
        { status: 503 },
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: `${label} ya está abierto` }, { status: 409 });
    }
    console.error("[top-picks/periods POST]", e);
    return NextResponse.json({ error: "No se pudo abrir el período" }, { status: 500 });
  }
}

// ── PATCH — fijar o borrar la fecha del informe ───────────────────────────────
// Es un upsert a propósito: los períodos viejos no tienen fila, y ponerles fecha no
// debería exigir "abrirlos" primero.
export async function PATCH(req: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const self = await getSessionUser();

  let body: PeriodBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = parseBody(body, false);
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });
  const { region, period, periodDate, reportDate, hasReportDate } = parsed;
  if (!hasReportDate) return NextResponse.json({ error: "Falta reportDate" }, { status: 400 });
  const label = periodLabel(period, region === "CHILE");

  try {
    const [before, withPicks] = await Promise.all([
      prisma.topPickPeriod.findUnique({
        where: { region_periodDate: { region, periodDate } },
        select: { reportDate: true },
      }),
      prisma.topPick.count({ where: { region, periodDate } }),
    ]);

    // El upsert es para los períodos viejos, que no tienen fila propia: ponerles fecha
    // no debería obligar a "abrirlos" primero. Pero sólo para ésos — un período que no
    // existe por ninguna vía no se crea de contrabando fijándole una fecha.
    //
    // El del calendario cuenta como existente aunque esté vacío: la vista siempre lo
    // ofrece para empezar a cargar, así que ponerle fecha no debería mandar a abrirlo.
    const isCurrent = period === currentPeriod(region === "CHILE");
    if (!before && withPicks === 0 && !isCurrent) {
      return NextResponse.json(
        { error: `${label} no existe todavía: ábrelo antes de ponerle fecha` },
        { status: 404 },
      );
    }

    await prisma.topPickPeriod.upsert({
      where:  { region_periodDate: { region, periodDate } },
      update: { reportDate, updatedBy: self?.email ?? null },
      create: { region, periodDate, reportDate, updatedBy: self?.email ?? null },
    });

    await logAdminChanges(
      [{
        entity: ENTITY.topPickPeriod, entityKey: `${region}|${period}`, label,
        field: "report_date",
        oldValue: before?.reportDate ? isoDay(before.reportDate) : null,
        newValue: reportDate ? isoDay(reportDate) : null,
        context: `${period}-01`, action: "update",
      }],
      self?.email ?? null,
    );

    return NextResponse.json({ ok: true, reportDate: reportDate ? isoDay(reportDate) : null });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
      return NextResponse.json(
        { error: "Falta la tabla top_pick_periods. Corre `npx prisma db push`." },
        { status: 503 },
      );
    }
    console.error("[top-picks/periods PATCH]", e);
    return NextResponse.json({ error: "No se pudo guardar la fecha" }, { status: 500 });
  }
}
