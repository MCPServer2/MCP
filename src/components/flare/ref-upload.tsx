"use client";

import { useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFlareStore } from "@/lib/store";
import { useT } from "@/lib/lang-store";
import { ImageDropzone } from "./image-dropzone";

/**
 * Optional reference image for the text-to-image mode.
 * Collapsed by default; expands into a dropzone. When set, the model uses the
 * image as a visual reference while applying the user's text prompt.
 */
export function RefUpload() {
  const t = useT();
  const refImage = useFlareStore((s) => s.refImage);
  const setRefImage = useFlareStore((s) => s.setRefImage);
  const [open, setOpen] = useState(false);

  if (refImage) {
    return (
      <div className="space-y-2">
        <div className="relative overflow-hidden rounded-xl border border-border">
          <img
            src={refImage}
            alt={t.refUpload.previewAlt}
            className="mx-auto max-h-40 w-auto object-contain"
          />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-background/80 px-3 py-2 backdrop-blur">
            <span className="text-xs text-muted-foreground">{t.refUpload.ready}</span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setRefImage(null)}
              className="h-8 gap-1"
            >
              <X className="size-3.5" />
              {t.refUpload.remove}
            </Button>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{t.refUpload.hint}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.refUpload.addAria}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-dashed p-3 text-start transition-colors hover:border-orange-400/60 hover:bg-orange-500/5"
      >
        <ImagePlus className="size-4.5 shrink-0 text-orange-400" aria-hidden="true" />
        <span className="text-sm">
          {t.refUpload.add} <span className="text-xs text-muted-foreground">{t.refUpload.optional}</span>
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <ImageDropzone
        value={refImage}
        onChange={(v) => {
          setRefImage(v);
          if (v) setOpen(false);
        }}
        title={t.refUpload.dropTitle}
        subtitle={t.refUpload.dropSubtitle}
        readyLabel={t.refUpload.ready}
        alt={t.refUpload.previewAlt}
        successToast={t.refUpload.successToast}
        previewClassName="mx-auto max-h-40 w-auto object-contain"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(false)}
        className="h-8 text-xs text-muted-foreground"
      >
        {t.common.cancel}
      </Button>
    </div>
  );
}
