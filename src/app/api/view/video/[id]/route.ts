import { NextResponse } from "next/server";
import { handleVideoViewer } from "@/lib/media-handlers";

/**
 * GET /api/view/video/[id]?token=... → minimal HTML viewer for one video.
 * A friendly, always-working share link the MCP tools hand to the model:
 * it plays the video full-page in any browser (autoplay muted loop) and
 * carries OpenGraph tags (og:video + og:image poster) so link-unfurling
 * surfaces show a rich preview. Owner token required.
 *
 * Token can also be given in the path: /api/view/video/[id]/t/[token].
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

  return handleVideoViewer(request, id, token);
}
