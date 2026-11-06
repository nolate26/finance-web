import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import {
  listTables, tableMeta, readRows, getRow, updateRow, insertRow, deleteRow,
  validKey, rowLabel, keyString, type TableMeta, type Row,
} from "@/lib/adminTables";
import { normalizeTicker } from "@/lib/issuer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Editor de tablas de Admin Issues (todo sólo admin). Ver lib/adminTables.ts.
//   GET                              → lista de tablas
//   GET    ?table=&q=&sort=&dir=&offset=&limit= → columnas + página de filas
//   PATCH  { table, key, changes }   → edita una fila (key = valores de la PK)
//   POST   { table, values }         → inserta una fila
//   DELETE { table, key }            → borra una fila
// Cada escritura deja una línea por campo en admin_change_log (entity = "db:<tabla>").

const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

// Las empresas se crean sólo desde este editor. Nombre y ticker son lo único que no puede
// faltar; el resto de los NOT NULL entra vacío, como ya lo tienen cientos de filas de la
// maestra, y se completa después.
const MASTER_TABLE = "empresas_industrias_v2";
const MASTER_REQUIRED = ["nombre_latam", "ticker_bloomberg"];

// Sin esto un "PAMPA CI Equity" se guarda sin error, pero la empresa no sale en Company
// Profiles (filtra LIKE '% EQUITY') y no cruza con sus datos, que comparan por igualdad.
// Sólo mira los campos que llegan: una fila vieja se puede editar sin tocar estos dos.
function checkMaster(values: Record<string, unknown>): { values: Record<string, unknown> } | { error: string } {
  const out = { ...values };
  if ("ticker_bloomberg" in values) {
    const ticker = normalizeTicker(String(values.ticker_bloomberg ?? ""));
    if (!ticker.endsWith(" EQUITY")) return { error: `Ticker Bloomberg: debe terminar en EQUITY (ej. PAMPA CI EQUITY), llegó “${ticker}”` };
    out.ticker_bloomberg = ticker;
  }
  if ("country_risk" in values) {
    const country = String(values.country_risk ?? "").trim().toUpperCase();
    if (country && !/^[A-Z]{2}$/.test(country)) return { error: `País: usá el código de 2 letras (CL, BR, MX, US, OT…), llegó “${country}”` };
    out.country_risk = country;
  }
  return { values: out };
}

// Mensaje legible de un error de Postgres (tipo inválido, NOT NULL, FK, PK duplicada…).
function pgError(err: unknown): string {
  const s = String((err as { message?: string })?.message ?? err);
  const m = s.match(/(?:ERROR|Message):\s*`?([^`\n]+)/i) ?? s.match(/db error: ERROR: ([^\n]+)/i);
  return (m?.[1] ?? s).slice(0, 300);
}

async function editableMeta(table: unknown): Promise<TableMeta | NextResponse> {
  if (typeof table !== "string" || !table) return fail("Falta la tabla");
  const meta = await tableMeta(table);
  if (!meta) return fail(`La tabla "${table}" no existe o no está disponible`, 404);
  if (!meta.editable) return fail(meta.readonlyReason ?? "Tabla de sólo lectura", 403);
  return meta;
}

async function log(meta: TableMeta, key: Row, action: "create" | "update" | "delete", before: Row | null, after: Row | null) {
  const user = await getSessionUser();
  const fields = meta.columns.map((c) => c.name).filter((f) => {
    if (action === "update") return (before?.[f] ?? null) !== (after?.[f] ?? null);
    return (action === "create" ? after?.[f] : before?.[f]) != null;
  });
  if (fields.length === 0) return;
  const label = rowLabel(meta, after ?? before);
  await prisma.adminChangeLog.createMany({
    data: fields.map((f) => ({
      entity: `db:${meta.name}`.slice(0, 60),
      entityKey: keyString(meta, key),
      label,
      field: f.slice(0, 60),
      oldValue: before?.[f]?.slice(0, 300) ?? null,
      newValue: after?.[f]?.slice(0, 300) ?? null,
      context: "Editor de tablas",
      action,
      editedBy: user?.email ?? null,
    })),
  });
}

export async function GET(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const sp = request.nextUrl.searchParams;
  const table = sp.get("table");
  try {
    if (!table) return NextResponse.json({ tables: await listTables() });

    const meta = await tableMeta(table);
    if (!meta) return fail(`La tabla "${table}" no existe o no está disponible`, 404);
    const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "100", 10) || 100, 1), 500);
    const offset = Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0);
    const { rows, total } = await readRows(meta, {
      q: (sp.get("q") ?? "").trim(),
      sort: sp.get("sort"),
      dir: sp.get("dir") === "desc" ? "desc" : "asc",
      limit, offset,
    });
    return NextResponse.json({ meta, rows, total, limit, offset });
  } catch (err) {
    console.error("[admin/tables GET]", err);
    return fail(pgError(err), 500);
  }
}

export async function PATCH(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const body = await request.json().catch(() => ({})) as { table?: unknown; key?: unknown; changes?: unknown };
  const meta = await editableMeta(body.table);
  if (meta instanceof NextResponse) return meta;
  if (!validKey(meta, body.key)) return fail("Falta la llave primaria de la fila");

  let changes = body.changes;
  if (meta.name === MASTER_TABLE) {
    const checked = checkMaster((changes ?? {}) as Record<string, unknown>);
    if ("error" in checked) return fail(checked.error);
    changes = checked.values;
  }

  try {
    const before = await getRow(meta, body.key);
    if (!before) return fail("La fila ya no existe (¿la cambió o borró alguien más?)", 404);
    const after = await updateRow(meta, body.key, changes);
    // Si se editó la PK, la fila nueva se identifica con los valores nuevos.
    const newKey = after ? Object.fromEntries(meta.pk.map((k) => [k, after[k]])) : body.key;
    await log(meta, newKey, "update", before, after);
    return NextResponse.json({ row: after });
  } catch (err) {
    return fail(pgError(err));
  }
}

export async function POST(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const body = await request.json().catch(() => ({})) as { table?: unknown; values?: unknown };
  const meta = await editableMeta(body.table);
  if (meta instanceof NextResponse) return meta;

  let values = body.values;
  if (meta.name === MASTER_TABLE) {
    const given = (values ?? {}) as Record<string, unknown>;
    const missing = MASTER_REQUIRED.filter((c) => !String(given[c] ?? "").trim());
    if (missing.length) return fail(`Falta ${missing.join(" y ")}`);
    const checked = checkMaster(given);
    if ("error" in checked) return fail(checked.error);
    const blanks = meta.columns.filter((c) => !c.nullable && !c.hasDefault).map((c) => [c.name, ""]);
    values = { ...Object.fromEntries(blanks), ...checked.values };
  }

  try {
    const row = await insertRow(meta, values);
    if (row) await log(meta, Object.fromEntries(meta.pk.map((k) => [k, row[k]])), "create", null, row);
    return NextResponse.json({ row });
  } catch (err) {
    return fail(pgError(err));
  }
}

export async function DELETE(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const body = await request.json().catch(() => ({})) as { table?: unknown; key?: unknown };
  const meta = await editableMeta(body.table);
  if (meta instanceof NextResponse) return meta;
  if (!validKey(meta, body.key)) return fail("Falta la llave primaria de la fila");

  try {
    const before = await getRow(meta, body.key);
    if (!before) return NextResponse.json({ ok: true });
    await deleteRow(meta, body.key);
    // Se registran TODOS los valores: es lo único que permite recrear la fila.
    await log(meta, body.key, "delete", before, null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(pgError(err));
  }
}
