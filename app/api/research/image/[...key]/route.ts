import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isResearchImageKey } from "@/lib/researchImages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SIGNED_TTL_S = 3600;

/**
 * GET /api/research/image/research/<carpeta>/<archivo>
 *
 * Imagen incrustada de una nota de research. Pide sesión (además del middleware) y
 * redirige a una URL firmada de R2: los bytes no pasan por el servidor y el bucket no
 * necesita ser público. El navegador cachea el redirect un rato menos que la firma.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const deny = await requireAuth();
  if (deny) return deny;

  const { key: parts } = await params;
  const key = (parts ?? []).map((p) => decodeURIComponent(p)).join("/");
  const bucket = process.env.R2_BUCKET_NAME;
  if (!isResearchImageKey(key) || !bucket) {
    return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
  }

  try {
    const [{ r2 }, { GetObjectCommand }, { getSignedUrl }] = await Promise.all([
      import("@/lib/r2"), import("@aws-sdk/client-s3"), import("@aws-sdk/s3-request-presigner"),
    ]);
    const url = await getSignedUrl(r2, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: SIGNED_TTL_S,
    });
    return new NextResponse(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": `private, max-age=${SIGNED_TTL_S - 300}` },
    });
  } catch (e) {
    console.error("[research/image]", key, e);
    return NextResponse.json({ error: "No se pudo firmar la imagen" }, { status: 500 });
  }
}
