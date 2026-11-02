import { NextResponse } from "next/server";
import { handleImageViewer } from "@/lib/media-handlers";

/**
 * GET /api/view/image/[id]?token=... → minimal HTML viewer for one image.
 * A friendly, always-working share link the MCP tools hand to the model:
 * it renders the image full-page in any browser and carries OpenGraph tags
 * so link-unfurling surfaces show a preview. Owner token required.
 *
 * Token can also be given in the path: /api/view/image/[id]/t/[token].
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

  return handleImageViewer(request, id, token);
}
