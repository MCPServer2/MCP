import crypto from "crypto";

/**
 * AES-256-GCM vault for user-supplied BYOK keys stored in the database.
 *
 * The kie.ai key saved from the video tab must survive across sessions AND be
 * usable from the MCP server (external chat clients), so it lives in the
 * database — but never as plain text. The raw key is encrypted with a secret
 * derived from KEY_ENC_SECRET (or, when unset, from the deployment's
 * DATABASE_URL so no extra configuration is required).
 */

const VERSION = "v1";

function encryptionKey(): Buffer {
  const secret =
    process.env.KEY_ENC_SECRET?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "flare-local-development-fallback";
  return crypto.createHash("sha256").update(`flare-key-vault:${secret}`).digest();
}

/** Encrypts a secret into "v1.iv.tag.cipher" (all base64url segments). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

/**
 * Decrypts a vault payload; returns null when the ciphertext is malformed or
 * was encrypted with a different secret (e.g. DATABASE_URL rotated) — callers
 * treat that as "no key saved".
 */
export function decryptSecret(payload: string): string | null {
  try {
    const [version, ivB64, tagB64, dataB64] = payload.split(".");
    if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivB64, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    const value = dec.toString("utf8");
    return value || null;
  } catch {
    return null;
  }
}

/** Short display form for the UI: first 4 + last 4 characters. */
export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}
