import { db } from "@/lib/db";
import { CometError } from "@/lib/comet-server";
import { runGeneration, type RunParams } from "@/lib/generation-service";
import {
  KieError,
  MAX_KEYFRAME_S,
} from "@/lib/kie-server";
import {
  recoverVideoJob,
  runVideoGeneration,
  serializeVideoRow,
  type VideoRunParams,
} from "@/lib/video-service";
import { serverMsg } from "@/lib/i18n";

/**
 * Flare Image Generator — a personal MCP (Model Context Protocol) server.
 *
 * Transport: Streamable HTTP (JSON-RPC 2.0) at /api/mcp?token=...&key=...
 * - POST with JSON-RPC messages; responses are application/json, or an SSE
 *   stream (with keepalive comments) when the client accepts text/event-stream.
 *   The SSE keepalives keep gateways/proxies from cutting the connection while
 *   a long generation (10-60s) is in flight.
 * - Stateless: no session ids, no server-initiated streams (GET/DELETE → 405).
 *
 * Credentials come from the server URL itself (the user's personal URL built
 * on the site): token = the anonymous FLR- gallery id, key = the user's own
 * CometAPI key. They are never persisted server-side.
 */

export const MCP_SERVER_INFO = {
  name: "flare-image-generator",
  title: "Flare Image Generator",
  version: "1.1.0",
} as const;

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

/** How long tools/call waits for a generation before replying "still running". */
const TOOL_WAIT_MS = 150_000;
const SSE_KEEPALIVE_MS = 5_000;
/**
 * Total base64 budget for inline image blocks in one tool result (≈13 MB of
 * binary). Images are included greedily while the budget lasts so chat clients
 * (Claude, ChatGPT developer mode, Cursor…) receive the actual image content;
 * any leftovers are still reachable through their markdown/URL links.
 */
const INLINE_BUDGET_CHARS = 18_000_000;

/* ------------------------------------------------------------------ */
/* JSON-RPC plumbing                                                   */
/* ------------------------------------------------------------------ */

type JsonRpcId = string | number | null;

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
}

type JsonRpcResult = Record<string, unknown>;

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: JsonRpcResult;
  error?: { code: number; message: string; data?: unknown };
}

function resultResponse(id: JsonRpcId, result: JsonRpcResult): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function errorResponse(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, MCP-Session-Id, Last-Event-ID, mcp-protocol-version, x-api-key",
  "Access-Control-Expose-Headers": "MCP-Session-Id",
};

const NO_STORE = { "Cache-Control": "no-store" } as const;

/* ------------------------------------------------------------------ */
/* Tool definitions                                                    */
/* ------------------------------------------------------------------ */

const SIZE_ENUM = ["auto", "1024x1024", "1536x1024", "1024x1536"] as const;
const QUALITY_ENUM = ["auto", "low", "medium", "high"] as const;
const FORMAT_ENUM = ["png", "jpeg", "webp"] as const;
const BACKGROUND_ENUM = ["auto", "transparent", "opaque"] as const;

const imageParams = {
  size: {
    type: "string",
    enum: [...SIZE_ENUM],
    description:
      "Image size. 'auto' lets the model choose; 1536x1024 is landscape, 1024x1536 is portrait, 1024x1024 is square. Default: auto.",
  },
  quality: {
    type: "string",
    enum: [...QUALITY_ENUM],
    description: "Rendering quality — low is fastest, high is most detailed. Default: auto.",
  },
  n: {
    type: "integer",
    minimum: 1,
    maximum: 4,
    description: "Number of images to generate (1-4). Default: 1.",
  },
  output_format: {
    type: "string",
    enum: [...FORMAT_ENUM],
    description: "Output file format. Default: png.",
  },
} as const;

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: "generate_image",
    title: "Generate image from text",
    description:
      "Generate one or more images from a text prompt using the GPT Image 2.5 Flare model. " +
      "Returns the image(s) directly plus ready-to-use markdown image links, and saves them to the user's private gallery. " +
      "Typical generation time is 10-60 seconds. To display the result in the chat, embed each returned " +
      "markdown image link (syntax: ![image](url)) in your reply.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Detailed description of the image: subject, scene, style, lighting, colors, angle. " +
            "The model can also render written text inside the image accurately.",
        },
        ...imageParams,
        background: {
          type: "string",
          enum: [...BACKGROUND_ENUM],
          description:
            "Background handling — 'transparent' requires png/webp output. Default: auto.",
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "edit_image",
    title: "Generate image from a reference image",
    description:
      "Generate an image guided by a reference image: sketch-to-image rendering, style transfer, " +
      "or editing an existing picture. Provide a publicly downloadable image URL (http/https) or a data: URL. " +
      "The reference's composition guides the result while the prompt describes the desired output. " +
      "To display the result in the chat, embed each returned markdown image link (syntax: ![image](url)) in your reply.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "What to generate from the reference image, e.g. 'turn this sketch into a realistic sunset scene' " +
            "or 'repaint this photo in watercolor style'.",
        },
        image_url: {
          type: "string",
          description:
            "URL of the source image — a publicly downloadable http(s) link or a data: URL. PNG/JPG/WEBP, max 10 MB.",
        },
        ...imageParams,
      },
      required: ["prompt", "image_url"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "check_job",
    title: "Check generation job status",
    description:
      "Check the status of a previously started generation job and fetch its images when ready. " +
      "Use this if generate_image or edit_image replied that the job is still running.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The jobId returned by the earlier tool call." },
      },
      required: ["job_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_image",
    title: "Fetch a stored gallery image",
    description:
      "Fetch one image from the user's private gallery by its image id and return it as displayable " +
      "image content plus a public markdown image URL. Use it to show a previously generated image " +
      "(or a gallery item from list_recent_images) inline in the chat.",
    inputSchema: {
      type: "object",
      properties: {
        image_id: {
          type: "string",
          description: "The image id, as returned by generate_image, check_job or list_recent_images.",
        },
      },
      required: ["image_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "list_recent_images",
    title: "List recent gallery images",
    description:
      "List the most recent images generated by this account, with their image ids, markdown image links " +
      "and the prompts used. Combine with get_image to display any of them inline in the chat.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "How many images to return (1-20). Default: 6.",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "generate_video",
    title: "Generate a video with Grok Imagine",
    description:
      "Generate a short MP4 video (with audio) using the grok-imagine-video-1-5-preview model via kie.ai. " +
      "Supports pure text-to-video, animating an input image (image_url), a Start Frame and/or End Frame " +
      "(start_frame_url / end_frame_url), a Loop frame (loop_url — used as both first and last frame, " +
      "cannot be combined with start/end frames) and up to 4 mid-video keyframes " +
      "(keyframes: [{url, timestamp_s}]). Videos typically finish in 40-120 seconds; if the tool replies " +
      "that the job is still running, poll it with check_video_job. The finished video is saved to the " +
      "user's private library; the result text contains its direct playable URL — share it in the chat " +
      "and embed it as a plain markdown link so the user can open/download it.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Describe the video: scene, action, camera movement, mood. Spoken dialogue written in the " +
            "prompt is rendered as audio. Max 4096 characters. With image_url you can reference it as @image1. " +
            "Optional when at least one frame is provided.",
        },
        image_url: {
          type: "string",
          description:
            "Optional image to animate (image-to-video) — public http(s) URL or data: URL. PNG/JPG/WEBP, max 20 MB. " +
            "Not supported at 1080p resolution.",
        },
        start_frame_url: {
          type: "string",
          description: "Optional Start Frame — the video opens from this image (public http(s) URL or data: URL).",
        },
        end_frame_url: {
          type: "string",
          description: "Optional End Frame — the video ends on this image (public http(s) URL or data: URL).",
        },
        loop_url: {
          type: "string",
          description:
            "Optional loop image used as BOTH the first and last frame (seamless loop). " +
            "Cannot be sent together with a different start/end frame.",
        },
        keyframes: {
          type: "array",
          maxItems: 4,
          description:
            "Optional mid-video keyframes (up to 4). Each item: {url: string, timestamp_s: number} where " +
            "timestamp_s is > 0 and < duration, and any two keyframes are at least 1/3 second apart.",
          items: {
            type: "object",
            properties: {
              url: { type: "string", description: "Keyframe image — public http(s) URL or data: URL." },
              timestamp_s: { type: "number", description: "When this frame appears, in seconds (> 0 and < duration)." },
            },
            required: ["url", "timestamp_s"],
            additionalProperties: false,
          },
        },
        aspect_ratio: {
          type: "string",
          enum: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
          description: "Video aspect ratio. Default: auto.",
        },
        resolution: {
          type: "string",
          enum: ["480p", "720p", "1080p"],
          description: "Video resolution (1080p disables image_url animation). Default: 480p (fastest).",
        },
        duration: {
          type: "integer",
          minimum: 1,
          maximum: 15,
          description: "Video duration in seconds (1-15). Default: 8.",
        },
        enable_audio: {
          type: "boolean",
          description: "Generate audio (dialogue/sound). Default: true.",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "check_video_job",
    title: "Check video job status",
    description:
      "Check the status of a previously started video generation and fetch the finished MP4 when ready. " +
      "Use this if generate_video replied that the job is still running.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The jobId returned by generate_video." },
      },
      required: ["job_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_video",
    title: "Fetch a stored video",
    description:
      "Fetch one video from the user's private library by its video id and return its direct playable URL " +
      "(and its source provider URL when still valid). Use it to re-share a previously generated video in the chat.",
    inputSchema: {
      type: "object",
      properties: {
        video_id: {
          type: "string",
          description: "The video id, as returned by generate_video, check_video_job or list_recent_videos.",
        },
      },
      required: ["video_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "list_recent_videos",
    title: "List recent videos",
    description:
      "List the most recent videos generated by this account, with their video ids, direct playable URLs " +
      "and the prompts used. Combine with get_video to re-share any of them in the chat.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "How many videos to return (1-20). Default: 6.",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
];

/* ------------------------------------------------------------------ */
/* Credentials & helpers                                               */
/* ------------------------------------------------------------------ */

export class ToolError extends Error {}

interface McpCreds {
  token: string | null;
  key: string | null;
}

function readCreds(request: Request): McpCreds {
  const { searchParams } = new URL(request.url);
  return {
    token: searchParams.get("token")?.trim() ?? null,
    key: searchParams.get("key")?.trim() ?? null,
  };
}

/** Public base URL for downloadable image links (respects reverse-proxy headers). */
function getBaseUrl(request: Request): string {
  const h = request.headers;
  const host =
    h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host")?.trim() || null;
  if (!host) return new URL(request.url).origin;
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(host);
  if (isLocal) return `http://${host}`;
  // Public hosts are reached via the https connection URL the user pasted from
  // the site card; internal proxy hops may downgrade x-forwarded-proto to http,
  // so https is always used for non-local hosts.
  return `https://${host}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function pickEnum(value: unknown, allowed: readonly string[], fallback: string): string {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? value
    : fallback;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Maps any thrown error to a user-friendly English message for the tool result. */
function mapToolError(error: unknown): string {
  if (error instanceof ToolError) return error.message;
  if (error instanceof KieError) return error.message;
  if (error instanceof CometError) {
    const en = serverMsg(error.message, "en");
    return en === error.message ? `${en} (HTTP ${error.status})` : en;
  }
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return "The request timed out. The model may be under load — please try again.";
  }
  return `Unexpected server error: ${error instanceof Error ? error.message : String(error)}`;
}

/** Downloads a reference image URL (or validates a data: URL) into a data URL. */
async function downloadImageAsDataUrl(rawUrl: string): Promise<string> {
  const url = rawUrl.trim();
  if (!url) throw new ToolError("The 'image_url' parameter is empty.");

  if (url.startsWith("data:")) {
    if (!/^data:image\/(png|jpe?g|webp)[;,]/i.test(url)) {
      throw new ToolError("The data: URL is not a PNG/JPG/WEBP image.");
    }
    const b64 = url.slice(url.indexOf(",") + 1);
    if (b64.length * 0.75 > 10 * 1024 * 1024) {
      throw new ToolError("The provided image exceeds the 10 MB limit.");
    }
    return url;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ToolError(`'${truncate(url, 120)}' is not a valid URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ToolError("Only http(s) image URLs are supported.");
  }

  let res: Response;
  try {
    res = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
      headers: { "User-Agent": "FlareImageMCP/1.0" },
    });
  } catch (e) {
    throw new ToolError(
      `Could not download the reference image (${e instanceof Error ? e.message : "network error"}). ` +
        "Make sure the URL is publicly accessible."
    );
  }
  if (!res.ok) {
    throw new ToolError(`Downloading the reference image failed with HTTP ${res.status}.`);
  }
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!contentType.startsWith("image/")) {
    throw new ToolError(`The URL did not return an image (got content-type '${contentType || "unknown"}').`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > 10 * 1024 * 1024) {
    throw new ToolError("The downloaded image exceeds the 10 MB limit.");
  }
  return `data:${contentType};base64,${buf.toString("base64")}`;
}

/* ------------------------------------------------------------------ */
/* Tool executions                                                     */
/* ------------------------------------------------------------------ */

interface ToolResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

/** Public URL for one stored image (token in the query keeps galleries private). */
function imageUrl(id: string, token: string, baseUrl: string): string {
  return `${baseUrl}/api/image/${id}?token=${encodeURIComponent(token)}`;
}

/**
 * Builds the success payload for finished jobs: inline image blocks (while the
 * budget lasts) plus text containing ready-to-use markdown image links so the
 * model can render the images inline in any chat client.
 */
async function buildFinishedJobResult(
  jobId: string,
  token: string,
  baseUrl: string
): Promise<ToolResult> {
  const rows = await db.generation.findMany({
    where: { jobId, userToken: token },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) {
    return textResult("The job finished but no images were stored. Please try generating again.", true);
  }

  const content: ToolResult["content"] = [];
  let budget = INLINE_BUDGET_CHARS;
  for (const r of rows) {
    if (r.data.length <= budget) {
      content.push({ type: "image", data: r.data, mimeType: r.mimeType || "image/png" });
      budget -= r.data.length;
    }
  }

  const links = rows
    .map((r, i) => {
      const url = imageUrl(r.id, token, baseUrl);
      return (
        `Image ${i + 1} — id: ${r.id} (${r.size} ${r.outputFormat})\n` +
        `![Image ${i + 1}](${url})\n` +
        url
      );
    })
    .join("\n");

  const first = rows[0];
  const text =
    `✅ Generated ${rows.length} image${rows.length > 1 ? "s" : ""} with GPT Image 2.5 Flare.\n` +
    `Prompt: "${truncate(first.prompt, 400)}"\n` +
    (first.revisedPrompt ? `Revised prompt: "${truncate(first.revisedPrompt, 400)}"\n` : "") +
    `\n${links}\n` +
    "IMPORTANT — how to display: if the image content blocks are visible to you, show them; " +
    "otherwise embed each markdown image link above (syntax: ![Image N](url)) directly in your reply " +
    "so the images render inline in the chat. Also share the plain URL(s) so the user can download. " +
    "The images are also saved in the user's private gallery on the Flare Studio website.";

  content.push({ type: "text", text });
  return { content };
}

async function execGenerateImage(
  args: Record<string, unknown>,
  creds: McpCreds,
  baseUrl: string,
  withReference: boolean
): Promise<ToolResult> {
  const token = creds.token as string;
  const key = creds.key as string;

  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  if (!prompt) {
    return textResult("The 'prompt' parameter is required — describe the image you want.", true);
  }

  let image: string | null = null;
  if (withReference) {
    const imageUrl = typeof args.image_url === "string" ? args.image_url.trim() : "";
    if (!imageUrl) {
      return textResult("The 'image_url' parameter is required — provide a public image URL or data URL.", true);
    }
    image = await downloadImageAsDataUrl(imageUrl);
  }

  const n = clampInt(args.n, 1, 4, 1);
  const size = pickEnum(args.size, SIZE_ENUM, "auto");
  const quality = pickEnum(args.quality, QUALITY_ENUM, "auto");
  const outputFormat = pickEnum(args.output_format, FORMAT_ENUM, "png");
  const background = pickEnum(args.background, BACKGROUND_ENUM, "auto");

  const job = await db.job.create({
    data: { userToken: token, mode: "generate", prompt, status: "pending" },
    select: { id: true },
  });

  const params: RunParams = {
    jobId: job.id,
    apiKey: key,
    userToken: token,
    mode: "generate",
    prompt,
    n,
    size,
    quality,
    outputFormat,
    background,
    autoEnhance: false,
    image,
  };

  // Start the generation and wait for it (bounded) while the SSE stream keeps
  // the connection alive. If we time out, the generation keeps running in the
  // background and the client can poll it via the check_job tool.
  const generation = runGeneration(params).then(
    () => ({ settled: true as const, error: null as unknown }),
    (e: unknown) => ({ settled: true as const, error: e })
  );
  const outcome = await Promise.race([
    generation,
    sleep(TOOL_WAIT_MS).then(() => ({ settled: false as const })),
  ]);

  if (!outcome.settled) {
    return textResult(
      `⏳ The image is still being generated (jobId: ${job.id}). ` +
        "The generation continues in the background — call the check_job tool with this jobId in a little while to fetch the result."
    );
  }
  if (outcome.error) {
    await db.job
      .update({
        where: { id: job.id },
        data: {
          status: "error",
          error:
            outcome.error instanceof CometError
              ? outcome.error.message
              : outcome.error instanceof Error && outcome.error.name === "AbortError"
                ? "انتهت مهلة الطلب. النموذج قد يكون تحت ضغط، جرّب مرة أخرى."
                : "حدث خطأ غير متوقع أثناء الاتصال بـ CometAPI.",
        },
      })
      .catch(() => undefined);
    return textResult(mapToolError(outcome.error), true);
  }

  return buildFinishedJobResult(job.id, token, baseUrl);
}

async function execCheckJob(
  args: Record<string, unknown>,
  creds: McpCreds,
  baseUrl: string
): Promise<ToolResult> {
  const token = creds.token as string;
  const jobId = typeof args.job_id === "string" ? args.job_id.trim() : "";
  if (!jobId) return textResult("The 'job_id' parameter is required.", true);

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.userToken !== token) {
    return textResult("Job not found (or it belongs to another token).", true);
  }

  if (job.status === "pending") {
    const elapsed = Math.round((Date.now() - new Date(job.createdAt).getTime()) / 1000);
    return textResult(
      `⏳ Still generating (${elapsed}s elapsed). Call check_job again shortly — when it is done the images ` +
        "are returned right here so you can display them in the chat."
    );
  }
  if (job.status === "error") {
    return textResult(serverMsg(job.error, "en") || "The generation failed. Please try again.", true);
  }
  return buildFinishedJobResult(job.id, token, baseUrl);
}

async function execListRecent(
  args: Record<string, unknown>,
  creds: McpCreds,
  baseUrl: string
): Promise<ToolResult> {
  const token = creds.token as string;
  const limit = clampInt(args.limit, 1, 20, 6);

  const rows = await db.generation.findMany({
    where: { userToken: token },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      prompt: true,
      mode: true,
      size: true,
      outputFormat: true,
      usedReference: true,
      createdAt: true,
    },
  });

  if (rows.length === 0) {
    return textResult("No images yet — call generate_image first.");
  }

  const lines = rows
    .map((r, i) => {
      const url = imageUrl(r.id, token, baseUrl);
      return (
        `${i + 1}. id: ${r.id} [${r.mode}${r.usedReference ? " + reference" : ""}, ${r.size} ${r.outputFormat}] ` +
        `"${truncate(r.prompt, 120)}" — ${new Date(r.createdAt).toISOString()}\n` +
        `   ![Image ${i + 1}](${url})\n   ${url}`
      );
    })
    .join("\n");

  return textResult(
    `🖼️ Your ${rows.length} most recent image${rows.length > 1 ? "s" : ""}:\n${lines}\n\n` +
      "To display one of these images in the chat: embed its markdown image link (syntax: ![image](url)) " +
      "in your reply, or call get_image with the image id to fetch the actual image content."
  );
}

/** Returns one stored image as an inline image block + markdown link. */
async function execGetImage(
  args: Record<string, unknown>,
  creds: McpCreds,
  baseUrl: string
): Promise<ToolResult> {
  const token = creds.token as string;
  const imageId = typeof args.image_id === "string" ? args.image_id.trim() : "";
  if (!imageId) {
    return textResult(
      "The 'image_id' parameter is required — use an id from generate_image, check_job or list_recent_images.",
      true
    );
  }

  const row = await db.generation.findFirst({ where: { id: imageId, userToken: token } });
  if (!row) {
    return textResult("Image not found (or it belongs to another token).", true);
  }

  const url = imageUrl(row.id, token, baseUrl);
  const text =
    `🖼️ Image ${row.id} (${row.size} ${row.outputFormat}${row.usedReference ? ", with reference" : ""})\n` +
    `Prompt: "${truncate(row.prompt, 300)}"\n` +
    `Generated: ${new Date(row.createdAt).toISOString()}\n\n` +
    `![image](${url})\n${url}\n\n` +
    "Display: the image content block above shows the image directly; otherwise embed the markdown " +
    "image link (syntax: ![image](url)) in your reply so it renders inline in the chat.";

  return {
    content: [
      { type: "image", data: row.data, mimeType: row.mimeType || "image/png" },
      { type: "text", text },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Video tools (grok-imagine-video-1-5-preview via kie.ai)             */
/* ------------------------------------------------------------------ */

/** Public URL for one stored video (token in the query keeps the library private). */
function videoUrl(id: string, token: string, baseUrl: string): string {
  return `${baseUrl}/api/video-file/${id}?token=${encodeURIComponent(token)}`;
}

/** Builds the success payload for a finished video job: playable URL + guidance. */
async function buildFinishedVideoResult(
  jobId: string,
  token: string,
  baseUrl: string
): Promise<ToolResult> {
  const rows = await db.video.findMany({
    where: { jobId, userToken: token },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) {
    return textResult("The video job finished but no video was stored. Please try generating again.", true);
  }

  const lines = rows
    .map((r, i) => {
      const url = videoUrl(r.id, token, baseUrl);
      const meta = `${r.resolution} ${r.aspectRatio} ${r.duration}s${r.audio ? " with audio" : " muted"}`;
      return (
        `Video ${i + 1} — id: ${r.id} (${meta})\n` +
        `Play/download: ${url}\n` +
        `[Open video ${i + 1}](${url})`
      );
    })
    .join("\n");

  const first = rows[0];
  const text =
    `🎬 Generated ${rows.length} video${rows.length > 1 ? "s" : ""} with Grok Imagine (grok-imagine-video-1-5-preview).\n` +
    `Prompt: "${truncate(first.prompt, 400)}"\n` +
    `\n${lines}\n\n` +
    "IMPORTANT — how to share: paste the Play/download URL(s) directly in your reply (many chat clients " +
    "render them as an inline video player), and also embed each as a markdown link " +
    "(syntax: [Open video](url)) so the user can always open or download the MP4. " +
    "The video is also saved in the user's private video library on the Flare Studio website.";

  return { content: [{ type: "text", text }] };
}

interface ParsedVideoArgs {
  prompt: string;
  imageUrl: string | null;
  startFrame: string | null;
  endFrame: string | null;
  loopFrame: string | null;
  keyframes: { url: string; timestamp: number }[];
  aspectRatio: string;
  resolution: string;
  duration: number;
  audio: boolean;
}

/** Validates generate_video arguments; returns an error string or the parsed args. */
function parseVideoArgs(args: Record<string, unknown>): { error?: string; parsed?: ParsedVideoArgs } {
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  const imageUrl = typeof args.image_url === "string" && args.image_url.trim() ? args.image_url.trim() : null;
  const startFrame =
    typeof args.start_frame_url === "string" && args.start_frame_url.trim() ? args.start_frame_url.trim() : null;
  const endFrame =
    typeof args.end_frame_url === "string" && args.end_frame_url.trim() ? args.end_frame_url.trim() : null;
  const loopFrame =
    typeof args.loop_url === "string" && args.loop_url.trim() ? args.loop_url.trim() : null;

  if (!prompt && !imageUrl && !startFrame && !endFrame && !loopFrame) {
    return { error: "Provide a prompt, or at least one frame/image URL to animate." };
  }
  if (prompt.length > 4096) {
    return { error: "The prompt exceeds the 4096 character limit." };
  }
  if (loopFrame && (startFrame || endFrame)) {
    return { error: "loop_url cannot be combined with start_frame_url/end_frame_url — pick one style." };
  }

  const duration = clampInt(args.duration, 1, 15, 8);
  const keyframes: { url: string; timestamp: number }[] = [];
  if (Array.isArray(args.keyframes)) {
    for (const raw of args.keyframes.slice(0, 4)) {
      if (!raw || typeof raw !== "object") continue;
      const obj = raw as Record<string, unknown>;
      const url = typeof obj.url === "string" ? obj.url.trim() : "";
      const ts = Number(obj.timestamp_s);
      if (!url) return { error: "Every keyframe needs a url." };
      if (!Number.isFinite(ts) || ts <= 0 || ts >= duration) {
        return { error: `Each keyframe timestamp_s must be > 0 and < duration (${duration}s).` };
      }
      keyframes.push({ url, timestamp: Math.min(ts, MAX_KEYFRAME_S) });
    }
    if (duration <= 1 && keyframes.length > 0) {
      return { error: "Keyframes need a duration longer than 1 second." };
    }
  }

  const resolution = pickEnum(args.resolution, ["480p", "720p", "1080p"], "480p");
  if (resolution === "1080p" && imageUrl) {
    return { error: "1080p does not support animating an image (image_url) — use 480p or 720p." };
  }

  return {
    parsed: {
      prompt,
      imageUrl,
      startFrame,
      endFrame,
      loopFrame,
      keyframes,
      aspectRatio: pickEnum(
        args.aspect_ratio,
        ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
        "auto"
      ),
      resolution,
      duration,
      audio: args.enable_audio === undefined ? true : Boolean(args.enable_audio),
    },
  };
}

async function execGenerateVideo(
  args: Record<string, unknown>,
  creds: McpCreds,
  baseUrl: string
): Promise<ToolResult> {
  const token = creds.token as string;

  const { error, parsed } = parseVideoArgs(args);
  if (error || !parsed) {
    return textResult(error ?? "Invalid arguments.", true);
  }

  if (!process.env.KIE_API_KEY?.trim()) {
    return textResult(
      "Video generation is not configured on the server yet (missing KIE_API_KEY environment variable).",
      true
    );
  }

  const job = await db.job.create({
    data: { userToken: token, mode: "video", prompt: parsed.prompt, status: "pending" },
    select: { id: true },
  });

  const params: VideoRunParams = {
    jobId: job.id,
    userToken: token,
    prompt: parsed.prompt,
    aspectRatio: parsed.aspectRatio,
    resolution: parsed.resolution,
    duration: parsed.duration,
    audio: parsed.audio,
    startFrame: parsed.startFrame,
    endFrame: parsed.endFrame,
    loopFrame: parsed.loopFrame,
    referenceImage: parsed.imageUrl,
    keyframes: parsed.keyframes,
  };

  // Videos usually finish in 40-120s — wait (bounded) while the SSE stream
  // keeps the connection alive; afterwards the client can poll check_video_job.
  const generation = runVideoGeneration(params).then(
    () => ({ settled: true as const, error: null as unknown }),
    (e: unknown) => ({ settled: true as const, error: e })
  );
  const outcome = await Promise.race([
    generation,
    sleep(TOOL_WAIT_MS).then(() => ({ settled: false as const })),
  ]);

  if (!outcome.settled) {
    return textResult(
      `⏳ The video is still generating (jobId: ${job.id}). Grok Imagine videos usually take 40-120 seconds — ` +
        "call the check_video_job tool with this jobId shortly to fetch the finished MP4."
    );
  }
  if (outcome.error) {
    await db.job
      .update({
        where: { id: job.id },
        data: {
          status: "error",
          error:
            outcome.error instanceof KieError
              ? outcome.error.message
              : outcome.error instanceof Error && outcome.error.name === "AbortError"
                ? "انتهت مهلة الاتصال بـ kie.ai. جرّب مرة أخرى."
                : "حدث خطأ غير متوقع أثناء توليد الفيديو.",
        },
      })
      .catch(() => undefined);
    return textResult(mapToolError(outcome.error), true);
  }

  return buildFinishedVideoResult(job.id, token, baseUrl);
}

async function execCheckVideoJob(
  args: Record<string, unknown>,
  creds: McpCreds,
  baseUrl: string
): Promise<ToolResult> {
  const token = creds.token as string;
  const jobId = typeof args.job_id === "string" ? args.job_id.trim() : "";
  if (!jobId) return textResult("The 'job_id' parameter is required.", true);

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.userToken !== token) {
    return textResult("Job not found (or it belongs to another token).", true);
  }
  if (job.mode !== "video") {
    return textResult("This jobId belongs to an image job — use the check_job tool instead.", true);
  }

  // Recovery pass — finishes the job from its stored kie.ai task if the
  // background worker died.
  if (job.status === "pending" || job.status === "processing") {
    await recoverVideoJob(job.id).catch(() => undefined);
  }

  const current = await db.job.findUnique({ where: { id: jobId } });
  if (current?.status === "pending" || current?.status === "processing") {
    const elapsed = Math.round((Date.now() - new Date(current.createdAt).getTime()) / 1000);
    return textResult(
      `⏳ Still generating (${elapsed}s elapsed). Grok Imagine videos usually take 40-120 seconds — ` +
        "call check_video_job again shortly."
    );
  }
  if (current?.status === "error") {
    return textResult(serverMsg(current.error, "en") || "The video generation failed. Please try again.", true);
  }
  return buildFinishedVideoResult(jobId, token, baseUrl);
}

/** Returns one stored video with its playable URL. */
async function execGetVideo(
  args: Record<string, unknown>,
  creds: McpCreds,
  baseUrl: string
): Promise<ToolResult> {
  const token = creds.token as string;
  const videoId = typeof args.video_id === "string" ? args.video_id.trim() : "";
  if (!videoId) {
    return textResult(
      "The 'video_id' parameter is required — use an id from generate_video, check_video_job or list_recent_videos.",
      true
    );
  }

  const row = await db.video.findFirst({ where: { id: videoId, userToken: token } });
  if (!row) {
    return textResult("Video not found (or it belongs to another token).", true);
  }

  const url = videoUrl(row.id, token, baseUrl);
  const meta = `${row.resolution} ${row.aspectRatio} ${row.duration}s${row.audio ? " with audio" : " muted"}`;
  const text =
    `🎬 Video ${row.id} (${meta})\n` +
    `Prompt: "${truncate(row.prompt, 300)}"\n` +
    `Generated: ${new Date(row.createdAt).toISOString()}\n\n` +
    `Play/download: ${url}\n` +
    `[Open video](${url})\n\n` +
    "Share the URL directly in your reply (many chat clients render it as an inline video player) " +
    "and embed it as a markdown link ([Open video](url)) so the user can always open or download it.";

  return { content: [{ type: "text", text }] };
}

async function execListRecentVideos(
  args: Record<string, unknown>,
  creds: McpCreds,
  baseUrl: string
): Promise<ToolResult> {
  const token = creds.token as string;
  const limit = clampInt(args.limit, 1, 20, 6);

  const rows = await db.video.findMany({
    where: { userToken: token },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { ...serializeVideoRowSelect },
  });

  if (rows.length === 0) {
    return textResult("No videos yet — call generate_video first.");
  }

  const lines = rows
    .map((r, i) => {
      const url = videoUrl(r.id, token, baseUrl);
      const flags = [
        r.usedStartFrame ? "start-frame" : null,
        r.usedEndFrame ? "end-frame" : null,
        r.usedLoop ? "loop" : null,
        r.usedKeyframes > 0 ? `${r.usedKeyframes} keyframes` : null,
        r.usedReference ? "animated-image" : null,
      ]
        .filter(Boolean)
        .join(", ");
      return (
        `${i + 1}. id: ${r.id} [${r.resolution} ${r.aspectRatio} ${r.duration}s${flags ? `, ${flags}` : ""}] ` +
        `"${truncate(r.prompt, 120)}" — ${new Date(r.createdAt).toISOString()}\n` +
        `   Play/download: ${url}\n   [Open video ${i + 1}](${url})`
      );
    })
    .join("\n");

  return textResult(
    `🎬 Your ${rows.length} most recent video${rows.length > 1 ? "s" : ""}:\n${lines}\n\n` +
      "To share one of these videos in the chat: paste its Play/download URL directly, " +
      "or call get_video with the video id."
  );
}

/** Shared select for list_recent_videos (kept near its only consumer). */
const serializeVideoRowSelect = {
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
} as const;

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

function requireCreds(creds: McpCreds, needKey: boolean): string | null {
  const token = creds.token;
  if (!token || token.length < 8 || token.length > 80) {
    return "This MCP server URL must include your personal gallery token: /api/mcp?token=FLR-XXXXX-XXXXX&key=sk-… " +
      "Rebuild the URL on the Flare Studio website (MCP section) and reconnect.";
  }
  if (needKey && (!creds.key || creds.key.length < 8)) {
    return "This MCP server URL must include your CometAPI key: /api/mcp?token=FLR-…&key=sk-… " +
      "Rebuild the URL on the Flare Studio website (MCP section) and reconnect.";
  }
  return null;
}

async function dispatchRequest(
  msg: JsonRpcMessage,
  creds: McpCreds,
  baseUrl: string
): Promise<JsonRpcResponse | null> {
  const id = msg.id ?? null;
  const method = msg.method ?? "";
  const params = (msg.params ?? {}) as Record<string, unknown>;

  switch (method) {
    case "initialize": {
      const requested =
        typeof params.protocolVersion === "string" ? params.protocolVersion : SUPPORTED_PROTOCOL_VERSIONS[0];
      const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as string[]).includes(requested)
        ? requested
        : SUPPORTED_PROTOCOL_VERSIONS[0];
      return resultResponse(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { ...MCP_SERVER_INFO },
        instructions:
          "Flare Studio creates images AND videos. Images: the GPT Image 2.5 Flare model — use generate_image " +
          "for text prompts, edit_image when the user supplies a reference or sketch image URL, check_job to " +
          "poll a running generation, get_image / list_recent_images for the gallery. Videos: the Grok Imagine " +
          "model (grok-imagine-video-1-5-preview) — use generate_video for text-to-video, image animation, " +
          "Start/End frames, Loop frames and keyframes; poll with check_video_job, and use get_video / " +
          "list_recent_videos for the video library. Image results include ready-to-use markdown image links " +
          "(embed them as ![image](url) in your reply); video results include direct playable URLs (paste them " +
          "in your reply and embed as markdown links).",
      });
    }

    case "ping":
      return resultResponse(id, {});

    case "tools/list":
      return resultResponse(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: t.annotations,
        })),
      });

    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        return errorResponse(id, -32602, `Unknown tool: ${name || "(missing)"}`);
      }

      const needKey = name === "generate_image" || name === "edit_image";
      const credsError = requireCreds(creds, needKey);
      if (credsError) return resultResponse(id, { ...textResult(credsError, true), isError: true });

      try {
        let result: ToolResult;
        if (name === "generate_image") result = await execGenerateImage(args, creds, baseUrl, false);
        else if (name === "edit_image") result = await execGenerateImage(args, creds, baseUrl, true);
        else if (name === "check_job") result = await execCheckJob(args, creds, baseUrl);
        else if (name === "get_image") result = await execGetImage(args, creds, baseUrl);
        else if (name === "generate_video") result = await execGenerateVideo(args, creds, baseUrl);
        else if (name === "check_video_job") result = await execCheckVideoJob(args, creds, baseUrl);
        else if (name === "get_video") result = await execGetVideo(args, creds, baseUrl);
        else if (name === "list_recent_videos") result = await execListRecentVideos(args, creds, baseUrl);
        else result = await execListRecent(args, creds, baseUrl);
        return resultResponse(id, { ...result });
      } catch (error) {
        return resultResponse(id, { ...textResult(mapToolError(error), true), isError: true });
      }
    }

    default:
      return errorResponse(id, -32601, `Method not found: ${method}`);
  }
}

/* ------------------------------------------------------------------ */
/* HTTP entry point                                                    */
/* ------------------------------------------------------------------ */

function acceptsSse(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  return accept.toLowerCase().includes("text/event-stream");
}

function jsonRpcBody(responses: JsonRpcResponse[]): string {
  return JSON.stringify(responses.length === 1 ? responses[0] : responses);
}

/** POST /api/mcp — Streamable HTTP JSON-RPC endpoint. */
export async function handleMcpPost(request: Request): Promise<Response> {
  const creds = readCreds(request);
  const baseUrl = getBaseUrl(request);

  let messages: JsonRpcMessage[];
  try {
    const body = (await request.json()) as JsonRpcMessage | JsonRpcMessage[];
    messages = Array.isArray(body) ? body : [body];
  } catch {
    return new Response(
      JSON.stringify(errorResponse(null, -32700, "Parse error: request body must be JSON")),
      { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...NO_STORE } }
    );
  }

  const requests = messages.filter(
    (msg): msg is JsonRpcMessage =>
      Boolean(msg) && typeof msg === "object" && msg.id !== undefined && msg.id !== null
  );

  // Notifications only (no id) → nothing to answer.
  if (requests.length === 0) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  const encodeResponse = (res: JsonRpcResponse): string =>
    `event: message\ndata: ${JSON.stringify(res)}\n\n`;

  if (acceptsSse(request)) {
    // Stream each JSON-RPC response as soon as it is computed. While a long
    // tool call (10-60s generation) is in flight, periodic keepalive comments
    // stop gateways/proxies from cutting the idle connection. If the client
    // disconnects anyway, the generation still finishes and is stored in the
    // database (the user can fetch it later via check_job or the website).
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const safeEnqueue = (chunk: string) => {
          if (!open) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            open = false;
          }
        };
        const keepalive = setInterval(() => safeEnqueue(": keepalive\n\n"), SSE_KEEPALIVE_MS);
        try {
          for (const msg of requests) {
            const res = await dispatchSafe(msg, creds, baseUrl);
            safeEnqueue(encodeResponse(res));
            if (!open) break;
          }
        } finally {
          clearInterval(keepalive);
          open = false;
          try {
            controller.close();
          } catch {
            // already closed / client gone
          }
        }
      },
      cancel() {
        // Client disconnected — nothing to clean (keepalive is cleared in start).
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        ...CORS_HEADERS,
      },
    });
  }

  const responses: JsonRpcResponse[] = [];
  for (const msg of requests) {
    responses.push(await dispatchSafe(msg, creds, baseUrl));
  }
  return new Response(jsonRpcBody(responses), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...NO_STORE },
  });
}

/** Dispatches one request, converting unexpected throws into JSON-RPC errors. */
async function dispatchSafe(
  msg: JsonRpcMessage,
  creds: McpCreds,
  baseUrl: string
): Promise<JsonRpcResponse> {
  try {
    const res = await dispatchRequest(msg, creds, baseUrl);
    return res ?? errorResponse(msg.id ?? null, -32603, "Internal error: no response produced");
  } catch (error) {
    return errorResponse(
      msg.id ?? null,
      -32603,
      `Internal error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
