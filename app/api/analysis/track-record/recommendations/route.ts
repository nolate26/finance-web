import { NextResponse, NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Thrown inside the transaction to surface a 400 with a friendly message.
class ValidationError extends Error {}

interface Body {
  date?:               string;
  type?:               string;
  analyst?:            string;
  company?:            string;
  recommendation?:     string;
  recType?:            string;
  currentPrice?:       number | string;
  targetPrice?:        number | string;
  yahooFinanceTicker?: string;   // required only when the company is new
  isin?:               string;   // optional for new companies
}

function num(v: number | string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const date           = body.date?.trim();
  const type           = body.type?.trim();
  const analyst        = body.analyst?.trim().toUpperCase();   // normalise like the rest of the feature
  const company        = body.company?.trim();
  const recommendation = body.recommendation?.trim();
  const recType        = body.recType?.trim() || recommendation;   // defaults to the recommendation
  const currentPrice   = num(body.currentPrice);
  const targetPrice    = num(body.targetPrice);
  const ticker         = body.yahooFinanceTicker?.trim();
  const isin           = body.isin?.trim() || null;

  // ── Validation ──────────────────────────────────────────────────────────────
  const missing: string[] = [];
  if (!date)           missing.push("date");
  if (!type)           missing.push("type");
  if (!analyst)        missing.push("analyst");
  if (!company)        missing.push("company");
  if (!recommendation) missing.push("recommendation");
  if (currentPrice == null) missing.push("currentPrice");
  if (targetPrice  == null) missing.push("targetPrice");
  if (missing.length) {
    return NextResponse.json({ error: `Missing or invalid fields: ${missing.join(", ")}` }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Create the CompanyIsin mapping if the company is new.
      const existing = await tx.companyIsin.findUnique({ where: { companyName: company! } });
      let createdCompany = false;
      if (!existing) {
        if (!ticker) {
          throw new ValidationError(`"${company}" is a new company — a Yahoo Finance ticker is required.`);
        }
        await tx.companyIsin.create({
          data: { companyName: company!, yahooFinanceTicker: ticker, isin },
        });
        createdCompany = true;
      }

      const recommendationRow = await tx.analystRecommendationHistory.create({
        data: {
          date:           new Date(date! + "T00:00:00.000Z"),
          type:           type!,
          analyst:        analyst!,
          company:        company!,
          recommendation: recommendation!,
          recType:        recType!,
          currentPrice:   currentPrice!,
          targetPrice:    targetPrice!,
        },
      });

      return { recommendationRow, createdCompany };
    });

    return NextResponse.json(
      { recommendation: result.recommendationRow, createdCompany: result.createdCompany },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target as string[] | string | undefined);
      const field = Array.isArray(target) ? target.join(", ") : target ?? "value";
      return NextResponse.json({ error: `Duplicate ${field} — already exists.` }, { status: 400 });
    }
    console.error("[analysis/track-record/recommendations POST]", e);
    return NextResponse.json({ error: "Failed to save recommendation." }, { status: 500 });
  }
}
