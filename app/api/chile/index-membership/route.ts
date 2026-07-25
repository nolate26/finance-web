import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// index_membership es SPARSE: solo guarda las filas de pertenencia (weight=1). "No
// pertenece" = no hay fila. Por eso editar = crear/borrar filas, no togglear un weight.

// Orden de columnas preferido (los no listados van al final, alfabeticos).
const INDEX_ORDER = ["IPSA", "IGPA", "IGPA LC", "IGPA MC", "IGPA MCSC", "IGPA SC", "FTSE", "Mon Gen", "Mon 500", "Mon 501"];
const orderIdx = (name: string): number => {
  const i = INDEX_ORDER.indexOf(name);
  return i === -1 ? INDEX_ORDER.length : i;
};

const MAX_INDEX = 40, MAX_COMPANY = 120; // limites del schema (VarChar)

// Clave de celda: JSON.stringify([indice, compania]). Los nombres traen espacios
// ("IGPA MC", "Las Condes") y un separador plano podria colisionar; el par JSON es
// univoco. El front DEBE construir la clave igual (memberKey) para que el matcheo cuadre.
const memberKey = (indexName: string, company: string) => JSON.stringify([indexName, company]);

export interface IndexMembershipPayload {
  indices: string[];   // columnas (fondos), en orden preferido
  companies: string[]; // filas (companias), alfabetico
  members: string[];   // claves JSON [indice, compania] con pertenencia (weight>0)
  weights: Record<string, number>; // clave JSON -> peso (el "multiplicador" del sumaproducto)
}

export async function GET() {
  try {
    const rows = await prisma.indexMembership.findMany({
      select: { indexName: true, company: true, weight: true },
    });
    const indexSet = new Set<string>();
    const companySet = new Set<string>();
    const members: string[] = [];
    const weights: Record<string, number> = {};
    for (const r of rows) {
      indexSet.add(r.indexName);
      companySet.add(r.company);
      if (r.weight > 0) {
        const k = memberKey(r.indexName, r.company);
        members.push(k);
        weights[k] = r.weight;
      }
    }
    const indices = [...indexSet].sort((a, b) => orderIdx(a) - orderIdx(b) || a.localeCompare(b));
    const companies = [...companySet].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
    const payload: IndexMembershipPayload = { indices, companies, members, weights };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[index-membership GET]", err);
    return NextResponse.json({ error: "No se pudo cargar la membresia de indices" }, { status: 500 });
  }
}

interface Change { indexName?: string; company?: string; member?: boolean }
interface PutBody { changes?: Change[] }

export async function PUT(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  let body: PutBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const raw = Array.isArray(body.changes) ? body.changes : [];
  if (!raw.length) return NextResponse.json({ ok: true, applied: 0 });
  if (raw.length > 5000) return NextResponse.json({ error: "Demasiados cambios en una sola operacion" }, { status: 400 });

  // Sanitizar + deduplicar (ultimo gana por celda).
  const byCell = new Map<string, { indexName: string; company: string; member: boolean }>();
  for (const c of raw) {
    const indexName = typeof c.indexName === "string" ? c.indexName.trim() : "";
    const company = typeof c.company === "string" ? c.company.trim() : "";
    if (!indexName || !company) continue;
    if (indexName.length > MAX_INDEX || company.length > MAX_COMPANY) {
      return NextResponse.json({ error: `Nombre demasiado largo (indice <= ${MAX_INDEX}, compania <= ${MAX_COMPANY})` }, { status: 400 });
    }
    byCell.set(memberKey(indexName, company), { indexName, company, member: !!c.member });
  }

  const ops = [...byCell.values()].map(({ indexName, company, member }) =>
    member
      ? prisma.indexMembership.upsert({
          where: { indexName_company: { indexName, company } },
          create: { indexName, company, weight: 1 },
          update: { weight: 1 },
        })
      : prisma.indexMembership.deleteMany({ where: { indexName, company } }),
  );

  try {
    await prisma.$transaction(ops);
    return NextResponse.json({ ok: true, applied: ops.length });
  } catch (err) {
    console.error("[index-membership PUT]", err);
    return NextResponse.json({ error: "No se pudieron guardar los cambios" }, { status: 500 });
  }
}
