"use client";

import { useCallback, useEffect } from "react";
import { GalleryHorizontalEnd, RefreshCcw, Trash2 } from "lucide-react";
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
import { toast } from "sonner";
import { useFlareStore } from "@/lib/store";
import { useLangStore, useT } from "@/lib/lang-store";
import { fmt } from "@/lib/i18n";
import type { GenerationItem } from "@/lib/types";
import { ModeBadge } from "./results";

export function Gallery() {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const userToken = useFlareStore((s) => s.userToken);
  const gallery = useFlareStore((s) => s.gallery);
  const galleryLoading = useFlareStore((s) => s.galleryLoading);
  const setGallery = useFlareStore((s) => s.setGallery);
  const setGalleryLoading = useFlareStore((s) => s.setGalleryLoading);
  const openViewer = useFlareStore((s) => s.openViewer);

  const refresh = useCallback((token: string, isRetry = false) => {
    const run = async (retry: boolean): Promise<void> => {
      setGalleryLoading(true);
      try {
        const res = await fetch(`/api/gallery?token=${encodeURIComponent(token)}`);
        const data = (await res.json()) as { items?: GenerationItem[] };
        if (res.ok && data.items) setGallery(data.items);
      } catch {
        // Transient failure (e.g. dev-server cold start) — retry once, then give up silently.
        if (!retry) setTimeout(() => void run(true), 2_500);
      } finally {
        setGalleryLoading(false);
      }
    };
    if (token) void run(isRetry);
  }, [setGallery, setGalleryLoading]);

  useEffect(() => {
    if (userToken) void refresh(userToken);
  }, [userToken, refresh]);

  const clearAll = async () => {
    try {
      const res = await fetch(`/api/gallery?token=${encodeURIComponent(userToken)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      useFlareStore.getState().clearGalleryLocal();
      toast.success(t.gallery.cleared);
    } catch {
      toast.error(t.gallery.clearFailed);
    }
  };

  return (
    <section aria-label={t.gallery.sectionAria} className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <GalleryHorizontalEnd className="size-5 text-orange-400" aria-hidden="true" />
          {t.gallery.title}
          <Badge variant="secondary" className="font-mono text-[10px]">
            {fmt(gallery.length === 1 ? t.gallery.countOne : t.gallery.countMany, { n: gallery.length })}
          </Badge>
        </h2>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.gallery.refreshAria}
            title={t.gallery.refreshTitle}
            onClick={() => void refresh(userToken)}
            disabled={galleryLoading || !userToken}
          >
            <RefreshCcw className={`size-4 ${galleryLoading ? "animate-spin" : ""}`} />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t.gallery.clearAria}
                title={t.gallery.clearTitle}
                disabled={gallery.length === 0}
                className="hover:text-red-400"
              >
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir={dir}>
              <AlertDialogHeader>
                <AlertDialogTitle>{t.gallery.clearDialogTitle}</AlertDialogTitle>
                <AlertDialogDescription>{t.gallery.clearDialogDesc}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={clearAll}>
                  {t.gallery.clearConfirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {gallery.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed bg-muted/20 p-6 text-center text-xs text-muted-foreground">
          {userToken ? t.gallery.emptyGallery : t.gallery.preparing}
        </p>
      ) : (
        <div className="custom-scrollbar mt-4 grid max-h-96 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
          {gallery.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openViewer(item.id)}
              className="group relative aspect-square overflow-hidden rounded-xl border bg-muted/30 focus-visible:outline-orange-400"
              aria-label={fmt(t.gallery.viewAria, { p: item.prompt.slice(0, 50) })}
            >
              <img
                src={`/api/image/${item.id}?token=${encodeURIComponent(userToken)}`}
                alt={`${t.gallery.altPrefix}${item.prompt.slice(0, 60)}`}
                loading="lazy"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-background/85 px-1.5 py-1 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                <ModeBadge mode={item.mode} />
                <span className="font-mono text-[9px] text-muted-foreground">{item.size}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{t.gallery.note}</p>
    </section>
  );
}
