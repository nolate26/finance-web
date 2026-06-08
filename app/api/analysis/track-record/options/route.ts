import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface TrackRecordOptions {
  analysts:        string[];
  companies:       string[];   // companies seen in AnalystRecommendationHistory
  mappedCompanies: string[];   // companies already present in CompanyIsin (have a mapping)
  types:           string[];   // distinct `type` values (for the add form)
  recTypes:        string[];   // distinct `recType` values (for the add form)
  recommendations: string[];   // distinct `recommendation` values (for the add form)
  minDate:         string | null;
  maxDate:         string | null;
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export async function GET(request: NextRequest) {
  try {
    // When a company is given, analysts are scoped to that company.
    const company = request.nextUrl.searchParams.get("company");

    const [analystRows, companyRows, typeRows, recTypeRows, recRows, mappedRows, bounds] = await Promise.all([
      prisma.analystRecommendationHistory.findMany({
        where:    company ? { company } : undefined,
        distinct: ["analyst"],
        select:   { analyst: true },
      }),
      prisma.analystRecommendationHistory.findMany({
        distinct: ["company"],
        select:   { company: true },
        orderBy:  { company: "asc" },
      }),
      prisma.analystRecommendationHistory.findMany({
        distinct: ["type"], select: { type: true }, orderBy: { type: "asc" },
      }),
      prisma.analystRecommendationHistory.findMany({
        distinct: ["recType"], select: { recType: true }, orderBy: { recType: "asc" },
      }),
      prisma.analystRecommendationHistory.findMany({
        distinct: ["recommendation"], select: { recommendation: true }, orderBy: { recommendation: "asc" },
      }),
      prisma.companyIsin.findMany({
        select: { companyName: true }, orderBy: { companyName: "asc" },
      }),
      prisma.analystRecommendationHistory.aggregate({
        _min: { date: true },
        _max: { date: true },
      }),
    ]);

    // Data has analysts in mixed case (e.g. "RM" / "rm"). Normalise to UPPERCASE
    // and de-duplicate so each analyst appears once.
    const analysts = Array.from(
      new Set(analystRows.map((r) => r.analyst.toUpperCase()).filter(Boolean)),
    ).sort();

    const payload: TrackRecordOptions = {
      analysts,
      companies:       companyRows.map((r) => r.company).filter(Boolean),
      mappedCompanies: mappedRows.map((r) => r.companyName).filter(Boolean),
      types:           typeRows.map((r) => r.type).filter(Boolean),
      recTypes:        recTypeRows.map((r) => r.recType).filter(Boolean),
      recommendations: recRows.map((r) => r.recommendation).filter(Boolean),
      minDate:         iso(bounds._min.date),
      maxDate:         iso(bounds._max.date),
    };

    return NextResponse.json(payload);
  } catch (e) {
    console.error("[analysis/track-record/options]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
