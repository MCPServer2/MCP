import { db } from "@/lib/db";
import { CometError } from "@/lib/comet-server";
import { runGeneration, type RunParams } from "@/lib/generation-service";
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
  version: "1.0.0",
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
          "Flare Image Generator creates images with the GPT Image 2.5 Flare model: text-to-image, " +
          "reference-image edits and sketch-to-image. Use generate_image for text prompts, edit_image when " +
          "the user supplies a reference or sketch image URL, check_job to poll a running generation, " +
          "get_image to fetch a stored image by id, and list_recent_images to browse the gallery. " +
          "Every result includes ready-to-use markdown image links — always embed them (syntax: " +
          "![image](url)) in your reply so the images render inline in the chat.",
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
