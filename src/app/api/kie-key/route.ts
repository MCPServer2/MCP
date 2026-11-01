import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptSecret, decryptSecret, maskKey } from "@/lib/key-vault";
import { validateKieKey } from "@/lib/kie-server";

/**
 * kie.ai key vault API — the key saved from the video tab lives ENCRYPTED in
 * the database, bound to the user's anonymous FLR- token, so it also powers
 * MCP video generations from external chat clients (no kie_key re-sending).
 *
 * GET    /api/kie-key?token=...  → { configured, keyPreview, credits, checkedAt, serverKeyAvailable }
 * PUT    /api/kie-key { userToken, apiKey } → validates (free probe) and stores the key
 * DELETE /api/kie-key?token=...  → removes the stored key (server key takes over again)
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
    select: { kieApiKey: true, kieCredits: true, kieCheckedAt: true },
  });
  const plain = row?.kieApiKey ? decryptSecret(row.kieApiKey) : null;
  return {
    configured: Boolean(plain),
    keyPreview: plain ? maskKey(plain) : null,
    credits: row?.kieCredits ?? null,
    checkedAt: row?.kieCheckedAt ? row.kieCheckedAt.toISOString() : null,
    serverKeyAvailable: Boolean(process.env.KIE_API_KEY?.trim()),
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
    console.error("[kie-key:GET] error:", error);
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
    return NextResponse.json({ error: "أدخل مفتاح kie.ai أولاً." }, { status: 400 });
  }
  if (apiKey.length > MAX_KEY_LEN) {
    return NextResponse.json({ error: "مفتاح kie.ai طويل جداً." }, { status: 400 });
  }

  // Free probe (no credits spent): rejects invalid keys, captures the balance.
  const probe = await validateKieKey(apiKey);
  if (!probe.valid && !probe.unreachable) {
    return NextResponse.json(
      { error: "مفتاح kie.ai غير صالح — تحقق منه ثم أعد المحاولة.", valid: false },
      { status: 400 }
    );
  }

  try {
    await db.userKey.upsert({
      where: { userToken: userToken as string },
      create: {
        userToken: userToken as string,
        kieApiKey: encryptSecret(apiKey),
        kieCredits: probe.credits,
        kieCheckedAt: probe.unreachable ? null : new Date(),
      },
      update: {
        kieApiKey: encryptSecret(apiKey),
        kieCredits: probe.credits,
        kieCheckedAt: probe.unreachable ? null : new Date(),
      },
    });
    return NextResponse.json({
      ...(await statusPayload(userToken as string)),
      valid: probe.valid,
      stored: true,
    });
  } catch (error) {
    console.error("[kie-key:PUT] error:", error);
    return NextResponse.json({ error: "تعذر حفظ المفتاح. جرّب مرة أخرى." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (badToken(token)) {
    return NextResponse.json({ error: "توكن المستخدم غير صالح." }, { status: 400 });
  }
  try {
    await db.userKey.deleteMany({ where: { userToken: token as string } });
    return NextResponse.json(await statusPayload(token as string));
  } catch (error) {
    console.error("[kie-key:DELETE] error:", error);
    return NextResponse.json({ error: "تعذر حذف المفتاح." }, { status: 500 });
  }
}
