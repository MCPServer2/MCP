import { db } from "@/lib/db";
import {
  COMET_BASE,
  FLARE_MODEL,
  CometError,
  dataUrlToBlob,
  buildSketchPrompt,
  mapUpstreamError,
  mimeForFormat,
} from "@/lib/comet-server";

/**
 * Shared generation pipeline used by both the website (POST /api/generate,
 * executed via after()) and the MCP server (/api/mcp tools/call).
 * Runs the upstream CometAPI call and persists the results — throws on failure;
 * the caller is responsible for persisting the error onto the Job row.
 */

export interface CometImageItem {
  b64_json?: string;
  url?: string;
  revised_prompt?: string;
}

export interface CometImageResponse {
  created?: number;
  data?: CometImageItem[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

export interface RunParams {
  jobId: string;
  apiKey: string;
  userToken: string;
  mode: "generate" | "sketch";
  prompt: string;
  n: number;
  size: string;
  quality: string;
  outputFormat: string;
  background?: string;
  autoEnhance: boolean;
  image?: string | null;
}

/** Runs the upstream CometAPI call and persists results as Generation rows. */
export async function runGeneration(p: RunParams): Promise<void> {
  const hasImage = Boolean(p.image);
  const usedReference = p.mode === "generate" && hasImage;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 280_000);

  let response: Response;
  try {
    if (p.mode === "generate" && !hasImage) {
      // Pure text-to-image → JSON generations endpoint.
      response = await fetch(`${COMET_BASE}/v1/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${p.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: FLARE_MODEL,
          prompt: p.prompt,
          n: p.n,
          size: p.size,
          quality: p.quality,
          output_format: p.outputFormat,
          ...(p.background ? { background: p.background } : {}),
        }),
      });
    } else {
      // Sketch mode (source drawing) OR text-to-image with a reference image
      // → multipart edits endpoint, per CometAPI docs.
      const formData = new FormData();
      const blob = dataUrlToBlob(p.image as string);
      const ext = blob.type.includes("jpeg") ? "jpg" : blob.type.includes("webp") ? "webp" : "png";
      formData.append("image", blob, p.mode === "sketch" ? `sketch.${ext}` : `reference.${ext}`);
      formData.append("model", FLARE_MODEL);
      formData.append(
        "prompt",
        p.mode === "sketch" ? buildSketchPrompt(p.prompt, p.autoEnhance) : p.prompt
      );
      formData.append("n", String(p.n));
      if (p.size && p.size !== "auto") formData.append("size", p.size);
      if (p.quality && p.quality !== "auto") formData.append("quality", p.quality);
      formData.append("output_format", p.outputFormat);
      if (p.mode === "generate" && p.background && p.background !== "auto") {
        formData.append("background", p.background);
      }

      response = await fetch(`${COMET_BASE}/v1/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${p.apiKey}` },
        signal: controller.signal,
        body: formData,
      });
    }
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errBody = await response.text();
    throw mapUpstreamError(response.status, errBody);
  }

  const payload = (await response.json()) as CometImageResponse;
  const images = payload.data ?? [];
  const b64Images = images.filter((img) => img.b64_json);

  if (b64Images.length === 0) {
    throw new CometError("لم يُرجع المزود أي صورة. جرّب تعديل الوصف أو المعاملات.", 502);
  }

  const mimeType = mimeForFormat(p.outputFormat);
  const createdAt = new Date();

  for (const img of b64Images) {
    await db.generation.create({
      data: {
        userToken: p.userToken,
        jobId: p.jobId,
        prompt: p.prompt,
        mode: p.mode,
        model: FLARE_MODEL,
        size: p.size,
        quality: p.quality,
        outputFormat: p.outputFormat,
        background: p.background ?? null,
        revisedPrompt: img.revised_prompt ?? null,
        usedReference,
        mimeType,
        data: img.b64_json as string,
        inputTokens: payload.usage?.input_tokens ?? null,
        outputTokens: payload.usage?.output_tokens ?? null,
        totalTokens: payload.usage?.total_tokens ?? null,
        createdAt,
      },
    });
  }

  await db.job.update({ where: { id: p.jobId }, data: { status: "done" } });
}
