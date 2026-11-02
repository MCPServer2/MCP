import { handleVideoFileDelete, handleVideoFileGet } from "@/lib/media-handlers";

/**
 * GET/DELETE /api/video-file/[id]/t/[token] → path-token variant of
 * /api/video-file/[id]?token=… — the canonical URL shape embedded in MCP
 * markdown results (survives query-string stripping sanitizers).
 * See lib/media-handlers for the shared implementation (S3 302 redirect,
 * lazy upload, DB fallback with Range support).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; token: string }> }
) {
  const { id, token } = await context.params;
  return handleVideoFileGet(request, id, decodeURIComponent(token).trim());
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; token: string }> }
) {
  const { id, token } = await context.params;
  return handleVideoFileDelete(request, id, decodeURIComponent(token).trim());
}
