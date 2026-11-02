import { handleImageViewer } from "@/lib/media-handlers";

/**
 * GET /api/view/image/[id]/t/[token] → HTML viewer for one image.
 * Path-token variant of /api/view/image/[id]?token=… (shared handler in
 * lib/media-handlers; carries og:image so link previews show the picture).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; token: string }> }
) {
  const { id, token } = await context.params;
  return handleImageViewer(request, id, decodeURIComponent(token).trim());
}
