import { Pool, types } from "pg";

// Acceso a la base del bot de Q&A de Telegram: rol claude_ro, que sólo ve el schema ai (las
// vistas documentadas de prisma/sql/phase_c_ai_schema_2026-11-23.sql) con search_path = ai y
// statement_timeout de 30 s. Pool propio con AI_DATABASE_URL: el bot NUNCA usa DATABASE_URL
// para consultas que escribe el modelo.
//
// Defensa en capas: el rol no puede leer public ni escribir; además cada consulta corre en una
// transacción READ ONLY, de a una sentencia, con timeout y tope de filas.

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const url = process.env.AI_DATABASE_URL;
    if (!url) throw new Error("Falta AI_DATABASE_URL (conexión de claude_ro al schema ai)");
    // DATE (oid 1082) como texto "2026-11-19": convertirlo a Date lo corre de día según la zona
    // horaria del servidor. Sólo en este pool — tocar pg.types global afectaría a Prisma.
    const DATE_OID = 1082;
    const parsers = {
      getTypeParser: (oid: number, format?: "text" | "binary") =>
        oid === DATE_OID ? (v: string) => v : types.getTypeParser(oid, format as "text"),
    };
    pool = new Pool({ connectionString: url, max: 4, idleTimeoutMillis: 60_000, types: parsers as never });
  }
  return pool;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  /** true si había más filas que el tope pedido. */
  truncated: boolean;
}

/** Una sola sentencia SELECT / WITH, sin punto y coma intermedio. Devuelve el SQL limpio o un error. */
export function validateSelect(raw: string): { sql: string } | { error: string } {
  const sql = raw.trim().replace(/;\s*$/, "");
  const noComments = sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  if (!/^\s*\(*\s*(select|with)\b/i.test(noComments)) return { error: "Sólo se permiten consultas SELECT (o WITH ... SELECT)." };
  if (noComments.includes(";")) return { error: "Una sola sentencia por consulta (sin ';' intermedios)." };
  return { sql };
}

/** Corre un SELECT como claude_ro en una transacción de sólo lectura, con tope de filas. */
export async function runReadOnly(rawSql: string, maxRows: number, timeoutMs = 20_000): Promise<QueryResult> {
  const v = validateSelect(rawSql);
  if ("error" in v) throw new Error(v.error);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${Math.round(timeoutMs)}`);
    const res = await client.query({ text: `SELECT * FROM (${v.sql}) AS q LIMIT ${maxRows + 1}`, rowMode: "array" });
    await client.query("COMMIT");
    const rows = res.rows as unknown[][];
    return { columns: res.fields.map((f) => f.name), rows: rows.slice(0, maxRows), truncated: rows.length > maxRows };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Valor de celda serializable y legible (fechas ISO cortas, números tal cual). */
export function cellValue(v: unknown): string | number | boolean | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 16).replace("T", " ") + " UTC"; // timestamps (DATE llega como texto)
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && v.length < 20) return Number(v); // numeric de pg llega como string
  return String(v);
}
