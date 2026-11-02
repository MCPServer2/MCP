import { db } from "@/lib/db";
import {
  COMET_BASE,
  FLARE_MODEL,
  CometError,
  adoptUserCometKey,
  dataUrlToBlob,
  buildSketchPrompt,
  mapUpstreamError,
  mimeForFormat,
} from "@/lib/comet-server";
import { s3MediaKey, uploadS3Media } from "@/lib/s3-storage";
import { keyFixHint } from "@/lib/key-vault";

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
  /**
   * The key the CALLER explicitly supplied for this request (MCP api_key
   * argument / x-cometapi-key header), if any — distinct from p.apiKey which
   * is the resolved (vault-first) key. Used as the retry fallback when the
   * resolved key fails with a balance/validity problem, then adopted as the
   * new saved key on success (the old one is replaced).
   */
  explicitApiKey?: string | null;
}

/** Runs the upstream CometAPI call and persists results as Generation rows. */
export async function runGeneration(p: RunParams): Promise<void> {
  const hasImage = Boolean(p.image);
  const usedReference = p.mode === "generate" && hasImage;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 280_000);

  // One upstream call with a given key — factored out so a key failure can be
  // retried with the caller-provided replacement key (see below).
  const doFetch = (apiKey: string): Promise<Response> => {
    if (p.mode === "generate" && !hasImage) {
      // Pure text-to-image → JSON generations endpoint.
      return fetch(`${COMET_BASE}/v1/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
    }
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
    return fetch(`${COMET_BASE}/v1/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: formData,
    });
  };

  let response: Response;
  try {
    response = await doFetch(p.apiKey);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errBody = await response.text();
    const first = mapUpstreamError(response.status, errBody);
    // NEW-KEY SEMANTICS: the resolved (saved) key failed with a balance or
    // validity problem, but the caller supplied a DIFFERENT explicit key —
    // retry with it; on success it is ADOPTED as the account's new saved key
    // (the old one is replaced, exactly like saving it on the website). The
    // newest key the user adds anywhere wins.
    const retryable =
      Boolean(p.explicitApiKey) &&
      p.explicitApiKey !== p.apiKey &&
      [401, 402, 403].includes(first.status);
    if (!retryable) {
      // Key problem with no replacement available → actionable fix-it tail so
      // the website user AND the chat assistant know exactly how to recover.
      if ([401, 402, 403].includes(first.status)) {
        throw new CometError(`${first.message} ${keyFixHint("comet")}`, first.status);
      }
      throw first;
    }
    let retry: Response;
    try {
      retry = await doFetch(p.explicitApiKey as string);
    } catch {
      throw new CometError(`${first.message} ${keyFixHint("comet")}`, first.status);
    }
    if (!retry.ok) {
      const second = mapUpstreamError(retry.status, await retry.text());
      throw new CometError(
        `${first.message} — والمفتاح البديل فشل أيضًا: ${second.message}. ${keyFixHint("comet")}`,
        first.status
      );
    }
    response = retry;
    // Adopt: the provided key replaces the dead saved one everywhere (site +
    // MCP). Best-effort — the generation itself already succeeded.
    await adoptUserCometKey(p.userToken, p.explicitApiKey as string).catch(() => undefined);
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
    const row = await db.generation.create({
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

    // Mirror the image into S3-compatible storage so media routes can serve it
    // by redirect (best-effort — the database copy stays the source of truth).
    await uploadS3Media(
      s3MediaKey("image", row.id, p.outputFormat),
      Buffer.from(img.b64_json as string, "base64"),
      mimeType
    ).catch(() => undefined);
  }

  await db.job.update({ where: { id: p.jobId }, data: { status: "done" } });
}
