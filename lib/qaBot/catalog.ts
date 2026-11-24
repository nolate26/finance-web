import { runReadOnly } from "@/lib/qaBot/db";

// Catálogo del schema ai para el system prompt del bot, armado de los COMMENT ON de cada vista y
// columna (prisma/sql/phase_c_ai_schema_2026-11-23.sql). Se genera en caliente para que un cambio
// en las vistas llegue solo al bot, y se cachea en memoria una hora: el texto tiene que ser
// idéntico entre requests para que el prompt caching de la API funcione.

const TTL_MS = 60 * 60 * 1000;
let cache: { text: string; at: number } | null = null;

const CATALOG_SQL = `
SELECT c.relname AS view_name,
       obj_description(c.oid, 'pg_class') AS view_comment,
       a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS column_type,
       col_description(c.oid, a.attnum) AS column_comment,
       a.attnum
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
 WHERE n.nspname = 'ai' AND c.relkind IN ('v', 'm')
 ORDER BY c.relname, a.attnum`;

/** Texto del catálogo: una sección por vista con su descripción y sus columnas. */
export async function loadCatalog(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.text;
  const { rows } = await runReadOnly(CATALOG_SQL, 5000);
  // runReadOnly envuelve la consulta en un subselect, que no garantiza el ORDER BY de adentro.
  const sorted = (rows as [string, string | null, string, string, string | null, number][])
    .slice()
    .sort((a, b) => a[0].localeCompare(b[0]) || a[5] - b[5]);
  const parts: string[] = [];
  let current = "";
  for (const [view, viewComment, col, type, colComment] of sorted) {
    if (view !== current) {
      current = view;
      parts.push(`\n### ${view}\n${viewComment ?? ""}`);
    }
    parts.push(`- ${col} (${type})${colComment ? `: ${colComment}` : ""}`);
  }
  const text = parts.join("\n").trim();
  cache = { text, at: Date.now() };
  return text;
}
