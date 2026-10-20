import { NextResponse } from "next/server";
import { COMET_BASE, mapUpstreamError } from "@/lib/comet-server";
import type { KeyUsageInfo } from "@/lib/types";

/**
 * POST /api/validate-key
 * Validates a CometAPI key via GET /api/usage/token and returns quota info.
 * The key is used once and never stored server-side.
 */
export async function POST(request: Request) {
  const apiKey = request.headers.get("x-cometapi-key")?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "أدخل مفتاح CometAPI أولاً." }, { status: 400 });
  }

  try {
    const response = await fetch(`${COMET_BASE}/api/usage/token`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const errBody = await response.text();
      const err = mapUpstreamError(response.status, errBody);
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    const payload = (await response.json()) as {
      code?: boolean;
      message?: string;
      data?: {
        name?: string;
        total_granted?: number;
        total_used?: number;
        total_available?: number;
        unlimited_quota?: boolean;
        expires_at?: number;
      };
    };

    if (payload.code === false || !payload.data) {
      return NextResponse.json(
        { error: payload.message || "المفتاح غير صالح." },
        { status: 401 }
      );
    }

    const d = payload.data;
    const usage: KeyUsageInfo = {
      name: d.name ?? "",
      totalGranted: d.total_granted ?? 0,
      totalUsed: d.total_used ?? 0,
      totalAvailable: d.total_available ?? 0,
      unlimitedQuota: Boolean(d.unlimited_quota),
      expiresAt: d.expires_at ?? 0,
    };

    return NextResponse.json({ usage });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "انتهت مهلة التحقق من المفتاح." }, { status: 504 });
    }
    console.error("[validate-key] error:", error);
    return NextResponse.json({ error: "تعذر الاتصال بـ CometAPI للتحقق." }, { status: 502 });
  }
}
