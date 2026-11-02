import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { S3_MEDIA_ENABLED, s3MediaKey, s3MediaRedirect } from "@/lib/s3-storage";
import { ensureVideoPoster } from "@/lib/video-service";

/**
 * GET /api/video-poster/[id]?token=... → JPEG preview frame of the video.
 * The poster lets chat clients (Claude, ChatGPT, …) show the video VISUALLY
 * inline: MCP tools embed it as an image block / markdown image next to the
 * playable MP4 link. The frame is extracted once with ffmpeg and cached in
 * the Video row. Requires the owner token, like every media route.
 *
 * With object storage (Neon S3) enabled it is served by 302 redirect, with
 * a lazy upload of legacy rows and a DB-bytes fallback.
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

  const row = await db.video.findUnique({
    where: { id },
    select: { userToken: true },
  });
  if (!row || row.userToken !== token) {
    return NextResponse.json({ error: "الفيديو غير موجود أو لا يحق لك الوصول." }, { status: 404 });
  }

  const poster = await ensureVideoPoster(id);
  if (!poster) {
    return NextResponse.json({ error: "تعذر استخراج معاينة الفيديو." }, { status: 404 });
  }

  const contentType = poster.mime || "image/jpeg";

  if (S3_MEDIA_ENABLED) {
    const redirect = await s3MediaRedirect(s3MediaKey("poster", id, "jpg"), contentType, poster.base64);
    if (redirect) return redirect;
  }

  const bytes = Buffer.from(poster.base64, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
