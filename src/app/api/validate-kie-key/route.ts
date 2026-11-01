import { NextResponse } from "next/server";
import { validateKieKey } from "@/lib/kie-server";

/**
 * POST /api/validate-kie-key
 * Validates a user-supplied kie.ai API key (BYOK for video generation) using a
 * free probe call (no credits are spent) and returns the available credits.
 * The key is used once and never stored server-side.
 */
export async function POST(request: Request) {
  const apiKey = request.headers.get("x-kie-key")?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "أدخل مفتاح kie.ai أولاً." }, { status: 400 });
  }
  if (apiKey.length > 256) {
    return NextResponse.json({ error: "مفتاح kie.ai طويل جداً." }, { status: 400 });
  }

  try {
    const result = await validateKieKey(apiKey);
    if (result.unreachable) {
      return NextResponse.json(
        { error: "تعذر الاتصال بـ kie.ai للتحقق من المفتاح." },
        { status: 502 }
      );
    }
    if (!result.valid) {
      return NextResponse.json({ error: "مفتاح kie.ai غير صالح." }, { status: 401 });
    }
    return NextResponse.json({ valid: true, credits: result.credits });
  } catch (error) {
    console.error("[validate-kie-key] error:", error);
    return NextResponse.json({ error: "تعذر الاتصال بـ kie.ai للتحقق." }, { status: 502 });
  }
}
