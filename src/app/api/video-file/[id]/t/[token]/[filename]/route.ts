import { handleVideoFileDelete, handleVideoFileGet } from "@/lib/media-handlers";

/**
 * GET/DELETE /api/video-file/[id]/t/[token]/video.mp4 → serves the stored MP4.
 *
 * Extension-suffixed variant of /api/video-file/[id]/t/[token] — the URL shape
 * embedded in MCP markdown results. Chat clients (and downloaders) recognize a
 * .mp4 suffix far more reliably than an extensionless path, which maximizes
 * the chance of an inline player or a rich file card. The filename is
 * cosmetic — the bytes and the real Content-Type always come from the stored
 * row (with Range support for seeking).
 */
const VIDEO_EXT = /\.(mp4|webm|mov)$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; token: string; filename: string }> }
) {
  const { id, token, filename } = await context.params;
  if (!VIDEO_EXT.test(decodeURIComponent(filename))) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  return handleVideoFileGet(request, id, decodeURIComponent(token).trim());
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; token: string; filename: string }> }
) {
  const { id, token, filename } = await context.params;
  if (!VIDEO_EXT.test(decodeURIComponent(filename))) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  return handleVideoFileDelete(request, id, decodeURIComponent(token).trim());
}
