import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret, maskKey, needsReencryption } from "@/lib/key-vault";
import { validateCometKey } from "@/lib/comet-server";

/**
 * CometAPI key vault API — the key saved from the images tab lives ENCRYPTED
 * in the database, bound to the user's anonymous FLR- token, so it also powers
 * MCP image generations from external chat clients (no &key= in the URL and no
 * per-call key). Same pattern as /api/kie-key for videos.
 *
 * GET    /api/comet-key?token=...  → { configured, keyPreview, name, available, unlimited }
 * PUT    /api/comet-key { userToken, apiKey } → validates (free probe) and stores the key
 * DELETE /api/comet-key?token=...  → removes the stored key
 */

const MAX_TOKEN_LEN = 80;
const MAX_KEY_LEN = 256;

function badToken(token: string | null | undefined): boolean {
  const t = token?.trim() ?? "";
  return t.length < 8 || t.length > MAX_TOKEN_LEN;
}

/** Builds the client-safe status payload (never returns the full key). */
async function statusPayload(userToken: string) {
  const row = await db.userKey.findUnique({
    where: { userToken },
    select: { cometApiKey: true, cometName: true, cometAvailable: true, cometUnlimited: true },
  });
  const plain = row?.cometApiKey ? decryptSecret(row.cometApiKey) : null;
  if (plain && row.cometApiKey && needsReencryption(row.cometApiKey)) {
    // Self-heal: migrate legacy-encrypted rows to the canonical vault secret.
    try {
      await db.userKey.update({
        where: { userToken },
        data: { cometApiKey: encryptSecret(plain) },
      });
    } catch {
      // best-effort — reads keep working via the keyring
    }
  }
  return {
    configured: Boolean(plain),
    keyPreview: plain ? maskKey(plain) : null,
    name: row?.cometName ?? null,
    available: row?.cometAvailable ?? null,
    unlimited: row?.cometUnlimited ?? null,
  };
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (badToken(token)) {
    return NextResponse.json({ error: "توكن المستخدم غير صالح." }, { status: 400 });
  }
  try {
    return NextResponse.json(await statusPayload(token as string));
  } catch (error) {
    console.error("[comet-key:GET] error:", error);
    return NextResponse.json({ error: "تعذر قراءة المفتاح المحفوظ." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  let body: { userToken?: string; apiKey?: string };
  try {
    body = (await request.json()) as { userToken?: string; apiKey?: string };
  } catch {
    return NextResponse.json({ error: "طلب غير صالح." }, { status: 400 });
  }

  const userToken = body.userToken?.trim();
  const apiKey = body.apiKey?.trim();
  if (badToken(userToken)) {
    return NextResponse.json({ error: "توكن المستخدم غير صالح." }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "أدخل مفتاح CometAPI أولاً." }, { status: 400 });
  }
  if (apiKey.length > MAX_KEY_LEN) {
    return NextResponse.json({ error: "مفتاح CometAPI طويل جداً." }, { status: 400 });
  }

  // Free probe (no credits spent): rejects invalid keys, snapshots the quota.
  const probe = await validateCometKey(apiKey);
  if (!probe.valid && !probe.unreachable) {
    return NextResponse.json(
      { error: "مفتاح CometAPI غير صالح — تحقق منه ثم أعد المحاولة.", valid: false },
      { status: 400 }
    );
  }

  try {
    await db.userKey.upsert({
      where: { userToken: userToken as string },
      create: {
        userToken: userToken as string,
        cometApiKey: encryptSecret(apiKey),
        cometName: probe.usage?.name || null,
        cometAvailable: probe.usage
          ? probe.usage.unlimitedQuota
            ? null
            : probe.usage.totalAvailable
          : null,
        cometUnlimited: probe.usage ? probe.usage.unlimitedQuota : null,
      },
      update: {
        cometApiKey: encryptSecret(apiKey),
        cometName: probe.usage?.name || null,
        cometAvailable: probe.usage
          ? probe.usage.unlimitedQuota
            ? null
            : probe.usage.totalAvailable
          : null,
        cometUnlimited: probe.usage ? probe.usage.unlimitedQuota : null,
      },
    });
    return NextResponse.json({
      ...(await statusPayload(userToken as string)),
      valid: probe.valid,
      stored: true,
    });
  } catch (error) {
    console.error("[comet-key:PUT] error:", error);
    return NextResponse.json({ error: "تعذر حفظ المفتاح. جرّب مرة أخرى." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (badToken(token)) {
    return NextResponse.json({ error: "توكن المستخدم غير صالح." }, { status: 400 });
  }
  try {
    // Clear ONLY the CometAPI fields — the kie.ai key on the same row must survive.
    await db.userKey.updateMany({
      where: { userToken: token as string },
      data: { cometApiKey: null, cometName: null, cometAvailable: null, cometUnlimited: null },
    });
    return NextResponse.json(await statusPayload(token as string));
  } catch (error) {
    console.error("[comet-key:DELETE] error:", error);
    return NextResponse.json({ error: "تعذر حذف المفتاح." }, { status: 500 });
  }
}
