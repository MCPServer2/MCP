/**
 * Seeds one tiny test image + one tiny test video for E2E MCP testing
 * (idempotent: re-running replaces the previous test rows for the token).
 * Usage: bun scripts/seed-e2e-media.ts [FLR-token]
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const token = process.argv[2] ?? "FLR-5CG2G-7RYWP";
const db = new PrismaClient();

// 1x1 red PNG (well-known base64).
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const dir = await mkdtemp(join(tmpdir(), "flare-e2e-"));
const mp4Path = join(dir, "test.mp4");
execFileSync("/usr/bin/ffmpeg", [
  "-hide_banner", "-loglevel", "error",
  "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=10",
  "-pix_fmt", "yuv420p", "-y", mp4Path,
]);
const mp4 = await readFile(mp4Path);

// A real JPEG poster: extract frame 0 from the mp4.
const posterPath = join(dir, "poster.jpg");
execFileSync("/usr/bin/ffmpeg", [
  "-hide_banner", "-loglevel", "error",
  "-ss", "0", "-i", mp4Path, "-vframes", "1", "-q:v", "4", "-y", posterPath,
]);
const poster = await readFile(posterPath);
await rm(dir, { recursive: true, force: true });

const marker = "e2e-seed";
const oldImgs = await db.generation.findMany({ where: { revisedPrompt: marker } });
const oldVids = await db.video.findMany({ where: { model: marker } });
for (const r of oldImgs) await db.generation.delete({ where: { id: r.id } });
for (const r of oldVids) await db.video.delete({ where: { id: r.id } });

const img = await db.generation.create({
  data: {
    userToken: token,
    prompt: "E2E seed image for MCP extension-URL testing",
    mode: "generate",
    size: "1024x1024",
    outputFormat: "png",
    mimeType: "image/png",
    revisedPrompt: marker,
    data: PNG_B64,
  },
});

const vid = await db.video.create({
  data: {
    userToken: token,
    prompt: "E2E seed video for MCP extension-URL testing",
    model: marker,
    aspectRatio: "16:9",
    resolution: "480p",
    duration: 2,
    audio: false,
    mimeType: "video/mp4",
    data: mp4.toString("base64"),
    poster: poster.toString("base64"),
    posterMime: "image/jpeg",
  },
});

console.log(JSON.stringify({ imgId: img.id, vidId: vid.id, mp4Bytes: mp4.byteLength, posterBytes: poster.byteLength }));
await db.$disconnect();
