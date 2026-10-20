import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeGenerationRow } from "@/lib/serialize";

/** GET /api/generate/[jobId]?token=... → poll the status of an async generation job. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "توكن المستخدم مطلوب." }, { status: 400 });
  }

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.userToken !== token) {
    return NextResponse.json({ error: "المهمة غير موجودة." }, { status: 404 });
  }

  if (job.status === "pending") {
    return NextResponse.json({ status: "pending" });
  }

  if (job.status === "error") {
    return NextResponse.json({ status: "error", error: job.error ?? "فشل التوليد، حاول مجدداً." });
  }

  const rows = await db.generation.findMany({
    where: { jobId: job.id, userToken: token },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ status: "done", items: rows.map(serializeGenerationRow) });
}
