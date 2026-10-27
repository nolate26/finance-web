import { prisma } from "@/lib/prisma";

// Editor genérico de tablas para Admin Issues.
//
// Trabaja contra el catálogo de Postgres (no contra el schema de Prisma) para que sirva
// para CUALQUIER tabla de `public`, incluidas las que se agreguen después, sin escribir
// un endpoint por tabla. Reglas de seguridad:
//   · Los nombres de tabla y columna NUNCA se interpolan sin antes validarlos contra el
//     catálogo; además van siempre entre comillas dobles.
//   · Los valores van siempre como parámetros ($n) y se castean al tipo real de la
//     columna (format_type), así Postgres valida el formato.
//   · Las filas se identifican por su PK. Una tabla sin PK es de sólo lectura.
//   · Las tablas de autenticación no se exponen (hash de contraseñas, sesiones).

/** Nunca se listan ni se leen: credenciales y sesiones de NextAuth. */
export const BLOCKED_TABLES = new Set(["users", "accounts", "sessions", "verification_tokens"]);

/** Se pueden ver pero no editar: editar la bitácora borraría la auditoría. */
export const READONLY_TABLES = new Set(["admin_change_log"]);

export interface TableInfo {
  name: string;
  rowsEstimate: number | null; // reltuples; null si la tabla nunca fue analizada
}

export interface ColumnInfo {
  name: string;
  type: string;        // format_type: "character varying(200)", "double precision", ...
  nullable: boolean;
  hasDefault: boolean; // autoincrement, now(), etc. → en un alta se puede dejar vacía
  pk: boolean;
}

export interface TableMeta {
  name: string;
  columns: ColumnInfo[];
  pk: string[];
  editable: boolean;
  readonlyReason: string | null;
}

export type Row = Record<string, string | null>;

export const qi = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

export async function listTables(): Promise<TableInfo[]> {
  const rows = await prisma.$queryRawUnsafe<{ name: string; est: number }[]>(
    `SELECT c.relname AS name, c.reltuples::float8 AS est
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname`,
  );
  return rows
    .filter((r) => !BLOCKED_TABLES.has(r.name) && !r.name.startsWith("_prisma"))
    .map((r) => ({ name: r.name, rowsEstimate: r.est >= 0 ? Math.round(r.est) : null }));
}

/** Metadatos de la tabla, o null si no existe / está bloqueada. */
export async function tableMeta(table: string): Promise<TableMeta | null> {
  if (BLOCKED_TABLES.has(table) || table.startsWith("_prisma")) return null;
  const cols = await prisma.$queryRawUnsafe<{ name: string; type: string; nullable: boolean; has_default: boolean; pk: boolean }[]>(
    `SELECT a.attname AS name,
            format_type(a.atttypid, a.atttypmod) AS type,
            NOT a.attnotnull AS nullable,
            (d.adbin IS NOT NULL OR a.attidentity <> '') AS has_default,
            COALESCE(a.attnum = ANY(i.indkey), false) AS pk
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
       LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
       LEFT JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = $1
      ORDER BY a.attnum`,
    table,
  );
  if (cols.length === 0) return null;
  const columns: ColumnInfo[] = cols.map((c) => ({
    name: c.name, type: c.type, nullable: c.nullable, hasDefault: c.has_default, pk: c.pk,
  }));
  const pk = columns.filter((c) => c.pk).map((c) => c.name);
  const readonlyReason = READONLY_TABLES.has(table)
    ? "Tabla de auditoría: sólo lectura."
    : pk.length === 0
      ? "La tabla no tiene llave primaria, así que no se puede identificar una fila para editarla."
      : null;
  return { name: table, columns, pk, editable: !readonlyReason, readonlyReason };
}

/** `$n::text::<tipo>` — el valor viaja como texto y Postgres lo convierte (y valida). */
const cast = (n: number, col: ColumnInfo) => `$${n}::text::${col.type}`;

const selectList = (meta: TableMeta) =>
  meta.columns.map((c) => `${qi(c.name)}::text AS ${qi(c.name)}`).join(", ");

export async function readRows(meta: TableMeta, opts: {
  q: string; sort: string | null; dir: "asc" | "desc"; limit: number; offset: number;
}): Promise<{ rows: Row[]; total: number }> {
  const params: unknown[] = [];
  let where = "";
  if (opts.q) {
    params.push(`%${opts.q}%`);
    where = `WHERE (${meta.columns.map((c) => `${qi(c.name)}::text ILIKE $1`).join(" OR ")})`;
  }
  const sortCol = opts.sort && meta.columns.some((c) => c.name === opts.sort) ? opts.sort : null;
  const orderCols = sortCol ? [sortCol] : meta.pk.length ? meta.pk : [meta.columns[0].name];
  const dir = opts.dir === "desc" ? "DESC" : "ASC";
  const order = orderCols.map((c) => `${qi(c)} ${dir} NULLS LAST`).join(", ");

  const [rows, count] = await Promise.all([
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${selectList(meta)} FROM ${qi(meta.name)} ${where} ORDER BY ${order} LIMIT ${opts.limit} OFFSET ${opts.offset}`,
      ...params,
    ),
    prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM ${qi(meta.name)} ${where}`,
      ...params,
    ),
  ]);
  return { rows, total: count[0]?.n ?? 0 };
}

/** WHERE por PK. `start` = número del primer parámetro. */
function pkWhere(meta: TableMeta, key: Row, start: number): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const parts = meta.pk.map((name, i) => {
    const col = meta.columns.find((c) => c.name === name)!;
    params.push(key[name] ?? null);
    return `${qi(name)} = ${cast(start + i, col)}`;
  });
  return { sql: parts.join(" AND "), params };
}

export function validKey(meta: TableMeta, key: unknown): key is Row {
  return !!key && typeof key === "object" && meta.pk.every((k) => typeof (key as Row)[k] === "string");
}

export async function getRow(meta: TableMeta, key: Row): Promise<Row | null> {
  const w = pkWhere(meta, key, 1);
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT ${selectList(meta)} FROM ${qi(meta.name)} WHERE ${w.sql}`, ...w.params,
  );
  return rows[0] ?? null;
}

/** Sólo columnas que existen. Vacío → NULL, salvo texto NOT NULL, que queda "". */
function cleanValues(meta: TableMeta, values: unknown): [ColumnInfo, string | null][] {
  if (!values || typeof values !== "object") return [];
  return Object.entries(values as Record<string, unknown>)
    .map(([k, v]) => [meta.columns.find((c) => c.name === k), v] as const)
    .filter((e): e is readonly [ColumnInfo, unknown] => !!e[0])
    .map(([col, v]) => {
      const empty = v == null || (typeof v === "string" && v.trim() === "");
      if (!empty) return [col, String(v)];
      const isText = /^(text|character)/.test(col.type);
      return [col, !col.nullable && isText ? "" : null];
    });
}

export async function updateRow(meta: TableMeta, key: Row, changes: unknown): Promise<Row | null> {
  const vals = cleanValues(meta, changes);
  if (vals.length === 0) return getRow(meta, key);
  const set = vals.map(([col], i) => `${qi(col.name)} = ${cast(i + 1, col)}`).join(", ");
  const w = pkWhere(meta, key, vals.length + 1);
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `UPDATE ${qi(meta.name)} SET ${set} WHERE ${w.sql} RETURNING ${selectList(meta)}`,
    ...vals.map(([, v]) => v), ...w.params,
  );
  return rows[0] ?? null;
}

export async function insertRow(meta: TableMeta, values: unknown): Promise<Row | null> {
  // Las vacías se omiten: así aplican los defaults (id autoincrement, now(), ...).
  const vals = cleanValues(meta, values).filter(([, v]) => v !== null);
  const sql = vals.length
    ? `INSERT INTO ${qi(meta.name)} (${vals.map(([c]) => qi(c.name)).join(", ")}) VALUES (${vals.map(([c], i) => cast(i + 1, c)).join(", ")}) RETURNING ${selectList(meta)}`
    : `INSERT INTO ${qi(meta.name)} DEFAULT VALUES RETURNING ${selectList(meta)}`;
  const rows = await prisma.$queryRawUnsafe<Row[]>(sql, ...vals.map(([, v]) => v));
  return rows[0] ?? null;
}

export async function deleteRow(meta: TableMeta, key: Row): Promise<number> {
  const w = pkWhere(meta, key, 1);
  return prisma.$executeRawUnsafe(`DELETE FROM ${qi(meta.name)} WHERE ${w.sql}`, ...w.params);
}

// Columna "humana" para la etiqueta de la bitácora.
const LABEL_COLS = ["nombre_latam", "nombre_chile", "company", "empresa", "name", "nombre", "ticker", "ticker_bloomberg", "fund", "title", "email"];

export function rowLabel(meta: TableMeta, row: Row | null): string | null {
  if (!row) return null;
  const col = LABEL_COLS.find((c) => meta.columns.some((m) => m.name === c) && row[c]);
  return col ? row[col]!.slice(0, 200) : null;
}

export const keyString = (meta: TableMeta, key: Row) => meta.pk.map((k) => key[k] ?? "").join("|").slice(0, 200);
