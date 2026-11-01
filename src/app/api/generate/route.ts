import { NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/lib/db";
import { CometError, resolveCometKeyForUser, sanitizeMode } from "@/lib/comet-server";
import { runGeneration, type RunParams } from "@/lib/generation-service";
import { serializeGenerationRow } from "@/lib/serialize";

export const maxDuration = 300;

/** A pending job older than this is considered dead (upstream timeout is 280s). */
const STALE_PENDING_MS = 6 * 60 * 1000;
const KEEP_FINISHED_MS = 24 * 60 * 60 * 1000;

/** GET /api/generate?token=... → the user's most recent pending job (if any). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "توكن المستخدم مطلوب." }, { status: 400 });
  }

  // Fail stale pending jobs so the client never waits on a dead one.
  // (Video jobs have their own longer lifecycle in /api/video — excluded here.)
  await db.job.updateMany({
    where: {
      userToken: token,
      status: "pending",
      mode: { not: "video" },
      updatedAt: { lt: new Date(Date.now() - STALE_PENDING_MS) },
    },
    data: { status: "error", error: "توقفت عملية التوليد قبل اكتمالها. جرّب مرة أخرى." },
  });

  const pending = await db.job.findFirst({
    where: { userToken: token, status: "pending", mode: { not: "video" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, mode: true, createdAt: true },
  });

  return NextResponse.json({ pending: pending ?? null });
}

/**
 * POST /api/generate → validates the request, creates an async Job, kicks off
 * the CometAPI call in the background (after the response is sent) and returns
 * the jobId immediately. The client polls GET /api/generate/[jobId] for status.
 * This keeps the HTTP request short-lived so gateway timeouts / network blips
 * can never lose a finished generation again.
 */
export async function POST(request: Request) {
  let body: import("@/lib/types").GenerateRequestBody;
  try {
    body = (await request.json()) as import("@/lib/types").GenerateRequestBody;
  } catch {
    return NextResponse.json({ error: "طلب غير صالح." }, { status: 400 });
  }

  const userToken = body.userToken?.trim();
  if (!userToken || userToken.length < 8 || userToken.length > 80) {
    return NextResponse.json({ error: "توكن المستخدم غير صالح." }, { status: 400 });
  }

  // Key resolution: explicit per-request header → the key saved encrypted in
  // the vault (UserKey table) for this token. The website normally sends no
  // header at all — the vault key powers web AND MCP generations alike.
  const headerKey = request.headers.get("x-cometapi-key")?.trim() || null;
  const apiKey = await resolveCometKeyForUser(userToken, headerKey);
  if (!apiKey) {
    return NextResponse.json(
      { error: "أضف مفتاح CometAPI أولاً من شريط «مفتاح CometAPI الخاص بك» في الأعلى." },
      { status: 400 }
    );
  }

  const prompt = body.prompt?.trim() ?? "";
  const mode = sanitizeMode(body.mode);
  if (!prompt && mode === "generate") {
    return NextResponse.json({ error: "اكتب وصفاً للصورة أولاً." }, { status: 400 });
  }
  if (!prompt && mode === "sketch" && body.autoEnhance === false) {
    return NextResponse.json(
      { error: "اكتب تعليمات لتحويل الرسم، أو فعّل التحسين التلقائي." },
      { status: 400 }
    );
  }
  if (mode === "sketch" && !body.image) {
    return NextResponse.json(
      { error: "أضف صورة الرسم المصدر أولاً — ارسمها في اللوحة أو ارفعها." },
      { status: 400 }
    );
  }

  // Optional visual reference in text-to-image mode (also routed through /edits).
  const hasImage = Boolean(body.image);

  const n = Math.min(Math.max(Number(body.n) || 1, 1), 4);
  const size = String(body.size || "1024x1024");
  const quality = String(body.quality || "auto");
  const outputFormat = String(body.outputFormat || "png");
  const background =
    mode === "generate" && ["auto", "transparent", "opaque"].includes(String(body.background))
      ? String(body.background)
      : undefined;

  // Housekeeping: drop this user's old finished jobs.
  try {
    await db.job.deleteMany({
      where: {
        userToken: userToken,
        status: { not: "pending" },
        updatedAt: { lt: new Date(Date.now() - KEEP_FINISHED_MS) },
      },
    });
  } catch {
    // housekeeping is best-effort
  }

  const job = await db.job.create({
    data: { userToken, mode, prompt, status: "pending" },
    select: { id: true },
  });

  const params: RunParams = {
    jobId: job.id,
    apiKey,
    userToken,
    mode,
    prompt,
    n,
    size,
    quality,
    outputFormat,
    background,
    autoEnhance: body.autoEnhance !== false,
    image: body.image ?? null,
  };

  after(async () => {
    try {
      await runGeneration(params); // shared with /api/mcp
    } catch (error) {
      const message =
        error instanceof CometError
          ? error.message
          : error instanceof Error && error.name === "AbortError"
            ? "انتهت مهلة الطلب. النموذج قد يكون تحت ضغط، جرّب مرة أخرى."
            : "حدث خطأ غير متوقع أثناء الاتصال بـ CometAPI.";
      if (!(error instanceof CometError) && !(error instanceof Error && error.name === "AbortError")) {
        console.error(`[generate:${job.id}] unexpected error:`, error);
      }
      try {
        await db.job.update({ where: { id: job.id }, data: { status: "error", error: message } });
      } catch (dbError) {
        console.error(`[generate:${job.id}] failed to persist error:`, dbError);
      }
    }
  });

  return NextResponse.json({ jobId: job.id });
}
