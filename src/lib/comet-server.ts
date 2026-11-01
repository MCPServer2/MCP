import { db } from "@/lib/db";
import { decryptSecret, encryptSecret, needsReencryption } from "./key-vault";
import type { GenerationMode, KeyUsageInfo } from "./types";

export const COMET_BASE = "https://api.cometapi.com";
export const FLARE_MODEL = "gpt-image-2.5-flare";

/** Mirrors CometAPI/OpenAI style errors into friendly Arabic messages. */
export class CometError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function mapUpstreamError(status: number, body: string): CometError {
  let detail = "";
  let code = "";
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; code?: string } | string;
      message?: string;
      code?: string;
    };
    if (typeof parsed.error === "string") detail = parsed.error;
    else {
      detail = parsed.error?.message ?? parsed.message ?? "";
      code = parsed.error?.code ?? parsed.code ?? "";
    }
  } catch {
    detail = body.slice(0, 300);
  }

  // CometAPI reports a ZERO ACCOUNT BALANCE as HTTP 403 with code
  // "insufficient_user_quota" ("pre-consume quota failed, organization and
  // owner combined quota is zero"). The key itself is VALID — labelling this
  // "invalid key" sends the user down the wrong debugging path, so it must be
  // surfaced as a balance problem.
  const haystack = `${detail} ${code}`.toLowerCase();
  const insufficientQuota =
    code === "insufficient_user_quota" ||
    haystack.includes("insufficient_user_quota") ||
    haystack.includes("pre-consume quota failed") ||
    haystack.includes("quota is zero") ||
    haystack.includes("insufficient quota");

  const msg =
    insufficientQuota
      ? "رصيد حساب CometAPI غير كافٍ — المفتاح صالح لكن يجب شحن الرصيد أولاً من cometapi.com."
      : status === 401
        ? "مفتاح API غير صالح أو منتهي الصلاحية. تأكد من إضافة مفتاح CometAPI صحيح."
        : status === 403
          ? "الوصول مرفوض (403) — المفتاح لا يملك صلاحية لهذا الطلب أو النموذج."
          : status === 429
            ? "تم تجاوز حد معدل الطلبات (429). انتظر قليلاً ثم أعد المحاولة."
            : status === 402
              ? "الرصيد غير كافٍ في مفتاح CometAPI الخاص بك."
              : status >= 500
                ? "خطأ في خوادم CometAPI. أعد المحاولة بعد قليل."
                : detail
                  ? `رفض المزود الطلب: ${detail}`
                  : `فشل الطلب (${status}). أعد المحاولة.`;

  return new CometError(msg, status);
}

export function cometHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * The "Sketch" capability of GPT Image 2.5: turn a rough drawing into a fully
 * rendered image while preserving the composition of the original sketch.
 */
export function buildSketchPrompt(prompt: string, autoEnhance: boolean): string {
  const cleaned = prompt.trim();
  if (!autoEnhance) return cleaned;
  const base =
    "Turn this sketch / drawing into a fully rendered, high-quality digital image. " +
    "Preserve the composition, shapes and intent of the original sketch, and render it " +
    "with rich colors, realistic lighting, coherent proportions and fine details.";
  return cleaned ? `${base} ${cleaned}` : base;
}

/** Converts a data URL ("data:image/png;base64,....") into a Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new CometError("صورة الإدخال غير صالحة.", 400);
  const mime = match[1] || "image/png";
  const isBase64 = Boolean(match[2]);
  const raw = match[3];
  const binary = isBase64 ? Buffer.from(raw, "base64") : Buffer.from(decodeURIComponent(raw), "binary");
  return new Blob([new Uint8Array(binary)], { type: mime });
}

export function mimeForFormat(format: string): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

export function sanitizeMode(mode: unknown): GenerationMode {
  return mode === "sketch" ? "sketch" : "generate";
}

/* ------------------------------------------------------------------ */
/* CometAPI key vault (same pattern as the kie.ai key)                 */
/* ------------------------------------------------------------------ */

/**
 * Reads the CometAPI key the user saved from the images tab (encrypted in the
 * database, bound to their FLR- token). Returns null when nothing is saved or
 * the ciphertext can no longer be decrypted.
 *
 * Self-healing: rows encrypted by an environment whose vault secret differed
 * (legacy DATABASE_URL-based secrets) are transparently re-encrypted with the
 * canonical secret on first successful read.
 */
export async function getUserCometKey(userToken: string): Promise<string | null> {
  try {
    const row = await db.userKey.findUnique({
      where: { userToken },
      select: { cometApiKey: true },
    });
    if (!row?.cometApiKey) return null;
    const plain = decryptSecret(row.cometApiKey);
    if (plain && needsReencryption(row.cometApiKey)) {
      // Best-effort lazy migration to the canonical vault secret.
      try {
        await db.userKey.update({
          where: { userToken },
          data: { cometApiKey: encryptSecret(plain) },
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
 * Full key resolution for a generation run: the key saved ENCRYPTED in the
 * vault (UserKey table) for this token ALWAYS wins — the key the account owner
 * added on the website is the account's key. An explicitly-supplied key
 * (x-cometapi-key header / MCP api_key argument / legacy &key= URL parameter)
 * is only a FALLBACK for tokens with nothing saved — a stale key embedded in
 * an old MCP URL must never shadow the vault. Returns null when no key is
 * available; callers turn that into an actionable message.
 */
export async function resolveCometKeyForUser(
  userToken: string,
  userKey?: string | null
): Promise<string | null> {
  const saved = await getUserCometKey(userToken);
  if (saved) return saved;
  const own = userKey?.trim();
  return own || null;
}

/**
 * Free key probe via GET /api/usage/token — no credits are spent. Returns the
 * quota payload so the vault can store an informational balance snapshot.
 */
export async function validateCometKey(
  key: string
): Promise<{ valid: boolean; unreachable?: boolean; usage?: KeyUsageInfo }> {
  try {
    const response = await fetch(`${COMET_BASE}/api/usage/token`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      // Upstream 5xx (or odd statuses) must NOT mark a possibly-valid key as
      // invalid — callers store it as "unreachable" instead of rejecting it.
      return { valid: false, unreachable: response.status >= 500 || response.status === 408 };
    }

    const payload = (await response.json().catch(() => null)) as {
      code?: boolean;
      data?: {
        name?: string;
        total_granted?: number;
        total_used?: number;
        total_available?: number;
        unlimited_quota?: boolean;
        expires_at?: number;
      };
    } | null;
    if (!payload || payload.code === false || !payload.data) return { valid: false };

    const d = payload.data;
    return {
      valid: true,
      usage: {
        name: d.name ?? "",
        totalGranted: d.total_granted ?? 0,
        totalUsed: d.total_used ?? 0,
        totalAvailable: d.total_available ?? 0,
        unlimitedQuota: Boolean(d.unlimited_quota),
        expiresAt: d.expires_at ?? 0,
      },
    };
  } catch {
    return { valid: false, unreachable: true };
  }
}
