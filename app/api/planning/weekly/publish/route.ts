import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY, type AdminLogEntry } from "@/lib/adminLog";
import { notify, type CalendarChange } from "@/lib/notify";
import {
  PLAN_CATEGORIES, categoryStyle, cellDateLabel, regionLabel, mondayOf, isoDate, type PlanCategory,
} from "@/lib/planning";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Guarda de una vez el borrador del calendario macro (weekly_plan) y avisa al grupo de
// tareas por Telegram. Sólo admin. Es la ÚNICA escritura del calendario: el admin edita
// y arrastra en el navegador, y nada llega a la base —ni se avisa— hasta el botón.
//
// Todo o nada: un `id` que ya no existe aborta con 409 antes de escribir, porque aplicar
// la mitad de un borrador dejaría el calendario en un estado que nadie armó.
//
// `sortOrder` manda el orden dentro de cada casilla; al final se renumeran 0..n-1 todas
// las casillas tocadas, que también cierra los huecos que dejan las actividades que se
// fueron o se borraron.

export interface PublishCell {
  /** Sin id se CREA una actividad nueva en la casilla. */
  id?:         string;
  region:      string;
  weekStart:   string;
  topic:       string | null;
  category:    string;
  allAnalysts: boolean;
  highlighted: boolean;
  notes:       string | null;
  analystIds:  string[];
  sortOrder:   number;
}

export interface PublishBody {
  saves:   PublishCell[];
  deletes: string[];
}

/** Una PublishCell ya validada: región canónica y la semana como lunes. */
type CleanCell = Omit<PublishCell, "weekStart"> & { weekStart: Date };

const TOPIC_MAX = 80;  // en el aviso: el tópico admite 300 y Telegram corta en 4096
const clip = (s: string | null) => (s && s.length > TOPIC_MAX ? s.slice(0, TOPIC_MAX) + "…" : s);

const place = (region: string, weekIso: string) => `${regionLabel(region)} · ${cellDateLabel(region, weekIso)}`;
const team = (all: boolean, initials: (string | null)[]) => (all ? "All" : initials.filter(Boolean).join(" / ") || "-");
const catLabel = (c: string) => categoryStyle(c).label;

export async function POST(req: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const self = await getSessionUser();

  let body: Partial<PublishBody>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const deletes = [...new Set(body.deletes ?? [])];
  const saves: CleanCell[] = [];
  for (const c of body.saves ?? []) {
    const region = c.region?.trim().toUpperCase();
    if (!region) return NextResponse.json({ error: "region is required" }, { status: 400 });
    const weekStart = mondayOf(c.weekStart ?? "");
    if (Number.isNaN(weekStart.getTime())) {
      return NextResponse.json({ error: "Invalid weekStart" }, { status: 400 });
    }
    if (!PLAN_CATEGORIES.includes(c.category as PlanCategory)) {
      return NextResponse.json({ error: `Invalid category (${PLAN_CATEGORIES.join(" | ")})` }, { status: 400 });
    }
    saves.push({
      id: c.id, region, weekStart, category: c.category,
      topic: c.topic?.trim() || null, notes: c.notes?.trim() || null,
      allAnalysts: !!c.allAnalysts, highlighted: !!c.highlighted,
      analystIds: [...new Set(c.analystIds ?? [])], sortOrder: c.sortOrder ?? 0,
    });
  }
  if (!saves.length && !deletes.length) {
    return NextResponse.json({ error: "There are no changes to save" }, { status: 400 });
  }

  try {
    // Los ids tienen que ser usuarios reales: un id inventado reventaría el connect
    // con un P2025 opaco en vez de un 400 que se entiende.
    const analystIds = [...new Set(saves.flatMap((s) => s.analystIds))];
    const users = await prisma.user.findMany({ where: { id: { in: analystIds } }, select: { id: true, initials: true } });
    if (users.length !== analystIds.length) {
      return NextResponse.json({ error: "Some analysts no longer exist" }, { status: 400 });
    }
    const initialsById = new Map(users.map((u) => [u.id, u.initials]));

    const ids = [...new Set([...saves.flatMap((s) => (s.id ? [s.id] : [])), ...deletes])];
    const rows = await prisma.weeklyPlan.findMany({
      where:   { id: { in: ids } },
      include: { analysts: { include: { user: { select: { initials: true } } } } },
    });
    if (rows.length !== ids.length) {
      return NextResponse.json(
        { error: "Someone else changed these activities. Discard your draft and edit again." },
        { status: 409 },
      );
    }
    const before = new Map(rows.map((r) => [r.id, r]));

    await prisma.$transaction(async (tx) => {
      await tx.weeklyPlan.deleteMany({ where: { id: { in: deletes } } });

      for (const { id, analystIds: cellAnalysts, ...fields } of saves) {
        const data = { ...fields, updatedBy: self?.email ?? null };
        const saved = id
          ? await tx.weeklyPlan.update({ where: { id }, data })
          : await tx.weeklyPlan.create({ data });

        // Los analistas se reemplazan en bloque: es una lista corta y así no hay que
        // diffear la selección.
        await tx.weeklyPlanAnalyst.deleteMany({ where: { weeklyPlanId: saved.id } });
        if (cellAnalysts.length) {
          await tx.weeklyPlanAnalyst.createMany({
            data: cellAnalysts.map((userId) => ({ weeklyPlanId: saved.id, userId })),
          });
        }
      }

      const slots = new Map<string, { region: string; weekStart: Date }>();
      for (const { region, weekStart } of [...saves, ...rows]) {
        slots.set(`${region}|${isoDate(weekStart)}`, { region, weekStart });
      }
      for (const slot of slots.values()) {
        const list = await tx.weeklyPlan.findMany({
          where:   slot,
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select:  { id: true },
        });
        for (let i = 0; i < list.length; i++) {
          await tx.weeklyPlan.update({ where: { id: list[i].id }, data: { sortOrder: i } });
        }
      }
    }, { timeout: 30_000 });

    // ── Bitácora y aviso ─────────────────────────────────────────────────────
    // Un cambio sólo de orden no se registra: ni la fecha ni el contenido cambiaron.
    const changes: CalendarChange[] = [];
    const log: AdminLogEntry[] = [];

    for (const id of deletes) {
      const r = before.get(id)!;
      const weekIso = isoDate(r.weekStart);
      changes.push({ action: "deleted", topic: clip(r.topic), where: place(r.region, weekIso), details: [] });
      log.push({
        entity: ENTITY.weeklyPlan, entityKey: `${r.region}|${weekIso}`, label: r.topic, field: "cell",
        oldValue: `${r.category}: ${r.topic ?? "—"}`, newValue: null, context: weekIso, action: "delete",
      });
    }

    for (const s of saves) {
      const weekIso = isoDate(s.weekStart);
      const key     = `${s.region}|${weekIso}`;
      const newTeam = team(s.allAnalysts, s.analystIds.map((id) => initialsById.get(id) ?? null));
      const r       = s.id ? before.get(s.id) : undefined;

      if (!r) {
        changes.push({
          action: "created", topic: clip(s.topic), where: place(s.region, weekIso),
          details: [`Category: ${catLabel(s.category)}`, `Analysts: ${newTeam}`],
        });
        log.push({
          entity: ENTITY.weeklyPlan, entityKey: key, label: s.topic, field: "cell",
          oldValue: null, newValue: `${s.category}: ${s.topic ?? "—"}`, context: weekIso, action: "create",
        });
        continue;
      }

      const oldIso  = isoDate(r.weekStart);
      const oldKey  = `${r.region}|${oldIso}`;
      const oldTeam = team(r.allAnalysts, r.analysts.map((a) => a.user.initials));
      const details: string[] = [];
      if (oldKey !== key)                details.push(`Moved from ${place(r.region, oldIso)}`);
      if (r.topic !== s.topic)           details.push(`Topic: ${clip(r.topic) ?? "—"} → ${clip(s.topic) ?? "—"}`);
      if (r.category !== s.category)     details.push(`Category: ${catLabel(r.category)} → ${catLabel(s.category)}`);
      if (oldTeam !== newTeam)           details.push(`Analysts: ${oldTeam} → ${newTeam}`);
      if (r.highlighted !== s.highlighted) details.push(s.highlighted ? "Highlighted" : "No longer highlighted");
      if (r.notes !== s.notes)           details.push("Notes updated");
      if (!details.length) continue;

      changes.push({ action: "updated", topic: clip(s.topic), where: place(s.region, weekIso), details });
      if (oldKey !== key) {
        log.push({
          entity: ENTITY.weeklyPlan, entityKey: key, label: s.topic, field: "week",
          oldValue: oldKey, newValue: key, context: weekIso, action: "update",
        });
      }
      if (r.topic !== s.topic || r.category !== s.category) {
        log.push({
          entity: ENTITY.weeklyPlan, entityKey: key, label: s.topic, field: "cell",
          oldValue: `${r.category}: ${r.topic ?? "—"}`, newValue: `${s.category}: ${s.topic ?? "—"}`,
          context: weekIso, action: "update",
        });
      }
    }

    await logAdminChanges(log, self?.email ?? null);
    notify({ kind: "calendar_updated", changes, editedBy: self?.name ?? self?.email ?? null });

    return NextResponse.json({ ok: true, changes: changes.length });
  } catch (e) {
    // La unicidad (region, week_start) se quitó del schema justo para permitir varias
    // actividades por día. Si sigue viva en la base es que falta aplicar el cambio, y
    // el P2002 pelado —"Unique constraint failed"— no dice ni qué falta ni qué hacer.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "The database still allows only one activity per day. Run `npx prisma db push`." },
        { status: 503 },
      );
    }
    console.error("[planning/weekly/publish POST]", e);
    return NextResponse.json({ error: "Could not save the calendar" }, { status: 500 });
  }
}
