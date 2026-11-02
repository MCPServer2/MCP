import { db } from "@/lib/db";
import {
  GROK_VIDEO_MODEL,
  KieError,
  createVideoTask,
  ensureKieImageUrl,
  getVideoTask,
  getUserKieKey,
  type VideoKeyframe,
} from "@/lib/kie-server";
import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import type { VideoItem } from "@/lib/types";
import { s3MediaKey, uploadS3Media } from "@/lib/s3-storage";

/**
 * Shared video generation pipeline used by both the website (POST /api/video,
 * executed via after()) and the MCP server (generate_video tool).
 *
 * Lifecycle:
 *  1. Claim the Job row (pending → processing) so a single worker handles it.
 *  2. Upload any data-URL frames to the kie.ai file service (they must be
 *     reachable by the video model) and create the upstream task.
 *  3. Persist the kie.ai taskId, then poll until the MP4 is ready.
 *  4. Download the MP4, store it base64 in the Video table, mark the Job done.
 *
 * If the background worker dies (serverless timeout), GET /api/video/[jobId]
 * and the MCP check_video_job tool call recoverVideoJob() which re-claims the
 * job (using the stored taskId) and finishes the work on demand.
 */

const POLL_INTERVAL_MS = 5_000;
/** Poll budget inside after(); stays under the 300s serverless cap. */
const POLL_BUDGET_MS = 240_000;
/** A "processing" job older than this is considered abandoned by its worker. */
const STALE_PROCESSING_MS = 150_000;
/** A "pending" video job older than this is dead (createTask never ran). */
const STALE_PENDING_MS = 8 * 60 * 1000;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024; // 80 MB binary per video

export interface VideoRunParams {
  jobId: string;
  userToken: string;
  prompt: string;
  aspectRatio: string;
  resolution: string;
  duration: number;
  audio: boolean;
  startFrame?: string | null;
  endFrame?: string | null;
  loopFrame?: string | null;
  referenceImage?: string | null;
  keyframes?: VideoKeyframe[] | null;
  /** User-supplied kie.ai key (BYOK); null/undefined = server's built-in key. */
  kieKey?: string | null;
}

/** Atomically claims a pending job (or re-claims an abandoned processing one). */
async function claimJob(jobId: string, allowStaleProcessing: boolean): Promise<boolean> {
  const claimed = await db.job.updateMany({
    where: { id: jobId, status: "pending" },
    data: { status: "processing" },
  });
  if (claimed.count === 1) return true;
  if (allowStaleProcessing) {
    const stale = await db.job.updateMany({
      where: {
        id: jobId,
        status: "processing",
        updatedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) },
      },
      data: { status: "processing", updatedAt: new Date() },
    });
    return stale.count === 1;
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Downloads the finished MP4 and stores it as a Video row; marks job done. */
async function storeFinishedVideo(
  jobId: string,
  userToken: string,
  taskId: string,
  videoUrl: string,
  p: VideoRunParams,
  credits: number | null
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(videoUrl, {
      signal: AbortSignal.timeout(120_000),
      redirect: "follow",
    });
  } catch (e) {
    throw new KieError(
      `تعذر تنزيل الفيديو الناتج (${e instanceof Error ? e.message : "خطأ شبكة"}).`,
      502
    );
  }
  if (!res.ok) {
    throw new KieError(`فشل تنزيل الفيديو الناتج (HTTP ${res.status}).`, 502);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_VIDEO_BYTES) {
    throw new KieError("حجم الفيديو الناتج أكبر من الحد المسموح لتخزينه.", 502);
  }

  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "video/mp4";
  // Extract a preview frame up-front so the MCP tools can show the video
  // inline in chat clients without waiting for a lazy backfill.
  const poster = await extractPosterFrame(buf).catch(() => null);
  const videoRow = await db.video.create({
    data: {
      userToken,
      jobId,
      taskId,
      prompt: p.prompt,
      model: GROK_VIDEO_MODEL,
      aspectRatio: p.aspectRatio,
      resolution: p.resolution,
      duration: p.duration,
      audio: p.audio,
      usedStartFrame: Boolean(p.startFrame),
      usedEndFrame: Boolean(p.endFrame),
      usedKeyframes: p.keyframes?.length ?? 0,
      usedLoop: Boolean(p.loopFrame),
      usedReference: Boolean(p.referenceImage),
      sourceUrl: videoUrl,
      mimeType,
      data: buf.toString("base64"),
      poster: poster?.base64 ?? null,
      posterMime: poster?.mime ?? null,
      credits,
    },
  });

  // Mirror the MP4 + poster into S3-compatible storage so media routes can
  // serve them by redirect — large videos must not pass through the serverless
  // response body. Best-effort: the database copy stays the source of truth.
  await uploadS3Media(s3MediaKey("video", videoRow.id, "mp4"), buf, mimeType).catch(() => undefined);
  if (poster) {
    await uploadS3Media(s3MediaKey("poster", videoRow.id, "jpg"), Buffer.from(poster.base64, "base64"), poster.mime).catch(
      () => undefined
    );
  }

  await db.job.update({ where: { id: jobId }, data: { status: "done" } });
}

/* ------------------------------------------------------------------ */
/* Poster frames — make videos VISIBLE inside chat clients             */
/* ------------------------------------------------------------------ */

const POSTER_MAX_W = 768;

/**
 * Resolves the ffmpeg binary path. Prefers the bundled static binary
 * (@ffmpeg-installer/ffmpeg — required on Vercel serverless where no system
 * ffmpeg exists), falling back to the system "ffmpeg" (sandbox/dev).
 * Cached after the first call; a failed import is not fatal because posters
 * are best-effort.
 */
let ffmpegPathPromise: Promise<string | null> | null = null;
function resolveFfmpegPath(): Promise<string | null> {
  ffmpegPathPromise ??= (async () => {
    try {
      const mod = (await import("@ffmpeg-installer/ffmpeg")) as { default?: { path?: string }; path?: string };
      const installer = mod.default ?? mod;
      if (typeof installer?.path === "string" && installer.path) return installer.path;
    } catch {
      // Package missing (e.g. slim dev install) → system ffmpeg below.
    }
    return null;
  })();
  return ffmpegPathPromise;
}

/**
 * Extracts a representative JPEG frame from an MP4 buffer with ffmpeg.
 * Prefers a frame at ~1s (avoids an all-black opener); falls back to the
 * first frame. Returns null on any failure — posters are best-effort and
 * must never break video delivery.
 */
async function extractPosterFrame(buf: Buffer): Promise<{ base64: string; mime: string } | null> {
  const ffmpegBin = (await resolveFfmpegPath()) ?? "ffmpeg";
  const dir = await mkdtemp(path.join(tmpdir(), "flare-poster-"));
  const src = path.join(dir, "input.mp4");
  const out = path.join(dir, "poster.jpg");
  try {
    await writeFile(src, buf);
    const attempt = (atSec: number) =>
      new Promise<boolean>((resolve) => {
        const proc = spawn(
          ffmpegBin,
          [
            "-hide_banner", "-loglevel", "error",
            "-ss", atSec.toFixed(1),
            "-i", src,
            "-vframes", "1",
            "-vf", `scale='min(${POSTER_MAX_W},iw)':-2`,
            "-q:v", "4",
            "-y", out,
          ],
          { stdio: "ignore" }
        );
        const timer = setTimeout(() => {
          proc.kill("SIGKILL");
          resolve(false);
        }, 20_000);
        proc.on("error", () => {
          clearTimeout(timer);
          resolve(false);
        });
        proc.on("close", (code) => {
          clearTimeout(timer);
          resolve(code === 0);
        });
      });

    // Try 1s first; a video shorter than 1s still yields the first frame.
    if (!(await attempt(1.0)) && !(await attempt(0))) return null;

    const jpg = await readFile(out);
    if (jpg.byteLength === 0) return null;
    return { base64: jpg.toString("base64"), mime: "image/jpeg" };
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Returns the stored poster for a video, extracting and caching it on first
 * use — this also backfills videos saved before posters existed. Best-effort:
 * returns null when ffmpeg is unavailable or the payload is unreadable.
 */
export async function ensureVideoPoster(
  videoId: string
): Promise<{ base64: string; mime: string } | null> {
  try {
    const row = await db.video.findUnique({
      where: { id: videoId },
      select: { poster: true, posterMime: true, data: true },
    });
    if (!row?.data) return null;
    if (row.poster) return { base64: row.poster, mime: row.posterMime || "image/jpeg" };

    const extracted = await extractPosterFrame(Buffer.from(row.data, "base64"));
    if (!extracted) return null;
    await db.video
      .update({ where: { id: videoId }, data: { poster: extracted.base64, posterMime: extracted.mime } })
      .catch(() => undefined);
    // Mirror the freshly extracted poster into storage (best-effort).
    await uploadS3Media(
      s3MediaKey("poster", videoId, "jpg"),
      Buffer.from(extracted.base64, "base64"),
      extracted.mime
    ).catch(() => undefined);
    return extracted;
  } catch {
    return null;
  }
}

/** Runs the full video generation and persists the result. Throws KieError. */
export async function runVideoGeneration(p: VideoRunParams): Promise<void> {
  // 1) Claim the job — if another worker already owns it, do nothing.
  const claimed = await db.job.updateMany({
    where: { id: p.jobId, status: "pending" },
    data: { status: "processing" },
  });
  if (claimed.count === 0) return;

  // Key priority: per-request key → key saved in the vault for this token →
  // server's built-in KIE_API_KEY (resolveKieKey throws when none exists).
  const kieKey = p.kieKey || (await getUserKieKey(p.userToken));

  // 2) Make sure every frame is a URL the video model can download.
  const [startFrame, endFrame, loopFrame, referenceImage] = await Promise.all([
    p.startFrame ? ensureKieImageUrl(p.startFrame, kieKey) : Promise.resolve(null),
    p.endFrame ? ensureKieImageUrl(p.endFrame, kieKey) : Promise.resolve(null),
    p.loopFrame ? ensureKieImageUrl(p.loopFrame, kieKey) : Promise.resolve(null),
    p.referenceImage ? ensureKieImageUrl(p.referenceImage, kieKey) : Promise.resolve(null),
  ]);
  const keyframes: VideoKeyframe[] = [];
  for (const k of p.keyframes ?? []) {
    keyframes.push({ url: await ensureKieImageUrl(k.url, kieKey), timestamp: k.timestamp });
  }

  // 3) Create the upstream task and remember its id + key for recovery.
  const taskId = await createVideoTask({
    prompt: p.prompt,
    imageUrls: referenceImage ? [referenceImage] : undefined,
    aspectRatio: p.aspectRatio,
    resolution: p.resolution,
    duration: p.duration,
    firstFrameUrl: startFrame ?? undefined,
    lastFrameUrl: endFrame ?? undefined,
    loopUrl: loopFrame ?? undefined,
    keyframes: keyframes.length ? keyframes : undefined,
    enableAudio: p.audio,
  }, kieKey);
  await db.job.update({ where: { id: p.jobId }, data: { taskId, kieKey: kieKey || null } });

  // 4) Poll until the MP4 is ready (or the poll budget runs out).
  const deadline = Date.now() + POLL_BUDGET_MS;
  for (;;) {
    await sleep(POLL_INTERVAL_MS);
    if (Date.now() > deadline) {
      // Keep the job processing — recovery paths finish it via the taskId.
      return;
    }
    const record = await getVideoTask(taskId, kieKey);
    if (record.state === "success" && record.resultUrls.length > 0) {
      await storeFinishedVideo(p.jobId, p.userToken, taskId, record.resultUrls[0], p, record.credits);
      return;
    }
    if (record.state === "fail") {
      throw new KieError(
        record.failMsg
          ? `فشل توليد الفيديو على kie.ai: ${record.failMsg}`
          : "فشل توليد الفيديو على kie.ai. جرّب تعديل الوصف أو المعاملات.",
        502
      );
    }
    // waiting / queuing / generating → keep polling
  }
}

/**
 * Recovery path: a video job stuck pending/processing whose background worker
 * is gone. Uses the stored kie.ai taskId to fetch the result on demand.
 * Returns the refreshed job row (status may have advanced to done/error).
 */
export async function recoverVideoJob(jobId: string): Promise<void> {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.mode !== "video" || !job.taskId) return;
  if (job.status === "done" || job.status === "error") return;

  const age = Date.now() - new Date(job.updatedAt).getTime();
  if (job.status === "pending" && age < STALE_PENDING_MS) return;
  if (job.status === "processing" && age < STALE_PROCESSING_MS) return;

  if (!(await claimJob(jobId, true))) return;

  try {
    // Same key priority as the original run: the stored per-request key, then
    // the vault key for this token, then the server key.
    const record = await getVideoTask(job.taskId, job.kieKey || (await getUserKieKey(job.userToken)));
    if (record.state === "success" && record.resultUrls.length > 0) {
      await storeFinishedVideo(
        jobId,
        job.userToken,
        job.taskId,
        record.resultUrls[0],
        {
          jobId,
          userToken: job.userToken,
          prompt: job.prompt,
          // Metadata of recovered jobs is best-effort; stored on the Video row
          // from the original run parameters when the worker was alive.
          aspectRatio: "auto",
          resolution: "480p",
          duration: 8,
          audio: true,
        },
        record.credits
      );
      return;
    }
    if (record.state === "fail") {
      await db.job.update({
        where: { id: jobId },
        data: {
          status: "error",
          error: record.failMsg
            ? `فشل توليد الفيديو على kie.ai: ${record.failMsg}`
            : "فشل توليد الفيديو على kie.ai. جرّب مجدداً.",
        },
      });
      return;
    }
    // Still running upstream — leave it processing with a fresh updatedAt.
    await db.job.update({ where: { id: jobId }, data: { status: "processing" } });
  } catch (e) {
    const message =
      e instanceof KieError
        ? e.message
        : "حدث خطأ غير متوقع أثناء متابعة مهمة الفيديو. جرّب مجدداً.";
    await db.job.update({ where: { id: jobId }, data: { status: "error", error: message } }).catch(() => undefined);
  }
}

type Row = Record<string, unknown>;

/** Maps a Video DB row to the client-safe metadata item (no base64 payload). */
export function serializeVideoRow(row: Row): VideoItem {
  return {
    id: row.id as string,
    prompt: row.prompt as string,
    model: row.model as string,
    aspectRatio: row.aspectRatio as string,
    resolution: row.resolution as string,
    duration: row.duration as number,
    audio: Boolean(row.audio),
    usedStartFrame: Boolean(row.usedStartFrame),
    usedEndFrame: Boolean(row.usedEndFrame),
    usedKeyframes: (row.usedKeyframes as number) ?? 0,
    usedLoop: Boolean(row.usedLoop),
    usedReference: Boolean(row.usedReference),
    mimeType: row.mimeType as string,
    credits: (row.credits as number) ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}
