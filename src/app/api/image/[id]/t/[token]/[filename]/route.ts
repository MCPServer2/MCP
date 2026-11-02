import { handleImageGet } from "@/lib/media-handlers";

/**
 * GET /api/image/[id]/t/[token]/img.png → serves the stored image binary.
 *
 * Extension-suffixed variant of /api/image/[id]/t/[token] — this is the URL
 * shape embedded in MCP markdown results. Many chat clients (ChatGPT, Claude,
 * Slack, …) only inline-render markdown images whose URL ends with a
 * recognizable image extension; extensionless URLs fall back to a plain text
 * link. The filename is cosmetic — the bytes and the real Content-Type always
 * come from the stored row, so any of img.png / img.jpg / img.webp works.
 */
const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; token: string; filename: string }> }
) {
  const { id, token, filename } = await context.params;
  if (!IMAGE_EXT.test(decodeURIComponent(filename))) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  return handleImageGet(request, id, decodeURIComponent(token).trim());
}
