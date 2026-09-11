import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import { logAdminChanges } from "@/lib/adminLog";
import { normName, SEED_ORDEN, type OrdenPayload, type OrdenSeccion } from "@/lib/chileCompanyOrder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Orden y secciones de las tablas de Chile. Lo consumen Stock Selection y Proyecciones:
// las dos tienen que listar las empresas en el MISMO orden, así que hay una sola fuente.
//
// Mientras stock_selection_orden esté vacía se devuelve la semilla de lib/chileCompanyOrder
// (el antiguo FIXED_SECTIONS), para que la vista se comporte igual que siempre hasta que
// alguien guarde por primera vez desde el panel.

const MAX_SECCIONES = 60;
const MAX_EMPRESAS = 1000;
const MAX_NOMBRE_SECCION = 60;
const MAX_NOMBRE_EMPRESA = 120;

export async function GET() {
  try {
    const rows = await prisma.stockSelectionOrden.findMany({
      orderBy: [{ seccionPos: "asc" }, { pos: "asc" }],
      select: { label: true, seccion: true, seccionPos: true },
    });
    if (!rows.length) return NextResponse.json(SEED_ORDEN);

    // Las filas ya vienen ordenadas: basta agrupar respetando el orden de aparición.
    const secciones: OrdenSeccion[] = [];
    let actual: { pos: number; s: OrdenSeccion } | null = null;
    for (const r of rows) {
      if (!actual || actual.pos !== r.seccionPos) {
        actual = { pos: r.seccionPos, s: { nombre: r.seccion, empresas: [] } };
        secciones.push(actual.s);
      }
      actual.s.empresas.push(r.label);
    }
    const payload: OrdenPayload = { secciones, fuente: "db" };
    return NextResponse.json(payload);
  } catch (err) {
    // Resiliente como el resto: si falta el `db push`, las vistas usan la semilla y
    // se ordenan como siempre en vez de romperse.
    console.warn("[chile/orden GET] no disponible:", String(err).slice(0, 160));
    return NextResponse.json(SEED_ORDEN);
  }
}

interface PutBody { secciones?: { nombre?: string; empresas?: string[] }[] }

export async function PUT(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const user = await getSessionUser();

  let body: PutBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const raw = Array.isArray(body.secciones) ? body.secciones : [];
  if (!raw.length) return NextResponse.json({ error: "Hay que mandar al menos una sección" }, { status: 400 });
  if (raw.length > MAX_SECCIONES) return NextResponse.json({ error: `Máximo ${MAX_SECCIONES} secciones` }, { status: 400 });

  // Se valida TODO antes de escribir: la operación reemplaza la tabla entera, así que no
  // puede quedar a medias por una fila mala del final.
  const data: { company: string; label: string; seccion: string; seccionPos: number; pos: number; updatedBy: string | null }[] = [];
  const vistas = new Set<string>();
  const nombresSeccion = new Set<string>();

  for (const [si, s] of raw.entries()) {
    const nombre = typeof s.nombre === "string" ? s.nombre.trim() : "";
    if (!nombre) return NextResponse.json({ error: `La sección ${si + 1} no tiene nombre` }, { status: 400 });
    if (nombre.length > MAX_NOMBRE_SECCION) return NextResponse.json({ error: `Nombre de sección demasiado largo: “${nombre.slice(0, 40)}…”` }, { status: 400 });
    const claveSeccion = normName(nombre);
    if (nombresSeccion.has(claveSeccion)) return NextResponse.json({ error: `Hay dos secciones llamadas “${nombre}”` }, { status: 400 });
    nombresSeccion.add(claveSeccion);

    const empresas = Array.isArray(s.empresas) ? s.empresas : [];
    for (const [pi, e] of empresas.entries()) {
      const label = typeof e === "string" ? e.trim() : "";
      if (!label) continue;
      if (label.length > MAX_NOMBRE_EMPRESA) return NextResponse.json({ error: `Nombre de empresa demasiado largo: “${label.slice(0, 40)}…”` }, { status: 400 });
      const company = normName(label);
      // Una empresa en dos secciones haría ambiguo el orden: se corta acá y no en silencio.
      if (vistas.has(company)) return NextResponse.json({ error: `“${label}” está en más de una sección` }, { status: 400 });
      vistas.add(company);
      data.push({ company, label, seccion: nombre, seccionPos: si, pos: pi, updatedBy: user?.email ?? null });
    }
  }
  if (data.length > MAX_EMPRESAS) return NextResponse.json({ error: `Demasiadas empresas (${data.length})` }, { status: 400 });

  try {
    const antes = await prisma.stockSelectionOrden.count();
    await prisma.$transaction([
      prisma.stockSelectionOrden.deleteMany({}),
      prisma.stockSelectionOrden.createMany({ data }),
    ]);
    await logAdminChanges([{
      entity: "stock_selection_orden",
      entityKey: "orden",
      field: "estructura",
      label: `${raw.length} secciones`,
      oldValue: `${antes} empresas`,
      newValue: `${data.length} empresas · ${raw.length} secciones`,
    }], user?.email ?? null);
    return NextResponse.json({ ok: true, secciones: raw.length, empresas: data.length });
  } catch (err) {
    console.error("[chile/orden PUT]", err);
    return NextResponse.json({ error: "No se pudo guardar el orden" }, { status: 500 });
  }
}
