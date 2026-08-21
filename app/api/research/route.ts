import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeTicker } from "@/lib/issuer";

export const dynamic = "force-dynamic";

interface RawRow {
  id:             number;
  company:        string;
  date:           Date;
  category:       string;
  title:          string | null;
  subject:        string | null;
  from:           string | null;
  html:           string;
  targetPrice:    number | null;
  recommendation: string | null;
}

export async function GET(request: NextRequest) {
  const companyParam = request.nextUrl.searchParams.get("company") ?? undefined;

  try {
    // Una nota pertenece al ticker con el que se creó y a ninguno más: no se
    // replica entre líneas del mismo emisor (ADR, doble clase). Si el analista la
    // mandó a BCH US, se ve en BCH US aunque CHILE CI quede sin notas.
    const ticker = companyParam ? normalizeTicker(companyParam) : null;

    // `company` está normalizado en la base y `ticker` viene de normalizeTicker(),
    // así que se comparan con igualdad directa y el índice (company, date) sirve.
    const records = ticker
      ? await prisma.$queryRaw<RawRow[]>`
          SELECT id, company, date, category, title, subject, "from",
                 html, target_price AS "targetPrice", recommendation
          FROM email_research
          WHERE company = ${ticker}
          ORDER BY date DESC, id DESC
        `
      : await prisma.$queryRaw<RawRow[]>`
          SELECT id, company, date, category, title, subject, "from",
                 html, target_price AS "targetPrice", recommendation
          FROM email_research
          ORDER BY date DESC, id DESC
        `;

    // Industria vía tickerBloomberg → industriaGics.
    const uniqueCompanies = [...new Set(records.map((r) => normalizeTicker(r.company)))];
    const empresas = await prisma.empresasIndustriasV2.findMany({
      where:  { tickerBloomberg: { in: uniqueCompanies } },
      select: { tickerBloomberg: true, industriaGics: true },
    });
    // Ambos lados del mapa pasan por normalizeTicker: la clave se arma igual que
    // se consulta, sin depender de que .toUpperCase() y la forma canónica coincidan.
    const industryMap: Record<string, string> = Object.fromEntries(
      empresas
        .filter((e) => e.tickerBloomberg)
        .map((e) => [normalizeTicker(e.tickerBloomberg), e.industriaGics ?? "Other"])
    );

    const enriched = records.map((r) => {
      const company = normalizeTicker(r.company);
      return {
        ...r,
        company,
        date:     r.date.toISOString().slice(0, 10),
        industry: industryMap[company] ?? "Other",
      };
    });

    // Unique filter options
    const categories = [...new Set(enriched.map((r) => r.category))].sort();
    const companies  = [...new Set(enriched.map((r) => r.company))].sort();
    const froms      = [...new Set(enriched.map((r) => r.from).filter(Boolean))].sort() as string[];
    const industries = [...new Set(enriched.map((r) => r.industry))].sort();

    return NextResponse.json({
      records: enriched,
      filters: { categories, companies, froms, industries },
    });
  } catch (err) {
    console.error("Research fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch research" }, { status: 500 });
  }
}
