import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── GET: list presentations, optionally filtered by company_name ──────────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const companyName = searchParams.get("company_name")?.trim() || undefined;

    const presentations = await prisma.presentation.findMany({
      where: companyName ? { company_name: companyName } : undefined,
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json({ presentations });
  } catch (err) {
    console.error("[api/presentations] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch presentations" }, { status: 500 });
  }
}

// ── POST: create a presentation record after R2 upload ────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      title?: string;
      description?: string;
      file_url?: string;
      category?: string;
      region?: string;
      company_name?: string;
      is_sell_side?: boolean;
    };

    const { title, description, file_url, category, region, company_name, is_sell_side } = body;

    if (!title?.trim())    return NextResponse.json({ error: "title is required" },    { status: 400 });
    if (!file_url?.trim()) return NextResponse.json({ error: "file_url is required" }, { status: 400 });
    if (!category?.trim()) return NextResponse.json({ error: "category is required" }, { status: 400 });
    if (!region?.trim())   return NextResponse.json({ error: "region is required" },   { status: 400 });

    const presentation = await prisma.presentation.create({
      data: {
        title:        title.trim(),
        description:  description?.trim() || null,
        file_url:     file_url.trim(),
        category:     category.trim(),
        region:       region.trim(),
        company_name: company_name?.trim() || null,
        is_sell_side: is_sell_side ?? false,
      },
    });

    return NextResponse.json({ presentation }, { status: 201 });
  } catch (err) {
    console.error("[api/presentations] POST error:", err);
    return NextResponse.json({ error: "Failed to create presentation" }, { status: 500 });
  }
}
