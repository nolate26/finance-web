import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUser } from "@/lib/auth";
import { normalizeTicker } from "@/lib/issuer";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";

// Comentarios de Chile → Last Ficha. Cualquier usuario autenticado escribe (requireAuth),
// igual que Planning: el control es de trazabilidad, no de rol — cada comentario queda
// firmado en ficha_comments.created_by/updated_by y en admin_change_log.
//
// PUT { ticker, year, quarter, source, section, line, target, comment }
//   · comment con texto → crea o actualiza (único por todo lo demás)
//   · comment vacío     → borra (quita el círculo de una variación)

const bodySchema = z.object({
  ticker:  z.string().trim().min(1, "ticker es obligatorio").transform(normalizeTicker),
  year:    z.number().int().min(1900).max(2100),
  quarter: z.number().int().min(1, "quarter debe ser 1 a 4").max(4, "quarter debe ser 1 a 4"),
  source:  z.enum(["statement", "kpi"]),
  section: z.string().trim().min(1).max(255),
  line:    z.string().trim().min(1).max(255),
  target:  z.enum(["line", "yoy", "qoq"]),
  comment: z.string().max(4000, "el comentario supera 4.000 caracteres").transform((s) => s.trim()),
});

export async function PUT(request: Request) {
  const deny = await requireAuth();
  if (deny) return deny;

  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return NextResponse.json({ error: `Payload inválido: ${i.path.join(".") || "body"}: ${i.message}` }, { status: 400 });
    }
    const { comment, ...key } = parsed.data;
    const user = await getSessionUser();
    const by = user?.email ?? null;
    const where = { ticker_year_quarter_source_section_line_target: key };
    const prev = await prisma.fichaComment.findUnique({ where, select: { comment: true } });
    const logKey = `${key.ticker} ${key.quarter}Q${key.year} · ${key.section} · ${key.line}`;

    if (!comment) {
      if (prev) {
        await prisma.fichaComment.delete({ where });
        await logAdminChanges([{ entity: ENTITY.fichaComment, entityKey: logKey, field: key.target, oldValue: prev.comment, newValue: null, action: "delete" }], by);
      }
      return NextResponse.json({ deleted: true });
    }

    const saved = await prisma.fichaComment.upsert({
      where,
      update: { comment, updatedBy: by },
      create: { ...key, comment, createdBy: by, updatedBy: by },
    });
    if (prev?.comment !== comment) {
      await logAdminChanges([{ entity: ENTITY.fichaComment, entityKey: logKey, field: key.target, oldValue: prev?.comment ?? null, newValue: comment, action: prev ? "update" : "create" }], by);
    }
    return NextResponse.json({
      comment: {
        source: saved.source, section: saved.section, line: saved.line, target: saved.target,
        comment: saved.comment, updatedBy: saved.updatedBy, updatedAt: saved.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    console.error("[last-ficha/comments]", e);
    return NextResponse.json({ error: "Error interno del servidor", details: String(e) }, { status: 500 });
  }
}
