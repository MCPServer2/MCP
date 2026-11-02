import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
function envValue(name: string): string | null {
  for (const line of readFileSync("/home/z/my-project/.env", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim());
    if (m && m[1] === name) return m[2];
  }
  return null;
}
const db = new PrismaClient({ datasourceUrl: envValue("DIRECT_URL") + "&connect_timeout=30" });
const vids = await db.video.findMany({ select: { id: true, data: true, poster: true, sourceUrl: true, mimeType: true }, take: 3, orderBy: { createdAt: "desc" } });
for (const v of vids) {
  console.log(v.id, "| data b64 chars:", v.data?.length ?? 0, "| poster:", v.poster ? `${v.poster.length} chars` : "null", "| mime:", v.mimeType, "| sourceUrl:", v.sourceUrl ? "yes" : "null");
}
// ffmpeg extraction test on first video
import { writeFileSync, mkdtempSync, readFileSync as rf } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
const v0 = vids[0];
if (v0?.data) {
  const dir = mkdtempSync(path.join(tmpdir(), "poster-test-"));
  const src = path.join(dir, "in.mp4");
  writeFileSync(src, Buffer.from(v0.data, "base64"));
  console.log("mp4 bytes:", Buffer.from(v0.data, "base64").byteLength);
  const probe = spawnSync("ffmpeg", ["-hide_banner", "-i", src], { encoding: "utf8" });
  console.log("ffmpeg stderr tail:", (probe.stderr || "").split("\n").slice(-6).join("\n"));
}
await db.$disconnect();
