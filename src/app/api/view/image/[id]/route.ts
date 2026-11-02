import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/view/image/[id]?token=... → minimal HTML viewer for one image.
 * A friendly, always-working share link the MCP tools hand to the model:
 * it renders the image full-page in any browser and carries OpenGraph tags
 * so link-unfurling surfaces show a preview. Owner token required.
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

  const gen = await db.generation.findUnique({
    where: { id },
    select: { userToken: true, prompt: true, mimeType: true },
  });
  if (!gen || gen.userToken !== token) {
    return NextResponse.json({ error: "الصورة غير موجودة أو لا يحق لك الوصول." }, { status: 404 });
  }

  const fileUrl = `/api/image/${id}?token=${encodeURIComponent(token)}`;
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
