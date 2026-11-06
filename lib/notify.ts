import { after } from "next/server";
import { prisma } from "@/lib/prisma";

// Avisos del Research Hub por Telegram. Un bot publica en dos grupos:
//   · "model"        → TELEGRAM_CHAT_MODELS: entra un modelo nuevo por /api/ingest (compañía o banco).
//   · "task_created" → TELEGRAM_CHAT_TASKS:  se crea una tarea en Planning (🟦).
//   · "task_done"    → TELEGRAM_CHAT_TASKS:  una tarea de Planning pasa a done (🟩).
//   · "calendar_updated" → TELEGRAM_CHAT_TASKS: el admin guarda cambios del calendario (🟧).
// Telegram no permite colorear texto: creada vs completada se distinguen por el
// cuadrado de color y el emoji del encabezado.
// Quién recibe cada aviso = quién está en cada grupo; se administra en Telegram, no en la app.
//
// Fire-and-forget: notify() nunca lanza ni se espera. El trabajo se agenda con after()
// para que corra DESPUÉS de mandar la respuesta; cualquier error se loguea como [notify]
// y la API principal sigue su camino. Va por HTTPS (api.telegram.org), así que funciona
// en Railway Hobby, que bloquea SMTP.

/** Una línea del aviso del calendario. `where` y `details` ya vienen en texto plano. */
export interface CalendarChange {
  action:  "created" | "updated" | "deleted";
  topic:   string | null;
  where:   string;
  details: string[];
}

export type NotifyEvent =
  | {
      kind:     "calendar_updated";
      /** Vacío = sólo se reordenaron actividades dentro de un día. */
      changes:  CalendarChange[];
      editedBy: string | null;
    }
  | {
      kind:       "model";
      modelType:  "company" | "bank";
      ticker:     string;
      updateDate: Date;
      recc?:      string | null;
      tp?:        number | null;
      analyst?:   string | null;
      thesis?:    string | null;
      link?:      string | null;
    }
  | {
      kind:      "task_done";
      taskId:    string;
      title:     string;
      sectorId:  string;
      company?:  string | null;
      assignee?: string | null;
      closedBy?: string | null;
    }
  | {
      kind:         "task_created";
      taskId:       string;
      title:        string;
      sectorId:     string;
      description?: string | null;
      priority?:    string | null;
      dueDate?:     Date | null;
      company?:     string | null;
      assignee?:    string | null;
      createdBy?:   string | null;
    };

const THESIS_MAX = 700;   // Telegram corta en 4096 caracteres; la tesis es lo único largo
const CALENDAR_MAX = 3500;   // ídem: lugar para los cambios, el resto queda en "y N más"

export function notify(event: NotifyEvent): void {
  const job = () => send(event).catch((e) => console.error("[notify]", e));
  try {
    after(job);
  } catch {
    // after() solo existe dentro de un request; fuera de él (scripts, tests) se dispara directo.
    void job();
  }
}

async function send(event: NotifyEvent): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = event.kind === "model" ? process.env.TELEGRAM_CHAT_MODELS : process.env.TELEGRAM_CHAT_TASKS;
  if (!token || !chatId) {
    console.warn(`[notify] falta TELEGRAM_BOT_TOKEN o el chat de "${event.kind}": no se envía`);
    return;
  }

  const text = event.kind === "model"            ? await modelMessage(event)
             : event.kind === "task_created"     ? await taskCreatedMessage(event)
             : event.kind === "calendar_updated" ? calendarMessage(event)
             :                                     await taskMessage(event);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id:              chatId,
      text,
      parse_mode:           "HTML",
      link_preview_options: { is_disabled: true },
    }),
  });

  if (!res.ok) {
    // El caso típico: el grupo pasó a supergrupo y cambió de id → Telegram devuelve
    // parameters.migrate_to_chat_id con el id nuevo para poner en la variable.
    const body = await res.json().catch(() => ({}));
    console.error(`[notify] Telegram rechazó el mensaje (${res.status}):`, body);
  }
}

// ── Contenido ────────────────────────────────────────────────────────────────
// HTML de Telegram: solo admite <b>, <i>, <a>, <code>… y exige escapar & < >.

type ModelEvent = Extract<NotifyEvent, { kind: "model" }>;
type TaskEvent  = Extract<NotifyEvent, { kind: "task_done" }>;
type TaskCreatedEvent = Extract<NotifyEvent, { kind: "task_created" }>;
type CalendarEvent = Extract<NotifyEvent, { kind: "calendar_updated" }>;

const PRIORITY_LABEL: Record<string, string> = {
  high:   "🔴 High",
  medium: "🟠 Medium",
  low:    "⚪ Low",
};

async function modelMessage(e: ModelEvent): Promise<string> {
  // findFirst y no findUnique por costumbre: la maestra tiene fan-out por nombre_latam.
  const company = await prisma.empresasIndustriasV2.findFirst({
    where:  { tickerBloomberg: e.ticker },
    select: { nombreLatam: true },
  });
  const ticker = e.ticker.replace(/ EQUITY$/i, "");
  const thesis = e.thesis && e.thesis.length > THESIS_MAX ? e.thesis.slice(0, THESIS_MAX) + "…" : e.thesis;

  const app   = appUrl(`/companies?ticker=${encodeURIComponent(e.ticker)}&tab=model`);
  const links = [
    app    ? `<a href="${esc(app)}">View in Research Hub</a>` : null,
    e.link ? `<a href="${esc(e.link)}">Analyst spreadsheet</a>` : null,
  ].filter(Boolean).join("  ·  ");

  return [
    `📊 <b>${headline("MODEL UPDATE", ticker, e.recc?.toUpperCase())}</b>`,
    company?.nombreLatam ? esc(company.nombreLatam) : null,
    "",
    field("Type",          e.modelType === "bank" ? "Bank" : "Company"),
    field("Target price",  e.tp != null ? fmtNum(e.tp) : null),
    field("Analyst",       e.analyst),
    field("Model date",    e.updateDate.toISOString().slice(0, 10)),
    thesis ? `\n<i>${esc(thesis)}</i>` : null,
    links  ? `\n${links}` : null,
  ].filter((l) => l !== null).join("\n");
}

async function taskMessage(e: TaskEvent): Promise<string> {
  const sector = await prisma.sector.findUnique({ where: { id: e.sectorId }, select: { name: true } });
  const app    = appUrl("/planning");

  return [
    `🟩 ✅ <b>${headline("TASK COMPLETED", e.closedBy)}</b>`,
    headline(e.title, sector?.name),
    "",
    field("Company",     e.company),
    field("Assigned to", e.assignee),
    app ? `\n<a href="${esc(app)}">View in Planning</a>` : null,
  ].filter((l) => l !== null).join("\n");
}

async function taskCreatedMessage(e: TaskCreatedEvent): Promise<string> {
  const sector = await prisma.sector.findUnique({ where: { id: e.sectorId }, select: { name: true } });
  const app    = appUrl("/planning");
  const desc   = e.description && e.description.length > THESIS_MAX
    ? e.description.slice(0, THESIS_MAX) + "…"
    : e.description;

  return [
    `🟦 🆕 <b>${headline("NEW TASK", e.createdBy)}</b>`,
    headline(e.title, sector?.name),
    "",
    field("Company",     e.company),
    field("Assigned to", e.assignee),
    e.priority ? `Priority: ${PRIORITY_LABEL[e.priority] ?? esc(e.priority)}` : null,
    field("Due",         e.dueDate ? e.dueDate.toISOString().slice(0, 10) : null),
    desc ? `\n<i>${esc(desc)}</i>` : null,
    app  ? `\n<a href="${esc(app)}">View in Planning</a>` : null,
  ].filter((l) => l !== null).join("\n");
}

const CALENDAR_ICON: Record<CalendarChange["action"], string> = {
  created: "🆕",
  updated: "✏️",
  deleted: "🗑️",
};

function calendarMessage(e: CalendarEvent): string {
  const app = appUrl("/planning");

  const blocks: string[] = [];
  let used = 0;
  for (const c of e.changes) {
    const block = [
      `${CALENDAR_ICON[c.action]} <b>${esc(c.topic ?? "(no topic)")}</b> · ${esc(c.where)}`,
      ...c.details.map((d) => `    ${esc(d)}`),
    ].join("\n");
    if (used + block.length > CALENDAR_MAX) break;
    blocks.push(block);
    used += block.length;
  }
  const rest = e.changes.length - blocks.length;

  return [
    `🟧 📅 <b>CALENDAR UPDATED</b>`,
    field("Changed by", e.editedBy),
    "",
    e.changes.length ? blocks.join("\n") : "Activities were reordered within a day.",
    rest > 0 ? `\n…and ${rest} more change${rest === 1 ? "" : "s"}` : null,
    app ? `\n<a href="${esc(app)}">View calendar</a>` : null,
  ].filter((l) => l !== null).join("\n");
}

// Las dos primeras líneas son lo que se ve en la notificación del teléfono. Un dato
// vacío se salta, para no dejar "MODEL UPDATE - CCU CI - ".
function headline(...parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => !!p).map(esc).join(" - ");
}

function field(label: string, value: string | null | undefined): string | null {
  return value ? `${label}: <b>${esc(value)}</b>` : null;
}

// Telegram no acepta links a localhost: en dev el mensaje sale sin botón.
function appUrl(path: string): string | null {
  const base = process.env.APP_URL?.replace(/\/+$/, "");
  if (!base || /localhost|127\.0\.0\.1/.test(base)) return null;
  return base + path;
}

function fmtNum(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
