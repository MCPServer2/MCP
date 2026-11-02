import { NextResponse } from "next/server";
import { handlePosterGet } from "@/lib/media-handlers";

/**
 * GET /api/video-poster/[id]?token=... → JPEG preview frame of the video.
 * The poster lets chat clients (Claude, ChatGPT, …) show the video VISUALLY
 * inline: MCP tools embed it as an image block / markdown image next to the
 * playable MP4 link. The frame is extracted once with ffmpeg and cached in
 * the Video row. Requires the owner token, like every media route.
 *
 * Token can also be given in the path: /api/video-poster/[id]/t/[token] —
 * that shape is what MCP results embed in markdown (it survives URL
 * sanitizers that strip query strings).
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

  return handlePosterGet(request, id, token);
}
