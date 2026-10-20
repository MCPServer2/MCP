export type GenerationMode = "generate" | "sketch";

export interface GenerateRequestBody {
  userToken: string;
  mode: GenerationMode;
  prompt: string;
  size: string;
  quality: string;
  outputFormat: string;
  n: number;
  background?: string;
  autoEnhance?: boolean;
  /**
   * data URL of an uploaded image:
   * - sketch mode: the source drawing (required)
   * - generate mode: optional visual reference guiding the generation
   */
  image?: string | null;
}

export interface GenerationItem {
  id: string;
  prompt: string;
  mode: GenerationMode;
  model: string;
  size: string;
  quality: string;
  outputFormat: string;
  background: string | null;
  revisedPrompt: string | null;
  usedReference: boolean | null;
  mimeType: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  createdAt: string;
}

export interface KeyUsageInfo {
  name: string;
  totalGranted: number;
  totalUsed: number;
  totalAvailable: number;
  unlimitedQuota: boolean;
  expiresAt: number;
}

/** POST /api/generate response — the generation runs async in the background. */
export interface GenerateStartResponse {
  jobId?: string;
  error?: string;
}

/** GET /api/generate/[jobId] response. */
export interface JobStatusResponse {
  status: "pending" | "done" | "error";
  items?: GenerationItem[];
  error?: string;
}

/** Pending job info returned by GET /api/generate?token=... */
export interface PendingJobInfo {
  id: string;
  mode: string;
  createdAt: Date | string;
}

// Option values only — display labels live in src/lib/i18n.ts (ar/en).
export const SIZES = ["1024x1024", "1536x1024", "1024x1536", "auto"] as const;

export const QUALITIES = ["auto", "low", "medium", "high"] as const;

export const OUTPUT_FORMATS = ["png", "jpeg", "webp"] as const;

export const BACKGROUNDS = ["auto", "transparent", "opaque"] as const;
