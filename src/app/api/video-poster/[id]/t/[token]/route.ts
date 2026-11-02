import { handlePosterGet } from "@/lib/media-handlers";

/**
 * GET /api/video-poster/[id]/t/[token] → JPEG preview frame of the video.
 *
 * Path-token variant of /api/video-poster/[id]?token=… — the canonical URL
 * shape embedded in MCP markdown results (survives query-string stripping
 * sanitizers). See lib/media-handlers for the shared implementation.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; token: string }> }
) {
  const { id, token } = await context.params;
  return handlePosterGet(request, id, decodeURIComponent(token).trim());
}
