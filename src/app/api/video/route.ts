import { NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/lib/db";
import { KieError, MAX_KEYFRAME_S } from "@/lib/kie-server";
import { runVideoGeneration, type VideoRunParams } from "@/lib/video-service";
import { ASPECT_RATIOS, VIDEO_RESOLUTIONS, type VideoGenerateRequestBody } from "@/lib/types";

export const maxDuration = 300;

/** A pending video job older than this is considered dead. */
const STALE_PENDING_MS = 8 * 60 * 1000;
const KEEP_FINISHED_MS = 24 * 60 * 60 * 1000;

/** GET /api/video?token=... → the user's most recent pending video job (if any). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "توكن المستخدم مطلوب." }, { status: 400 });
  }

  await db.job.updateMany({
    where: {
      userToken: token,
      mode: "video",
      status: "pending",
      updatedAt: { lt: new Date(Date.now() - STALE_PENDING_MS) },
    },
    data: { status: "error", error: "توقفت عملية توليد الفيديو قبل اكتمالها. جرّب مرة أخرى." },
  });

  const pending = await db.job.findFirst({
    where: { userToken: token, mode: "video", status: { in: ["pending", "processing"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({ pending: pending ?? null });
}

/**
 * POST /api/video → validates the request, creates an async Job, kicks off the
 * kie.ai video generation in the background and returns the jobId immediately.
 * The client polls GET /api/video/[jobId].
 */
export async function POST(request: Request) {
  let body: VideoGenerateRequestBody;
  try {
    body = (await request.json()) as VideoGenerateRequestBody;
  } catch {
    return NextResponse.json({ error: "طلب غير صالح." }, { status: 400 });
  }

  const userToken = body.userToken?.trim();
  if (!userToken || userToken.length < 8 || userToken.length > 80) {
    return NextResponse.json({ error: "توكن المستخدم غير صالح." }, { status: 400 });
  }
  if (!process.env.KIE_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "توليد الفيديو غير مُعد على الخادم — أضف KIE_API_KEY إلى متغيرات البيئة." },
      { status: 500 }
    );
  }

  const prompt = body.prompt?.trim() ?? "";
  const hasStart = Boolean(body.startFrame);
  const hasEnd = Boolean(body.endFrame);
  const hasLoop = Boolean(body.loopFrame);
  const hasRef = Boolean(body.referenceImage);
  const keyframes = Array.isArray(body.keyframes) ? body.keyframes.slice(0, 4) : [];

  if (!prompt && !hasStart && !hasEnd && !hasLoop && !hasRef && keyframes.length === 0) {
    return NextResponse.json(
      { error: "اكتب وصفاً للفيديو أو أضف صورة إطار أولاً." },
      { status: 400 }
    );
  }
  if (prompt.length > 4096) {
    return NextResponse.json({ error: "وصف الفيديو أطول من الحد المسموح (4096 حرفاً)." }, { status: 400 });
  }
  if (hasLoop && (hasStart || hasEnd)) {
    return NextResponse.json(
      { error: "صورة التكرار (Loop) تُستخدم وحدها — أزل إطار البداية والنهاية." },
      { status: 400 }
    );
  }

  const aspectRatio = (ASPECT_RATIOS as readonly string[]).includes(String(body.aspectRatio))
    ? String(body.aspectRatio)
    : "auto";
  const resolution = (VIDEO_RESOLUTIONS as readonly string[]).includes(String(body.resolution))
    ? String(body.resolution)
    : "480p";
  const duration = Math.min(Math.max(Math.round(Number(body.duration) || 8), 1), 15);
  const audio = body.audio !== false;

  // Validate keyframes: timestamp within (0, duration).
  for (const k of keyframes) {
    const ts = Number(k?.timestamp);
    if (!k?.url || !Number.isFinite(ts) || ts <= 0 || ts >= duration) {
      return NextResponse.json(
        { error: `وقت الإطار المفتاحي يجب أن يكون أكبر من 0 وأقل من مدة الفيديو (${duration} ث).` },
        { status: 400 }
      );
    }
  }
  if (duration <= 1 && keyframes.length > 0) {
    return NextResponse.json(
      { error: "الإطارات المفتاحية تحتاج مدة فيديو أكبر من ثانية واحدة." },
      { status: 400 }
    );
  }
  if (resolution === "1080p" && hasRef) {
    return NextResponse.json(
      { error: "دقة 1080p لا تدعم صورة متحركة (image_urls) — استخدم 480p أو 720p." },
      { status: 400 }
    );
  }

  // Housekeeping: drop this user's old finished video jobs.
  try {
    await db.job.deleteMany({
      where: {
        userToken,
        mode: "video",
        status: { notIn: ["pending", "processing"] },
        updatedAt: { lt: new Date(Date.now() - KEEP_FINISHED_MS) },
      },
    });
  } catch {
    // housekeeping is best-effort
  }

  const job = await db.job.create({
    data: { userToken, mode: "video", prompt, status: "pending" },
    select: { id: true },
  });

  const params: VideoRunParams = {
    jobId: job.id,
    userToken,
    prompt,
    aspectRatio,
    resolution,
    duration,
    audio,
    startFrame: hasStart ? body.startFrame : null,
    endFrame: hasEnd ? body.endFrame : null,
    loopFrame: hasLoop ? body.loopFrame : null,
    referenceImage: hasRef ? body.referenceImage : null,
    keyframes: keyframes.map((k) => ({
      url: String(k.url),
      timestamp: Math.min(Math.max(Number(k.timestamp), 0.1), MAX_KEYFRAME_S),
    })),
  };

  after(async () => {
    try {
      await runVideoGeneration(params); // shared with /api/mcp
    } catch (error) {
      const message =
        error instanceof KieError
          ? error.message
          : error instanceof Error && error.name === "AbortError"
            ? "انتهت مهلة الاتصال بـ kie.ai. جرّب مرة أخرى."
            : "حدث خطأ غير متوقع أثناء توليد الفيديو.";
      if (!(error instanceof KieError) && !(error instanceof Error && error.name === "AbortError")) {
        console.error(`[video:${job.id}] unexpected error:`, error);
      }
      try {
        await db.job.update({ where: { id: job.id }, data: { status: "error", error: message } });
      } catch (dbError) {
        console.error(`[video:${job.id}] failed to persist error:`, dbError);
      }
    }
  });

  return NextResponse.json({ jobId: job.id });
}
