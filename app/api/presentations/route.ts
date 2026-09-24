import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSessionUser } from "@/lib/auth";
import { isRecommendation } from "@/lib/recommendations";
import { PRESENTATION_INCLUDE, REVIEWABLE_CATEGORY, toPresentationDTO } from "@/lib/presentationDto";

export const dynamic = "force-dynamic";

/** Un ticker del caso, tal como lo manda el uploader. */
interface TickerInput {
  ticker?:         string;
  target_price?:   number | null;
  recommendation?: string | null;
}

// Normaliza y valida la lista de tickers del caso. Devuelve el error como string
// para que el handler responda 400 con un mensaje concreto.
function parseTickers(raw: unknown): { rows: { ticker: string; targetPrice: number | null; recommendation: string | null }[] } | { error: string } {
  if (raw == null) return { rows: [] };
  if (!Array.isArray(raw)) return { error: "tickers must be an array" };

  const seen = new Set<string>();
  const rows = [];
  for (const item of raw as TickerInput[]) {
    const ticker = item?.ticker?.trim().toUpperCase();
    if (!ticker) continue;
    if (seen.has(ticker)) continue;          // el mismo ticker dos veces es ruido, no error
    seen.add(ticker);

    const tp = item.target_price;
    if (tp != null && (typeof tp !== "number" || !Number.isFinite(tp))) {
      return { error: `Invalid target price for ${ticker}` };
    }
    const rec = item.recommendation ?? null;
    if (rec != null && rec !== "" && !isRecommendation(rec)) {
      return { error: `Invalid recommendation for ${ticker} (use BUY, HOLD or SELL)` };
    }
    rows.push({ ticker, targetPrice: tp ?? null, recommendation: rec || null });
  }
  return { rows };
}

// ── GET: list presentations ───────────────────────────────────────────────────
// `company_name` matchea el texto libre heredado O la relación de tickers, para que
// el deep-dive de una empresa encuentre también los casos multi-ticker.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const companyName = searchParams.get("company_name")?.trim() || undefined;

    const presentations = await prisma.presentation.findMany({
      where: companyName
        ? { OR: [{ company_name: companyName }, { tickers: { some: { ticker: companyName.toUpperCase() } } }] }
        : undefined,
      orderBy: { created_at: "desc" },
      include: PRESENTATION_INCLUDE,
    });

    return NextResponse.json({ presentations: presentations.map(toPresentationDTO) });
  } catch (err) {
    console.error("[api/presentations] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch presentations" }, { status: 500 });
  }
}

// ── POST: create a presentation record after R2 upload ────────────────────────
// Cualquier usuario con sesión: aportar material es de todo el equipo. Los
// investment cases nacen en review_status "pending" — el admin verifica tickers,
// target price y recomendación antes de darlos por buenos.
export async function POST(request: Request) {
  const deny = await requireAuth();
  if (deny) return deny;
  try {
    const body = await request.json() as {
      title?: string; description?: string; file_url?: string;
      category?: string; region?: string; company_name?: string; is_sell_side?: boolean;
      case_date?: string | null; tickers?: unknown;
    };

    const { title, description, file_url, category, region, company_name, is_sell_side } = body;

    if (!title?.trim())    return NextResponse.json({ error: "title is required" },    { status: 400 });
    if (!file_url?.trim()) return NextResponse.json({ error: "file_url is required" }, { status: 400 });
    if (!category?.trim()) return NextResponse.json({ error: "category is required" }, { status: 400 });
    if (!region?.trim())   return NextResponse.json({ error: "region is required" },   { status: 400 });

    const parsed = parseTickers(body.tickers);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const isCase = category.trim() === REVIEWABLE_CATEGORY;
    if (isCase && parsed.rows.length === 0) {
      return NextResponse.json({ error: "An investment case needs at least one ticker" }, { status: 400 });
    }

    // Fecha del caso: día puro, sin hora ni zona (la columna es DATE).
    let caseDate: Date | null = null;
    if (body.case_date) {
      const d = new Date(`${body.case_date}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid case date" }, { status: 400 });
      caseDate = d;
    }

    const user = await getSessionUser();

    const presentation = await prisma.presentation.create({
      data: {
        title:        title.trim(),
        description:  description?.trim() || null,
        file_url:     file_url.trim(),
        category:     category.trim(),
        region:       region.trim(),
        company_name: company_name?.trim() || null,
        is_sell_side: is_sell_side ?? false,
        caseDate,
        uploadedBy:   user?.email ?? null,
        // Sólo los casos entran a revisión; el resto queda aprobado de entrada.
        reviewStatus: isCase ? "pending" : "approved",
        tickers: parsed.rows.length ? { create: parsed.rows } : undefined,
      },
      include: PRESENTATION_INCLUDE,
    });

    return NextResponse.json({ presentation: toPresentationDTO(presentation) }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json({ error: "One of the tickers does not exist in empresas_industrias_v2" }, { status: 400 });
    }
    console.error("[api/presentations] POST error:", err);
    return NextResponse.json({ error: "Failed to create presentation" }, { status: 500 });
  }
}
