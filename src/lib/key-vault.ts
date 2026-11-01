import crypto from "crypto";

/**
 * AES-256-GCM vault for user-supplied BYOK keys stored in the database.
 *
 * The CometAPI key (images tab) and the kie.ai key (video tab) must survive
 * across sessions AND be usable from the MCP server (external chat clients),
 * so they live in the database — but never as plain text.
 *
 * IMPORTANT — the encryption secret must be IDENTICAL in every environment
 * that shares the database (the sandbox dev server AND Vercel), otherwise a
 * key saved in one place becomes undecryptable in the other ("Invalid or
 * expired API key"). DATABASE_URL is NOT a stable choice: some sandbox shells
 * export a legacy SQLite `file:` URL that overrides .env, while Vercel holds
 * the real Neon URL. So the canonical secret prefers DIRECT_URL (the Neon
 * direct connection string, identical locally and on Vercel) and falls back
 * sensibly. Decryption additionally tries a KEYRING of every secret that was
 * ever used (KEY_ENC_SECRET / DIRECT_URL / DATABASE_URL / legacy fallback),
 * and read paths lazily re-encrypt rows that were written with a non-canonical
 * secret, so the vault self-heals over time.
 */

const VERSION = "v1";
const LEGACY_FALLBACK = "flare-local-development-fallback";

/** The secret NEW rows are encrypted with. Stable across environments. */
function canonicalSecret(): string {
  return (
    process.env.KEY_ENC_SECRET?.trim() ||
    process.env.DIRECT_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    LEGACY_FALLBACK
  );
}

/** Every secret that may have encrypted an existing row (order = preference). */
function keyringSecrets(): string[] {
  const list = [
    process.env.KEY_ENC_SECRET?.trim(),
    process.env.DIRECT_URL?.trim(),
    process.env.DATABASE_URL?.trim(),
    LEGACY_FALLBACK,
  ].filter((s): s is string => Boolean(s));
  return Array.from(new Set(list));
}

function encryptionKeyFor(secret: string): Buffer {
  return crypto.createHash("sha256").update(`flare-key-vault:${secret}`).digest();
}

/** Encrypts a secret into "v1.iv.tag.cipher" (all base64url segments). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKeyFor(canonicalSecret()), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

/** Decrypts with ONE specific keyring secret; null on any failure. */
function decryptWithSecret(payload: string, secret: string): string | null {
  try {
    const [version, ivB64, tagB64, dataB64] = payload.split(".");
    if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKeyFor(secret),
      Buffer.from(ivB64, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return dec.toString("utf8") || null;
  } catch {
    return null;
  }
}

/**
 * Decrypts a vault payload, trying the canonical secret first and then the
 * rest of the keyring (rows written by an environment whose DATABASE_URL or
 * KEY_ENC_SECRET differed still decrypt here). Returns null when the payload
 * is malformed or no keyring secret matches — callers treat that as "no key
 * saved".
 */
export function decryptSecret(payload: string): string | null {
  for (const secret of keyringSecrets()) {
    const plain = decryptWithSecret(payload, secret);
    if (plain !== null) return plain;
  }
  return null;
}

/**
 * True when the payload does NOT decrypt with the canonical secret but DOES
 * decrypt with a legacy keyring secret — the caller should re-encrypt it with
 * the canonical secret (lazy migration) so future reads never depend on the
 * legacy secret remaining in the environment.
 */
export function needsReencryption(payload: string): boolean {
  if (decryptWithSecret(payload, canonicalSecret()) !== null) return false;
  return decryptSecret(payload) !== null;
}

/** Short display form for the UI: first 4 + last 4 characters. */
export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}
