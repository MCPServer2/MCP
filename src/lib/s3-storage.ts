import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * S3-compatible object storage (Neon Storage) for generated media.
 *
 * WHY: large MP4s must not be streamed through serverless functions (Vercel's
 * ~4.5 MB response body limit breaks 720p/1080p videos) and multi-MB base64
 * payloads bloat Postgres round-trips. Uploading each image/video/poster here
 * lets the media routes answer with a 302 to the storage service so bytes flow
 * straight from S3 to the chat client.
 *
 * DESIGN — fully optional and fail-safe:
 * - Missing env vars → everything disabled, every route keeps serving from the
 *   database exactly as before (zero behavior change).
 * - Uploads are best-effort: any failure is logged and swallowed; the DB copy
 *   remains the source of truth and the routes fall back to it.
 * - Serving order per media route: token check → S3 (redirect, with lazy
 *   backfill-upload of legacy DB-only rows) → database bytes.
 *
 * Neon quirks honored here:
 * - Path-style addressing only (`forcePathStyle: true`), SigV4, region from env.
 * - `requestChecksumCalculation: "WHEN_REQUIRED"` — newer SDK versions embed an
 *   empty-body checksum into presigned PUT URLs which then rejects real uploads.
 * - Bucket visibility (private vs public_read) is managed in the Neon Console;
 *   set S3_PUBLIC_READ=true to serve permanent public URLs instead of 7-day
 *   presigned ones.
 */

const ENDPOINT = process.env.AWS_ENDPOINT_URL_S3?.trim() || "";
const BUCKET = process.env.S3_BUCKET?.trim() || "";
const REGION = process.env.AWS_REGION?.trim() || "us-east-2";
const KEY_ID = process.env.AWS_ACCESS_KEY_ID?.trim() || "";
const SECRET = process.env.AWS_SECRET_ACCESS_KEY?.trim() || "";

/** Bucket set to public_read in the Neon Console → permanent anonymous URLs. */
const PUBLIC_READ = process.env.S3_PUBLIC_READ === "true";

/** Presigned GET lifetime. SigV4 caps at 7 days. */
const PRESIGN_SECONDS = 6 * 24 * 60 * 60; // 6 days (safely under the 7-day cap)

export const S3_MEDIA_ENABLED = Boolean(ENDPOINT && BUCKET && KEY_ID && SECRET);

/* ------------------------------------------------------------------ */
/* Circuit breaker — storage outages must never slow media routes      */
/* ------------------------------------------------------------------ */

const BREAKER_THRESHOLD = 3; // consecutive failures before opening
const BREAKER_COOLDOWN_MS = 5 * 60_000; // probe again after 5 minutes

let breakerFailures = 0;
let breakerOpenUntil = 0;

function breakerOpen(): boolean {
  return Date.now() < breakerOpenUntil;
}

function noteStorageFailure(): void {
  breakerFailures += 1;
  if (breakerFailures >= BREAKER_THRESHOLD) {
    breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
    breakerFailures = 0;
    console.error("[s3-storage] circuit OPEN — skipping storage for 5 minutes");
  }
}

function noteStorageSuccess(): void {
  breakerFailures = 0;
  breakerOpenUntil = 0;
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: REGION,
      endpoint: ENDPOINT,
      forcePathStyle: true, // Neon Storage: path-style ONLY (no virtual-host TLS)
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: { accessKeyId: KEY_ID, secretAccessKey: SECRET },
    });
  }
  return client;
}

export type S3MediaKind = "image" | "video" | "poster";

/** Canonical object key for one stored media item. */
export function s3MediaKey(kind: S3MediaKind, id: string, ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `media/${kind}/${id}.${safeExt}`;
}

/**
 * Uploads a media payload (best-effort). Returns true when the object was
 * stored; false on ANY failure (caller falls back to DB serving).
 */
export async function uploadS3Media(key: string, body: Buffer, contentType: string): Promise<boolean> {
  if (!S3_MEDIA_ENABLED || breakerOpen()) return false;
  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: new Uint8Array(body),
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
    noteStorageSuccess();
    return true;
  } catch (error) {
    noteStorageFailure();
    console.error("[s3-storage] upload failed:", key, error instanceof Error ? error.message : error);
    return false;
  }
}

/** True when the object exists in storage (best-effort: false on errors). */
async function s3MediaExists(key: string): Promise<boolean> {
  if (breakerOpen()) return false;
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    noteStorageSuccess();
    return true;
  } catch (error) {
    // A 404 HeadObject is a normal "not uploaded yet" answer, not an outage.
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return false;
    noteStorageFailure();
    return false;
  }
}

/**
 * The URL a media route should redirect to, or null when storage is
 * disabled/misconfigured. Public buckets get a permanent URL; private buckets
 * get a presigned GET (each request re-signs, so links issued by the API stay
 * valid even though older signed URLs rotate out).
 */
async function s3MediaUrl(key: string): Promise<string | null> {
  if (!S3_MEDIA_ENABLED) return null;
  if (PUBLIC_READ) return `${ENDPOINT}/${BUCKET}/${key}`;
  try {
    return await getSignedUrl(getClient(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
      expiresIn: PRESIGN_SECONDS,
    });
  } catch (error) {
    console.error("[s3-storage] presign failed:", key, error instanceof Error ? error.message : error);
    return null;
  }
}

/** Cache-Control for the 302 response itself. */
function redirectCacheControl(): string {
  // Presigned URLs expire — never cache the redirect long. Public URLs are
  // permanent and may be cached aggressively.
  return PUBLIC_READ ? "public, max-age=31536000, immutable" : "private, no-store";
}

/**
 * Best-effort delete of one media object (and used on gallery/video deletion).
 * Never throws; failures only leave an orphaned object in storage.
 */
export async function deleteS3Media(key: string): Promise<void> {
  if (!S3_MEDIA_ENABLED) return;
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (error) {
    console.error("[s3-storage] delete failed:", key, error instanceof Error ? error.message : error);
  }
}

/* ------------------------------------------------------------------ */
/* Shared serving logic for the media routes                           */
/* ------------------------------------------------------------------ */

/**
 * Attempts to answer a media request via object storage: checks the object
 * exists (lazily uploading legacy DB-only rows first) and returns a 302
 * redirect Response. Returns null when storage is disabled, the object is
 * unavailable, or any storage error occurred — the caller then serves the
 * bytes from the database as before.
 */
export async function s3MediaRedirect(
  key: string,
  contentType: string,
  dbBase64: string | null
): Promise<Response | null> {
  if (!S3_MEDIA_ENABLED) return null;

  let exists = await s3MediaExists(key);
  if (!exists && dbBase64) {
    // Legacy row stored before S3 existed → upload once, then redirect.
    exists = await uploadS3Media(key, Buffer.from(dbBase64, "base64"), contentType);
  }
  if (!exists) return null;

  const url = await s3MediaUrl(key);
  if (!url) return null;

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Cache-Control": redirectCacheControl(),
    },
  });
}
