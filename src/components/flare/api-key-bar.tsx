"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck, ExternalLink, CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useFlareStore } from "@/lib/store";
import { useLangStore, useT } from "@/lib/lang-store";
import { fmt, serverMsg, translations } from "@/lib/i18n";
import type { KeyUsageInfo } from "@/lib/types";
import { useHasMounted } from "./providers";

export function ApiKeyBar() {
  const mounted = useHasMounted();
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const apiKey = useFlareStore((s) => s.apiKey);
  const setApiKey = useFlareStore((s) => s.setApiKey);
  const keyStatus = useFlareStore((s) => s.keyStatus);
  const keyUsage = useFlareStore((s) => s.keyUsage);
  const setKeyStatus = useFlareStore((s) => s.setKeyStatus);
  const userToken = useFlareStore((s) => s.userToken);

  const [draft, setDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (mounted) setDraft(apiKey);
  }, [mounted]);

  const saveKey = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      toast.error(t.apiKey.enterFirst);
      return;
    }
    setApiKey(trimmed);
    toast.success(t.apiKey.saved, {
      description: t.apiKey.savedDesc,
    });
  };

  const validateKey = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      toast.error(t.apiKey.enterFirst);
      return;
    }
    setChecking(true);
    setKeyStatus("checking");
    try {
      const res = await fetch("/api/validate-key", {
        method: "POST",
        headers: { "x-cometapi-key": trimmed },
      });
      const data = (await res.json()) as { usage?: KeyUsageInfo; error?: string };
      if (!res.ok || !data.usage) {
        setKeyStatus("invalid");
        toast.error(serverMsg(data.error, lang) || t.apiKey.invalid);
        return;
      }
      setApiKey(trimmed);
      setKeyStatus("valid", data.usage);
      toast.success(t.apiKey.valid, {
        description: fmt(t.apiKey.balanceDesc, { q: formatQuota(data.usage, lang) }),
      });
    } catch {
      setKeyStatus("unknown");
      toast.error(t.apiKey.checkFailed);
    } finally {
      setChecking(false);
    }
  };

  const statusBadge = () => {
    if (!mounted) return null;
    switch (keyStatus) {
      case "valid":
        return (
          <Badge className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-400" variant="outline">
            <CircleCheck className="size-3.5" /> {t.apiKey.badgeValid}
          </Badge>
        );
      case "checking":
        return (
          <Badge className="gap-1 border-orange-500/40 bg-orange-500/10 text-orange-300" variant="outline">
            <Loader2 className="size-3.5 animate-spin" /> {t.apiKey.badgeChecking}
          </Badge>
        );
      case "invalid":
        return (
          <Badge className="gap-1 border-red-500/40 bg-red-500/10 text-red-400" variant="outline">
            <CircleX className="size-3.5" /> {t.apiKey.badgeInvalid}
          </Badge>
        );
      case "unknown":
        return (
          <Badge className="gap-1 border-zinc-500/40 bg-zinc-500/10 text-zinc-300" variant="outline">
            <CircleAlert className="size-3.5" /> {t.apiKey.badgeSaved}
          </Badge>
        );
      default:
        return (
          <Badge className="gap-1 border-zinc-500/40 bg-zinc-500/10 text-zinc-400" variant="outline">
            <CircleAlert className="size-3.5" /> {t.apiKey.badgeNone}
          </Badge>
        );
    }
  };

  return (
    <section
      aria-label={t.apiKey.sectionAria}
      className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6"
    >
      <div className="rounded-2xl border border-orange-500/25 bg-gradient-to-l from-orange-500/10 via-amber-500/5 to-transparent p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-orange-400" aria-hidden="true" />
            <h2 className="text-base font-bold">{t.apiKey.heading}</h2>
            {statusBadge()}
          </div>
          <a
            href="https://www.cometapi.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-orange-300 underline-offset-4 hover:underline"
          >
            {t.apiKey.getLink}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row" dir="ltr">
          <div className="relative flex-1">
            <Input
              type={showKey ? "text" : "password"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
              placeholder="sk-… your CometAPI key"
              className="h-11 pr-10 font-mono text-sm"
              aria-label={t.apiKey.inputAria}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showKey ? t.apiKey.hideKey : t.apiKey.showKey}
            >
              {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={saveKey}
              variant="secondary"
              className="h-11 flex-1 sm:flex-none sm:px-6"
              disabled={checking}
            >
              {t.apiKey.save}
            </Button>
            <Button
              onClick={validateKey}
              className="h-11 flex-1 bg-gradient-to-l from-amber-500 to-orange-600 text-white hover:from-amber-400 hover:to-orange-500 sm:flex-none sm:px-6"
              disabled={checking}
            >
              {checking ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              {t.apiKey.check}
            </Button>
          </div>
        </div>

        {mounted && keyUsage && keyStatus === "valid" && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{t.apiKey.keyName} <b className="text-foreground">{keyUsage.name || "—"}</b></span>
            <span>{t.apiKey.balance} <b className="text-emerald-400">{formatQuota(keyUsage, lang)}</b></span>
            <span>{t.apiKey.used} <b className="text-foreground">{keyUsage.totalUsed.toLocaleString("en-US")}</b></span>
          </div>
        )}

        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
          {t.apiKey.privacyA}
          {mounted && userToken ? <b className="mx-1 font-mono text-orange-300">{userToken}</b> : null}
          {t.apiKey.privacyB}
        </p>
      </div>
    </section>
  );
}

function formatQuota(usage: KeyUsageInfo, lang: "ar" | "en"): string {
  const t = translations[lang];
  if (usage.unlimitedQuota) return t.apiKey.unlimited;
  const units = usage.totalAvailable;
  // CometAPI quota units: 500,000 units ≈ $1 (one-api convention)
  const approxUsd = units / 500000;
  return `${units.toLocaleString("en-US")} ${t.apiKey.unit}${approxUsd > 0 ? ` (~$${approxUsd.toFixed(2)})` : ""}`;
}
