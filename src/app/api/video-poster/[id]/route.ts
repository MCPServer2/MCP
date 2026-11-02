import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureVideoPoster } from "@/lib/video-service";

/**
 * GET /api/video-poster/[id]?token=... → JPEG preview frame of the video.
 * The poster lets chat clients (Claude, ChatGPT, …) show the video VISUALLY
 * inline: MCP tools embed it as an image block / markdown image next to the
 * playable MP4 link. The frame is extracted once with ffmpeg and cached in
 * the Video row. Requires the owner token, like every media route.
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

  const bytes = Buffer.from(poster.base64, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": poster.mime || "image/jpeg",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
