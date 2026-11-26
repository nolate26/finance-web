import { NextRequest, NextResponse, after } from "next/server";
import { answer, resetConversation, getLastQueries, exportLastQuery, dataStatus } from "@/lib/qaBot/agent";
import { getMe, sendReply, sendTyping } from "@/lib/qaBot/telegram";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Webhook del bot de Q&A de Telegram (bot nuevo, separado del de avisos de lib/notify.ts).
//
// Seguridad, en este orden:
//   1. Telegram manda el secreto del webhook en X-Telegram-Bot-Api-Secret-Token; sin él → 401.
//      (La ruta no pasa por el middleware de sesión: Telegram no tiene cookie.)
//   2. Sólo responde a los usuarios de TELEGRAM_QA_ALLOWED_USER_IDS. A los demás les dice su ID
//      para que el admin los pueda agregar.
//   3. La base se lee como qa_bot_ro (sólo el schema ai, sólo lectura) — ver lib/qaBot/db.ts.
//
// En grupos responde sólo cuando lo mencionan (@bot) o le responden a un mensaje suyo; con la
// privacy mode de BotFather activa, Telegram ni siquiera le manda el resto.
//
// Se contesta 200 de inmediato y el trabajo corre con after(): Telegram reintenta el update si el
// webhook tarda, y una pregunta puede tomar varios segundos.

interface TgUser { id: number; first_name?: string; username?: string }
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: "private" | "group" | "supergroup" | "channel" };
  text?: string;
  caption?: string;
  entities?: { type: string; offset: number; length: number }[];
  reply_to_message?: { from?: TgUser };
}
interface TgUpdate { update_id: number; message?: TgMessage }

const HELP = [
  "<b>Research Hub · Q&amp;A</b>",
  "Pregúntame por datos de la base: recomendaciones y TP del equipo, modelos vs consenso, múltiplos, retornos, fichas, top picks, notas de research, carteras, tareas y calendario.",
  "",
  "Ejemplos:",
  "• <i>TP y recomendación de Falabella</i>",
  "• <i>EBITDA 3T26 vs 3T25 de CCU</i>",
  "• <i>P/E forward de los bancos chilenos vs su promedio, en tabla</i>",
  "• <i>Consenso 2027 de todo el IPSA en Excel</i>",
  "• <i>Mándame la ficha de Andina</i>",
  "• <i>Gráfico del P/E forward de CCU de los últimos 5 años</i>",
  "",
  "/new — conversación nueva (borra el contexto)",
  "/status — fecha del último dato de cada fuente",
  "/sql — el SQL detrás de la última respuesta",
  "/excel — la tabla de la última respuesta en Excel",
  "/id — tu ID de Telegram",
].join("\n");

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const allowedUsers = (): Set<number> =>
  new Set((process.env.TELEGRAM_QA_ALLOWED_USER_IDS ?? "").split(",").map((s) => Number(s.trim())).filter(Number.isFinite));

// Telegram puede reenviar un update; se recuerdan los últimos para no responder dos veces.
const seen: number[] = [];
const isDuplicate = (id: number): boolean => {
  if (seen.includes(id)) return true;
  seen.push(id); if (seen.length > 500) seen.shift();
  return false;
};

// Una pregunta a la vez por chat: la segunda espera a la primera (comparten memoria).
const queues = new Map<number, Promise<void>>();
function enqueue(chatId: number, job: () => Promise<void>): Promise<void> {
  const next = (queues.get(chatId) ?? Promise.resolve()).then(job, job);
  queues.set(chatId, next.finally(() => { if (queues.get(chatId) === next) queues.delete(chatId); }));
  return next;
}

export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_QA_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let update: TgUpdate;
  try { update = await request.json(); } catch { return NextResponse.json({ ok: true }); }
  if (isDuplicate(update.update_id)) return NextResponse.json({ ok: true });

  const msg = update.message;
  if (msg) after(() => handle(msg).catch((e) => console.error("[qa-bot]", e)));
  return NextResponse.json({ ok: true });
}

async function handle(msg: TgMessage): Promise<void> {
  const raw = (msg.text ?? msg.caption ?? "").trim();
  if (!raw || !msg.from) return;
  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
  const me = await getMe();
  const mention = new RegExp(`@${me.username}\\b`, "i");

  // En grupos: sólo si lo mencionan, le responden a él o le mandan un comando suyo.
  if (isGroup) {
    const repliedToBot = msg.reply_to_message?.from?.id === me.id;
    if (!mention.test(raw) && !repliedToBot) return;
  }
  const text = raw.replace(mention, "").trim();
  const replyTo = isGroup ? msg.message_id : undefined;
  const cmd = text.match(/^\/(\w+)/)?.[1]?.toLowerCase();

  if (cmd === "id") return sendReply(chatId, `Tu ID de Telegram es <code>${msg.from.id}</code>.`, replyTo);

  if (!allowedUsers().has(msg.from.id)) {
    return sendReply(chatId,
      `No tienes acceso a este bot. Tu ID de Telegram es <code>${msg.from.id}</code>: pídele al administrador del Research Hub que lo agregue.`,
      replyTo);
  }

  // Comandos en inglés (los que se registran en BotFather); /nuevo y /ayuda quedan como alias.
  if (cmd === "start" || cmd === "help" || cmd === "ayuda") return sendReply(chatId, HELP, replyTo);
  if (cmd === "new" || cmd === "nuevo" || cmd === "reset") {
    resetConversation(chatId);
    return sendReply(chatId, "Listo, conversación nueva.", replyTo);
  }
  if (cmd === "status") {
    try {
      return sendReply(chatId, `<b>Último dato por fuente</b>\n<pre>${escapeHtml(await dataStatus())}</pre>`, replyTo);
    } catch (e) {
      console.error("[qa-bot] /status:", e);
      return sendReply(chatId, "No pude leer las fechas de la base.", replyTo);
    }
  }
  if (cmd === "sql") {
    const qs = getLastQueries(chatId);
    if (!qs.length) return sendReply(chatId, "La última respuesta no usó consultas (o la conversación es nueva).", replyTo);
    return sendReply(chatId, qs.map((q, i) => `<b>Consulta ${i + 1}</b>\n<pre>${escapeHtml(q.trim())}</pre>`).join("\n"), replyTo);
  }
  if (cmd === "excel") {
    try {
      const res = await exportLastQuery(chatId, replyTo);
      if (!res) return sendReply(chatId, "No hay una consulta reciente para exportar: primero hazme una pregunta.", replyTo);
      if (!res.rows) return sendReply(chatId, "La última consulta no devuelve filas.", replyTo);
      return;
    } catch (e) {
      console.error("[qa-bot] /excel:", e);
      return sendReply(chatId, "No pude generar el Excel.", replyTo);
    }
  }
  if (!text || cmd) return sendReply(chatId, HELP, replyTo);

  const who = msg.from.first_name ?? msg.from.username ?? String(msg.from.id);
  await enqueue(chatId, async () => {
    // "escribiendo…" dura ~5 s en Telegram: se renueva mientras el agente trabaja.
    await sendTyping(chatId);
    const typing = setInterval(() => void sendTyping(chatId), 4500);
    try {
      const res = await answer(chatId, text, who, replyTo);
      await sendReply(chatId, res.text, replyTo);
    } catch (e) {
      console.error("[qa-bot] error respondiendo:", e);
      await sendReply(chatId, "Tuve un problema respondiendo eso. Prueba de nuevo en un momento.", replyTo);
    } finally {
      clearInterval(typing);
    }
  });
}
