import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── GET: list all presentations ordered by newest first ───────────────────────
export async function GET() {
  try {
    const presentations = await prisma.presentation.findMany({
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json({ presentations });
  } catch (err) {
    console.error("[api/presentations] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch presentations" }, { status: 500 });
  }
}

// ── POST: save metadata for a file already uploaded to R2 ─────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      title?: string;
      description?: string;
      file_url?: string;
      category?: string;
      region?: string;
      company_name?: string;
    };

    const { title, description, file_url, category, region, company_name } = body;

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
      },
    });

    return NextResponse.json({ presentation }, { status: 201 });
  } catch (err) {
    console.error("[api/presentations] POST error:", err);
    return NextResponse.json({ error: "Failed to create presentation" }, { status: 500 });
  }
}
