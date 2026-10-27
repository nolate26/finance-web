import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Ocultar / mostrar una compañía de Analyst Estimates para los usuarios no-admin.
// No toca el modelo: sólo agrega o quita la fila en estimates_hidden, que es lo que
// /api/latam/consensus-check usa para filtrar. Cada cambio queda en admin_change_log.
//
// POST { ticker, hidden: boolean, reason? }

export async function POST(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const body = await request.json().catch(() => null) as { ticker?: unknown; hidden?: unknown; reason?: unknown } | null;
  const ticker = typeof body?.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  if (!ticker || typeof body?.hidden !== "boolean") {
    return NextResponse.json({ error: "Payload inválido: se espera { ticker, hidden }" }, { status: 400 });
  }
  const hidden = body.hidden;
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 300) : null;
  const user = await getSessionUser();
  const editedBy = user?.email ?? null;

  try {
    const existing = await prisma.estimatesHidden.findUnique({ where: { ticker } });
    if (hidden === !!existing) return NextResponse.json({ ok: true, ticker, hidden });

    await prisma.$transaction([
      hidden
        ? prisma.estimatesHidden.create({ data: { ticker, reason, hiddenBy: editedBy } })
        : prisma.estimatesHidden.delete({ where: { ticker } }),
      prisma.adminChangeLog.create({
        data: {
          entity: "estimates_hidden", entityKey: ticker, label: ticker, field: "visible",
          oldValue: hidden ? "visible" : "oculta", newValue: hidden ? "oculta" : "visible",
          action: hidden ? "create" : "delete", editedBy,
        },
      }),
    ]);
    return NextResponse.json({ ok: true, ticker, hidden });
  } catch (err) {
    console.error("[admin/estimates-hidden]", err);
    return NextResponse.json(
      { error: "No se pudo guardar. ¿Ya se corrió `npx prisma db push` (tabla estimates_hidden)?" },
      { status: 500 },
    );
  }
}
