import { handlePosterGet } from "@/lib/media-handlers";

/**
 * GET /api/video-poster/[id]/t/[token]/poster.jpg → JPEG preview frame.
 *
 * Extension-suffixed variant of /api/video-poster/[id]/t/[token] — the URL
 * shape embedded in MCP video results. Chat clients only inline-render
 * markdown images whose URL ends with an image extension, so the preview
 * frame is always embedded as …/poster.jpg (the filename is cosmetic; the
 * real Content-Type comes from the stored poster row).
 */
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; token: string; filename: string }> }
) {
  const { id, token, filename } = await context.params;
  if (!IMAGE_EXT.test(decodeURIComponent(filename))) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  return handlePosterGet(request, id, decodeURIComponent(token).trim());
}
