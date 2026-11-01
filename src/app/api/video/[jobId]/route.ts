import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recoverVideoJob, serializeVideoRow } from "@/lib/video-service";
import type { VideoJobStatusResponse } from "@/lib/types";

export const maxDuration = 300;

/**
 * GET /api/video/[jobId]?token=... → poll a video job.
 * If the background worker died, this endpoint transparently recovers the job
 * from its stored kie.ai taskId (fetches the finished MP4 and stores it) so a
 * running generation is never lost.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json({ error: "توكن المستخدم مطلوب." }, { status: 400 });
  }

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.userToken !== token) {
    return NextResponse.json({ error: "المهمة غير موجودة." }, { status: 404 });
  }

  // Recovery pass (cheap when the job is already done/error or fresh).
  if (job.mode === "video" && (job.status === "pending" || job.status === "processing")) {
    await recoverVideoJob(job.id).catch(() => undefined);
  }

  const current = await db.job.findUnique({ where: { id: jobId } });
  if (!current) {
    return NextResponse.json({ error: "المهمة غير موجودة." }, { status: 404 });
  }

  if (current.status === "pending" || current.status === "processing") {
    const elapsed = Math.round((Date.now() - new Date(current.createdAt).getTime()) / 1000);
    const body: VideoJobStatusResponse = { status: "pending" };
    return NextResponse.json({ ...body, elapsed });
  }

  if (current.status === "error") {
    const body: VideoJobStatusResponse = { status: "error", error: current.error ?? "فشل توليد الفيديو." };
    return NextResponse.json(body);
  }

  const rows = await db.video.findMany({
    where: { jobId: jobId, userToken: token },
    orderBy: { createdAt: "asc" },
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

  const body: VideoJobStatusResponse = {
    status: "done",
    items: rows.map((row) => serializeVideoRow(row)),
  };
  return NextResponse.json(body);
}

/**
 * POST /api/video/[jobId]?token=... → resume a stalled video job.
 * Re-runs the recovery path synchronously: it re-claims the job (if the
 * background worker abandoned it) and follows the stored kie.ai task until
 * the MP4 is stored — no extra credits are consumed for the same task.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "توكن المستخدم مطلوب." }, { status: 400 });
  }

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.userToken !== token || job.mode !== "video") {
    return NextResponse.json({ error: "المهمة غير موجودة." }, { status: 404 });
  }
  if (job.status === "done") {
    return NextResponse.json({ status: "done" });
  }

  await recoverVideoJob(jobId).catch(() => undefined);
  return NextResponse.json({ status: "resumed" });
}
