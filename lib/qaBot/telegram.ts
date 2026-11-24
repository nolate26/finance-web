// Cliente mínimo de la Bot API de Telegram para el bot de Q&A (TELEGRAM_QA_BOT_TOKEN). Es un
// bot distinto del de avisos (lib/notify.ts, TELEGRAM_BOT_TOKEN): los dos conviven sin cruzarse.

const MAX_MESSAGE = 4096;

function token(): string {
  const t = process.env.TELEGRAM_QA_BOT_TOKEN;
  if (!t) throw new Error("Falta TELEGRAM_QA_BOT_TOKEN");
  return t;
}

async function call<T = unknown>(method: string, body: Record<string, unknown> | FormData): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description ?? res.status}`);
  return data.result as T;
}

let me: { id: number; username: string } | null = null;
/** id y @username del bot (para detectar menciones en grupos). Se cachea en memoria. */
export async function getMe(): Promise<{ id: number; username: string }> {
  if (!me) me = await call<{ id: number; username: string }>("getMe", {});
  return me;
}

export async function sendTyping(chatId: number, action: "typing" | "upload_document" = "typing"): Promise<void> {
  await call("sendChatAction", { chat_id: chatId, action }).catch(() => {});
}

const stripTags = (s: string) =>
  s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/** Parte un texto largo en trozos de menos de 4096 caracteres, cortando en saltos de línea. */
function chunks(text: string): string[] {
  if (text.length <= MAX_MESSAGE) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_MESSAGE - 96) {
    let cut = rest.lastIndexOf("\n", MAX_MESSAGE - 96);
    if (cut < MAX_MESSAGE / 2) cut = MAX_MESSAGE - 96;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, "");
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Manda una respuesta con el HTML de Telegram. Si Telegram rechaza el HTML (una etiqueta sin
 * cerrar, un "<" suelto en "P/E < 10"), reintenta el mismo trozo como texto plano: la respuesta
 * llega igual, sólo sin formato. Un texto partido en varios trozos va sin formato desde el
 * comienzo, porque un corte puede caer dentro de un <pre>.
 */
export async function sendReply(chatId: number, html: string, replyTo?: number): Promise<void> {
  const parts = chunks(html);
  const plain = parts.length > 1;
  for (const [i, part] of parts.entries()) {
    const base = { chat_id: chatId, link_preview_options: { is_disabled: true }, ...(replyTo && i === 0 ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}) };
    if (!plain) {
      try { await call("sendMessage", { ...base, text: part, parse_mode: "HTML" }); continue; }
      catch (e) { console.warn("[qa-bot] HTML rechazado, va en texto plano:", String(e).slice(0, 160)); }
    }
    await call("sendMessage", { ...base, text: stripTags(part).slice(0, MAX_MESSAGE) });
  }
}

/** Sube un archivo generado en el servidor (CSV/XLSX) como documento. Límite de Telegram: 50 MB. */
export async function sendDocumentBuffer(
  chatId: number, file: Buffer, filename: string, mime: string, caption?: string, replyTo?: number,
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", new Blob([new Uint8Array(file)], { type: mime }), filename);
  if (caption) form.append("caption", caption.slice(0, 1024));
  if (replyTo) form.append("reply_parameters", JSON.stringify({ message_id: replyTo, allow_sending_without_reply: true }));
  await call("sendDocument", form);
}

/** Manda un documento por URL: Telegram lo descarga (PDF hasta 20 MB). */
export async function sendDocumentUrl(chatId: number, url: string, caption?: string, replyTo?: number): Promise<void> {
  await call("sendDocument", {
    chat_id: chatId, document: url, ...(caption ? { caption: caption.slice(0, 1024) } : {}),
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
  });
}
