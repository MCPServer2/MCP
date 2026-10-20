"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Flame, Moon, Sun, Copy, RefreshCcw, Fingerprint, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useFlareStore } from "@/lib/store";
import { useLangStore, useT } from "@/lib/lang-store";
import { LangToggle } from "./lang-toggle";
import { useHasMounted } from "./providers";

export function SiteHeader() {
  const { theme, setTheme } = useTheme();
  const mounted = useHasMounted();
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const userToken = useFlareStore((s) => s.userToken);
  const rotateToken = useFlareStore((s) => s.rotateToken);
  const clearGalleryLocal = useFlareStore((s) => s.clearGalleryLocal);
  const [copied, setCopied] = useState(false);

  const copyToken = async () => {
    if (!userToken) return;
    try {
      await navigator.clipboard.writeText(userToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success(t.header.tokenCopied);
    } catch {
      toast.error(t.header.copyFailed);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 shadow-lg shadow-orange-500/25">
            <Flame className="size-5 text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate bg-gradient-to-l from-amber-300 via-orange-400 to-red-400 bg-clip-text text-lg font-extrabold leading-tight text-transparent">
              {t.header.title}
            </h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {t.header.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Unique anonymous user token */}
          {mounted && userToken && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="hidden h-9 cursor-pointer gap-1.5 border-orange-500/40 bg-orange-500/10 px-3 font-mono text-xs text-orange-300 hover:bg-orange-500/15 sm:flex"
                    onClick={copyToken}
                    role="button"
                    aria-label={t.header.copyTokenAria}
                  >
                    <Fingerprint className="size-3.5" aria-hidden="true" />
                    {userToken}
                    {copied ? (
                      <Check className="size-3.5 text-emerald-400" aria-hidden="true" />
                    ) : (
                      <Copy className="size-3.5 opacity-60" aria-hidden="true" />
                    )}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{t.header.tokenTooltip}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {mounted && userToken && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t.header.rotateAria}>
                  <RefreshCcw className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir={dir}>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t.header.rotateTitle}</AlertDialogTitle>
                  <AlertDialogDescription>{t.header.rotateDesc}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-orange-600 text-white hover:bg-orange-700"
                    onClick={() => {
                      rotateToken();
                      clearGalleryLocal();
                      toast.success(t.header.rotated);
                    }}
                  >
                    {t.header.rotateConfirm}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <LangToggle />

          <Button
            variant="ghost"
            size="icon"
            aria-label={t.header.themeAria}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {mounted && theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
