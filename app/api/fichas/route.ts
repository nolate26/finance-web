import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Fila de ficha tal como la consume la UI: ya viene con nombre y país de la maestra. */
export interface FichaRow {
  id:           string;
  ticker:       string;
  company_name: string;        // empresas_industrias_v2.nombre_latam
  country:      string;        // empresas_industrias_v2.country_risk (CL, BR, …)
  title:        string;
  description:  string | null;
  file_url:     string;
  created_at:   string;
}

function toRow(f: {
  id: string; ticker: string; title: string; description: string | null;
  fileUrl: string; createdAt: Date;
  empresa: { nombreLatam: string; countryRisk: string };
}): FichaRow {
  return {
    id:           f.id,
    ticker:       f.ticker,
    company_name: f.empresa.nombreLatam,
    country:      f.empresa.countryRisk,
    title:        f.title,
    description:  f.description,
    file_url:     f.fileUrl,
    created_at:   f.createdAt.toISOString(),
  };
}

const WITH_EMPRESA = { empresa: { select: { nombreLatam: true, countryRisk: true } } } as const;

// ── GET: lista de fichas (cualquier autenticado), opcional ?ticker= ───────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get("ticker")?.trim().toUpperCase() || undefined;

    const fichas = await prisma.ficha.findMany({
      where:   ticker ? { ticker } : undefined,
      orderBy: { createdAt: "desc" },
      include: WITH_EMPRESA,
    });

    return NextResponse.json({ fichas: fichas.map(toRow) });
  } catch (err) {
    console.error("[api/fichas] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch fichas" }, { status: 500 });
  }
}

// ── POST: registrar una ficha ya subida a R2 (solo admin) ─────────────────────
export async function POST(request: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;

  try {
    const body = await request.json() as {
      ticker?: string; title?: string; description?: string;
      file_url?: string; file_key?: string;
    };

    const ticker = body.ticker?.trim().toUpperCase();
    if (!ticker)                 return NextResponse.json({ error: "ticker is required" },   { status: 400 });
    if (!body.title?.trim())     return NextResponse.json({ error: "title is required" },    { status: 400 });
    if (!body.file_url?.trim())  return NextResponse.json({ error: "file_url is required" }, { status: 400 });

    // La FK ya lo garantiza, pero así el mensaje es claro en vez de un P2003 genérico.
    const empresa = await prisma.empresasIndustriasV2.findUnique({
      where:  { tickerBloomberg: ticker },
      select: { id: true },
    });
    if (!empresa) {
      return NextResponse.json({ error: `Ticker ${ticker} does not exist in empresas_industrias_v2` }, { status: 400 });
    }

    const user = await getSessionUser();

    const ficha = await prisma.ficha.create({
      data: {
        ticker,
        title:       body.title.trim(),
        description: body.description?.trim() || null,
        fileUrl:     body.file_url.trim(),
        fileKey:     body.file_key?.trim() || null,
        uploadedBy:  user?.email ?? null,
      },
      include: WITH_EMPRESA,
    });

    return NextResponse.json({ ficha: toRow(ficha) }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json({ error: "Ticker not found in empresas_industrias_v2" }, { status: 400 });
    }
    console.error("[api/fichas] POST error:", err);
    return NextResponse.json({ error: "Failed to create ficha" }, { status: 500 });
  }
}
