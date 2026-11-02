import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureVideoPoster } from "@/lib/video-service";

/**
 * GET /api/view/video/[id]?token=... → minimal HTML viewer for one video.
 * A friendly, always-working share link the MCP tools hand to the model:
 * it plays the video full-page in any browser (autoplay muted loop) and
 * carries OpenGraph tags (og:video + og:image poster) so link-unfurling
 * surfaces show a rich preview. Owner token required.
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
    select: { userToken: true, prompt: true, mimeType: true, duration: true, resolution: true, aspectRatio: true },
  });
  if (!row || row.userToken !== token) {
    return NextResponse.json({ error: "الفيديو غير موجود أو لا يحق لك الوصول." }, { status: 404 });
  }

  const fileUrl = `/api/video-file/${id}?token=${encodeURIComponent(token)}`;
  const posterRow = await ensureVideoPoster(id);
  const posterUrl = posterRow ? `/api/video-poster/${id}?token=${encodeURIComponent(token)}` : null;
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
