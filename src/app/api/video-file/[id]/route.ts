import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { S3_MEDIA_ENABLED, deleteS3Media, s3MediaKey, s3MediaRedirect } from "@/lib/s3-storage";

/**
 * GET /api/video-file/[id]?token=... → serves the stored video binary.
 * The caller must present the user token that owns the video, so the library
 * stays private per visitor.
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
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json({ error: "توكن المستخدم مطلوب." }, { status: 400 });
  }

  const row = await db.video.findUnique({
    where: { id },
    select: { userToken: true, data: true, mimeType: true },
  });

  if (!row || row.userToken !== token) {
    return NextResponse.json({ error: "الفيديو غير موجود أو لا يحق لك الوصول." }, { status: 404 });
  }

  const videoKey = s3MediaKey("video", id, "mp4");
  const contentType = row.mimeType || "video/mp4";

  if (S3_MEDIA_ENABLED) {
    const redirect = await s3MediaRedirect(videoKey, contentType, row.data);
    if (redirect) return redirect;
  }

  const bytes = Buffer.from(row.data, "base64");
  const total = bytes.byteLength;
  const rangeHeader = request.headers.get("range");

  // Simple single-range support (the video player uses it for seeking).
  const rangeMatch = rangeHeader
    ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
    : null;
  if (rangeMatch) {
    let start = rangeMatch[1] ? Number(rangeMatch[1]) : 0;
    let end = rangeMatch[2] ? Number(rangeMatch[2]) : total - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${total}` },
      });
    }
    start = Math.max(0, start);
    end = Math.min(end, total - 1);
    const chunk = bytes.subarray(start, end + 1);
    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

/** DELETE /api/video-file/[id]?token=... → remove one stored video. */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();

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

  await db.video.delete({ where: { id } });

  // Best-effort cleanup of the storage mirrors.
  await Promise.all([
    deleteS3Media(s3MediaKey("video", id, "mp4")),
    deleteS3Media(s3MediaKey("poster", id, "jpg")),
  ]);

  return NextResponse.json({ deleted: true });
}
