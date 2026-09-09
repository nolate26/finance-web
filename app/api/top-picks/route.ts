import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";
import {
  computeIsLegacy, memberKey, resolveAuthorId,
  type TopPickDTO, type TopPicksPayload,
} from "@/lib/topPicks";

export const dynamic = "force-dynamic";

// Top Picks de un período.
//
// PERMISOS: leer es abierto a cualquier autenticado — el equipo entero ve las
// recomendaciones de todos. Escribir depende de la membresía al SECTOR del pick:
// admin en todo, un `user` sólo en los sectores donde figura.
//
// El POST de acá crea UN pick (el modal de búsqueda agrega de a uno). Editar y borrar
// viven en /api/top-picks/[id].

/** Membresías de todos los sectores en un Set, para resolver isLegacy sin N consultas. */
async function loadMembers(): Promise<Set<string>> {
  const rows = await prisma.pickSectorMember.findMany({ select: { sectorId: true, userId: true } });
  return new Set(rows.map((r) => memberKey(r.sectorId, r.userId)));
}

export async function GET(request: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;

  const region     = request.nextUrl.searchParams.get("region");
  const periodParam = request.nextUrl.searchParams.get("period_date");

  if (!region || !periodParam) return NextResponse.json({ picks: [] } satisfies TopPicksPayload);

  const periodDate = new Date(periodParam);
  if (isNaN(periodDate.getTime())) return NextResponse.json({ picks: [] } satisfies TopPicksPayload);

  try {
    const [rows, members, users] = await Promise.all([
      prisma.topPick.findMany({
        where:   { region, periodDate },
        orderBy: { createdAt: "asc" },
        include: {
          sector: { select: { id: true, name: true } },
          author: { select: { id: true, initials: true, name: true } },
        },
      }),
      loadMembers(),
      prisma.user.findMany({ select: { id: true, name: true, initials: true } }),
    ]);

    // Índice por nombre para reparar enlaces faltantes al vuelo (ver resolveAuthorId).
    const byName = new Map(users.filter((u) => u.name).map((u) => [u.name!.trim().toLowerCase(), u]));

    const picks: TopPickDTO[] = rows.map((p) => {
      const resolvedId = resolveAuthorId(p.authorId, p.authorName, new Map([...byName].map(([k, u]) => [k, u.id])));
      const resolved   = p.author ?? (p.authorName ? byName.get(p.authorName.trim().toLowerCase()) ?? null : null);
      return {
      id:            p.id,
      region:        p.region,
      periodDate:    p.periodDate.toISOString().slice(0, 10),
      nombreLatam:   p.nombreLatam,
      comment:       p.comment,
      targetPrice:   p.targetPrice,
      sectorId:      p.sectorId,
      sectorName:    p.sector?.name ?? null,
      authorId:      resolvedId,
      // El nombre congelado manda sobre el del usuario vivo: si alguien se cambió el
      // nombre en su perfil, el pick sigue diciendo quién lo escribió en su momento.
      authorName:    p.authorName ?? p.author?.name ?? null,
      authorInitials: resolved?.initials ?? null,
      industryGroup: p.industryGroup,
      // Se usa el id RESUELTO, no el guardado: si el analista se dio de alta después
      // de que sus picks se cargaran, igual se reconoce como miembro y no sale gris.
      isLegacy:      computeIsLegacy(p.sectorId, resolvedId, p.authorName, members),
      };
    });

    return NextResponse.json({ picks } satisfies TopPicksPayload);
  } catch (err) {
    console.error("[top-picks GET]", err);
    return NextResponse.json({ error: "Failed to fetch picks" }, { status: 500 });
  }
}

// ── POST — agregar UN pick ────────────────────────────────────────────────────
interface CreateBody {
  region?:       string;
  period_date?:  string;
  nombreLatam?:  string;
  sectorId?:     string | null;
  comment?:      string;
  targetPrice?:  number | null;
  industryGroup?: string | null;
}

export async function POST(request: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;
  const self = await getSessionUser();
  if (!self) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const region      = body.region?.trim().toUpperCase();
  const nombreLatam = body.nombreLatam?.trim();
  if (!region || !body.period_date || !nombreLatam) {
    return NextResponse.json({ error: "Faltan region, period_date o empresa" }, { status: 400 });
  }

  const periodDate = new Date(body.period_date);
  if (isNaN(periodDate.getTime())) {
    return NextResponse.json({ error: "period_date inválida" }, { status: 400 });
  }

  // El sector decide el permiso. Sin sector sólo escribe un admin: un pick sin
  // clasificar no pertenece a nadie, así que nadie hereda permiso sobre él.
  const sectorId = body.sectorId || null;
  const isAdmin  = self.role === "admin";

  if (sectorId) {
    const sector = await prisma.pickSector.findUnique({
      where: { id: sectorId },
      select: { id: true, name: true, members: { select: { userId: true } } },
    });
    if (!sector) return NextResponse.json({ error: "El sector no existe" }, { status: 404 });
    if (!isAdmin && !sector.members.some((m) => m.userId === self.id)) {
      return NextResponse.json(
        { error: `No eres miembro de "${sector.name}": solo puedes verlo.` },
        { status: 403 },
      );
    }
  } else if (!isAdmin) {
    return NextResponse.json({ error: "Elige un sector para agregar el pick" }, { status: 400 });
  }

  try {
    const pick = await prisma.topPick.create({
      data: {
        region,
        periodDate,
        nombreLatam,
        comment:       body.comment?.trim() ?? "",
        targetPrice:   body.targetPrice ?? null,
        sectorId,
        authorId:      self.id,
        // Copia congelada: es lo que sobrevive si el usuario se borra más adelante.
        authorName:    self.name || self.email || null,
        industryGroup: body.industryGroup?.trim() || null,
      },
      include: { sector: { select: { name: true } }, author: { select: { initials: true } } },
    });

    await logAdminChanges(
      [{
        entity: ENTITY.topPick, entityKey: pick.id, label: nombreLatam,
        field: "pick", oldValue: null,
        newValue: `${region} · ${pick.sector?.name ?? "Unassigned"}`,
        context: pick.periodDate.toISOString().slice(0, 10), action: "create",
      }],
      self.email ?? null,
    );

    return NextResponse.json({ id: pick.id }, { status: 201 });
  } catch (err) {
    if (typeof err === "object" && err && "code" in err && err.code === "P2002") {
      return NextResponse.json(
        { error: `${nombreLatam} ya está en los Top Picks de este período.` },
        { status: 409 },
      );
    }
    console.error("[top-picks POST]", err);
    return NextResponse.json({ error: "No se pudo agregar el pick" }, { status: 500 });
  }
}
