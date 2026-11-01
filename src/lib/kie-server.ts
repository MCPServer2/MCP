/**
 * kie.ai API client (server-side only).
 *
 * Used for video generation with the grok-imagine-video-1-5-preview model:
 * - POST /api/v1/jobs/createTask  → { code, data: { taskId } }
 * - GET  /api/v1/jobs/recordInfo?taskId=… → { code, data: { state, resultJson, failMsg } }
 *
 * The kie.ai key lives in the server environment (KIE_API_KEY); it is never
 * exposed to the browser and never persisted in the database.
 */

export const KIE_BASE = "https://api.kie.ai";
export const KIE_UPLOAD_BASE = "https://kieai.redpandaai.co";
export const GROK_VIDEO_MODEL = "grok-imagine-video-1-5-preview";

export const ASPECT_RATIOS = ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;
export const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"] as const;

/** Longest kie.ai task id we accept when echoing values back. */
export const MAX_KEYFRAME_S = 15;

export class KieError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

function kieKey(): string {
  const key = process.env.KIE_API_KEY?.trim();
  if (!key) {
    throw new KieError(
      "مفتاح kie.ai غير مُعد على الخادم (KIE_API_KEY). أضفه إلى متغيرات البيئة.",
      500
    );
  }
  return key;
}

/** Maps a kie.ai `code` into a friendly Arabic message (HTTP is always 200). */
export function mapKieCode(code: number, msg: string): KieError {
  switch (code) {
    case 200:
      return new KieError(`نجاح غير متوقع مع رسالة: ${msg}`, 200);
    case 401:
      return new KieError("مفتاح kie.ai على الخادم غير صالح أو منتهي الصلاحية.", 500);
    case 402:
      return new KieError("رصيد kie.ai على الخادم غير كافٍ لتوليد الفيديو.", 402);
    case 404:
      return new KieError("مهمة الفيديو غير موجودة على kie.ai.", 404);
    case 429:
      return new KieError("تم تجاوز حد معدل طلبات kie.ai. انتظر قليلاً ثم أعد المحاولة.", 429);
    case 422:
      return new KieError(`رفض kie.ai معاملات الطلب: ${msg || "تحقق من الإطارات والمدة والقيم."}`, 400);
    default:
      return new KieError(`خطأ من kie.ai (${code}): ${msg || "بدون تفاصيل."}`, 502);
  }
}

/* ------------------------------------------------------------------ */
/* Input types                                                         */
/* ------------------------------------------------------------------ */

export interface VideoKeyframe {
  url: string; // public http(s) URL
  timestamp: number; // seconds, > 0 and < duration
}

export interface GrokVideoInput {
  prompt: string;
  /** Public image URLs to animate (max 1 per kie.ai docs). */
  imageUrls?: string[];
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  loopUrl?: string;
  keyframes?: VideoKeyframe[];
  enableAudio?: boolean;
}

/* ------------------------------------------------------------------ */
/* Image upload (frames come in as data URLs or http URLs)             */
/* ------------------------------------------------------------------ */

/**
 * Uploads an image (data: URL or public http(s) URL) to the kie.ai file
 * service and returns a hosted download URL that the video model can read.
 * Public http(s) URLs pass through unchanged (kie.ai fetches them itself).
 */
export async function ensureKieImageUrl(rawUrl: string): Promise<string> {
  const url = rawUrl.trim();
  if (!url) throw new KieError("رابط صورة الإطار فارغ.", 400);
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (!url.startsWith("data:")) {
    throw new KieError("رابط صورة الإطار غير صالح — استخدم رابط http(s) أو data URL.", 400);
  }
  if (!/^data:image\/(png|jpe?g|webp)[;,]/i.test(url)) {
    throw new KieError("صورة الإطار يجب أن تكون PNG / JPG / WEBP.", 400);
  }
  const b64 = url.slice(url.indexOf(",") + 1);
  if (b64.length * 0.75 > 20 * 1024 * 1024) {
    throw new KieError("صورة الإطار أكبر من الحد المسموح (20 ميجابايت).", 400);
  }

  let res: Response;
  try {
    res = await fetch(`${KIE_UPLOAD_BASE}/api/file-base64-upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${kieKey()}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        base64Data: url,
        uploadPath: "flare/frames",
      }),
    });
  } catch (e) {
    throw new KieError(
      `تعذر رفع صورة الإطار إلى kie.ai (${e instanceof Error ? e.message : "خطأ شبكة"}).`,
      502
    );
  }
  const payload = (await res.json().catch(() => null)) as {
    success?: boolean;
    code?: number;
    msg?: string;
    data?: { downloadUrl?: string };
  } | null;
  if (!res.ok || !payload?.success || !payload.data?.downloadUrl) {
    throw new KieError(
      `فشل رفع صورة الإطار إلى kie.ai (${payload?.msg || `HTTP ${res.status}`}).`,
      502
    );
  }
  return payload.data.downloadUrl;
}

/* ------------------------------------------------------------------ */
/* Task lifecycle                                                      */
/* ------------------------------------------------------------------ */

/** Creates a video generation task and returns the kie.ai taskId. */
export async function createVideoTask(input: GrokVideoInput): Promise<string> {
  const body: Record<string, unknown> = {
    model: GROK_VIDEO_MODEL,
    input: {
      prompt: input.prompt || undefined,
      ...(input.imageUrls?.length ? { image_urls: input.imageUrls } : {}),
      aspect_ratio: input.aspectRatio || "auto",
      resolution: input.resolution || "480p",
      duration: input.duration ?? 8,
      ...(input.firstFrameUrl ? { first_frame_url: input.firstFrameUrl } : {}),
      ...(input.lastFrameUrl ? { last_frame_url: input.lastFrameUrl } : {}),
      ...(input.loopUrl ? { loop_url: input.loopUrl } : {}),
      ...(input.keyframes?.length
        ? {
            keyframes: input.keyframes.map((k) => ({
              url: k.url,
              timestamp_s: k.timestamp,
            })),
          }
        : {}),
      enable_audio: input.enableAudio ?? true,
    },
  };

  let res: Response;
  try {
    res = await fetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${kieKey()}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new KieError("انتهت مهلة الاتصال بـ kie.ai أثناء إنشاء المهمة.", 504);
    }
    throw new KieError("تعذر الاتصال بخوادم kie.ai. تحقق من الشبكة وحاول مجدداً.", 502);
  }

  const payload = (await res.json().catch(() => null)) as {
    code?: number;
    msg?: string;
    data?: { taskId?: string };
  } | null;
  if (!payload || payload.code !== 200 || !payload.data?.taskId) {
    throw mapKieCode(payload?.code ?? res.status, payload?.msg ?? "");
  }
  return payload.data.taskId;
}

export type KieTaskState = "waiting" | "queuing" | "generating" | "success" | "fail";

export interface KieTaskRecord {
  taskId: string;
  state: KieTaskState;
  resultUrls: string[];
  failMsg: string | null;
  failCode: string | null;
  credits: number | null;
}

interface KieRecordInfoResponse {
  code?: number;
  msg?: string;
  data?: {
    taskId?: string;
    state?: string;
    resultJson?: string;
    failCode?: string | null;
    failMsg?: string | null;
    creditsConsumed?: number | null;
  } | null;
}

/** Fetches the current state of a kie.ai task. */
export async function getVideoTask(taskId: string): Promise<KieTaskRecord> {
  let res: Response;
  try {
    res = await fetch(
      `${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      {
        headers: { Authorization: `Bearer ${kieKey()}` },
        signal: AbortSignal.timeout(30_000),
      }
    );
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new KieError("انتهت مهلة الاستعلام عن حالة المهمة على kie.ai.", 504);
    }
    throw new KieError("تعذر الاتصال بخوادم kie.ai أثناء الاستعلام.", 502);
  }

  const payload = (await res.json().catch(() => null)) as KieRecordInfoResponse | null;
  if (!payload || payload.code !== 200 || !payload.data) {
    throw mapKieCode(payload?.code ?? res.status, payload?.msg ?? "");
  }

  let resultUrls: string[] = [];
  if (payload.data.resultJson) {
    try {
      const parsed = JSON.parse(payload.data.resultJson) as { resultUrls?: unknown };
      if (Array.isArray(parsed.resultUrls)) {
        resultUrls = parsed.resultUrls.filter((u): u is string => typeof u === "string" && u.length > 0);
      }
    } catch {
      // resultJson malformed → treated as no results yet
    }
  }

  const state = payload.data.state;
  return {
    taskId,
    state: (state === "success" || state === "fail" || state === "generating" || state === "queuing" || state === "waiting"
      ? state
      : "waiting") as KieTaskState,
    resultUrls,
    failMsg: payload.data.failMsg || null,
    failCode: payload.data.failCode || null,
    credits: typeof payload.data.creditsConsumed === "number" ? payload.data.creditsConsumed : null,
  };
}
