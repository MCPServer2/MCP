"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useT } from "@/lib/lang-store";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export interface ImageDropzoneProps {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  /** Title shown on the empty dropzone */
  title: string;
  /** Subtitle (formats + size limit) */
  subtitle?: string;
  /** Label shown on the preview bar when an image is loaded */
  readyLabel: string;
  /** alt text for the preview image */
  alt: string;
  /** Toast message after a successful upload */
  successToast: string;
  /** Optional max preview height class (default max-h-56) */
  previewClassName?: string;
}

/**
 * Generic drag & drop (+ click, + paste) image upload zone.
 * Emits a data URL via onChange; pass null to clear.
 */
export function ImageDropzone({
  value,
  onChange,
  title,
  subtitle,
  readyLabel,
  alt,
  successToast,
  previewClassName = "mx-auto max-h-56 w-auto object-contain",
}: ImageDropzoneProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const readFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error(t.dropzone.notImage);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(t.dropzone.tooBig);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        onChange(String(reader.result));
        toast.success(successToast);
      };
      reader.onerror = () => toast.error(t.dropzone.readFailed);
      reader.readAsDataURL(file);
    },
    [onChange, successToast, t]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) readFile(file);
    },
    [readFile]
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) readFile(file);
    },
    [readFile]
  );

  if (value) {
    return (
      <div className="group relative overflow-hidden rounded-xl border border-border">
        <img src={value} alt={alt} className={previewClassName} />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-background/80 px-3 py-2 backdrop-blur">
          <span className="text-xs text-muted-foreground">{readyLabel}</span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => onChange(null)}
            className="h-8 gap-1"
          >
            <Trash2 className="size-3.5" />
            {t.dropzone.remove}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={title}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onPaste={onPaste}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
        dragOver
          ? "border-orange-400 bg-orange-500/10"
          : "border-border bg-muted/30 hover:border-orange-400/60 hover:bg-orange-500/5"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) readFile(file);
          e.target.value = "";
        }}
      />
      {dragOver ? (
        <UploadCloud className="size-8 text-orange-400" aria-hidden="true" />
      ) : (
        <ImagePlus className="size-8 text-muted-foreground" aria-hidden="true" />
      )}
      <div>
        <p className="text-sm font-medium">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
