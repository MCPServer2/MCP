import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/image/[id]?token=... → serves the stored image binary.
 * The caller must present the user token that owns the generation,
 * so galleries stay private per visitor.
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
    select: { userToken: true, data: true, mimeType: true },
  });

  if (!row || row.userToken !== token) {
    return NextResponse.json({ error: "الصورة غير موجودة أو لا يحق لك الوصول." }, { status: 404 });
  }

  const bytes = Buffer.from(row.data, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": row.mimeType || "image/png",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
