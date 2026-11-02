/**
 * One-off S3 connectivity probe (bun scripts/s3-probe.ts).
 * Tests: PutObject → HeadObject → anonymous GET (public read?) → presigned GET.
 */
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.AWS_ENDPOINT_URL_S3!;
const bucket = process.env.S3_BUCKET!;
const region = process.env.AWS_REGION || "us-east-2";

console.log("endpoint:", endpoint, "| bucket:", bucket, "| region:", region);

const s3 = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const key = `media/_probe/probe-${Date.now()}.txt`;
const body = Buffer.from("flare-probe-test");

// 1. PutObject
try {
  const res = await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "text/plain" }));
  console.log("PUT ok:", res.$metadata.httpStatusCode, "etag:", res.ETag);
} catch (e) {
  console.log("PUT FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
}

// 2. HeadObject
try {
  const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  console.log("HEAD ok:", res.$metadata.httpStatusCode, "size:", res.ContentLength, "type:", res.ContentType);
} catch (e) {
  console.log("HEAD FAILED:", e instanceof Error ? e.message : e);
}

const objectUrl = `${endpoint}/${bucket}/${key}`;

// 3. Anonymous GET (public read?)
try {
  const res = await fetch(objectUrl);
  const text = await res.text();
  console.log("ANON GET:", res.status, "body:", JSON.stringify(text.slice(0, 80)));
} catch (e) {
  console.log("ANON GET failed:", e instanceof Error ? e.message : e);
}

// 4. Presigned GET
try {
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
  const res = await fetch(url);
  const text = await res.text();
  console.log("PRESIGNED GET:", res.status, "body:", JSON.stringify(text.slice(0, 80)));
} catch (e) {
  console.log("PRESIGNED GET failed:", e instanceof Error ? e.message : e);
}

// 5. Cleanup probe object
try {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  console.log("DELETE probe ok");
} catch (e) {
  console.log("DELETE probe failed:", e instanceof Error ? e.message : e);
}
