import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteFromR2 } from "@/lib/r2";
import { requireAuth, getSessionUser } from "@/lib/auth";
import { isValidMonth, isValidQuarter, periodLabel, quarterOfMonth } from "@/lib/quarters";

export const dynamic = "force-dynamic";

export interface FichaTickerRow {
  ticker:       string;
  company_name: string;
  country:      string;
}

/**
 * Fila de ficha tal como la consume la UI: ya viene con nombre y país de la maestra.
 * En una ficha multi, `ticker` / `company_name` traen la lista unida con " · " y
 * `country` el de la primera empresa; el detalle por empresa está en `tickers`.
 */
export interface FichaRow {
  id:           string;
  multi:        boolean;
  ticker:       string;
  company_name: string;        // empresas_industrias_v2.nombre_latam
  country:      string;        // empresas_industrias_v2.country_risk (CL, BR, …)
  tickers:      FichaTickerRow[];
  fiscal_year:  number;
  quarter:      number;        // 1..4 (en una mensual, el que contiene al mes)
  month:        number | null; // 1..12 en fichas mensuales; null = trimestral
  quarter_label: string;       // etiqueta del período: "2Q26" o, si es mensual, "Oct 26"
  title:        string;
  description:  string | null;
  file_url:     string;
  created_at:   string;
}

type Empresa = { nombreLatam: string; countryRisk: string };

function toRow(f: {
  id: string; ticker: string | null; fiscalYear: number; quarter: number; month: number | null;
  title: string; description: string | null; fileUrl: string; createdAt: Date;
  empresa: Empresa | null;
  tickers: { ticker: string; empresa: Empresa }[];
}): FichaRow {
  const tickers: FichaTickerRow[] = f.ticker && f.empresa
    ? [{ ticker: f.ticker, company_name: f.empresa.nombreLatam, country: f.empresa.countryRisk }]
    : f.tickers.map((t) => ({ ticker: t.ticker, company_name: t.empresa.nombreLatam, country: t.empresa.countryRisk }));
  const multi = !f.ticker;
  return {
    id:            f.id,
    multi,
    ticker:        multi ? tickers.map((t) => t.ticker.replace(/ EQUITY$/i, "")).join(" · ") : f.ticker!,
    company_name:  multi ? tickers.map((t) => t.company_name).join(" · ") : tickers[0]?.company_name ?? f.ticker!,
    country:       tickers[0]?.country ?? "",
    tickers,
    fiscal_year:   f.fiscalYear,
    quarter:       f.quarter,
    month:         f.month,
    quarter_label: periodLabel(f.fiscalYear, f.quarter, f.month),
    title:         f.title,
    description:   f.description,
    file_url:      f.fileUrl,
    created_at:    f.createdAt.toISOString(),
  };
}

const EMPRESA = { select: { nombreLatam: true, countryRisk: true } } as const;
const WITH_EMPRESA = {
  empresa: EMPRESA,
  tickers: { include: { empresa: EMPRESA }, orderBy: { ticker: "asc" } },
} as const;

// ── GET: lista de fichas (cualquier autenticado), opcional ?ticker= ───────────
// Orden: quarter más nuevo primero, después por fecha de carga.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get("ticker")?.trim().toUpperCase() || undefined;

    const fichas = await prisma.ficha.findMany({
      // Con ?ticker= también salen las multi que incluyen a esa empresa.
      where:   ticker ? { OR: [{ ticker }, { tickers: { some: { ticker } } }] } : undefined,
      // Dentro del quarter, la trimestral (month NULL = cierre del quarter) antes que las mensuales.
      orderBy: [{ fiscalYear: "desc" }, { quarter: "desc" }, { month: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
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
      ticker?: string; tickers?: unknown; title?: string; description?: string;
      file_url?: string; file_key?: string;
      fiscal_year?: number; quarter?: number; month?: number | null;
    };

    // `tickers` (lista) o `ticker` (uno suelto, lo que mandaba el uploader viejo).
    const rawList = Array.isArray(body.tickers) ? body.tickers : [body.ticker];
    const tickers = [...new Set(rawList
      .map((t) => (typeof t === "string" ? t.trim().toUpperCase() : ""))
      .filter(Boolean))];
    if (tickers.length === 0)    return NextResponse.json({ error: "ticker is required" },   { status: 400 });
    if (!body.title?.trim())     return NextResponse.json({ error: "title is required" },    { status: 400 });
    if (!body.file_url?.trim())  return NextResponse.json({ error: "file_url is required" }, { status: 400 });
    // Período: mensual (fiscal_year + month) o trimestral (fiscal_year + quarter). En la
    // mensual el quarter se deriva del mes; no se confía en el que mande el cliente.
    const month = body.month ?? null;
    if (month !== null && !isValidMonth(month)) {
      return NextResponse.json({ error: "Invalid month (1-12)" }, { status: 400 });
    }
    const quarter = month !== null ? quarterOfMonth(month) : body.quarter;
    if (!isValidQuarter(body.fiscal_year, quarter)) {
      return NextResponse.json({ error: "A valid period is required (fiscal_year + quarter 1-4, or + month 1-12)" }, { status: 400 });
    }
    const fiscalYear = body.fiscal_year as number;

    // La FK ya lo garantiza, pero así el mensaje es claro en vez de un P2003 genérico.
    const found = await prisma.empresasIndustriasV2.findMany({
      where:  { tickerBloomberg: { in: tickers } },
      select: { tickerBloomberg: true },
    });
    const missing = tickers.filter((t) => !found.some((e) => e.tickerBloomberg === t));
    if (missing.length) {
      return NextResponse.json({ error: `Ticker ${missing.join(", ")} does not exist in empresas_industrias_v2` }, { status: 400 });
    }

    const user = await getSessionUser();

    // Multi: va aparte y se identifica por el TÍTULO, no por las empresas. Subir otra
    // "Preliminar bancos" (sin importar mayúsculas) reemplaza a la anterior, aunque
    // cambien las empresas o el período: es el mismo informe, versión nueva.
    if (tickers.length > 1) {
      const previous = await prisma.ficha.findMany({
        where:  { ticker: null, title: { equals: body.title.trim(), mode: "insensitive" } },
        select: { id: true, fileKey: true, fiscalYear: true, quarter: true, month: true },
        orderBy: { createdAt: "desc" },
      });
      if (previous.length) await prisma.ficha.deleteMany({ where: { id: { in: previous.map((p) => p.id) } } });

      const ficha = await prisma.ficha.create({
        data: {
          ticker: null, fiscalYear, quarter: quarter as number, month,
          title:       body.title.trim(),
          description: body.description?.trim() || null,
          fileUrl:     body.file_url.trim(),
          fileKey:     body.file_key?.trim() || null,
          uploadedBy:  user?.email ?? null,
          tickers:     { create: tickers.map((ticker) => ({ ticker })) },
        },
        include: WITH_EMPRESA,
      });
      // R2 al final, igual que en las individuales: si falla, la nueva ya quedó guardada.
      for (const p of previous) await deleteFromR2(p.fileKey);

      const last = previous[0];
      return NextResponse.json({
        ficha: toRow(ficha),
        replaced: last ? { quarter_label: periodLabel(last.fiscalYear, last.quarter, last.month) } : null,
        replaced_ids: previous.map((p) => p.id),
      }, { status: 201 });
    }

    const ticker = tickers[0];

    // Reemplazo: sacamos la anterior (si la hay) y nos guardamos su key para R2.
    const previous = await prisma.ficha.findUnique({
      where:  { ticker },
      select: { id: true, fileKey: true, fiscalYear: true, quarter: true, month: true },
    });
    if (previous) await prisma.ficha.delete({ where: { id: previous.id } });

    const ficha = await prisma.ficha.create({
      data: {
        ticker, fiscalYear, quarter: quarter as number, month,
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
      replaced: previous ? { quarter_label: periodLabel(previous.fiscalYear, previous.quarter, previous.month) } : null,
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
