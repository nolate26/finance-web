import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteFromR2, r2KeyFromUrl } from "@/lib/r2";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import { isRecommendation } from "@/lib/recommendations";
import { PRESENTATION_INCLUDE, toPresentationDTO } from "@/lib/presentationDto";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/presentations/[id] — revisión del admin.
 *
 * Es el paso de "verificar la información" del flujo de investment cases: el admin
 * corrige lo que haga falta (título, descripción, región, fecha, tickers con su TP y
 * recomendación) y, con `approve: true`, lo da por bueno y sale del panel de
 * pendientes. Los dos se pueden hacer juntos (editar y aceptar en un solo guardado)
 * o por separado.
 *
 * Los tickers se reemplazan en bloque cuando vienen en el body: es un set, y mandar
 * altas/bajas por separado complicaría el cliente sin ganar nada.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  let body: {
    title?: string; description?: string | null; region?: string;
    case_date?: string | null; is_sell_side?: boolean;
    tickers?: { ticker?: string; target_price?: number | null; recommendation?: string | null }[];
    approve?: boolean;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // ── Tickers (si vienen) ──────────────────────────────────────────────────
  let tickerRows: { ticker: string; targetPrice: number | null; recommendation: string | null }[] | undefined;
  if (body.tickers !== undefined) {
    if (!Array.isArray(body.tickers)) return NextResponse.json({ error: "tickers must be an array" }, { status: 400 });
    const seen = new Set<string>();
    tickerRows = [];
    for (const t of body.tickers) {
      const ticker = t?.ticker?.trim().toUpperCase();
      if (!ticker || seen.has(ticker)) continue;
      seen.add(ticker);
      const tp = t.target_price;
      if (tp != null && (typeof tp !== "number" || !Number.isFinite(tp))) {
        return NextResponse.json({ error: `Invalid target price for ${ticker}` }, { status: 400 });
      }
      const rec = t.recommendation ?? null;
      if (rec != null && rec !== "" && !isRecommendation(rec)) {
        return NextResponse.json({ error: `Invalid recommendation for ${ticker} (use BUY, HOLD or SELL)` }, { status: 400 });
      }
      tickerRows.push({ ticker, targetPrice: tp ?? null, recommendation: rec || null });
    }
  }

  // ── Fecha del caso ───────────────────────────────────────────────────────
  let caseDate: Date | null | undefined;
  if (body.case_date !== undefined) {
    if (body.case_date === null || body.case_date === "") caseDate = null;
    else {
      const d = new Date(`${body.case_date}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid case date" }, { status: 400 });
      caseDate = d;
    }
  }

  const existing = await prisma.presentation.findUnique({ where: { id }, select: { id: true, category: true } });
  if (!existing) return NextResponse.json({ error: "Presentación no encontrada" }, { status: 404 });

  // Un caso no se aprueba vacío: el punto de la revisión es que los tickers queden bien.
  if (body.approve && tickerRows?.length === 0) {
    return NextResponse.json({ error: "An investment case needs at least one ticker" }, { status: 400 });
  }

  const user = await getSessionUser();

  try {
    // Reemplazo de tickers + update en una transacción: si algo falla, el caso no
    // queda a medio editar (sin tickers viejos y sin los nuevos).
    const updated = await prisma.$transaction(async (tx) => {
      if (tickerRows !== undefined) {
        await tx.presentationTicker.deleteMany({ where: { presentationId: id } });
        if (tickerRows.length) {
          await tx.presentationTicker.createMany({
            data: tickerRows.map((t) => ({ ...t, presentationId: id })),
          });
        }
      }
      return tx.presentation.update({
        where: { id },
        data: {
          ...(body.title        !== undefined ? { title: body.title.trim() } : {}),
          ...(body.description  !== undefined ? { description: body.description?.trim() || null } : {}),
          ...(body.region       !== undefined ? { region: body.region.trim() } : {}),
          ...(body.is_sell_side !== undefined ? { is_sell_side: body.is_sell_side } : {}),
          ...(caseDate          !== undefined ? { caseDate } : {}),
          ...(body.approve ? { reviewStatus: "approved", reviewedBy: user?.email ?? null, reviewedAt: new Date() } : {}),
        },
        include: PRESENTATION_INCLUDE,
      });
    });

    return NextResponse.json({ presentation: toPresentationDTO(updated) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json({ error: "One of the tickers does not exist in empresas_industrias_v2" }, { status: 400 });
    }
    console.error("[api/presentations/[id]] PATCH error:", err);
    return NextResponse.json({ error: "No se pudo actualizar la presentación" }, { status: 500 });
  }
}

/**
 * DELETE /api/presentations/[id] — eliminar una presentación (sólo admin).
 *
 * Sirve tanto para limpiar material viejo como para rechazar un investment case que
 * no pasa la revisión. Borra la fila (sus `presentation_tickers` se van en cascada) y
 * después el PDF de R2, cuya key se deriva de file_url. Mismo orden que en fichas: si
 * R2 falla queda un huérfano en el bucket, que es el error barato, en vez de dejar una
 * fila apuntando a un archivo que ya no está.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  let fileUrl: string;
  try {
    const deleted = await prisma.presentation.delete({ where: { id }, select: { file_url: true } });
    fileUrl = deleted.file_url;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Presentación no encontrada" }, { status: 404 });
    }
    console.error("[api/presentations/[id]] DELETE error:", e);
    return NextResponse.json({ error: "No se pudo eliminar la presentación" }, { status: 500 });
  }

  const r2Deleted = await deleteFromR2(r2KeyFromUrl(fileUrl));
  return NextResponse.json({ ok: true, r2Deleted });
}
