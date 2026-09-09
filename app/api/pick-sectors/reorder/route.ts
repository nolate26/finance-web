import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Reordenar los sectores de una región.
//
// Recibe la lista COMPLETA de ids en el orden deseado y reescribe sort_order como
// 1..n dentro de una transacción. Se hace así y no con dos PATCH que intercambian
// posiciones porque dos clicks rápidos en las flechas podrían pisarse entre sí y
// dejar dos sectores con el mismo número; con la lista entera el resultado siempre
// es consistente, sin importar cuántas veces se apriete.

interface Body {
  region?:    string;
  sectorIds?: string[];
}

export async function POST(req: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const region = body.region?.trim().toUpperCase();
  if (region !== "CHILE" && region !== "LATAM") {
    return NextResponse.json({ error: "region debe ser CHILE o LATAM" }, { status: 400 });
  }

  const ids = body.sectorIds ?? [];
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Falta sectorIds" }, { status: 400 });
  }
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "Hay ids repetidos" }, { status: 400 });
  }

  try {
    // Todos los ids tienen que ser de ESTA región: si no, un reorder podría arrastrar
    // un sector de Chile al numerado de LatAm y dejarlos entremezclados.
    const own = await prisma.pickSector.findMany({
      where:  { region },
      select: { id: true },
    });
    const ownIds = new Set(own.map((s) => s.id));
    if (ids.some((id) => !ownIds.has(id))) {
      return NextResponse.json({ error: "Hay sectores que no son de esta región" }, { status: 400 });
    }

    await prisma.$transaction(
      ids.map((id, i) =>
        prisma.pickSector.update({ where: { id }, data: { sortOrder: i + 1 } }),
      ),
    );

    return NextResponse.json({ ok: true, ordered: ids.length });
  } catch (e) {
    console.error("[pick-sectors/reorder]", e);
    return NextResponse.json({ error: "No se pudo reordenar" }, { status: 500 });
  }
}
