import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeVideoRow } from "@/lib/video-service";

/** GET /api/videos?token=... → metadata list of the user's videos (no payload). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "توكن المستخدم مطلوب." }, { status: 400 });
  }

  const rows = await db.video.findMany({
    where: { userToken: token },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      id: true,
      prompt: true,
      model: true,
      aspectRatio: true,
      resolution: true,
      duration: true,
      audio: true,
      usedStartFrame: true,
      usedEndFrame: true,
      usedKeyframes: true,
      usedLoop: true,
      usedReference: true,
      mimeType: true,
      credits: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    items: rows.map((row) => serializeVideoRow(row)),
  });
}
