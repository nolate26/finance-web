import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const company = request.nextUrl.searchParams.get("company") ?? undefined;

  try {
    // Fetch records — optionally filtered by company (Bloomberg ticker)
    const records = await prisma.emailResearch.findMany({
      where:   company ? { company } : undefined,
      orderBy: { date: "desc" },
      select: {
        id:       true,
        company:  true,
        date:     true,
        category: true,
        title:    true,
        subject:  true,
        from:     true,
        html:     true,
      },
    });

    // Attach industry via tickerBloomberg → industriaGics
    const uniqueCompanies = [...new Set(records.map((r) => r.company))];
    const empresas = await prisma.empresasIndustrias.findMany({
      where:  { tickerBloomberg: { in: uniqueCompanies } },
      select: { tickerBloomberg: true, industriaGics: true },
    });
    const industryMap: Record<string, string> = Object.fromEntries(
      empresas
        .filter((e) => e.tickerBloomberg)
        .map((e) => [e.tickerBloomberg!, e.industriaGics ?? "Other"])
    );

    const enriched = records.map((r) => ({
      ...r,
      date:     r.date.toISOString().slice(0, 10),
      industry: industryMap[r.company] ?? "Other",
    }));

    // Unique filter options
    const categories = [...new Set(enriched.map((r) => r.category))].sort();
    const companies  = [...new Set(enriched.map((r) => r.company))].sort();
    const froms      = [...new Set(enriched.map((r) => r.from).filter(Boolean))].sort() as string[];
    const industries = [...new Set(enriched.map((r) => r.industry))].sort();

    return NextResponse.json({ records: enriched, filters: { categories, companies, froms, industries } });
  } catch (err) {
    console.error("Research fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch research" }, { status: 500 });
  }
}
