"use client";

import { Download, Copy, Trash2, PenTool } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useFlareStore, imageUrlFor } from "@/lib/store";
import { useLangStore, useT } from "@/lib/lang-store";
import { fmt } from "@/lib/i18n";
import type { GenerationItem } from "@/lib/types";
import { ModeBadge } from "./results";

export function Lightbox() {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const viewerId = useFlareStore((s) => s.viewerId);
  const closeViewer = useFlareStore((s) => s.closeViewer);
  const latest = useFlareStore((s) => s.latest);
  const gallery = useFlareStore((s) => s.gallery);
  const userToken = useFlareStore((s) => s.userToken);

  const item: GenerationItem | undefined =
    latest.find((i) => i.id === viewerId) ?? gallery.find((i) => i.id === viewerId);

  const download = async () => {
    if (!item) return;
    try {
      const res = await fetch(imageUrlFor(item.id, userToken));
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `flare-${item.id}.${item.outputFormat === "jpeg" ? "jpg" : item.outputFormat}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error(t.lightbox.downloadFailed);
    }
  };

  const copyPrompt = async () => {
    if (!item) return;
    try {
      await navigator.clipboard.writeText(item.prompt);
      toast.success(t.lightbox.copied);
    } catch {
      toast.error(t.lightbox.copyFailed);
    }
  };

  const useAsSketch = async () => {
    if (!item) return;
    try {
      const res = await fetch(imageUrlFor(item.id, userToken));
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        useFlareStore.getState().setSketchImage(String(reader.result));
        useFlareStore.getState().setMode("sketch");
        useFlareStore.getState().closeViewer();
        toast.success(t.lightbox.usedAsSketch);
      };
      reader.readAsDataURL(blob);
    } catch {
      toast.error(t.lightbox.convertFailed);
    }
  };

  const remove = async () => {
    if (!item) return;
    try {
      const res = await fetch(`/api/gallery/${item.id}?token=${encodeURIComponent(userToken)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      useFlareStore.getState().removeItem(item.id);
      closeViewer();
      toast.success(t.lightbox.deleted);
    } catch {
      toast.error(t.lightbox.deleteFailed);
    }
  };

  return (
    <Dialog open={Boolean(viewerId)} onOpenChange={(open) => !open && closeViewer()}>
      <DialogContent dir={dir} className="max-h-[92vh] max-w-3xl overflow-y-auto">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-start">
                <ModeBadge mode={item.mode} />
                <span className="text-sm font-semibold">{t.lightbox.title}</span>
              </DialogTitle>
              <DialogDescription className="text-start text-xs">
                {fmt(t.lightbox.createdAt, {
                  d: new Date(item.createdAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US", {
                    hour12: false,
                  }),
                })}
              </DialogDescription>
            </DialogHeader>

            <img
              src={imageUrlFor(item.id, userToken)}
              alt={`${t.lightbox.altPrefix}${item.prompt.slice(0, 80)}`}
              className="mx-auto max-h-[55vh] w-auto rounded-xl border object-contain"
            />

            <div className="space-y-2 text-sm">
              <div>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">{t.lightbox.promptUsed}</p>
                <p className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed">{item.prompt || "—"}</p>
              </div>
              {item.revisedPrompt && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">{t.lightbox.revised}</p>
                  <p className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed">{item.revisedPrompt}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="secondary">{item.model}</Badge>
                {item.usedReference && <Badge variant="secondary">{t.lightbox.withRef}</Badge>}
                <Badge variant="secondary">{item.size}</Badge>
                <Badge variant="secondary">{fmt(t.lightbox.quality, { q: item.quality })}</Badge>
                <Badge variant="secondary">{fmt(t.lightbox.format, { f: item.outputFormat.toUpperCase() })}</Badge>
                {item.background && item.background !== "auto" && (
                  <Badge variant="secondary">
                    {fmt(t.lightbox.background, {
                      b: item.background === "transparent" ? t.lightbox.bgTransparent : t.lightbox.bgOpaque,
                    })}
                  </Badge>
                )}
                {item.totalTokens != null && (
                  <Badge variant="secondary">
                    {fmt(t.lightbox.tokens, { n: item.totalTokens.toLocaleString("en-US") })}
                  </Badge>
                )}
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-2">
              <Button onClick={download} className="flex-1 gap-1.5 bg-gradient-to-l from-amber-500 to-orange-600 text-white hover:from-amber-400 hover:to-orange-500">
                <Download className="size-4" /> {t.lightbox.download}
              </Button>
              <Button onClick={copyPrompt} variant="secondary" className="flex-1 gap-1.5">
                <Copy className="size-4" /> {t.lightbox.copyPrompt}
              </Button>
              <Button onClick={useAsSketch} variant="secondary" className="flex-1 gap-1.5">
                <PenTool className="size-4" /> {t.lightbox.useAsSketch}
              </Button>
              <Button onClick={remove} variant="destructive" className="flex-1 gap-1.5">
                <Trash2 className="size-4" /> {t.lightbox.remove}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
