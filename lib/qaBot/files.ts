import { prisma } from "@/lib/prisma";
import { cellValue, type QueryResult } from "@/lib/qaBot/db";

// Archivos que el bot de Q&A manda por Telegram: tablas largas como CSV / Excel, y el PDF de una
// ficha o presentación vía link firmado de R2.

// ── Tablas ──────────────────────────────────────────────────────────────────────

const csvCell = (v: unknown): string => {
  const c = cellValue(v);
  if (c == null) return "";
  const s = String(c);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV UTF-8 con BOM (para que Excel respete los acentos), separado por comas. */
export function toCsv(r: QueryResult): Buffer {
  const lines = [r.columns.map(csvCell).join(","), ...r.rows.map((row) => row.map(csvCell).join(","))];
  return Buffer.from("﻿" + lines.join("\r\n"), "utf8");
}

/** Excel de una hoja, con el encabezado en negrita y columnas de ancho razonable. */
export async function toXlsx(r: QueryResult, sheetName = "Datos"): Promise<Buffer> {
  const XLSX = (await import("xlsx-js-style")).default ?? (await import("xlsx-js-style"));
  const aoa = [r.columns, ...r.rows.map((row) => row.map(cellValue))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  r.columns.forEach((_, c) => {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = { font: { bold: true } };
  });
  ws["!cols"] = r.columns.map((name, c) => {
    const longest = Math.max(name.length, ...r.rows.slice(0, 200).map((row) => String(cellValue(row[c]) ?? "").length));
    return { wch: Math.min(Math.max(longest + 2, 8), 60) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer);
}

/** Nombre de archivo seguro: sin rutas ni caracteres raros, con la extensión correcta. */
export function safeFilename(name: string, ext: "csv" | "xlsx"): string {
  const base = name.replace(/\.(csv|xlsx)$/i, "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "datos";
  return `${base}.${ext}`;
}

// ── PDFs de R2 ──────────────────────────────────────────────────────────────────

const SIGNED_TTL_S = 60 * 60; // 1 hora

export interface DocumentLink {
  title: string;
  /** URL para descargar: firmada (1 h) si el archivo está en R2; si no, la de la app (pide login). */
  url: string;
  signed: boolean;
}

async function signR2(key: string): Promise<string | null> {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) return null;
  // Import diferido: lib/r2 lanza al cargarse si faltan las credenciales de R2.
  const [{ r2 }, { GetObjectCommand }, { getSignedUrl }] = await Promise.all([
    import("@/lib/r2"), import("@aws-sdk/client-s3"), import("@aws-sdk/s3-request-presigner"),
  ]);
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: SIGNED_TTL_S });
}

/**
 * Link de descarga del PDF de una ficha (ai.tearsheet_pdfs.id) o de una presentación
 * (ai.presentations.id). Se busca por id con Prisma — el modelo sólo elige el id; nunca arma la URL.
 */
export async function documentLink(kind: "tearsheet" | "presentation", id: string): Promise<DocumentLink | null> {
  const { r2KeyFromUrl } = await import("@/lib/r2");
  if (kind === "tearsheet") {
    const f = await prisma.ficha.findUnique({ where: { id }, select: { title: true, fileUrl: true, fileKey: true } });
    if (!f) return null;
    const key = f.fileKey ?? r2KeyFromUrl(f.fileUrl);
    const signed = key ? await signR2(key) : null;
    return { title: f.title, url: signed ?? appUrl(f.fileUrl), signed: !!signed };
  }
  const p = await prisma.presentation.findUnique({ where: { id }, select: { title: true, file_url: true } });
  if (!p) return null;
  const key = r2KeyFromUrl(p.file_url);
  const signed = key ? await signR2(key) : null;
  return { title: p.title, url: signed ?? appUrl(p.file_url), signed: !!signed };
}

/** Las presentaciones antiguas guardan una ruta de la app (/api/presentations/download…). */
function appUrl(u: string): string {
  if (/^https?:\/\//i.test(u)) return u;
  return `${(process.env.APP_URL ?? "").replace(/\/$/, "")}${u.startsWith("/") ? "" : "/"}${u}`;
}
