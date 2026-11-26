import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { runReadOnly, cellValue, type QueryResult } from "@/lib/qaBot/db";
import { loadCatalog } from "@/lib/qaBot/catalog";
import { toCsv, toXlsx, safeFilename, documentLink } from "@/lib/qaBot/files";
import { sendDocumentBuffer, sendDocumentUrl, sendPhotoBuffer, sendTyping } from "@/lib/qaBot/telegram";
import { parseChartData, renderChartPng, MAX_SERIES } from "@/lib/qaBot/chart";

// Agente del bot de Q&A de Telegram: Claude (Messages API) con tres herramientas propias —
// run_sql sobre el schema ai como qa_bot_ro, send_table_file para tablas largas y send_document
// para el PDF de una ficha o presentación. El ciclo corre acá, dentro de la app (Railway).

export const MODEL = process.env.QA_BOT_MODEL || "claude-sonnet-5-5";
const MAX_TURNS = 12;            // vueltas modelo → herramientas por pregunta
const SQL_ROWS_FOR_MODEL = 200;  // filas que ve el modelo por consulta
const FILE_ROWS = 50_000;        // filas máximas en un CSV / Excel
const RESULT_CHARS = 40_000;     // tope del JSON que vuelve al modelo
const CELL_CHARS = 1_500;        // tope por celda (body_text de las notas es largo)

const client = new Anthropic(); // ANTHROPIC_API_KEY del entorno

const SYSTEM_PROMPT = `Eres el asistente de datos del equipo de Research de Renta Variable (Chile y LatAm). Respondes preguntas de los analistas por Telegram consultando la base del Research Hub con la herramienta run_sql, que ejecuta SELECT de solo lectura sobre el schema ai (vistas documentadas abajo).

Cómo trabajar
- Todo número que des sale de una consulta hecha en esta conversación. Si los datos no están o no alcanzan, dilo y explica qué falta; no estimes ni completes con conocimiento general.
- Cruza todo por bbg_ticker. Para resolver un nombre ("Andina", "SQM"), busca primero en securities (company_name, local_name) y, para nombres del track record, en security_aliases. securities tiene una fila por papel listado, no por empresa: si un nombre devuelve varios papeles (serie A/B, ADR), elige el local principal o pregunta, y nunca sumes montos después de un JOIN por company_name.
- Para "el dato actual" usa is_latest / is_latest_version. La recomendación y el target price oficiales del equipo son los de security_recommendations con source = 'analyst_model' e is_latest_for_source; las otras fuentes son contexto.
- Respeta las unidades y monedas que indican los comentarios de cada columna (millones vs unidades, decimal vs %, retornos anualizados, dividendos negativos en los modelos) y explicítalas en la respuesta.
- Si la pregunta es ambigua en algo que cambia el resultado (qué empresa, qué período), pregunta en una línea antes de consultar.
- Si el resultado tiene más de ~15 filas, o te piden "en Excel"/"en CSV"/"archivo", usa send_table_file (Excel por defecto) y en el mensaje resume lo principal.
- Si piden el PDF de una ficha o de una presentación, busca su id en tearsheet_pdfs o presentations y usa send_document.
- Si piden un gráfico, usa send_chart: "line" para series en el tiempo, "bar" para comparar empresas o categorías (barras horizontales; ordénalas en el SQL). Máximo ${MAX_SERIES} series y una sola unidad por gráfico (nunca dos escalas: si las magnitudes no se comparan, haz dos gráficos o indexa). Para series largas agrega por mes. En el mensaje que acompaña, da los números clave, porque la imagen no se puede consultar.

Formato de respuesta (Telegram)
- En español, directo: primero la respuesta, después el detalle mínimo. Siempre di la fecha del dato y de qué vista sale (p.ej. "consenso al 30/11/26").
- Usa solo HTML de Telegram: <b>, <i>, <code>, <pre>, <a href="...">. Nada de Markdown ni tablas con |. Escapa los signos < y > que no sean etiquetas como &lt; y &gt;.
- Tablas de hasta ~15 filas dentro de <pre>, con columnas alineadas y pocas columnas (se lee en celular).
- Máximo ~3.000 caracteres por respuesta.
- No muestres el SQL salvo que te lo pidan.`;

// ── Herramientas ────────────────────────────────────────────────────────────────

const RunSql = z.object({ sql: z.string().min(1) });
const SendTableFile = z.object({
  sql: z.string().min(1),
  filename: z.string().min(1),
  format: z.enum(["xlsx", "csv"]),
  caption: z.string(),
});
const SendDocument = z.object({ kind: z.enum(["tearsheet", "presentation"]), id: z.string().min(1) });
const SendChart = z.object({
  kind: z.enum(["line", "bar"]),
  sql: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string(),
  value_format: z.enum(["number", "percent", "fraction_percent", "multiple"]),
  decimals: z.number().int().min(0).max(4),
  source_note: z.string(),
});

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "run_sql",
    description:
      "Ejecuta UNA consulta SELECT (o WITH ... SELECT) de solo lectura sobre el schema ai y devuelve columnas y filas (máximo 200; si hay más, truncated = true). Usa nombres de vista sin prefijo (securities, mkt_consensus_estimates…). Filtra y agrega en SQL en vez de traer tablas enteras.",
    input_schema: {
      type: "object",
      properties: { sql: { type: "string", description: "Consulta SELECT sobre las vistas del schema ai." } },
      required: ["sql"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "send_table_file",
    description:
      "Ejecuta una consulta SELECT sobre el schema ai y manda el resultado completo (hasta 50.000 filas) como archivo Excel o CSV al chat. Úsala para tablas de más de ~15 filas o cuando pidan un archivo. Devuelve cuántas filas se mandaron.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "Consulta SELECT con las columnas y el orden que debe tener el archivo." },
        filename: { type: "string", description: "Nombre del archivo, sin extensión (p.ej. consenso_bancos_2026)." },
        format: { type: "string", enum: ["xlsx", "csv"], description: "xlsx por defecto; csv sólo si lo piden." },
        caption: { type: "string", description: "Texto corto que acompaña al archivo (puede ir vacío)." },
      },
      required: ["sql", "filename", "format", "caption"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "send_document",
    description:
      "Manda al chat el PDF de una ficha (kind = tearsheet, id de tearsheet_pdfs) o de una presentación (kind = presentation, id de presentations), con un link de descarga válido por 1 hora. Devuelve el título y el link.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["tearsheet", "presentation"] },
        id: { type: "string", description: "tearsheet_pdfs.id o presentations.id." },
      },
      required: ["kind", "id"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "send_chart",
    description:
      `Dibuja un gráfico con el manual de marca de PATRIA y lo manda como imagen al chat. Los datos salen de una consulta SELECT sobre el schema ai: la PRIMERA columna es el eje X (fecha 'YYYY-MM-DD', año o etiqueta de categoría) y las siguientes son las series numéricas (1 a ${MAX_SERIES}), con alias legibles porque el alias es el nombre de la serie en la leyenda. kind "line" para series en el tiempo (ordenadas por fecha ascendente, hasta 3.000 puntos); kind "bar" para comparar categorías en barras horizontales (hasta 30, ya ordenadas en el SQL). Devuelve cuántos puntos se dibujaron.`,
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["line", "bar"] },
        sql: { type: "string", description: "SELECT: primera columna = eje X; las siguientes = series numéricas con alias legibles." },
        title: { type: "string", description: "Título corto (se muestra en mayúsculas)." },
        subtitle: { type: "string", description: "Qué se mide y en qué unidad/moneda (puede ir vacío)." },
        value_format: {
          type: "string", enum: ["number", "percent", "fraction_percent", "multiple"],
          description: "number = tal cual; percent = el valor ya está en % (5.2 → 5,2%); fraction_percent = decimal (0.052 → 5,2%); multiple = veces (11.1 → 11,1x).",
        },
        decimals: { type: "integer", description: "Decimales de las etiquetas (0 a 4)." },
        source_note: { type: "string", description: "Pie: fuente y fecha del dato, p.ej. 'Fuente: consenso Bloomberg al 30/11/26' (puede ir vacío)." },
      },
      required: ["kind", "sql", "title", "subtitle", "value_format", "decimals", "source_note"],
      additionalProperties: false,
    },
    strict: true,
  },
];

/** Resultado de una consulta en el formato que lee el modelo, recortado si es muy largo. */
function forModel(r: QueryResult): string {
  const rows = r.rows.map((row) => row.map((v) => {
    const c = cellValue(v);
    return typeof c === "string" && c.length > CELL_CHARS ? c.slice(0, CELL_CHARS) + "…" : c;
  }));
  const out = { columns: r.columns, rows, row_count: r.rows.length, truncated: r.truncated };
  let json = JSON.stringify(out);
  if (json.length > RESULT_CHARS) {
    let n = rows.length;
    while (n > 1 && json.length > RESULT_CHARS) { n = Math.floor(n / 2); json = JSON.stringify({ ...out, rows: rows.slice(0, n), truncated: true, note: `Mostrando ${n} filas: el resultado es muy grande. Filtra más o usa send_table_file.` }); }
  }
  return json;
}

interface ToolCtx { chatId: number; replyTo?: number; filesSent: number; queries: string[] }

async function runTool(name: string, input: unknown, ctx: ToolCtx): Promise<{ content: string; isError?: boolean }> {
  try {
    if (name === "run_sql") {
      const p = RunSql.safeParse(input);
      if (!p.success) return { content: "Input inválido: falta sql.", isError: true };
      const r = await runReadOnly(p.data.sql, SQL_ROWS_FOR_MODEL);
      ctx.queries.push(p.data.sql);
      return { content: forModel(r) };
    }
    if (name === "send_table_file") {
      const p = SendTableFile.safeParse(input);
      if (!p.success) return { content: "Input inválido: faltan sql, filename o format.", isError: true };
      if (ctx.filesSent >= 3) return { content: "Ya se mandaron 3 archivos en esta respuesta; no mandes más.", isError: true };
      await sendTyping(ctx.chatId, "upload_document");
      const r = await runReadOnly(p.data.sql, FILE_ROWS, 25_000);
      ctx.queries.push(p.data.sql);
      if (!r.rows.length) return { content: "La consulta no devolvió filas; no se mandó archivo." };
      const file = p.data.format === "csv" ? toCsv(r) : await toXlsx(r);
      const fname = safeFilename(p.data.filename, p.data.format);
      await sendDocumentBuffer(ctx.chatId, file, fname,
        p.data.format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        p.data.caption || undefined, ctx.replyTo);
      ctx.filesSent++;
      return { content: JSON.stringify({ sent: true, filename: fname, rows: r.rows.length, truncated: r.truncated }) };
    }
    if (name === "send_document") {
      const p = SendDocument.safeParse(input);
      if (!p.success) return { content: "Input inválido: faltan kind o id.", isError: true };
      const link = await documentLink(p.data.kind, p.data.id);
      if (!link) return { content: "No existe un documento con ese id.", isError: true };
      // Telegram descarga el PDF desde el link (hasta 20 MB). Si no puede, queda el link.
      let attached = false;
      try {
        await sendTyping(ctx.chatId, "upload_document");
        await sendDocumentUrl(ctx.chatId, link.url, link.title, ctx.replyTo);
        attached = true;
      } catch (e) {
        console.warn("[qa-bot] no se pudo adjuntar el PDF, va el link:", String(e).slice(0, 160));
      }
      return { content: JSON.stringify({ title: link.title, attached, url: link.url, link_valid_for: link.signed ? "1 hora" : "requiere login en la app" }) };
    }
    if (name === "send_chart") {
      const p = SendChart.safeParse(input);
      if (!p.success) return { content: "Input inválido para send_chart.", isError: true };
      if (ctx.filesSent >= 3) return { content: "Ya se mandaron 3 archivos o gráficos en esta respuesta; no mandes más.", isError: true };
      const r = await runReadOnly(p.data.sql, 3001);
      ctx.queries.push(p.data.sql);
      const data = parseChartData(r, p.data.kind);
      if ("error" in data) return { content: data.error, isError: true };
      await sendTyping(ctx.chatId, "upload_photo");
      const png = await renderChartPng({
        kind: p.data.kind, title: p.data.title, subtitle: p.data.subtitle,
        valueFormat: p.data.value_format, decimals: p.data.decimals, sourceNote: p.data.source_note,
      }, data);
      await sendPhotoBuffer(ctx.chatId, png, undefined, ctx.replyTo);
      ctx.filesSent++;
      return { content: JSON.stringify({ sent: true, points: data.x.length, series: data.series.map((s) => s.name) }) };
    }
    return { content: `Herramienta desconocida: ${name}`, isError: true };
  } catch (e) {
    // Un error de SQL vuelve al modelo para que corrija la consulta.
    return { content: `Error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 2000), isError: true };
  }
}

// ── Memoria por chat ────────────────────────────────────────────────────────────
// Sólo el TEXTO de cada pregunta y respuesta (sin bloques de thinking ni de herramientas): el
// historial entre preguntas crece de forma append-only y no reenvía thinking de turnos anteriores,
// así que no choca con el chequeo de historial de los modelos con "preserved thinking". Vive en
// memoria: un deploy la reinicia, igual que /nuevo.

const MAX_PAIRS = 8;
const IDLE_MS = 3 * 60 * 60 * 1000;
const memory = new Map<number, { messages: Anthropic.Beta.BetaMessageParam[]; at: number }>();
// Consultas que usó la última respuesta de cada chat: las muestran /sql y las exporta /excel.
const lastQueries = new Map<number, string[]>();

export function resetConversation(chatId: number): void {
  memory.delete(chatId);
  lastQueries.delete(chatId);
}

/** SQL de la última respuesta del chat (en el orden en que se corrió). */
export function getLastQueries(chatId: number): string[] {
  return lastQueries.get(chatId) ?? [];
}

/** /excel: corre de nuevo la última consulta del chat y manda el resultado completo como Excel. */
export async function exportLastQuery(chatId: number, replyTo?: number): Promise<{ rows: number } | null> {
  const sql = getLastQueries(chatId).at(-1);
  if (!sql) return null;
  await sendTyping(chatId, "upload_document");
  const r = await runReadOnly(sql, FILE_ROWS, 25_000);
  if (!r.rows.length) return { rows: 0 };
  await sendDocumentBuffer(chatId, await toXlsx(r), `research_hub_${new Date().toISOString().slice(0, 10)}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", undefined, replyTo);
  return { rows: r.rows.length };
}

/** /status: fecha del último dato de cada fuente, sin pasar por el modelo. */
export async function dataStatus(): Promise<string> {
  const { rows } = await runReadOnly(`
    SELECT 'Precios Bloomberg', max(date)::text FROM mkt_price_snapshots
    UNION ALL SELECT 'Consenso sell-side', max(snapshot_date)::text FROM mkt_consensus_estimates
    UNION ALL SELECT 'Múltiplos (valuation)', max(date)::text FROM mkt_valuation_monthly
    UNION ALL SELECT 'Retornos totales', max(as_of)::text FROM mkt_total_returns
    UNION ALL SELECT 'Modelos del equipo', max(model_date)::text FROM model_versions
    UNION ALL SELECT 'Fichas (último cierre)', max(period_end)::text FROM reported_financials
    UNION ALL SELECT 'Notas de research', max(note_date)::text FROM research_notes
    UNION ALL SELECT 'Carteras de fondos', max(as_of)::text FROM fund_holdings
    UNION ALL SELECT 'Macro', max(date)::text FROM macro_indicator_history`, 50);
  return rows.map(([name, d]) => `${String(name).padEnd(24)} ${d ?? "—"}`).join("\n");
}

function history(chatId: number): Anthropic.Beta.BetaMessageParam[] {
  const m = memory.get(chatId);
  if (!m || Date.now() - m.at > IDLE_MS) { memory.delete(chatId); return []; }
  return m.messages;
}

function remember(chatId: number, question: string, answer: string): void {
  const msgs = [...history(chatId), { role: "user" as const, content: question }, { role: "assistant" as const, content: answer }];
  // Se recorta por pares desde el comienzo (nunca del medio).
  memory.set(chatId, { messages: msgs.slice(-MAX_PAIRS * 2), at: Date.now() });
}

// ── Una pregunta ────────────────────────────────────────────────────────────────

export interface AnswerResult { text: string; filesSent: number }

export async function answer(chatId: number, question: string, who: string, replyTo?: number): Promise<AnswerResult> {
  const catalog = await loadCatalog();
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: `${SYSTEM_PROMPT}\n\n<schema>\n${catalog}\n</schema>`, cache_control: { type: "ephemeral", ttl: "1h" } },
  ];
  const userText = `[${who}] ${question}`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [...history(chatId), { role: "user", content: userText }];
  const ctx: ToolCtx = { chatId, replyTo, filesSent: 0, queries: [] };
  const usage = { input: 0, output: 0, cacheRead: 0 };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16_000,
      system,
      tools: TOOLS,
      messages,
      output_config: { effort: "medium" },
      // Fallback del lado del servidor si el modelo declina por política (refusal).
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    usage.input += response.usage.input_tokens;
    usage.output += response.usage.output_tokens;
    usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;

    if (response.stop_reason === "refusal") {
      console.warn("[qa-bot] refusal", response.stop_details);
      return { text: "No puedo responder esa pregunta.", filesSent: ctx.filesSent };
    }

    // Append-only: la respuesta completa (thinking incluido) vuelve tal cual en la siguiente vuelta.
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") continue;

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text).join("\n").trim();
      console.log(`[qa-bot] chat ${chatId} · ${turn + 1} vueltas · in ${usage.input} (cache ${usage.cacheRead}) · out ${usage.output}`);
      const final = text || (ctx.filesSent ? "Listo, te mandé el archivo." : "No encontré una respuesta.");
      remember(chatId, userText, final);
      if (ctx.queries.length) lastQueries.set(chatId, ctx.queries);
      return { text: final, filesSent: ctx.filesSent };
    }

    // Todas las herramientas de la vuelta en un solo mensaje de resultados.
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const t of toolUses) {
      const r = await runTool(t.name, t.input, ctx);
      results.push({ type: "tool_result", tool_use_id: t.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
  }

  return { text: "La pregunta necesitó demasiados pasos. Prueba acotarla (una empresa, un período).", filesSent: ctx.filesSent };
}
