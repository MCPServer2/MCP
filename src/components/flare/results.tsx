"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Download, Expand, Images, Layers, PenTool, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useFlareStore, imageUrlFor } from "@/lib/store";
import { useLangStore, useT } from "@/lib/lang-store";
import { fmt, shortQualityLabel } from "@/lib/i18n";
import type { GenerationItem } from "@/lib/types";

export function Results() {
  const t = useT();
  const latest = useFlareStore((s) => s.latest);
  const openViewer = useFlareStore((s) => s.openViewer);
  const items = latest.length > 0 ? latest : [];

  return (
    <section aria-label={t.results.sectionAria} className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Images className="size-5 text-orange-400" aria-hidden="true" />
          {t.results.title}
        </h2>
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <ResultCard item={item} onExpand={() => openViewer(item.id)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  const t = useT();
  const mode = useFlareStore((s) => s.mode);
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/20 p-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/10">
        <Wand2 className="size-6 text-orange-400" aria-hidden="true" />
      </div>
      <p className="mt-1 text-sm font-medium">{t.results.emptyTitle}</p>
      <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
        {mode === "generate" ? t.results.emptyGenerate : t.results.emptySketch}
      </p>
    </div>
  );
}

export function ResultCard({
  item,
  onExpand,
  compact = false,
}: {
  item: GenerationItem;
  onExpand: () => void;
  compact?: boolean;
}) {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const userToken = useFlareStore((s) => s.userToken);
  const removeItem = useFlareStore((s) => s.removeItem);
  const setSketchImage = useFlareStore((s) => s.setSketchImage);
  const setMode = useFlareStore((s) => s.setMode);

  const url = imageUrlFor(item.id, userToken);

  const download = async () => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `flare-${item.id}.${item.outputFormat === "jpeg" ? "jpg" : item.outputFormat}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error(t.results.downloadFailed);
    }
  };

  const useAsSketch = async () => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        setSketchImage(String(reader.result));
        setMode("sketch");
        toast.success(t.results.usedAsSketch);
        document.getElementById("generator-panel")?.scrollIntoView({ behavior: "smooth" });
      };
      reader.readAsDataURL(blob);
    } catch {
      toast.error(t.results.convertFailed);
    }
  };

  const remove = async () => {
    try {
      const res = await fetch(`/api/gallery/${item.id}?token=${encodeURIComponent(userToken)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      removeItem(item.id);
      toast.success(t.results.deleted);
    } catch {
      toast.error(t.results.deleteFailed);
    }
  };

  return (
    <figure className="group overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="relative">
        <img
          src={url}
          alt={`${t.results.altPrefix}${item.prompt.slice(0, 80)}`}
          loading="lazy"
          className={`w-full cursor-zoom-in object-cover ${compact ? "h-40" : "max-h-[480px]"}`}
          onClick={onExpand}
        />
        <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <ActionButton label={t.results.expand} onClick={onExpand}>
            <Expand className="size-4" />
          </ActionButton>
          <ActionButton label={t.results.download} onClick={download}>
            <Download className="size-4" />
          </ActionButton>
          {!compact && (
            <ActionButton label={t.results.useAsSketch} onClick={useAsSketch}>
              <PenTool className="size-4" />
            </ActionButton>
          )}
          <ActionButton label={t.results.remove} onClick={remove} danger>
            <Trash2 className="size-4" />
          </ActionButton>
        </div>
      </div>
      <figcaption className="space-y-2 p-3">
        <p className="line-clamp-2 text-xs leading-relaxed text-foreground/90" title={item.prompt}>
          {item.prompt || "—"}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <ModeBadge mode={item.mode} />
          {item.usedReference && (
            <Badge
              variant="outline"
              className="gap-1 border-teal-500/40 bg-teal-500/10 px-1.5 py-0 text-teal-300"
            >
              <Layers className="size-3" /> {t.results.refBadge}
            </Badge>
          )}
          <Badge variant="secondary" className="px-1.5 py-0">{item.size}</Badge>
          <Badge variant="secondary" className="px-1.5 py-0">
            {fmt(t.results.qualityBadge, {
              q: item.quality === "auto" ? t.results.qualityAuto : shortQualityLabel(lang, item.quality),
            })}
          </Badge>
          {item.totalTokens != null && (
            <Badge variant="secondary" className="px-1.5 py-0">
              {fmt(t.results.tokensBadge, { n: item.totalTokens.toLocaleString("en-US") })}
            </Badge>
          )}
        </div>
      </figcaption>
    </figure>
  );
}

function ActionButton({
  label,
  onClick,
  children,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Button
      size="icon"
      variant="secondary"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`size-8 border bg-background/85 backdrop-blur hover:bg-background ${
        danger ? "hover:text-red-400" : ""
      }`}
    >
      {children}
    </Button>
  );
}

export function ModeBadge({ mode }: { mode: string }) {
  const t = useT();
  return mode === "sketch" ? (
    <Badge className="gap-1 border-purple-500/40 bg-purple-500/10 px-1.5 py-0 text-purple-300" variant="outline">
      <PenTool className="size-3" /> Sketch
    </Badge>
  ) : (
    <Badge className="gap-1 border-orange-500/40 bg-orange-500/10 px-1.5 py-0 text-orange-300" variant="outline">
      <Wand2 className="size-3" /> {t.results.generateBadge}
    </Badge>
  );
}
