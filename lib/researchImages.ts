import { createHash, randomUUID } from "crypto";

/**
 * Imágenes incrustadas de las notas de research (correos de Outlook vía Power Automate).
 *
 * Outlook no mete la imagen en el HTML: deja `<img src="cid:image001.jpg@01DD…">` y la
 * imagen viaja como adjunto. Power Automate manda esos adjuntos (sólo los inline, ya
 * filtrados en el flujo) en `attachments`. Acá se suben a R2 y el `cid:` se reescribe a
 * `/api/research/image/<key>`, que pide login y redirige a una URL firmada de R2.
 *
 * Así la BD guarda sólo links cortos (nunca base64) y las imágenes se descargan recién
 * cuando se abre la nota.
 *
 * Key: research/<sha256(messageId)[0..24]>/<i>_<nombre>. Un correo con N tickers genera N
 * filas que comparten la misma carpeta; reprocesar el correo sobrescribe los mismos objetos.
 */

export interface IncomingAttachment {
  contentId?:    string | null;
  name?:         string | null;
  contentType?:  string | null;
  base64?:       string | null;   // nombre que usa el flujo
  contentBytes?: string | null;   // alias por si el flujo cambia
}

export const RESEARCH_IMAGE_ROUTE = "/api/research/image/";
const KEY_ROOT   = "research/";
const MAX_BYTES  = 10 * 1024 * 1024;   // 10 MB por imagen
const MAX_IMAGES = 40;

/** Carpeta de R2 de un correo. Sin messageId (nota manual) → carpeta única. */
export function researchImagePrefix(messageId: string | null | undefined): string {
  const id = messageId?.trim();
  const folder = id
    ? createHash("sha256").update(id).digest("hex").slice(0, 24)
    : `manual-${randomUUID()}`;
  return `${KEY_ROOT}${folder}/`;
}

/** Sólo se sirven keys de esta carpeta y sin segmentos raros. */
export function isResearchImageKey(key: string): boolean {
  return key.startsWith(KEY_ROOT) && !key.includes("..") && !key.includes("//") && key.length < 300;
}

const BASE64_RE = /^[A-Za-z0-9+/=\r\n]+$/;

/**
 * El flujo hoy manda el contenido codificado DOS veces (base64 de un texto base64): se
 * decodifica mientras el resultado siga siendo texto base64. Sirve igual si algún día
 * llega con una sola capa. Una imagen real nunca es ASCII base64 puro (JPEG empieza con
 * 0xFF, PNG con 0x89), así que el loop se detiene en la capa correcta.
 */
function decodeBase64Layers(raw: string): Buffer | null {
  let text = raw.trim();
  for (let i = 0; i < 3; i++) {
    if (!text || !BASE64_RE.test(text)) return null;
    const buf = Buffer.from(text, "base64");
    if (buf.length === 0) return null;
    const asText = buf.toString("latin1");
    if (BASE64_RE.test(asText.slice(0, 4096)) && BASE64_RE.test(asText)) {
      text = asText;
      continue;
    }
    return buf;
  }
  return null;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "image";
}

/** "<image001.jpg@01DD…>" o "image001.jpg@01DD…" → clave de búsqueda normalizada. */
function normCid(cid: string): string {
  return cid.trim().replace(/^<|>$/g, "").toLowerCase();
}

/**
 * Sube las imágenes a R2 y devuelve el HTML con los `cid:` reescritos.
 * No lanza: si R2 no está configurado o una imagen falla, esa imagen queda sin link
 * (el lector la oculta) y la nota se guarda igual.
 */
export async function processResearchImages(
  html: string,
  attachments: unknown,
  messageId: string | null | undefined,
): Promise<{ html: string; uploaded: number; skipped: number }> {
  if (!Array.isArray(attachments) || attachments.length === 0 || !/cid:/i.test(html)) {
    return { html, uploaded: 0, skipped: Array.isArray(attachments) ? attachments.length : 0 };
  }
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) {
    console.error("[researchImages] R2_BUCKET_NAME no configurado; imágenes descartadas");
    return { html, uploaded: 0, skipped: attachments.length };
  }

  // Import diferido: lib/r2 lanza al cargarse si faltan credenciales.
  const [{ r2 }, { PutObjectCommand }] = await Promise.all([
    import("@/lib/r2"), import("@aws-sdk/client-s3"),
  ]);

  const prefix = researchImagePrefix(messageId);
  const urlByCid = new Map<string, string>();
  let skipped = 0;

  const items = (attachments as IncomingAttachment[]).slice(0, MAX_IMAGES);
  skipped += attachments.length - items.length;

  await Promise.all(items.map(async (a, i) => {
    const cid  = a?.contentId ? normCid(String(a.contentId)) : "";
    const type = String(a?.contentType ?? "").toLowerCase();
    const raw  = a?.base64 ?? a?.contentBytes;
    if (!cid || !type.startsWith("image/") || typeof raw !== "string") { skipped++; return; }

    const buf = decodeBase64Layers(raw);
    if (!buf || buf.length > MAX_BYTES) { skipped++; return; }

    const key = `${prefix}${i}_${safeName(String(a.name ?? cid.split("@")[0]))}`;
    try {
      await r2.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: buf, ContentType: type,
        CacheControl: "private, max-age=31536000, immutable",
      }));
      urlByCid.set(cid, RESEARCH_IMAGE_ROUTE + key.split("/").map(encodeURIComponent).join("/"));
    } catch (e) {
      console.error("[researchImages] no se pudo subir", key, e);
      skipped++;
    }
  }));

  const out = html.replace(/(["'])cid:([^"']+)\1/gi, (m, q: string, cid: string) => {
    const url = urlByCid.get(normCid(cid));
    return url ? `${q}${url}${q}` : m;
  });

  return { html: out, uploaded: urlByCid.size, skipped };
}

/**
 * Borra la carpeta de imágenes de un correo. No lanza (igual que deleteFromR2): una
 * imagen huérfana en R2 es más barata que abortar el borrado de la nota.
 */
export async function deleteResearchImages(messageId: string | null | undefined): Promise<void> {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!messageId?.trim() || !bucket) return;
  try {
    const [{ r2 }, { ListObjectsV2Command, DeleteObjectsCommand }] = await Promise.all([
      import("@/lib/r2"), import("@aws-sdk/client-s3"),
    ]);
    const Prefix = researchImagePrefix(messageId);
    const list = await r2.send(new ListObjectsV2Command({ Bucket: bucket, Prefix }));
    const objects = (list.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
    if (objects.length === 0) return;
    await r2.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }));
  } catch (e) {
    console.error("[researchImages] carpeta no borrada:", messageId, e);
  }
}
