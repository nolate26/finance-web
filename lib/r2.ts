import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

if (!process.env.R2_ACCOUNT_ID)    throw new Error("Missing R2_ACCOUNT_ID");
if (!process.env.R2_ACCESS_KEY_ID) throw new Error("Missing R2_ACCESS_KEY_ID");
if (!process.env.R2_SECRET_ACCESS_KEY) throw new Error("Missing R2_SECRET_ACCESS_KEY");

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Borra un objeto del bucket. NO lanza: quien llama ya borró (o va a borrar) la fila
 * que lo referencia, y un PDF huérfano en R2 es un problema mucho más barato que
 * abortar la operación o dejar una fila apuntando a un 404. Devuelve si se borró.
 */
export async function deleteFromR2(fileKey: string | null | undefined): Promise<boolean> {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!fileKey || !bucket) return false;
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: fileKey }));
    return true;
  } catch (e) {
    console.error("[r2] object not removed:", fileKey, e);
    return false;
  }
}

/**
 * Key del objeto a partir de su URL pública.
 *
 * `presentations` guarda sólo `file_url` (a diferencia de `fichas`, que tiene
 * `file_key`), así que para borrar el archivo hay que recuperar la key. La URL la
 * arma /api/upload como `${R2_PUBLIC_URL}/${key}`, así que alcanza con sacarle ese
 * prefijo. Devuelve null si la URL NO pertenece al bucket configurado —por ejemplo
 * las presentaciones viejas servidas desde /api/presentations/download—, y así el
 * borrado no intenta tocar algo que no es suyo.
 */
export function r2KeyFromUrl(fileUrl: string | null | undefined): string | null {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!fileUrl || !base || !fileUrl.startsWith(`${base}/`)) return null;
  const key = decodeURIComponent(fileUrl.slice(base.length + 1)).trim();
  return key || null;
}
