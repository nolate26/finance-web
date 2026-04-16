import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2 } from "@/lib/r2";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const EXT_MAP: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as { filename?: string; contentType?: string; folder?: string };
    const { filename, contentType, folder } = body;

    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "filename is required" }, { status: 400 });
    }
    if (!contentType || !ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "contentType must be application/pdf, .ppt, or .pptx" },
        { status: 415 }
      );
    }

    const bucket = process.env.R2_BUCKET_NAME;
    const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");

    if (!bucket || !publicBase) {
      return NextResponse.json({ error: "R2 bucket not configured" }, { status: 500 });
    }

    // Build a unique, safe key
    const ext = EXT_MAP[contentType] ?? "bin";
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const uid = crypto.randomUUID();
    const prefix = folder ? `${folder.replace(/\/$/, "")}/` : "uploads/";
    const key = `${prefix}${uid}_${safeName}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key:    key,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });
    const fileUrl = `${publicBase}/${key}`;

    return NextResponse.json({ presignedUrl, fileUrl, key });
  } catch (err) {
    console.error("[api/upload] error:", err);
    return NextResponse.json({ error: "Failed to generate presigned URL" }, { status: 500 });
  }
}
