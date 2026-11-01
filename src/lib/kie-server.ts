/**
 * kie.ai API client (server-side only).
 *
 * Used for video generation with the grok-imagine-video-1-5-preview model:
 * - POST /api/v1/jobs/createTask  → { code, data: { taskId } }
 * - GET  /api/v1/jobs/recordInfo?taskId=… → { code, data: { state, resultJson, failMsg } }
 *
 * Keys (BYOK, like the CometAPI image flow), in priority order:
 *  1. Per-request key via the x-kie-key header / MCP kie_key argument.
 *  2. The key the user saved from the video tab — encrypted in the UserKey
 *     table and bound to their FLR- token (getUserKieKey). This makes the key
 *     work from the MCP server too, without re-sending it on every call.
 *  3. The server's built-in KIE_API_KEY environment variable.
 * A per-request key is additionally stored on the Job row (kieKey) so the
 * recovery path can query the correct kie.ai account after a worker restart.
 */

import { db } from "@/lib/db";
import { decryptSecret, encryptSecret, needsReencryption } from "@/lib/key-vault";

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

/**
 * Picks the kie.ai key for a call: the user's own key when provided (BYOK),
 * otherwise the server's built-in KIE_API_KEY.
 */
export function resolveKieKey(userKey?: string | null): string {
  const own = userKey?.trim();
  if (own) return own;
  const serverKey = process.env.KIE_API_KEY?.trim();
  if (!serverKey) {
    throw new KieError(
      "مفتاح kie.ai غير مُعد — أضف KIE_API_KEY على الخادم أو أضف مفتاحك الخاص من تبويب توليد الفيديو.",
      500
    );
  }
  return serverKey;
}

/**
 * Reads the kie.ai key the user saved from the video tab (encrypted in the
 * database, bound to their FLR- token). Returns null when nothing is saved or
 * the ciphertext can no longer be decrypted.
 *
 * Self-healing: rows encrypted with a legacy vault secret are re-encrypted
 * with the canonical secret on first successful read (see key-vault.ts).
 */
export async function getUserKieKey(userToken: string): Promise<string | null> {
  try {
    const row = await db.userKey.findUnique({
      where: { userToken },
      select: { kieApiKey: true },
    });
    if (!row?.kieApiKey) return null;
    const plain = decryptSecret(row.kieApiKey);
    if (plain && needsReencryption(row.kieApiKey)) {
      try {
        await db.userKey.update({
          where: { userToken },
          data: { kieApiKey: encryptSecret(plain) },
        });
      } catch {
        // ignore — the key still works via the keyring
      }
    }
    return plain;
  } catch {
    return null;
  }
}

/**
 * Full key resolution for a generation run: explicitly-supplied key (header /
 * MCP argument) → key saved in the database for this token → server env key.
 */
export async function resolveKieKeyForUser(
  userToken: string,
  userKey?: string | null
): Promise<string> {
  const own = userKey?.trim();
  if (own) return own;
  const saved = await getUserKieKey(userToken);
  if (saved) return saved;
  return resolveKieKey();
}

/**
 * Cheap, cost-free key check: recordInfo for a bogus task returns code 401
 * for an invalid key and code 422 ("recordInfo is null") for a valid one.
 * The available-credits endpoint (/api/v1/chat/credit) is queried best-effort.
 */
export async function validateKieKey(
  key: string
): Promise<{ valid: boolean; credits: number | null; unreachable?: boolean }> {
  const auth = { Authorization: `Bearer ${key}` };
  try {
    const probe = await fetch(
      `${KIE_BASE}/api/v1/jobs/recordInfo?taskId=flare-key-probe`,
      { headers: auth, signal: AbortSignal.timeout(20_000) }
    );
    const payload = (await probe.json().catch(() => null)) as { code?: number } | null;
    const code = payload?.code ?? probe.status;
    if (code === 401) return { valid: false, credits: null };
  } catch {
    return { valid: false, credits: null, unreachable: true };
  }

  let credits: number | null = null;
  try {
    const creditRes = await fetch(`${KIE_BASE}/api/v1/chat/credit`, {
      headers: auth,
      signal: AbortSignal.timeout(20_000),
    });
    const creditPayload = (await creditRes.json().catch(() => null)) as {
      code?: number;
      data?: number;
    } | null;
    if (creditPayload?.code === 200 && typeof creditPayload.data === "number") {
      credits = creditPayload.data;
    }
  } catch {
    // credits are informational — ignore failures
  }
  return { valid: true, credits };
}

/** Maps a kie.ai `code` into a friendly Arabic message (HTTP is always 200). */
export function mapKieCode(code: number, msg: string): KieError {
  switch (code) {
    case 200:
      return new KieError(`نجاح غير متوقع مع رسالة: ${msg}`, 200);
    case 401:
      return new KieError("مفتاح kie.ai غير صالح أو منتهي الصلاحية.", 500);
    case 402:
      return new KieError("رصيد kie.ai غير كافٍ لتوليد الفيديو.", 402);
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
export async function ensureKieImageUrl(rawUrl: string, userKey?: string | null): Promise<string> {
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
      headers: { Authorization: `Bearer ${resolveKieKey(userKey)}`, "Content-Type": "application/json" },
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
export async function createVideoTask(input: GrokVideoInput, userKey?: string | null): Promise<string> {
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
      headers: { Authorization: `Bearer ${resolveKieKey(userKey)}`, "Content-Type": "application/json" },
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

/** Fetches the current state of a kie.ai task (must use the key that created it). */
export async function getVideoTask(taskId: string, userKey?: string | null): Promise<KieTaskRecord> {
  let res: Response;
  try {
    res = await fetch(
      `${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      {
        headers: { Authorization: `Bearer ${resolveKieKey(userKey)}` },
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
