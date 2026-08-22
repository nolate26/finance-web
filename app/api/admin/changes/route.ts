import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Bitácora: todo lo que un admin cambió desde la web, más nuevo primero.
// Es append-only, así que acá vive el historial completo — incluidos los valores previos
// de un override, que en stock_selection_override se pisan al reeditar.

export interface ChangeLogRow {
  id: number;
  entity: string;
  entityKey: string;
  label: string | null;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  context: string | null;
  action: string;
  editedBy: string | null;
  editedAt: string; // ISO
}

export async function GET(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;

  const sp = request.nextUrl.searchParams;
  const entity = (sp.get("entity") ?? "").trim();
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "80", 10) || 80, 1), 500);

  try {
    const rows = await prisma.adminChangeLog.findMany({
      where: entity ? { entity } : undefined,
      orderBy: [{ editedAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    const out: ChangeLogRow[] = rows.map((r) => ({
      id: r.id, entity: r.entity, entityKey: r.entityKey, label: r.label, field: r.field,
      oldValue: r.oldValue, newValue: r.newValue, context: r.context, action: r.action,
      editedBy: r.editedBy, editedAt: r.editedAt.toISOString(),
    }));
    return NextResponse.json({ rows: out, truncated: out.length === limit });
  } catch (err) {
    // La tabla puede no existir todavía (falta `prisma db push`): se responde vacío con
    // aviso en vez de romper el panel entero.
    console.warn("[admin/changes GET]", String(err).slice(0, 160));
    return NextResponse.json({
      rows: [],
      truncated: false,
      unavailable: "La tabla admin_change_log todavía no existe. Corré `npx prisma db push` para habilitar la bitácora.",
    });
  }
}
