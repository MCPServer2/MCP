"use client";

import { useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  ExternalLink,
  CircleAlert,
  CircleCheck,
  CircleX,
  ImageIcon,
  DatabaseBackup,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useFlareStore } from "@/lib/store";
import { useLangStore, useT } from "@/lib/lang-store";
import { fmt, serverMsg, translations } from "@/lib/i18n";
import type { KeyUsageInfo } from "@/lib/types";
import { useHasMounted } from "./providers";

interface CometKeyStatusResponse {
  configured?: boolean;
  keyPreview?: string | null;
  name?: string | null;
  available?: number | null;
  unlimited?: boolean | null;
  valid?: boolean;
  stored?: boolean;
  error?: string;
}

/**
 * CometAPI API key bar for the images tabs — same look & behaviour as the
 * kie.ai key bar used for videos, but the key is saved ENCRYPTED in the
 * database (bound to the visitor's FLR- token) instead of the browser, so it
 * also powers MCP image generations from external chat clients without a
 * &key= URL parameter. A legacy key previously saved in localStorage is
 * migrated to the vault automatically, then scrubbed from the browser.
 */
export function ApiKeyBar() {
  const mounted = useHasMounted();
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const keyStatus = useFlareStore((s) => s.keyStatus);
  const keyUsage = useFlareStore((s) => s.keyUsage);
  const setKeyStatus = useFlareStore((s) => s.setKeyStatus);
  const userToken = useFlareStore((s) => s.userToken);

  const [draft, setDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!mounted || !userToken) return;
    let cancelled = false;

    // One-time migration: a key saved by an older version lives in localStorage
    // ("flare-studio-v1") — push it to the vault, then scrub it from the browser.
    const migrateLegacyKey = async (): Promise<boolean> => {
      try {
        const raw = localStorage.getItem("flare-studio-v1");
        if (!raw) return false;
        const parsed = JSON.parse(raw) as { state?: { apiKey?: unknown } };
        const legacy = typeof parsed?.state?.apiKey === "string" ? parsed.state.apiKey.trim() : "";
        if (!legacy) return false;
        const res = await fetch("/api/comet-key", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userToken, apiKey: legacy }),
        });
        if (res.ok) {
          localStorage.setItem(
            "flare-studio-v1",
            raw.replace(/("apiKey"\s*:\s*")[^"]*(")/, "$1$2")
          );
          return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    const load = async (isRetry = false) => {
      const migrated = await migrateLegacyKey();
      try {
        const res = await fetch(`/api/comet-key?token=${encodeURIComponent(userToken)}`);
        const data = (await res.json()) as CometKeyStatusResponse;
        if (cancelled) return;
        if (data.configured) {
          setPreview(data.keyPreview ?? null);
          setKeyStatus(migrated ? "unknown" : usageToStatus(data), usageFrom(data));
          if (migrated) {
            toast.success(t.apiKey.saved, { description: t.apiKey.savedDesc });
          }
        } else {
          setKeyStatus("empty");
        }
      } catch {
        if (cancelled) return;
        if (!isRetry) {
          // Transient failure (e.g. dev-server cold start) — retry once.
          setTimeout(() => {
            if (!cancelled) void load(true);
          }, 2_500);
          return;
        }
        setKeyStatus("empty");
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [mounted, userToken]);

  /** Validates with a free probe and stores the key encrypted in the vault. */
  const submitKey = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      toast.error(t.apiKey.enterFirst);
      return;
    }
    setBusy(true);
    setKeyStatus("checking");
    try {
      const res = await fetch("/api/comet-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken, apiKey: trimmed }),
      });
      const data = (await res.json()) as CometKeyStatusResponse;
      if (!res.ok) {
        setKeyStatus(data.valid === false ? "invalid" : "unknown");
        toast.error(serverMsg(data.error, lang) || t.apiKey.invalid);
        return;
      }
      setPreview(data.keyPreview ?? null);
      setDraft("");
      if (data.valid) {
        setKeyStatus("valid", usageFrom(data));
        toast.success(t.apiKey.valid, {
          description: fmt(t.apiKey.balanceDesc, {
            q: formatQuota(usageFrom(data), lang),
          }),
        });
      } else {
        // Stored but CometAPI was unreachable during the probe — still usable.
        setKeyStatus("unknown");
        toast.success(t.apiKey.saved, { description: t.apiKey.savedDesc });
      }
    } catch {
      setKeyStatus("unknown");
      toast.error(t.apiKey.checkFailed);
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/comet-key?token=${encodeURIComponent(userToken)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as CometKeyStatusResponse;
      if (!res.ok) {
        toast.error(serverMsg(data.error, lang) || t.apiKey.checkFailed);
        return;
      }
      setPreview(null);
      setKeyStatus("empty");
      toast.success(t.apiKey.removed, { description: t.apiKey.removedDesc });
    } catch {
      toast.error(t.apiKey.checkFailed);
    } finally {
      setRemoving(false);
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

  const configured = mounted && Boolean(preview);

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
              onKeyDown={(e) => e.key === "Enter" && submitKey()}
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
              onClick={submitKey}
              variant="secondary"
              className="h-11 flex-1 sm:flex-none sm:px-6"
              disabled={busy || removing}
            >
              {t.apiKey.save}
            </Button>
            <Button
              onClick={submitKey}
              className="h-11 flex-1 bg-gradient-to-l from-amber-500 to-orange-600 text-white hover:from-amber-400 hover:to-orange-500 sm:flex-none sm:px-6"
              disabled={busy || removing}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              {t.apiKey.check}
            </Button>
            {configured && (
              <Button
                onClick={removeKey}
                variant="outline"
                className="h-11 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                disabled={busy || removing}
                aria-label={t.apiKey.remove}
              >
                {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                {t.apiKey.remove}
              </Button>
            )}
          </div>
        </div>

        {configured && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <DatabaseBackup className="size-3.5 text-orange-400" aria-hidden="true" />
              {t.apiKey.previewLabel}
              <b className="font-mono text-orange-300" dir="ltr">
                {preview}
              </b>
            </span>
            {keyStatus === "valid" && keyUsage && (
              <>
                {keyUsage.name && (
                  <span>
                    {t.apiKey.keyName}
                    <b className="text-foreground">{keyUsage.name}</b>
                  </span>
                )}
                <span>
                  {t.apiKey.balance}
                  <b className="text-emerald-400">{formatQuota(keyUsage, lang)}</b>
                </span>
                <span>
                  {t.apiKey.used}
                  <b className="text-foreground">{keyUsage.totalUsed.toLocaleString("en-US")}</b>
                </span>
              </>
            )}
          </div>
        )}

        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <ImageIcon className="mt-0.5 size-3.5 shrink-0 text-orange-400" aria-hidden="true" />
          {t.apiKey.vaultNote}
        </p>

        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
          {t.apiKey.privacyA}
          {mounted && userToken ? <b className="mx-1 font-mono text-orange-300">{userToken}</b> : null}
          {t.apiKey.privacyB}
        </p>
      </div>
    </section>
  );
}

/** Maps a vault status payload onto a KeyStatus + KeyUsageInfo pair. */
function usageFrom(data: CometKeyStatusResponse): KeyUsageInfo {
  return {
    name: data.name ?? "",
    totalGranted: 0,
    totalUsed: 0,
    totalAvailable: data.available ?? 0,
    unlimitedQuota: Boolean(data.unlimited),
    expiresAt: 0,
  };
}

function usageToStatus(data: CometKeyStatusResponse): "valid" | "unknown" {
  return data.unlimited || typeof data.available === "number" ? "valid" : "unknown";
}

function formatQuota(usage: KeyUsageInfo, lang: "ar" | "en"): string {
  const t = translations[lang];
  if (usage.unlimitedQuota) return t.apiKey.unlimited;
  const units = usage.totalAvailable;
  // CometAPI quota units: 500,000 units ≈ $1 (one-api convention)
  const approxUsd = units / 500000;
  return `${units.toLocaleString("en-US")} ${t.apiKey.unit}${approxUsd > 0 ? ` (~$${approxUsd.toFixed(2)})` : ""}`;
}
