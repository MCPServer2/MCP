import { handleImageGet } from "@/lib/media-handlers";

/**
 * GET /api/image/[id]/t/[token] → serves the stored image binary.
 *
 * Path-token variant of /api/image/[id]?token=… — this is the canonical URL
 * shape embedded in MCP markdown results because some chat clients strip
 * query strings from markdown image URLs before rendering them. See
 * lib/media-handlers for the shared implementation (S3 302 redirect with
 * lazy upload + DB-bytes fallback).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; token: string }> }
) {
  const { id, token } = await context.params;
  return handleImageGet(request, id, decodeURIComponent(token).trim());
}
