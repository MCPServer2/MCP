import type { GenerationMode } from "./types";

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
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof parsed.error === "string") detail = parsed.error;
    else detail = parsed.error?.message ?? parsed.message ?? "";
  } catch {
    detail = body.slice(0, 300);
  }

  const msg =
    status === 401 || status === 403
      ? "مفتاح API غير صالح أو منتهي الصلاحية. تأكد من إضافة مفتاح CometAPI صحيح."
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
