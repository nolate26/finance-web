import { after } from "next/server";
import { prisma } from "@/lib/prisma";

// Avisos del Research Hub por Telegram. Un bot publica en dos grupos:
//   · "model"     → TELEGRAM_CHAT_MODELS: entra un modelo nuevo por /api/ingest (compañía o banco).
//   · "task_done" → TELEGRAM_CHAT_TASKS:  una tarea de Planning pasa a done.
// Quién recibe cada aviso = quién está en cada grupo; se administra en Telegram, no en la app.
//
// Fire-and-forget: notify() nunca lanza ni se espera. El trabajo se agenda con after()
// para que corra DESPUÉS de mandar la respuesta; cualquier error se loguea como [notify]
// y la API principal sigue su camino. Va por HTTPS (api.telegram.org), así que funciona
// en Railway Hobby, que bloquea SMTP.

export type NotifyEvent =
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
    };

const THESIS_MAX = 700;   // Telegram corta en 4096 caracteres; la tesis es lo único largo

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

  const text = event.kind === "model" ? await modelMessage(event) : await taskMessage(event);

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

async function modelMessage(e: ModelEvent): Promise<string> {
  // findFirst y no findUnique por costumbre: la maestra tiene fan-out por nombre_latam.
  const company = await prisma.empresasIndustriasV2.findFirst({
    where:  { tickerBloomberg: e.ticker },
    select: { nombreLatam: true },
  });
  const name   = company?.nombreLatam ?? e.ticker;
  const kind   = e.modelType === "bank" ? "banco" : "compañía";
  const thesis = e.thesis && e.thesis.length > THESIS_MAX ? e.thesis.slice(0, THESIS_MAX) + "…" : e.thesis;

  const app   = appUrl(`/companies?ticker=${encodeURIComponent(e.ticker)}&tab=model`);
  const links = [
    app    ? `<a href="${esc(app)}">Ver en Research Hub</a>` : null,
    e.link ? `<a href="${esc(e.link)}">Planilla del analista</a>` : null,
  ].filter(Boolean).join("  ·  ");

  return [
    `📊 <b>Nuevo modelo de ${kind}</b>`,
    `<b>${esc(name)}</b>  <code>${esc(e.ticker)}</code>`,
    "",
    field("Recomendación", e.recc?.toUpperCase()),
    field("Target price",  e.tp != null ? fmtNum(e.tp) : null),
    field("Analista",      e.analyst),
    field("Fecha modelo",  e.updateDate.toISOString().slice(0, 10)),
    thesis ? `\n<i>${esc(thesis)}</i>` : null,
    links  ? `\n${links}` : null,
  ].filter((l) => l !== null).join("\n");
}

async function taskMessage(e: TaskEvent): Promise<string> {
  const sector = await prisma.sector.findUnique({ where: { id: e.sectorId }, select: { name: true } });
  const app    = appUrl("/planning");

  return [
    `✅ <b>Tarea completada</b>`,
    `<b>${esc(e.title)}</b>`,
    "",
    field("Completada por", e.closedBy),
    field("Sector",         sector?.name),
    field("Empresa",        e.company),
    field("Asignada a",     e.assignee),
    app ? `\n<a href="${esc(app)}">Ver en Planning</a>` : null,
  ].filter((l) => l !== null).join("\n");
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
  return v.toLocaleString("es-CL", { maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
