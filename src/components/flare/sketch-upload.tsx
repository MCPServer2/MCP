"use client";

import { useFlareStore } from "@/lib/store";
import { useT } from "@/lib/lang-store";
import { ImageDropzone } from "./image-dropzone";

export function SketchUpload() {
  const t = useT();
  const sketchImage = useFlareStore((s) => s.sketchImage);
  const setSketchImage = useFlareStore((s) => s.setSketchImage);

  return (
    <ImageDropzone
      value={sketchImage}
      onChange={setSketchImage}
      title={t.sketchUpload.dropTitle}
      subtitle={t.sketchUpload.dropSubtitle}
      readyLabel={t.sketchUpload.ready}
      alt={t.sketchUpload.alt}
      successToast={t.sketchUpload.successToast}
    />
  );
}
