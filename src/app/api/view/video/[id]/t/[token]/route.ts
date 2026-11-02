import { handleVideoViewer } from "@/lib/media-handlers";

/**
 * GET /api/view/video/[id]/t/[token] → HTML viewer for one video.
 * Path-token variant of /api/view/video/[id]?token=… (shared handler in
 * lib/media-handlers; carries og:video + og:image so link previews show a
 * rich player card).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; token: string }> }
) {
  const { id, token } = await context.params;
  return handleVideoViewer(request, id, decodeURIComponent(token).trim());
}
