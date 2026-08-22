import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";
import { codePatchFor } from "@/lib/yahooTickerFixes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Homologación: lectura/edición de empresas_industrias_v2 desde el panel de admin.
// Es la tabla que decide QUÉ empresas aparecen en Stock Selection y con qué ticker de
// Yahoo se les busca precio, así que un símbolo malo acá deja la fila sin precio (o la
// saca de la vista). Todo cambio queda en admin_change_log.

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

// Campos editables desde la web. El resto de la fila (industria, moneda, país) lo escribe
// el cargador y no se toca desde acá. Sin `export`: Next sólo admite handlers y tipos
// como exports de un route.ts.
const EDITABLE_FIELDS = {
  yahooFinanceTicker: { label: "Ticker Yahoo", max: 30, re: /^[A-Za-z0-9.^=-]+$/, nullable: true },
  tickerBloomberg: { label: "Ticker Bloomberg", max: 60, re: /^[A-Za-z0-9./ -]+$/, nullable: false },
} as const;
type EditableField = keyof typeof EDITABLE_FIELDS;
const isEditable = (f: string): f is EditableField => Object.prototype.hasOwnProperty.call(EDITABLE_FIELDS, f);

export interface EmpresaAdminRow {
  id: number;
  nombreLatam: string;
  nombreChile: string;
  isin: string;
  industriaChile: string;
  industriaGics: string;
  moneda: string;
  tickerBloomberg: string;
  yahooFinanceTicker: string | null;
  /** Símbolo que el parche en código sustituiría (lib/yahooTickerFixes). null = pasa limpio. */
  codePatch: string | null;
  /** true si algún nombre de esta fila aparece en stock_selection_v1 (o sea, afecta la vista). */
  inStockSelection: boolean;
}

// ── GET — buscar filas de homologación (?q=&limit=) ─────────────────────────────
export async function GET(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get("limit") ?? "60", 10) || 60, 1), 300);

  try {
    const like = { contains: q, mode: "insensitive" as const };
    const [rows, ssNames] = await Promise.all([
      prisma.empresasIndustriasV2.findMany({
        where: q
          ? {
              OR: [
                { nombreLatam: like },
                { nombreChile: like },
                { tickerBloomberg: like },
                { yahooFinanceTicker: like },
                { isin: like },
              ],
            }
          : undefined,
        orderBy: [{ nombreLatam: "asc" }],
        take: limit,
        select: {
          id: true, nombreLatam: true, nombreChile: true, isin: true, moneda: true,
          industriaChile: true, industriaGics: true, tickerBloomberg: true, yahooFinanceTicker: true,
        },
      }),
      // groupBy y no findMany+distinct: el DISTINCT baja a SQL en vez de traerse las ~10k
      // filas de la tabla (98 compañías × métricas × trimestres) en cada búsqueda.
      prisma.stockSelectionV1.groupBy({ by: ["company"] }),
    ]);

    const ssSet = new Set(ssNames.map((r) => norm(r.company)));
    const out: EmpresaAdminRow[] = rows.map((r) => ({
      ...r,
      codePatch: codePatchFor(r.yahooFinanceTicker),
      inStockSelection: ssSet.has(norm(r.nombreLatam)) || ssSet.has(norm(r.nombreChile)),
    }));
    return NextResponse.json({ rows: out, total: out.length, truncated: out.length === limit });
  } catch (err) {
    console.error("[admin/empresas GET]", err);
    return NextResponse.json({ error: "No se pudo cargar la homologación" }, { status: 500 });
  }
}

// ── PUT — editar tickers de una fila (solo admin) ───────────────────────────────
interface PutBody { id?: number; changes?: Record<string, string | null> }

export async function PUT(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const user = await getSessionUser();

  let body: PutBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const id = body.id;
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Falta el id de la fila" }, { status: 400 });

  // Normaliza y valida cada campo pedido antes de tocar la base.
  const data: Record<string, string | null> = {};
  for (const [field, rawValue] of Object.entries(body.changes ?? {})) {
    if (!isEditable(field)) return NextResponse.json({ error: `Campo no editable: ${field}` }, { status: 400 });
    const def = EDITABLE_FIELDS[field];
    const v = typeof rawValue === "string" ? rawValue.trim() : rawValue == null ? "" : String(rawValue).trim();
    if (!v) {
      if (!def.nullable) return NextResponse.json({ error: `${def.label} no puede quedar vacío` }, { status: 400 });
      data[field] = null;
      continue;
    }
    if (v.length > def.max) return NextResponse.json({ error: `${def.label}: máximo ${def.max} caracteres` }, { status: 400 });
    if (!def.re.test(v)) return NextResponse.json({ error: `${def.label}: caracteres no válidos en “${v}”` }, { status: 400 });
    data[field] = v;
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Sin cambios" }, { status: 400 });

  try {
    const before = await prisma.empresasIndustriasV2.findUnique({
      where: { id: id as number },
      select: { id: true, nombreLatam: true, tickerBloomberg: true, yahooFinanceTicker: true },
    });
    if (!before) return NextResponse.json({ error: "La fila ya no existe" }, { status: 404 });

    // Sólo lo que realmente cambia: así el log no se llena de no-ops.
    const prev = before as unknown as Record<string, string | null>;
    const real = Object.fromEntries(Object.entries(data).filter(([f, v]) => (prev[f] ?? null) !== v));
    if (!Object.keys(real).length) return NextResponse.json({ error: "Los valores enviados son los que ya tenía" }, { status: 400 });

    const updated = await prisma.empresasIndustriasV2.update({
      where: { id: id as number },
      data: real,
      select: {
        id: true, nombreLatam: true, nombreChile: true, isin: true, moneda: true,
        industriaChile: true, industriaGics: true, tickerBloomberg: true, yahooFinanceTicker: true,
      },
    });

    await logAdminChanges(
      Object.entries(real).map(([field, value]) => ({
        entity: ENTITY.empresas,
        entityKey: String(before.id),
        label: before.nombreLatam,
        field,
        oldValue: prev[field] ?? null,
        newValue: value,
      })),
      user?.email ?? null,
    );

    return NextResponse.json({
      ok: true,
      applied: Object.keys(real).length,
      row: { ...updated, codePatch: codePatchFor(updated.yahooFinanceTicker), inStockSelection: true },
    });
  } catch (e) {
    // ticker_bloomberg es @unique: dos filas no pueden compartirlo.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Ese ticker Bloomberg ya está tomado por otra empresa" }, { status: 409 });
    }
    console.error("[admin/empresas PUT]", e);
    return NextResponse.json({ error: "No se pudo guardar el cambio" }, { status: 500 });
  }
}
