import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import { logAdminChanges } from "@/lib/adminLog";
import { norm } from "@/lib/ssHomologacion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Clonar el historial de una compañía a otra. El caso es el cambio de razón social: una
// empresa pasa a operar con otro nombre y otro ticker, y se quiere que la nueva arranque
// con la serie de la vieja en vez de nacer sin historia.
//
// ⚠️ Lo importante de este endpoint es que sea REVERSIBLE. El ingest de stock_selection_v1
// usa createMany({ skipDuplicates: true }), o sea que una fila clonada TAPA para siempre al
// dato real cuando el cargador empiece a mandarlo para ese mismo período. Por eso cada fila
// copiada queda marcada con `cloned_from`, y el DELETE de acá borra exactamente esas —
// nunca una fila cargada de verdad.
//
// El flujo sano es: clonar para tener continuidad hoy, y borrar las clonadas de los
// períodos que el cargador ya empezó a traer.

export interface CloneResult {
  ok: boolean;
  from: string;
  to: string;
  /** Filas efectivamente copiadas. */
  copiadas: number;
  /** Filas de origen que ya existían en el destino y no se pisaron. */
  omitidas: number;
  /** Trimestres cubiertos por la copia, para poder decirlo en la UI. */
  desde: string | null;
  hasta: string | null;
}

export async function POST(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const user = await getSessionUser();

  let body: { from?: string; to?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const from = typeof body.from === "string" ? body.from.trim() : "";
  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!from || !to) return NextResponse.json({ error: "Faltan las compañías de origen y destino" }, { status: 400 });
  if (norm(from) === norm(to)) return NextResponse.json({ error: "El origen y el destino son la misma compañía" }, { status: 400 });
  if (to.length > 120) return NextResponse.json({ error: "Nombre de destino demasiado largo" }, { status: 400 });

  try {
    const origen = await prisma.stockSelectionV1.findMany({ where: { company: from } });
    if (!origen.length) {
      return NextResponse.json({ error: `“${from}” no tiene filas en stock_selection_v1` }, { status: 404 });
    }

    // Lo que el destino ya tiene: no se pisa nada, ni cargado ni clonado antes.
    const yaHay = await prisma.stockSelectionV1.findMany({
      where: { company: to },
      select: { metric: true, series: true, fiscalYear: true, quarter: true },
    });
    const ocupado = new Set(yaHay.map((r) => `${r.metric}|${r.series}|${r.fiscalYear}|${r.quarter}`));

    const nuevas = origen
      .filter((r) => !ocupado.has(`${r.metric}|${r.series}|${r.fiscalYear}|${r.quarter}`))
      .map((r) => ({
        company: to, currency: r.currency, metric: r.metric, series: r.series,
        fiscalYear: r.fiscalYear, quarter: r.quarter, periodLabel: r.periodLabel,
        value: r.value, clonedFrom: from,
      }));

    if (nuevas.length) await prisma.stockSelectionV1.createMany({ data: nuevas, skipDuplicates: true });

    const keys = origen.map((r) => r.fiscalYear * 10 + r.quarter);
    const min = Math.min(...keys), max = Math.max(...keys);
    const label = (k: number) => `${k % 10}Q ${Math.floor(k / 10)}`;

    await logAdminChanges([{
      entity: "stock_selection_v1",
      entityKey: to,
      field: "clonacion",
      label: to,
      oldValue: null,
      newValue: `${nuevas.length} filas clonadas desde ${from}`,
      action: "create",
    }], user?.email ?? null);

    const res: CloneResult = {
      ok: true, from, to,
      copiadas: nuevas.length,
      omitidas: origen.length - nuevas.length,
      desde: keys.length ? label(min) : null,
      hasta: keys.length ? label(max) : null,
    };
    return NextResponse.json(res);
  } catch (err) {
    console.error("[ss-clone POST]", err);
    return NextResponse.json({ error: "No se pudo clonar el historial" }, { status: 500 });
  }
}

// ── DELETE — deshacer la clonación de una compañía ──────────────────────────────
// Borra SÓLO las filas marcadas como clonadas. Las que cargó el script quedan intactas,
// así que es seguro correrlo apenas empiece a llegar el dato real.
export async function DELETE(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const user = await getSessionUser();

  const company = (request.nextUrl.searchParams.get("company") ?? "").trim();
  if (!company) return NextResponse.json({ error: "Falta la compañía" }, { status: 400 });

  try {
    const { count } = await prisma.stockSelectionV1.deleteMany({
      where: { company, clonedFrom: { not: null } },
    });
    await logAdminChanges([{
      entity: "stock_selection_v1",
      entityKey: company,
      field: "clonacion",
      label: company,
      oldValue: `${count} filas clonadas`,
      newValue: null,
      action: "delete",
    }], user?.email ?? null);
    return NextResponse.json({ ok: true, borradas: count });
  } catch (err) {
    console.error("[ss-clone DELETE]", err);
    return NextResponse.json({ error: "No se pudieron borrar las filas clonadas" }, { status: 500 });
  }
}
