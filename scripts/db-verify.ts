/**
 * One-off verification: production DB link + key-vault decryption (bun scripts/db-verify.ts).
 * Bypasses the stale shell DATABASE_URL by reading DIRECT_URL from .env directly.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/key-vault";

function envValue(name: string): string | null {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim());
    if (m && m[1] === name) return m[2];
  }
  return null;
}

const directUrl = envValue("DIRECT_URL");
if (!directUrl) throw new Error("DIRECT_URL missing from .env");
console.log("DIRECT_URL host:", new URL(directUrl.replace("postgresql://", "http://")).host);
const connectUrl = `${directUrl}&connect_timeout=30`;

const db = new PrismaClient({ datasourceUrl: connectUrl });

const rows = await db.userKey.findMany({ select: { userToken: true, cometName: true, cometUnlimited: true } });
console.log("UserKey rows:", JSON.stringify(rows));

const target = "FLR-7QBZG-CUX63";
const row = await db.userKey.findUnique({ where: { userToken: target } });
if (row?.cometApiKey) {
  try {
    const plain = decryptSecret(row.cometApiKey);
    console.log(`VAULT DECRYPT OK for ${target}: ${plain.slice(0, 6)}…${plain.slice(-4)}`);
  } catch (e) {
    console.log("VAULT DECRYPT FAILED:", e instanceof Error ? e.message : e);
  }
} else {
  console.log(`No saved cometApiKey for ${target}`);
}

const [genCount, vidCount, jobCount] = await Promise.all([
  db.generation.count(),
  db.video.count(),
  db.job.count(),
]);
console.log(`generations: ${genCount}, videos: ${vidCount}, jobs: ${jobCount}`);

await db.$disconnect();
