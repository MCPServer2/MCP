import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/video-file/[id]?token=... → serves the stored video binary.
 * The caller must present the user token that owns the video, so the library
 * stays private per visitor. HTTP Range requests are honored so the browser
 * video player can seek (Safari requires this).
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

  const bytes = Buffer.from(row.data, "base64");
  const total = bytes.byteLength;
  const contentType = row.mimeType || "video/mp4";
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
  return NextResponse.json({ deleted: true });
}
