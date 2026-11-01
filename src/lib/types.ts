export type GenerationMode = "generate" | "sketch" | "video";

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

/* ------------------------------------------------------------------ */
/* Video (grok-imagine-video-1-5-preview via kie.ai)                   */
/* ------------------------------------------------------------------ */

export interface VideoKeyframeInput {
  /** data URL or public http(s) image URL */
  url: string;
  /** timestamp in seconds, > 0 and < duration */
  timestamp: number;
}

export interface VideoGenerateRequestBody {
  userToken: string;
  prompt: string;
  aspectRatio: string;
  resolution: string;
  duration: number;
  audio: boolean;
  /** data URL / http URL of the first frame (Start Frame) */
  startFrame?: string | null;
  /** data URL / http URL of the last frame (End Frame) */
  endFrame?: string | null;
  /** loop image used as both first and last frame */
  loopFrame?: string | null;
  /** image to animate (image_urls) */
  referenceImage?: string | null;
  /** up to 4 mid-video keyframes */
  keyframes?: VideoKeyframeInput[];
}

export interface VideoItem {
  id: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  duration: number;
  audio: boolean;
  usedStartFrame: boolean;
  usedEndFrame: boolean;
  usedKeyframes: number;
  usedLoop: boolean;
  usedReference: boolean;
  mimeType: string;
  credits: number | null;
  createdAt: string;
}

/** POST /api/video response — the video runs async in the background. */
export interface VideoStartResponse {
  jobId?: string;
  error?: string;
}

/** GET /api/video/[jobId] response. */
export interface VideoJobStatusResponse {
  status: "pending" | "processing" | "done" | "error";
  items?: VideoItem[];
  error?: string;
}

export const ASPECT_RATIOS = ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;
export const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export const VIDEO_DURATION_MIN = 1;
export const VIDEO_DURATION_MAX = 15;
export const VIDEO_KEYFRAMES_MAX = 4;
