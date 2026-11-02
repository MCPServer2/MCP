/**
 * E2E test of the s3-storage lib against the local stub (bun scripts/s3-e2e-test.ts).
 * Validates: upload → redirect (presigned + public mode) → byte-identical fetch.
 */
process.env.AWS_ENDPOINT_URL_S3 = "http://127.0.0.1:4566";
process.env.S3_BUCKET = "video";
process.env.AWS_REGION = "us-east-2";
process.env.AWS_ACCESS_KEY_ID = "test-key";
process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
delete process.env.S3_PUBLIC_READ;

const { uploadS3Media, s3MediaKey, s3MediaRedirect, S3_MEDIA_ENABLED } = await import("../src/lib/s3-storage");

console.log("S3_MEDIA_ENABLED:", S3_MEDIA_ENABLED);
if (!S3_MEDIA_ENABLED) throw new Error("storage should be enabled");

const payload = Buffer.from(`flare-e2e-${Date.now()}-${"x".repeat(512)}`);
const key = s3MediaKey("image", "test-img-1", "png");

const uploaded = await uploadS3Media(key, payload, "image/png");
console.log("upload ok:", uploaded);
if (!uploaded) throw new Error("upload failed");

// Redirect with presigned URL (private bucket mode)
const redirect = await s3MediaRedirect(key, "image/png", null);
if (!redirect || redirect.status !== 302) throw new Error("expected 302 redirect");
const location = redirect.headers.get("location") || "";
console.log("presigned location ok:", location.startsWith("http://127.0.0.1:4566/video/"), "| signed:", location.includes("X-Amz-Signature"));
const fetched = await fetch(location);
const body = Buffer.from(await fetched.arrayBuffer());
console.log("presigned fetch:", fetched.status, "bytes match:", body.equals(payload), "type:", fetched.headers.get("content-type"));

// Cache-Control on the redirect
console.log("redirect cache-control:", redirect.headers.get("cache-control"));

// Public mode
process.env.S3_PUBLIC_READ = "true";
const { s3MediaRedirect: redirectPublic } = await import("../src/lib/s3-storage");
const redirect2 = await redirectPublic(key, "image/png", null);
const loc2 = redirect2?.headers.get("location") || "";
console.log("public location:", loc2 === `http://127.0.0.1:4566/${process.env.S3_BUCKET}/${key}`);
console.log("public cache-control:", redirect2?.headers.get("cache-control"));

console.log("\nALL S3 E2E CHECKS DONE");
