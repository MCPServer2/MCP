import { NextResponse } from "next/server";
import { handleImageGet } from "@/lib/media-handlers";

/**
 * GET /api/image/[id]?token=... → serves the stored image binary.
 * The caller must present the user token that owns the generation,
 * so galleries stay private per visitor.
 *
 * Token can also be given in the path: /api/image/[id]/t/[token] — that shape
 * is what MCP results embed in markdown (it survives URL sanitizers that strip
 * query strings). Both shapes share the same handler in lib/media-handlers.
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
  const token = new URL(request.url).searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json({ error: "توكن المستخدم مطلوب." }, { status: 400 });
  }

  return handleImageGet(request, id, token);
}
