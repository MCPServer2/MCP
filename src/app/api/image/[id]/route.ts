import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { S3_MEDIA_ENABLED, s3MediaKey, s3MediaRedirect } from "@/lib/s3-storage";

/**
 * GET /api/image/[id]?token=... → serves the stored image binary.
 * The caller must present the user token that owns the generation,
 * so galleries stay private per visitor.
 *
 * When object storage (Neon S3) is enabled the request is answered with a
 * 302 to the storage object (lazily uploading legacy DB-only rows first);
 * any storage failure falls back to streaming the bytes from the database.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json({ error: "توكن المستخدم مطلوب." }, { status: 400 });
  }

  const row = await db.generation.findUnique({
    where: { id },
    select: { userToken: true, data: true, mimeType: true, outputFormat: true },
  });

  if (!row || row.userToken !== token) {
    return NextResponse.json({ error: "الصورة غير موجودة أو لا يحق لك الوصول." }, { status: 404 });
  }

  const contentType = row.mimeType || "image/png";

  if (S3_MEDIA_ENABLED) {
    const redirect = await s3MediaRedirect(s3MediaKey("image", id, row.outputFormat || "png"), contentType, row.data);
    if (redirect) return redirect;
  }

  const bytes = Buffer.from(row.data, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
