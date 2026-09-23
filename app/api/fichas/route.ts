import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteFromR2 } from "@/lib/r2";
import { requireAuth, getSessionUser } from "@/lib/auth";
import { isValidQuarter, quarterLabel } from "@/lib/quarters";

export const dynamic = "force-dynamic";

/** Fila de ficha tal como la consume la UI: ya viene con nombre y país de la maestra. */
export interface FichaRow {
  id:           string;
  ticker:       string;
  company_name: string;        // empresas_industrias_v2.nombre_latam
  country:      string;        // empresas_industrias_v2.country_risk (CL, BR, …)
  fiscal_year:  number;
  quarter:      number;        // 1..4
  quarter_label: string;       // "2Q26"
  title:        string;
  description:  string | null;
  file_url:     string;
  created_at:   string;
}

function toRow(f: {
  id: string; ticker: string; fiscalYear: number; quarter: number;
  title: string; description: string | null; fileUrl: string; createdAt: Date;
  empresa: { nombreLatam: string; countryRisk: string };
}): FichaRow {
  return {
    id:            f.id,
    ticker:        f.ticker,
    company_name:  f.empresa.nombreLatam,
    country:       f.empresa.countryRisk,
    fiscal_year:   f.fiscalYear,
    quarter:       f.quarter,
    quarter_label: quarterLabel(f.fiscalYear, f.quarter),
    title:         f.title,
    description:   f.description,
    file_url:      f.fileUrl,
    created_at:    f.createdAt.toISOString(),
  };
}

const WITH_EMPRESA = { empresa: { select: { nombreLatam: true, countryRisk: true } } } as const;

// ── GET: lista de fichas (cualquier autenticado), opcional ?ticker= ───────────
// Orden: quarter más nuevo primero, después por fecha de carga.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get("ticker")?.trim().toUpperCase() || undefined;

    const fichas = await prisma.ficha.findMany({
      where:   ticker ? { ticker } : undefined,
      orderBy: [{ fiscalYear: "desc" }, { quarter: "desc" }, { createdAt: "desc" }],
      include: WITH_EMPRESA,
    });

    return NextResponse.json({ fichas: fichas.map(toRow) });
  } catch (err) {
    console.error("[api/fichas] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch fichas" }, { status: 500 });
  }
}

// ── POST: registrar una ficha ya subida a R2 ──────────────────────────────────
// Una ficha viva por ticker: si la empresa ya tenía una, se borra su fila y su PDF
// antes de crear la nueva. Es el comportamiento pedido (mantener espacio), y el
// índice único de `ticker` lo respalda a nivel de base.
//
// Cualquier usuario con sesión, no sólo admin: decisión explícita del equipo, aun
// sabiendo que el reemplazo destruye la ficha anterior. Por eso `uploaded_by` deja
// registro de quién la subió y el uploader avisa a qué quarter va a pisar. El
// borrado explícito (DELETE) sí sigue siendo de admin.
export async function POST(request: Request) {
  const deny = await requireAuth();
  if (deny) return deny;

  try {
    const body = await request.json() as {
      ticker?: string; title?: string; description?: string;
      file_url?: string; file_key?: string;
      fiscal_year?: number; quarter?: number;
    };

    const ticker = body.ticker?.trim().toUpperCase();
    if (!ticker)                 return NextResponse.json({ error: "ticker is required" },   { status: 400 });
    if (!body.title?.trim())     return NextResponse.json({ error: "title is required" },    { status: 400 });
    if (!body.file_url?.trim())  return NextResponse.json({ error: "file_url is required" }, { status: 400 });
    if (!isValidQuarter(body.fiscal_year, body.quarter)) {
      return NextResponse.json({ error: "A valid quarter (fiscal_year + quarter 1-4) is required" }, { status: 400 });
    }
    const fiscalYear = body.fiscal_year as number;
    const quarter    = body.quarter as number;

    // La FK ya lo garantiza, pero así el mensaje es claro en vez de un P2003 genérico.
    const empresa = await prisma.empresasIndustriasV2.findUnique({
      where:  { tickerBloomberg: ticker },
      select: { id: true },
    });
    if (!empresa) {
      return NextResponse.json({ error: `Ticker ${ticker} does not exist in empresas_industrias_v2` }, { status: 400 });
    }

    const user = await getSessionUser();

    // Reemplazo: sacamos la anterior (si la hay) y nos guardamos su key para R2.
    const previous = await prisma.ficha.findUnique({
      where:  { ticker },
      select: { id: true, fileKey: true, fiscalYear: true, quarter: true },
    });
    if (previous) await prisma.ficha.delete({ where: { id: previous.id } });

    const ficha = await prisma.ficha.create({
      data: {
        ticker, fiscalYear, quarter,
        title:       body.title.trim(),
        description: body.description?.trim() || null,
        fileUrl:     body.file_url.trim(),
        fileKey:     body.file_key?.trim() || null,
        uploadedBy:  user?.email ?? null,
      },
      include: WITH_EMPRESA,
    });

    // Después de crear la nueva: si R2 falla, la ficha vigente ya quedó bien guardada.
    if (previous) await deleteFromR2(previous.fileKey);

    return NextResponse.json({
      ficha: toRow(ficha),
      replaced: previous ? { quarter_label: quarterLabel(previous.fiscalYear, previous.quarter) } : null,
    }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003") return NextResponse.json({ error: "Ticker not found in empresas_industrias_v2" }, { status: 400 });
      // Dos cargas simultáneas de la misma empresa: la segunda choca con el único.
      if (err.code === "P2002") return NextResponse.json({ error: "This company already has a ficha — reload the page and try again" }, { status: 409 });
    }
    console.error("[api/fichas] POST error:", err);
    return NextResponse.json({ error: "Failed to create ficha" }, { status: 500 });
  }
}
