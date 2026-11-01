"use client";

import { useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clapperboard, Download, Film, RefreshCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useFlareStore } from "@/lib/store";
import { useLangStore, useT } from "@/lib/lang-store";
import { fmt } from "@/lib/i18n";
import type { VideoItem } from "@/lib/types";

/** URL of a stored video for the current token. */
function videoUrlFor(id: string, token: string): string {
  return `/api/video-file/${id}?token=${encodeURIComponent(token)}`;
}

export function VideoResults() {
  const t = useT();
  const latestVideos = useFlareStore((s) => s.latestVideos);
  const items = latestVideos.length > 0 ? latestVideos : [];

  return (
    <section aria-label={t.video.resultsTitle} className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Clapperboard className="size-5 text-teal-400" aria-hidden="true" />
          {t.video.resultsTitle}
        </h2>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/20 p-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-500/20 to-cyan-500/10">
            <Clapperboard className="size-6 text-teal-400" aria-hidden="true" />
          </div>
          <p className="mt-1 text-sm font-medium">{t.video.resultsTitle}</p>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{t.video.resultsEmpty}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <VideoCard item={item} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

export function VideoLibrary() {
  const t = useT();
  const userToken = useFlareStore((s) => s.userToken);
  const videoList = useFlareStore((s) => s.videoList);
  const setVideoList = useFlareStore((s) => s.setVideoList);

  const refresh = useCallback(
    async (token: string) => {
      if (!token) return;
      try {
        const res = await fetch(`/api/videos?token=${encodeURIComponent(token)}`);
        const data = (await res.json()) as { items?: VideoItem[] };
        if (res.ok && data.items) setVideoList(data.items);
      } catch {
        // silent — library is non-critical
      }
    },
    [setVideoList]
  );

  useEffect(() => {
    if (userToken) void refresh(userToken);
  }, [userToken, refresh]);

  return (
    <section aria-label={t.video.libraryTitle} className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Film className="size-5 text-teal-400" aria-hidden="true" />
          {t.video.libraryTitle}
          <Badge variant="secondary" className="font-mono text-[10px]">
            {fmt(videoList.length === 1 ? t.video.countOne : t.video.countMany, { n: videoList.length })}
          </Badge>
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t.video.refreshAria}
          title={t.video.refreshTitle}
          onClick={() => void refresh(userToken)}
          disabled={!userToken}
        >
          <RefreshCcw className="size-4" />
        </Button>
      </div>

      {videoList.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed bg-muted/20 p-6 text-center text-xs text-muted-foreground">
          {userToken ? t.video.libraryEmpty : t.gallery.preparing}
        </p>
      ) : (
        <div className="custom-scrollbar mt-4 grid max-h-96 grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {videoList.map((item) => (
            <VideoCard key={item.id} item={item} compact />
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{t.video.note}</p>
    </section>
  );
}

export function VideoCard({ item, compact = false }: { item: VideoItem; onExpand?: () => void; compact?: boolean }) {
  const t = useT();
  const userToken = useFlareStore((s) => s.userToken);
  const removeVideoItem = useFlareStore((s) => s.removeVideoItem);
  const url = videoUrlFor(item.id, userToken);

  const download = async () => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `flare-video-${item.id}.mp4`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error(t.video.downloadFailed);
    }
  };

  const remove = async () => {
    try {
      const res = await fetch(`/api/video-file/${item.id}?token=${encodeURIComponent(userToken)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      removeVideoItem(item.id);
      toast.success(t.video.deleted);
    } catch {
      toast.error(t.video.deleteFailed);
    }
  };

  const flags: string[] = [];
  if (item.usedStartFrame) flags.push(t.video.badgeStart);
  if (item.usedEndFrame) flags.push(t.video.badgeEnd);
  if (item.usedLoop) flags.push(t.video.badgeLoop);
  if (item.usedKeyframes > 0) flags.push(fmt(t.video.badgeKeyframes, { n: item.usedKeyframes }));
  if (item.usedReference) flags.push(t.video.badgeAnimated);

  return (
    <figure className="group overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="relative">
        <video
          src={url}
          controls
          preload="metadata"
          playsInline
          className={`w-full bg-black/90 ${compact ? "max-h-56" : "max-h-[520px]"}`}
          aria-label={`${t.video.altPrefix}${item.prompt.slice(0, 80)}`}
        />
        <div className="absolute left-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button
            size="icon"
            variant="secondary"
            aria-label={t.video.download}
            title={t.video.download}
            onClick={(e) => {
              e.stopPropagation();
              download();
            }}
            className="size-8 border bg-background/85 backdrop-blur hover:bg-background"
          >
            <Download className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            aria-label={t.video.remove}
            title={t.video.remove}
            onClick={(e) => {
              e.stopPropagation();
              remove();
            }}
            className="size-8 border bg-background/85 backdrop-blur hover:bg-background hover:text-red-400"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <figcaption className="space-y-2 p-3">
        <p className="line-clamp-2 text-xs leading-relaxed text-foreground/90" title={item.prompt}>
          {item.prompt || "—"}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <Badge variant="secondary" className="px-1.5 py-0">
            {fmt(t.video.secondsBadge, { n: item.duration })}
          </Badge>
          <Badge variant="secondary" className="px-1.5 py-0">{item.resolution}</Badge>
          {item.aspectRatio !== "auto" && (
            <Badge variant="secondary" className="px-1.5 py-0">{item.aspectRatio}</Badge>
          )}
          <Badge variant="secondary" className="px-1.5 py-0">
            {item.audio ? t.video.badgeAudio : t.video.badgeMute}
          </Badge>
          {flags.map((f) => (
            <Badge
              key={f}
              variant="outline"
              className="border-teal-500/40 bg-teal-500/10 px-1.5 py-0 text-teal-600 dark:text-teal-300"
            >
              {f}
            </Badge>
          ))}
        </div>
      </figcaption>
    </figure>
  );
}
