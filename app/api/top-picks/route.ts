import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const region      = request.nextUrl.searchParams.get("region");
  const period_date = request.nextUrl.searchParams.get("period_date");

  if (!region || !period_date) {
    return NextResponse.json({ picks: [] });
  }

  const periodDate = new Date(period_date);
  if (isNaN(periodDate.getTime())) {
    return NextResponse.json({ picks: [] });
  }

  try {
    const picks = await prisma.top_picks.findMany({
      where:   { region, period_date: periodDate },
      orderBy: { created_at: "asc" },
      select:  {
        id:             true,
        nombre_latam:   true,
        industry_group: true,
        comment:        true,
        target_price:   true,
        created_at:     true,
      },
    });
    return NextResponse.json({ picks });
  } catch (err) {
    console.error("Top picks fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch picks" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

interface PickPayload {
  nombreLatam:   string;
  industryGroup: string;
  comment:       string;
  targetPrice?:  number | null;
}

interface PostBody {
  region:      "LATAM" | "CHILE";
  period_date: string; // ISO date string "YYYY-MM-DD"
  picks:       PickPayload[];
}

export async function POST(request: NextRequest) {
  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { region, period_date, picks } = body;

  if (!region || !period_date || !Array.isArray(picks) || picks.length === 0) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const periodDate = new Date(period_date);
  if (isNaN(periodDate.getTime())) {
    return NextResponse.json({ error: "Invalid period_date" }, { status: 400 });
  }

  try {
    const results = await Promise.all(
      picks.map((pick) =>
        prisma.top_picks.upsert({
          where: {
            region_period_date_nombre_latam: {
              region,
              period_date: periodDate,
              nombre_latam: pick.nombreLatam,
            },
          },
          update: {
            industry_group: pick.industryGroup,
            comment:        pick.comment,
            target_price:   pick.targetPrice ?? null,
          },
          create: {
            region,
            period_date:    periodDate,
            nombre_latam:   pick.nombreLatam,
            industry_group: pick.industryGroup,
            comment:        pick.comment,
            target_price:   pick.targetPrice ?? null,
          },
        })
      )
    );

    return NextResponse.json({ saved: results.length });
  } catch (err) {
    console.error("Top picks save error:", err);
    return NextResponse.json({ error: "Failed to save picks" }, { status: 500 });
  }
}
