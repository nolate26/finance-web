import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { r2 } from "@/lib/r2";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ── DELETE — borrar una ficha (solo admin) ─────────────────────────────────────
// Primero la fila, después el objeto en R2. Si R2 falla la ficha ya no se ve en la
// app (que es lo que el admin quería) y queda un PDF huérfano en el bucket, que es
// el error barato; al revés dejaría una fila apuntando a un 404.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  let fileKey: string | null;
  try {
    const ficha = await prisma.ficha.delete({ where: { id }, select: { fileKey: true } });
    fileKey = ficha.fileKey;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Ficha no encontrada" }, { status: 404 });
    }
    console.error("[fichas/[id] DELETE]", e);
    return NextResponse.json({ error: "No se pudo eliminar la ficha" }, { status: 500 });
  }

  let r2Deleted = false;
  const bucket = process.env.R2_BUCKET_NAME;
  if (fileKey && bucket) {
    try {
      await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: fileKey }));
      r2Deleted = true;
    } catch (e) {
      console.error("[fichas/[id] DELETE] R2 object not removed:", fileKey, e);
    }
  }

  return NextResponse.json({ ok: true, r2Deleted });
}
