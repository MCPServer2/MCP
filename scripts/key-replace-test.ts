/**
 * E2E check for "adding a new key replaces the old one" (both providers).
 * Uses a FAKE token so real user data is never touched. Run: bun scripts/key-replace-test.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { encryptSecret, decryptSecret } from "../src/lib/key-vault";
import { resolveKieKeyForUser } from "../src/lib/kie-server";
import { resolveCometKeyForUser } from "../src/lib/comet-server";

function envValue(name: string): string | null {
  for (const line of readFileSync("/home/z/my-project/.env", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim());
    if (m && m[1] === name) return m[2];
  }
  return null;
}
process.env.DIRECT_URL = envValue("DIRECT_URL"); // canonical vault secret source
const db = new PrismaClient({ datasourceUrl: envValue("DIRECT_URL") + "&connect_timeout=30" });

const TOKEN = "FLR-TEST-REPLACE";
const KEY_A = "kie-test-old-key-AAAA";
const KEY_B = "kie-test-new-key-BBBB";
const COMET_A = "sk-test-old-comet-AAAA";
const COMET_B = "sk-test-new-comet-BBBB";

let failures = 0;
function check(name: string, ok: boolean, got: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got: ${String(got)})`}`);
  if (!ok) failures++;
}

try {
  await db.userKey.deleteMany({ where: { userToken: TOKEN } });

  // --- kie.ai provider -----------------------------------------------------
  // 1) old key saved in the vault
  await db.userKey.create({ data: { userToken: TOKEN, kieApiKey: encryptSecret(KEY_A) } });
  // 2) a client still sends the OLD key explicitly (stale header / MCP argument)
  const r1 = await resolveKieKeyForUser(TOKEN, KEY_A);
  check("kie: vault key wins over stale client key (same key)", r1 === KEY_A, r1);
  // 3) owner adds a NEW key on the website → old ciphertext replaced
  await db.userKey.update({ where: { userToken: TOKEN }, data: { kieApiKey: encryptSecret(KEY_B) } });
  const rowA = await db.userKey.findUnique({ where: { userToken: TOKEN }, select: { kieApiKey: true } });
  const stillA = rowA?.kieApiKey ? decryptSecret(rowA.kieApiKey) === KEY_A : false;
  check("kie: old key ciphertext no longer stored after replace", !stillA);
  // 4) the stale client key must now be IGNORED — the new key is used
  const r2 = await resolveKieKeyForUser(TOKEN, KEY_A);
  check("kie: NEW vault key used even when old key is re-sent by client", r2 === KEY_B, r2);

  // --- CometAPI provider ---------------------------------------------------
  await db.userKey.update({ where: { userToken: TOKEN }, data: { cometApiKey: encryptSecret(COMET_A) } });
  const c1 = await resolveCometKeyForUser(TOKEN, COMET_A);
  check("comet: vault key wins over stale client key", c1 === COMET_A, c1);
  await db.userKey.update({ where: { userToken: TOKEN }, data: { cometApiKey: encryptSecret(COMET_B) } });
  const c2 = await resolveCometKeyForUser(TOKEN, COMET_A);
  check("comet: NEW vault key used even when old key is re-sent by client", c2 === COMET_B, c2);

  // --- fallback chain preserved when nothing is saved ----------------------
  await db.userKey.deleteMany({ where: { userToken: TOKEN } });
  const f = await resolveKieKeyForUser(TOKEN, KEY_A);
  check("kie: per-request key still works when vault is empty", f === KEY_A, f);
} finally {
  await db.userKey.deleteMany({ where: { userToken: TOKEN } }).catch(() => undefined);
  await db.$disconnect();
}
process.exit(failures === 0 ? 0 : 1);
