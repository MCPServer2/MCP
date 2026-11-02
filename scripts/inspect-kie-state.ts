/**
 * Inspects the current key-vault state + recent video jobs to debug the
 * "MCP video says insufficient balance while the UI works" report.
 * Run: bun run scripts/inspect-kie-state.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { maskKey, decryptSecret } from "../src/lib/key-vault";

function envValue(name: string): string | null {
  for (const line of readFileSync("/home/z/my-project/.env", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim());
    if (m && m[1] === name) return m[2];
  }
  const raw = process.env[name];
  return raw ? raw : null;
}

const rawUrl = envValue("DIRECT_URL") || envValue("DATABASE_URL");
if (!rawUrl) throw new Error("No database URL in .env");
const DIRECT_URL = rawUrl.includes("?") ? rawUrl : `${rawUrl}?`;

const db = new PrismaClient({
  datasourceUrl: `${DIRECT_URL}&connect_timeout=30`,
});

async function main() {
  const keys = await db.userKey.findMany();
  console.log("=== UserKey vault rows ===");
  for (const row of keys) {
    const kiePlain = row.kieApiKey ? decryptSecret(row.kieApiKey) : null;
    const cometPlain = row.cometApiKey ? decryptSecret(row.cometApiKey) : null;
    console.log(
      [
        `token=${row.userToken}`,
        `kie=${row.kieApiKey ? (kiePlain ? maskKey(kiePlain) : "UNDECRYPTABLE") : "—"}`,
        `kieCredits=${row.kieCredits ?? "—"}`,
        `kieCheckedAt=${row.kieCheckedAt?.toISOString() ?? "—"}`,
        `comet=${row.cometApiKey ? (cometPlain ? maskKey(cometPlain) : "UNDECRYPTABLE") : "—"}`,
        `updatedAt=${row.updatedAt?.toISOString() ?? "—"}`,
      ].join(" | ")
    );
  }

  const jobs = await db.job.findMany({
    where: { mode: "video" },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      userToken: true,
      status: true,
      error: true,
      kieKey: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  console.log("\n=== Recent video jobs (newest first) ===");
  for (const j of jobs) {
    console.log(
      [
        j.createdAt.toISOString(),
        `job=${j.id}`,
        `token=${j.userToken}`,
        j.status,
        `kieKey=${j.kieKey ? maskKey(j.kieKey) : "—"}`,
        j.error ? `error="${j.error.slice(0, 140)}"` : "",
      ]
        .filter(Boolean)
        .join(" | ")
    );
  }

  const envKey = process.env.KIE_API_KEY?.trim();
  console.log(`\nKIE_API_KEY in .env: ${envKey ? maskKey(envKey) : "(not set)"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
