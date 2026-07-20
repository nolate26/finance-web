import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function num(v: number | string | undefined | null): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

interface PatchBody {
  date?:           string;
  type?:           string;
  analyst?:        string;
  company?:        string;
  recommendation?: string;
  recType?:        string;
  currentPrice?:   number | string;
  targetPrice?:    number | string;
}

// ── PATCH — editar una recomendación (solo admin) ───────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data: Prisma.AnalystRecommendationHistoryUpdateInput = {};
  if (body.type           !== undefined) data.type           = body.type.trim();
  if (body.analyst        !== undefined) data.analyst        = body.analyst.trim().toUpperCase();
  if (body.company        !== undefined) data.company        = body.company.trim();
  if (body.recommendation !== undefined) data.recommendation = body.recommendation.trim();
  if (body.recType        !== undefined) data.recType        = body.recType.trim();

  const cp = num(body.currentPrice);
  if (cp !== undefined) {
    if (cp === null) return NextResponse.json({ error: "currentPrice inválido" }, { status: 400 });
    data.currentPrice = cp;
  }
  const tp = num(body.targetPrice);
  if (tp !== undefined) {
    if (tp === null) return NextResponse.json({ error: "targetPrice inválido" }, { status: 400 });
    data.targetPrice = tp;
  }

  if (body.date !== undefined) {
    const d = new Date(body.date + "T00:00:00.000Z");
    if (isNaN(d.getTime())) return NextResponse.json({ error: "date inválido" }, { status: 400 });
    data.date = d;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  try {
    const rec = await prisma.analystRecommendationHistory.update({
      where: { id: numericId },
      data,
    });
    return NextResponse.json({ recommendation: { ...rec, date: rec.date.toISOString().slice(0, 10) } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Recomendación no encontrada" }, { status: 404 });
    }
    console.error("[track-record/recommendations/[id] PATCH]", e);
    return NextResponse.json({ error: "No se pudo actualizar la recomendación" }, { status: 500 });
  }
}

// ── DELETE — eliminar una recomendación (solo admin) ────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    await prisma.analystRecommendationHistory.delete({ where: { id: numericId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Recomendación no encontrada" }, { status: 404 });
    }
    console.error("[track-record/recommendations/[id] DELETE]", e);
    return NextResponse.json({ error: "No se pudo eliminar la recomendación" }, { status: 500 });
  }
}
