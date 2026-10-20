import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** GET /api/gallery?token=... → metadata list (no heavy base64 payload). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "توكن المستخدم مطلوب." }, { status: 400 });
  }

  const rows = await db.generation.findMany({
    where: { userToken: token },
    orderBy: { createdAt: "desc" },
    take: 120,
    select: {
      id: true,
      prompt: true,
      mode: true,
      model: true,
      size: true,
      quality: true,
      outputFormat: true,
      background: true,
      revisedPrompt: true,
      usedReference: true,
      mimeType: true,
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    items: rows.map((row) => ({
      ...row,
      mode: row.mode === "sketch" ? "sketch" : "generate",
      usedReference: Boolean(row.usedReference),
      createdAt: row.createdAt.toISOString(),
    })),
  });
}

/** DELETE /api/gallery?token=... → clear the whole gallery of this user token. */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "توكن المستخدم مطلوب." }, { status: 400 });
  }

  const result = await db.generation.deleteMany({ where: { userToken: token } });
  return NextResponse.json({ deleted: result.count });
}
