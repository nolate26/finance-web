import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY, numToLog, type AdminLogEntry } from "@/lib/adminLog";
import {
  PROY_FIELD_MAP, YEAR_METRICS, ROW_YEAR, MIN_YEAR, MAX_YEAR,
  normEmpresa, type YearMetric,
} from "@/lib/proyeccionOverrideFields";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Capa de ediciones manuales sobre proyecciones_financieras.
//
// A diferencia del resto de las rutas mutantes de la app, ésta NO exige rol admin:
// cualquier usuario autenticado puede corregir una proyección. Lo que sí es obligatorio es
// la firma — el email de la sesión queda en proyecciones_override.edited_by y en la
// bitácora admin_change_log, que es append-only y guarda el historial completo.

// ── Estado de una celda para el panel de edición ───────────────────────────────
export interface CellState {
  metric:       string;
  calendarYear: number;      // 0 = campo de ficha (moneda / analista / payout)
  excel:        number | null;   // valor del snapshot vigente
  excelText:    string | null;
  override:     number | null;   // edición guardada (aplicada o no)
  overrideText: string | null;
  editedBy:     string | null;
  editedAt:     string | null;   // ISO
  /** false = el Excel se volvió a correr después de esta edición y la dejó atrás. */
  applied:      boolean;
}

export interface OverridesPayload {
  empresa:     string;
  generatedAt: string | null;  // ISO del snapshot vigente de la empresa
  columns:     number[];       // años calendario editables por defecto
  cells:       CellState[];
}

// Lee un y0/y1/y2 del snapshot por año calendario.
type SnapRow = Record<string, unknown> & { base_year: number };
function excelAt(row: SnapRow | null, metric: YearMetric, calYear: number): number | null {
  if (!row) return null;
  const off = calYear - (row.base_year ?? 0);
  if (off < 0 || off > 2) return null;
  const v = row[`${metric}_y${off}`];
  return typeof v === "number" ? v : null;
}

/** Snapshot vigente (generated_at más reciente) de una empresa. */
async function latestSnapshot(empresa: string) {
  const rows = await prisma.proyecciones_financieras.findMany({
    where: { empresa },
    orderBy: { generated_at: "desc" },
    take: 1,
  });
  return rows[0] ?? null;
}

/** Resuelve el nombre exacto tal como está en la tabla (case/espacios del Excel). */
async function resolveEmpresa(input: string): Promise<string | null> {
  const exact = await prisma.proyecciones_financieras.findFirst({
    where: { empresa: input },
    select: { empresa: true },
  });
  if (exact) return exact.empresa;
  const all = await prisma.proyecciones_financieras.findMany({ select: { empresa: true }, distinct: ["empresa"] });
  const target = normEmpresa(input);
  return all.find((r) => normEmpresa(r.empresa) === target)?.empresa ?? null;
}

// ── GET — estado editable de una empresa (?empresa=) ───────────────────────────

export async function GET(request: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;

  const input = (request.nextUrl.searchParams.get("empresa") ?? "").trim();
  if (!input) return NextResponse.json({ error: "Falta empresa" }, { status: 400 });

  try {
    const empresa = await resolveEmpresa(input);
    if (!empresa) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

    const [snap, overrides] = await Promise.all([
      latestSnapshot(empresa),
      prisma.proyeccionOverride.findMany({ where: { empresa } }),
    ]);

    // Ancla global: la misma que usa la vista (máximo base_year del snapshot vigente).
    const latestTs = await prisma.proyecciones_financieras.aggregate({ _max: { generated_at: true } });
    const anchorRows = latestTs._max.generated_at
      ? await prisma.proyecciones_financieras.findMany({
          where: { generated_at: latestTs._max.generated_at },
          select: { base_year: true },
        })
      : [];
    const anchor = anchorRows.length
      ? Math.max(...anchorRows.map((r) => r.base_year ?? 2025))
      : (snap?.base_year ?? 2025);

    const columns = [anchor, anchor + 1, anchor + 2];
    const snapAt = snap?.generated_at ?? null;
    const ovrMap = new Map(overrides.map((o) => [`${o.metric}|${o.calendarYear}`, o]));

    const cells: CellState[] = [];
    const push = (metric: string, calendarYear: number, excel: number | null, excelText: string | null) => {
      const o = ovrMap.get(`${metric}|${calendarYear}`) ?? null;
      cells.push({
        metric, calendarYear, excel, excelText,
        override:     o?.value ?? null,
        overrideText: o?.textValue ?? null,
        editedBy:     o?.editedBy ?? null,
        editedAt:     o?.editedAt.toISOString() ?? null,
        applied:      o ? (snapAt == null || o.editedAt.getTime() > snapAt.getTime()) : false,
      });
    };

    for (const metric of YEAR_METRICS)
      for (const y of columns) push(metric, y, excelAt(snap as SnapRow | null, metric, y), null);

    push("moneda",   ROW_YEAR, null, snap?.moneda ?? null);
    push("analyst",  ROW_YEAR, null, snap?.analyst ?? null);
    push("pool_div", ROW_YEAR, snap?.pool_div ?? null, null);

    // Años editados fuera de las 3 columnas por defecto (baches tapados a mano).
    for (const o of overrides) {
      if (o.calendarYear === ROW_YEAR || columns.includes(o.calendarYear)) continue;
      if (!YEAR_METRICS.includes(o.metric as YearMetric)) continue;
      push(o.metric, o.calendarYear, excelAt(snap as SnapRow | null, o.metric as YearMetric, o.calendarYear), null);
    }

    const payload: OverridesPayload = {
      empresa,
      generatedAt: snapAt?.toISOString() ?? null,
      columns,
      cells,
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[projections/overrides GET]", err);
    return NextResponse.json({ error: "No se pudieron cargar las ediciones" }, { status: 500 });
  }
}

// ── PUT — guarda los cambios de una fila ───────────────────────────────────────

interface Change {
  metric?:       string;
  calendarYear?: number;
  value?:        number | null;
  text?:         string | null;
}
interface PutBody { empresa?: string; changes?: Change[]; note?: string }

export async function PUT(request: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;
  const user = await getSessionUser();
  const editedBy = user?.email ?? null;

  let body: PutBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const input = typeof body.empresa === "string" ? body.empresa.trim() : "";
  if (!input) return NextResponse.json({ error: "Falta empresa" }, { status: 400 });

  const raw = Array.isArray(body.changes) ? body.changes : [];
  if (!raw.length) return NextResponse.json({ ok: true, applied: 0 });
  if (raw.length > 200) return NextResponse.json({ error: "Demasiados cambios" }, { status: 400 });

  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  // ── Normalización + validación ──────────────────────────────────────────────
  interface Cell { metric: string; calendarYear: number; value: number | null; text: string | null; kind: "number" | "text" }
  const byCell = new Map<string, Cell>();
  for (const c of raw) {
    const metric = typeof c.metric === "string" ? c.metric.trim() : "";
    const def = PROY_FIELD_MAP.get(metric);
    if (!def) return NextResponse.json({ error: `Campo no permitido: ${metric}` }, { status: 400 });

    // Los campos de ficha viven en el año centinela; los de año exigen un año razonable.
    // Se aceptan años FUERA del window del snapshot: es justamente para tapar baches.
    let year = ROW_YEAR;
    if (def.scope === "year") {
      year = Number(c.calendarYear);
      if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
        return NextResponse.json({ error: `Año inválido para ${metric}: ${c.calendarYear}` }, { status: 400 });
      }
    }

    let value: number | null = null;
    let text:  string | null = null;
    if (def.kind === "number") {
      value = c.value == null || !Number.isFinite(c.value) ? null : (c.value as number);
    } else {
      const t = typeof c.text === "string" ? c.text.trim() : "";
      text = t ? t.slice(0, 200) : null;
    }
    byCell.set(`${metric}|${year}`, { metric, calendarYear: year, value, text, kind: def.kind });
  }

  try {
    const empresa = await resolveEmpresa(input);
    if (!empresa) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

    const [snap, existing] = await Promise.all([
      latestSnapshot(empresa),
      prisma.proyeccionOverride.findMany({ where: { empresa } }),
    ]);
    const snapAt = snap?.generated_at ?? null;
    const prevMap = new Map(existing.map((o) => [`${o.metric}|${o.calendarYear}`, o]));

    const cells = [...byCell.values()];
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    const logEntries: AdminLogEntry[] = [];

    for (const cell of cells) {
      const k = `${cell.metric}|${cell.calendarYear}`;
      const prevOvr = prevMap.get(k) ?? null;
      // ¿La edición previa seguía en pie? Si el Excel se corrió después, el usuario está
      // viendo el valor del Excel, así que ESE es el punto de partida del Δ.
      const prevApplied = prevOvr != null && (snapAt == null || prevOvr.editedAt.getTime() > snapAt.getTime());

      const excelValue =
        cell.kind === "text"
          ? null
          : cell.metric === "pool_div"
            ? snap?.pool_div ?? null
            : excelAt(snap as SnapRow | null, cell.metric as YearMetric, cell.calendarYear);
      const excelText =
        cell.kind === "text"
          ? cell.metric === "moneda" ? snap?.moneda ?? null : snap?.analyst ?? null
          : null;

      const baseValue = prevApplied ? prevOvr!.value     : excelValue;
      const baseText  = prevApplied ? prevOvr!.textValue : excelText;
      const baseAt    = prevApplied ? prevOvr!.editedAt  : snapAt;

      const isClear = cell.kind === "number" ? cell.value == null : cell.text == null;

      // Sin cambio real → no se escribe ni se ensucia la bitácora.
      const sameAsBefore = cell.kind === "number"
        ? (prevApplied ? prevOvr!.value === cell.value : false)
        : (prevApplied ? prevOvr!.textValue === cell.text : false);
      if (sameAsBefore) continue;
      if (isClear && !prevOvr) continue; // vaciar algo que nunca se editó: nada que hacer

      if (isClear) {
        // Vaciar = borrar la edición → la celda vuelve al valor del Excel.
        // deleteMany (no delete): si la fila ya no está, la transacción no debe reventar.
        ops.push(prisma.proyeccionOverride.deleteMany({
          where: { empresa, metric: cell.metric, calendarYear: cell.calendarYear },
        }));
      } else {
        ops.push(prisma.proyeccionOverride.upsert({
          where: { empresa_metric_calendarYear: { empresa, metric: cell.metric, calendarYear: cell.calendarYear } },
          create: {
            empresa, metric: cell.metric, calendarYear: cell.calendarYear,
            value: cell.value, textValue: cell.text,
            baseValue, baseText, baseAt, editedBy, note,
          },
          update: {
            value: cell.value, textValue: cell.text,
            baseValue, baseText, baseAt, editedBy, note,
          },
        }));
      }

      const oldLog = cell.kind === "number" ? numToLog(baseValue) : baseText;
      const newLog = isClear
        ? null
        : cell.kind === "number" ? numToLog(cell.value) : cell.text;

      logEntries.push({
        entity:    ENTITY.proyeccionOverride,
        entityKey: `${empresa}|${cell.metric}|${cell.calendarYear}`,
        label:     empresa,
        field:     cell.calendarYear === ROW_YEAR ? cell.metric : `${cell.metric}_${cell.calendarYear}`,
        oldValue:  oldLog,
        newValue:  newLog,
        context:   cell.calendarYear === ROW_YEAR ? "ficha" : String(cell.calendarYear),
        action:    isClear ? ("delete" as const) : prevOvr ? ("update" as const) : ("create" as const),
      });
    }

    if (!ops.length) return NextResponse.json({ ok: true, applied: 0 });

    await prisma.$transaction(ops);
    await logAdminChanges(logEntries, editedBy);

    return NextResponse.json({ ok: true, applied: ops.length, editedBy });
  } catch (err) {
    console.error("[projections/overrides PUT]", err);
    return NextResponse.json({ error: "No se pudieron guardar los cambios" }, { status: 500 });
  }
}
