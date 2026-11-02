import { NextResponse } from "next/server";
import { handleVideoFileDelete, handleVideoFileGet } from "@/lib/media-handlers";

/**
 * GET /api/video-file/[id]?token=... → serves the stored video binary.
 * The caller must present the user token that owns the video, so the library
 * stays private per visitor.
 *
 * Token can also be given in the path: /api/video-file/[id]/t/[token] — that
 * shape is what MCP results embed in markdown (it survives URL sanitizers
 * that strip query strings).
 *
 * When object storage (Neon S3) is enabled the request is answered with a 302
 * to the storage object — large MP4s must not pass through the serverless
 * response body limit, and the storage service handles Range/seeking natively
 * (clients re-send the Range header after following the redirect). Legacy
 * DB-only rows are lazily uploaded on first request; any storage failure
 * falls back to streaming from the database (with Range support).
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

  return handleVideoFileGet(request, id, token);
}

/** DELETE /api/video-file/[id]?token=... → remove one stored video. */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json({ error: "توكن المستخدم مطلوب." }, { status: 400 });
  }

  return handleVideoFileDelete(request, id, token);
}
