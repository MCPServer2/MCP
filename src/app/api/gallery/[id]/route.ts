import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** DELETE /api/gallery/[id]?token=... → remove a single generation. */
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

  const row = await db.generation.findUnique({ where: { id } });
  if (!row || row.userToken !== token) {
    return NextResponse.json({ error: "العنصر غير موجود أو لا يخصك." }, { status: 404 });
  }

  await db.generation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
