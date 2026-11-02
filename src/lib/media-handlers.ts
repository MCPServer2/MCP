import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { S3_MEDIA_ENABLED, deleteS3Media, s3MediaKey, s3MediaRedirect } from "@/lib/s3-storage";
import { ensureVideoPoster } from "@/lib/video-service";

/**
 * Shared handlers for the media + viewer routes.
 *
 * Every route exists in TWO shapes that share these handlers:
 *   1. ?token=…  (query parameter — the original shape)
 *   2. /t/<token>  (token inside the URL path)
 *
 * Shape 2 exists because some chat clients sanitize markdown image URLs and
 * strip query strings before rendering them — a path token survives that and
 * is therefore the canonical URL shape the MCP tools embed in markdown.
 */

/** Path-shaped internal URL to the image binary (used by the HTML viewers). */
export function imageFileUrl(id: string, token: string): string {
  return `/api/image/${id}/t/${encodeURIComponent(token)}`;
}

/** Path-shaped internal URL to the video MP4 (used by the HTML viewers). */
export function videoFileUrl(id: string, token: string): string {
  return `/api/video-file/${id}/t/${encodeURIComponent(token)}`;
}

/** Path-shaped internal URL to the video poster frame (used by the viewers). */
export function videoPosterUrl(id: string, token: string): string {
  return `/api/video-poster/${id}/t/${encodeURIComponent(token)}`;
}

/** Builds an absolute OG URL (OG requires absolute URLs). */
function absoluteUrl(request: Request, path: string): string {
  const h = request.headers;
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host")?.trim();
  if (!host) return path;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return `${proto}://${host}${path}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ------------------------------------------------------------------ */
/* Binary media                                                        */
/* ------------------------------------------------------------------ */

/** Serves the stored image binary. Owner token required. */
export async function handleImageGet(_request: Request, id: string, token: string) {
  const row = await db.generation.findUnique({
    where: { id },
    select: { userToken: true, data: true, mimeType: true, outputFormat: true },
  });

  if (!row || row.userToken !== token) {
    return NextResponse.json({ error: "الصورة غير موجودة أو لا يحق لك الوصول." }, { status: 404 });
  }

  const contentType = row.mimeType || "image/png";

  if (S3_MEDIA_ENABLED) {
    const redirect = await s3MediaRedirect(s3MediaKey("image", id, row.outputFormat || "png"), contentType, row.data);
    if (redirect) return redirect;
  }

  const bytes = Buffer.from(row.data, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

/** Serves the JPEG preview frame of one video. Owner token required. */
export async function handlePosterGet(_request: Request, id: string, token: string) {
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

/** Serves the stored video binary (with single-range support). Owner token required. */
export async function handleVideoFileGet(request: Request, id: string, token: string) {
  const row = await db.video.findUnique({
    where: { id },
    select: { userToken: true, data: true, mimeType: true },
  });

  if (!row || row.userToken !== token) {
    return NextResponse.json({ error: "الفيديو غير موجود أو لا يحق لك الوصول." }, { status: 404 });
  }

  const contentType = row.mimeType || "video/mp4";

  if (S3_MEDIA_ENABLED) {
    const redirect = await s3MediaRedirect(s3MediaKey("video", id, "mp4"), contentType, row.data);
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

/** Removes one stored video (DB row + storage mirrors). Owner token required. */
export async function handleVideoFileDelete(_request: Request, id: string, token: string) {
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

/* ------------------------------------------------------------------ */
/* HTML viewers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Minimal HTML viewer for one image — renders it full-page in any browser and
 * carries OpenGraph tags so link-unfurling surfaces show a preview.
 */
export async function handleImageViewer(request: Request, id: string, token: string) {
  const gen = await db.generation.findUnique({
    where: { id },
    select: { userToken: true, prompt: true, mimeType: true },
  });
  if (!gen || gen.userToken !== token) {
    return NextResponse.json({ error: "الصورة غير موجودة أو لا يحق لك الوصول." }, { status: 404 });
  }

  const fileUrl = imageFileUrl(id, token);
  const title = gen.prompt.trim().slice(0, 120) || "صورة مولّدة";

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="صورة مولّدة بواسطة GPT Image 2.5 Flare — استوديو Flare">
<meta property="og:image" content="${escapeHtml(absoluteUrl(request, fileUrl))}">
<meta property="og:image:type" content="${escapeHtml(gen.mimeType || "image/png")}">
<meta name="twitter:card" content="summary_large_image">
<style>
  html,body{margin:0;background:#09090b;color:#fafafa;font-family:system-ui,sans-serif;min-height:100vh}
  main{display:flex;flex-direction:column;align-items:center;gap:16px;padding:24px 16px;box-sizing:border-box}
  img{max-width:min(960px,100%);max-height:80vh;border-radius:16px;box-shadow:0 8px 40px rgb(0 0 0/.6)}
  p{margin:0;color:#a1a1aa;font-size:14px;max-width:720px;text-align:center;line-height:1.6}
  a{color:#f59e0b;text-decoration:none;font-weight:600}
</style>
</head>
<body>
<main>
  <img src="${escapeHtml(fileUrl)}" alt="${escapeHtml(title)}">
  <p>${escapeHtml(title)}</p>
  <a href="${escapeHtml(fileUrl)}" download>⬇ تنزيل الصورة</a>
</main>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

/**
 * Minimal HTML viewer for one video — plays it full-page in any browser and
 * carries OpenGraph tags (og:video + og:image poster) so link-unfurling
 * surfaces show a rich preview.
 */
export async function handleVideoViewer(request: Request, id: string, token: string) {
  const row = await db.video.findUnique({
    where: { id },
    select: { userToken: true, prompt: true, mimeType: true, duration: true, resolution: true, aspectRatio: true },
  });
  if (!row || row.userToken !== token) {
    return NextResponse.json({ error: "الفيديو غير موجود أو لا يحق لك الوصول." }, { status: 404 });
  }

  const fileUrl = videoFileUrl(id, token);
  const posterRow = await ensureVideoPoster(id);
  const posterUrl = posterRow ? videoPosterUrl(id, token) : null;
  const title = row.prompt.trim().slice(0, 120) || "فيديو مولّد";

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="فيديو مولّد بواسطة Grok Imagine (${escapeHtml(row.resolution)} ${row.duration} ث) — استوديو Flare">
${posterUrl ? `<meta property="og:image" content="${escapeHtml(absoluteUrl(request, posterUrl))}">` : ""}
<meta property="og:video" content="${escapeHtml(absoluteUrl(request, fileUrl))}">
<meta property="og:video:type" content="${escapeHtml(row.mimeType || "video/mp4")}">
<meta name="twitter:card" content="player">
<style>
  html,body{margin:0;background:#09090b;color:#fafafa;font-family:system-ui,sans-serif;min-height:100vh}
  main{display:flex;flex-direction:column;align-items:center;gap:16px;padding:24px 16px;box-sizing:border-box}
  video{width:min(960px,100%);max-height:80vh;border-radius:16px;background:#000;box-shadow:0 8px 40px rgb(0 0 0/.6)}
  p{margin:0;color:#a1a1aa;font-size:14px;max-width:720px;text-align:center;line-height:1.6}
  a{color:#f59e0b;text-decoration:none;font-weight:600}
</style>
</head>
<body>
<main>
  <video src="${escapeHtml(fileUrl)}" ${posterUrl ? `poster="${escapeHtml(posterUrl)}"` : ""} controls autoplay muted loop playsinline></video>
  <p>${escapeHtml(title)}</p>
  <p>${escapeHtml(row.resolution)} · ${escapeHtml(row.aspectRatio)} · ${row.duration} ثانية</p>
  <a href="${escapeHtml(fileUrl)}" download>⬇ تنزيل الفيديو (MP4)</a>
</main>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
