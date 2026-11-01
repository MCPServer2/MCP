"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck, ExternalLink, CircleAlert, CircleCheck, CircleX, Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useFlareStore } from "@/lib/store";
import { useLangStore, useT } from "@/lib/lang-store";
import { fmt, serverMsg, translations } from "@/lib/i18n";
import { useHasMounted } from "./providers";

/**
 * kie.ai API key bar for the video tab — the video counterpart of the CometAPI
 * key bar used for images. Same behaviour: save locally, "check & activate"
 * with a free probe, live status badge and available credits. The key is
 * optional — when empty the server's built-in key is used.
 */
export function KieKeyBar() {
  const mounted = useHasMounted();
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const kieKey = useFlareStore((s) => s.kieKey);
  const setKieKey = useFlareStore((s) => s.setKieKey);
  const kieKeyStatus = useFlareStore((s) => s.kieKeyStatus);
  const kieCredits = useFlareStore((s) => s.kieCredits);
  const setKieKeyStatus = useFlareStore((s) => s.setKieKeyStatus);
  const userToken = useFlareStore((s) => s.userToken);

  const [draft, setDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (mounted) setDraft(kieKey);
  }, [mounted]);

  const saveKey = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      toast.error(t.kieKey.enterFirst);
      return;
    }
    setKieKey(trimmed);
    toast.success(t.kieKey.saved, {
      description: t.kieKey.savedDesc,
    });
  };

  const validateKey = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      toast.error(t.kieKey.enterFirst);
      return;
    }
    setChecking(true);
    setKieKeyStatus("checking");
    try {
      const res = await fetch("/api/validate-kie-key", {
        method: "POST",
        headers: { "x-kie-key": trimmed },
      });
      const data = (await res.json()) as { valid?: boolean; credits?: number | null; error?: string };
      if (!res.ok || !data.valid) {
        setKieKeyStatus("invalid");
        toast.error(serverMsg(data.error, lang) || t.kieKey.invalid);
        return;
      }
      setKieKey(trimmed);
      setKieKeyStatus("valid", typeof data.credits === "number" ? data.credits : null);
      toast.success(t.kieKey.valid, {
        description: fmt(t.kieKey.balanceDesc, { q: formatCredits(data.credits ?? null, lang) }),
      });
    } catch {
      setKieKeyStatus("unknown");
      toast.error(t.kieKey.checkFailed);
    } finally {
      setChecking(false);
    }
  };

  const statusBadge = () => {
    if (!mounted) return null;
    switch (kieKeyStatus) {
      case "valid":
        return (
          <Badge className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-400" variant="outline">
            <CircleCheck className="size-3.5" /> {t.kieKey.badgeValid}
          </Badge>
        );
      case "checking":
        return (
          <Badge className="gap-1 border-teal-500/40 bg-teal-500/10 text-teal-300" variant="outline">
            <Loader2 className="size-3.5 animate-spin" /> {t.kieKey.badgeChecking}
          </Badge>
        );
      case "invalid":
        return (
          <Badge className="gap-1 border-red-500/40 bg-red-500/10 text-red-400" variant="outline">
            <CircleX className="size-3.5" /> {t.kieKey.badgeInvalid}
          </Badge>
        );
      case "unknown":
        return (
          <Badge className="gap-1 border-zinc-500/40 bg-zinc-500/10 text-zinc-300" variant="outline">
            <CircleAlert className="size-3.5" /> {t.kieKey.badgeSaved}
          </Badge>
        );
      default:
        return (
          <Badge className="gap-1 border-zinc-500/40 bg-zinc-500/10 text-zinc-400" variant="outline">
            <CircleAlert className="size-3.5" /> {t.kieKey.badgeNone}
          </Badge>
        );
    }
  };

  return (
    <section
      aria-label={t.kieKey.sectionAria}
      className="rounded-2xl border border-teal-500/25 bg-gradient-to-l from-teal-500/10 via-emerald-500/5 to-transparent p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 text-teal-400" aria-hidden="true" />
          <h2 className="text-base font-bold">{t.kieKey.heading}</h2>
          {statusBadge()}
        </div>
        <a
          href="https://kie.ai/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-teal-300 underline-offset-4 hover:underline"
        >
          {t.kieKey.getLink}
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
            placeholder="your kie.ai key"
            className="h-11 pr-10 font-mono text-sm"
            aria-label={t.kieKey.inputAria}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showKey ? t.kieKey.hideKey : t.kieKey.showKey}
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
            {t.kieKey.save}
          </Button>
          <Button
            onClick={validateKey}
            className="h-11 flex-1 bg-gradient-to-l from-teal-500 to-emerald-600 text-white hover:from-teal-400 hover:to-emerald-500 sm:flex-none sm:px-6"
            disabled={checking}
          >
            {checking ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            {t.kieKey.check}
          </Button>
        </div>
      </div>

      {mounted && kieKeyStatus === "valid" && kieCredits !== null && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {t.kieKey.credits}
            <b className="text-emerald-400">
              {formatCredits(kieCredits, lang)}
            </b>
          </span>
        </div>
      )}

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <Clapperboard className="mt-0.5 size-3.5 shrink-0 text-teal-400" aria-hidden="true" />
        {t.kieKey.optionalNote}
      </p>

      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
        {t.kieKey.privacyA}
        {mounted && userToken ? <b className="mx-1 font-mono text-teal-300">{userToken}</b> : null}
        {t.kieKey.privacyB}
      </p>
    </section>
  );
}

function formatCredits(credits: number | null, lang: "ar" | "en"): string {
  const t = translations[lang];
  if (credits === null) return "—";
  return `${credits.toLocaleString("en-US")} ${t.kieKey.unit}`;
}
