"use client";

import { Flame, ExternalLink, ShieldCheck, Fingerprint } from "lucide-react";
import { useT } from "@/lib/lang-store";

export function SiteFooter() {
  const t = useT();

  return (
    <footer className="mt-auto border-t border-border/60 bg-background/60 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-center text-xs text-muted-foreground sm:flex-row sm:px-6 sm:text-start">
        <p className="flex items-center gap-1.5">
          <Flame className="size-3.5 text-orange-400" aria-hidden="true" />
          {t.footer.tagline}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">gpt-image-2.5-flare</code>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1">
            <Fingerprint className="size-3.5" aria-hidden="true" />
            {t.footer.perVisitor}
          </span>
          <span className="flex items-center gap-1">
            <ShieldCheck className="size-3.5 text-emerald-500" aria-hidden="true" />
            {t.footer.keysLocal}
          </span>
          <a
            href="https://www.cometapi.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-orange-300 underline-offset-4 hover:underline"
          >
            CometAPI
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}
