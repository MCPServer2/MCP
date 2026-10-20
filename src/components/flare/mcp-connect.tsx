"use client";

import { useMemo, useState } from "react";
import {
  Blocks,
  Check,
  ChevronDown,
  Copy,
  Plug,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useFlareStore } from "@/lib/store";
import { useT } from "@/lib/lang-store";
import { useHasMounted } from "./providers";

/** The name to register in ChatGPT / any MCP client. */
export const MCP_SERVER_NAME = "Flare Image Generator";

export function McpConnect() {
  const mounted = useHasMounted();
  const t = useT();
  const userToken = useFlareStore((s) => s.userToken);
  const apiKey = useFlareStore((s) => s.apiKey);

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"name" | "url" | null>(null);

  // Reading window.location during render is safe here: `mounted` is false on
  // the server and during the first (hydration) render, so SSR output and the
  // first client render match — the URL only appears after mount.
  const origin = mounted && typeof window !== "undefined" ? window.location.origin : "";

  const mcpUrl = useMemo(() => {
    if (!origin) return "";
    const token = userToken || "<YOUR_FLARE_TOKEN>";
    const key = apiKey || "<YOUR_COMETAPI_KEY>";
    return `${origin}/api/mcp?token=${encodeURIComponent(token)}&key=${encodeURIComponent(key)}`;
  }, [origin, userToken, apiKey]);

  const copy = async (text: string, kind: "name" | "url") => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
      toast.success(t.mcp.copied);
    } catch {
      toast.error(t.mcp.copyFailed);
    }
  };

  const copyButton = (kind: "name" | "url", label: string, value: string) => (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-8 shrink-0"
      aria-label={t.mcp.copyAria}
      onClick={() => copy(value, kind)}
      disabled={!value}
    >
      {copied === kind ? (
        <Check className="size-3.5 text-emerald-500" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      <span className="sr-only">{label}</span>
    </Button>
  );

  return (
    <section
      aria-label={t.mcp.cardTitle}
      className="overflow-hidden rounded-2xl border border-border/70 bg-card/40 shadow-sm"
    >
      {/* Collapsed header — click to expand */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t.mcp.expandAria}
        className="flex w-full items-center gap-3 p-4 text-start transition-colors hover:bg-muted/40"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 shadow-lg shadow-teal-500/20">
          <Blocks className="size-5 text-white" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold sm:text-base">{t.mcp.cardTitle}</span>
          <span className="block truncate text-xs text-muted-foreground">{t.mcp.cardSubtitle}</span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/60 p-4">
          {/* Server name */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t.mcp.serverNameLabel}</p>
            <div className="flex items-center gap-2" dir="ltr">
              <code className="flex-1 truncate rounded-lg border border-border/60 bg-muted/60 px-3 py-2 font-mono text-xs text-foreground">
                {MCP_SERVER_NAME}
              </code>
              {copyButton("name", t.mcp.copyAria, MCP_SERVER_NAME)}
            </div>
          </div>

          {/* Connection URL */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t.mcp.serverUrlLabel}</p>
            <div className="flex items-center gap-2" dir="ltr">
              <Input
                readOnly
                value={mcpUrl}
                placeholder={t.mcp.urlPlaceholder}
                className="h-9 flex-1 font-mono text-xs"
                aria-label={t.mcp.serverUrlLabel}
                onFocus={(e) => e.currentTarget.select()}
              />
              {copyButton("url", t.mcp.copyAria, mcpUrl)}
            </div>
            {mounted && !userToken && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Plug className="size-3" aria-hidden="true" />
                {t.mcp.needToken}
              </p>
            )}
            {mounted && !apiKey && (
              <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-400">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {t.mcp.needKey}
              </p>
            )}
          </div>

          {/* Setup steps */}
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
            <p className="mb-2 text-xs font-bold">{t.mcp.stepsTitle}</p>
            <ol className="list-inside list-decimal space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <li>{t.mcp.step1}</li>
              <li>{t.mcp.step2}</li>
              <li>{t.mcp.step3}</li>
              <li>{t.mcp.step4}</li>
              <li>{t.mcp.step5}</li>
            </ol>
            <p className="mt-2.5 border-t border-border/40 pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {t.mcp.otherTools}
            </p>
          </div>

          {/* Tools list */}
          <div className="text-[11px] leading-relaxed text-muted-foreground">
            <p className="mb-1.5 font-semibold text-foreground">{t.mcp.toolsList}</p>
            <ul className="space-y-1" dir="ltr">
              <li><code className="rounded bg-muted px-1 py-0.5 font-mono">generate_image</code> — {t.mcp.toolGenerate}</li>
              <li><code className="rounded bg-muted px-1 py-0.5 font-mono">edit_image</code> — {t.mcp.toolEdit}</li>
              <li><code className="rounded bg-muted px-1 py-0.5 font-mono">check_job</code> — {t.mcp.toolCheck}</li>
              <li><code className="rounded bg-muted px-1 py-0.5 font-mono">get_image</code> — {t.mcp.toolGet}</li>
              <li><code className="rounded bg-muted px-1 py-0.5 font-mono">list_recent_images</code> — {t.mcp.toolList}</li>
            </ul>
          </div>

          {/* Privacy note */}
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-400">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {t.mcp.privacy}
          </p>
        </div>
      )}
    </section>
  );
}
