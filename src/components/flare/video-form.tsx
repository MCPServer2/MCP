"use client";

import { Clapperboard, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageDropzone } from "./image-dropzone";
import { useLangStore, useT } from "@/lib/lang-store";
import { ASPECT_RATIOS, VIDEO_KEYFRAMES_MAX, VIDEO_RESOLUTIONS, type VideoKeyframeInput } from "@/lib/types";

export interface VideoSettings {
  aspectRatio: string;
  resolution: string;
  duration: number;
  audio: boolean;
}

export interface VideoFormValue {
  prompt: string;
  settings: VideoSettings;
  startFrame: string | null;
  endFrame: string | null;
  loopFrame: string | null;
  refImage: string | null;
  keyframes: VideoKeyframeInput[];
}

interface VideoFormProps {
  value: VideoFormValue;
  onChange: (patch: Partial<VideoFormValue>) => void;
}

/**
 * The "Video generation" tab content: prompt + optional Start/End/Loop frames,
 * an optional image to animate, up to 4 keyframes and the video parameters.
 * All frames are optional — a pure text-to-video generation is valid.
 */
export function VideoForm({ value, onChange }: VideoFormProps) {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const { settings, keyframes } = value;
  const loopActive = Boolean(value.loopFrame);

  const patchSettings = (patch: Partial<VideoSettings>) =>
    onChange({ settings: { ...settings, ...patch } });

  const addKeyframe = () => {
    if (keyframes.length >= VIDEO_KEYFRAMES_MAX) return;
    // Suggest a sensible timestamp: evenly spread inside the duration.
    const suggested = Math.max(
      0.5,
      Math.round(((settings.duration * (keyframes.length + 1)) / (VIDEO_KEYFRAMES_MAX + 1)) * 10) / 10
    );
    onChange({ keyframes: [...keyframes, { url: null, timestamp: Math.min(suggested, settings.duration - 0.5) }] });
  };

  const updateKeyframe = (index: number, patch: Partial<VideoKeyframeInput>) => {
    onChange({
      keyframes: keyframes.map((k, i) => (i === index ? { ...k, ...patch } : k)),
    });
  };

  const removeKeyframe = (index: number) => {
    onChange({ keyframes: keyframes.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="video-prompt">{t.video.promptLabel}</Label>
        <Textarea
          id="video-prompt"
          value={value.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          placeholder={t.video.promptPlaceholder}
          className="min-h-24 resize-y text-sm leading-relaxed"
          maxLength={4096}
        />
        <p className="text-[11px] text-muted-foreground">{t.video.promptHint}</p>
      </div>

      <p className="flex items-start gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 p-2 text-[11px] leading-relaxed text-teal-600 dark:text-teal-300">
        <Clapperboard className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {t.video.framesHint}
      </p>

      {/* Start / End frames */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={loopActive ? "pointer-events-none opacity-50" : ""}>
          <Label className="mb-1.5 block text-xs text-muted-foreground">{t.video.startFrame}</Label>
          <ImageDropzone
            value={value.startFrame}
            onChange={(v) => onChange({ startFrame: v })}
            title={t.video.startFrame}
            subtitle="PNG / JPG / WEBP — ≤ 20 MB"
            readyLabel={t.video.startFrame}
            alt={`${t.video.startFrame} — ${t.refUpload.previewAlt}`}
            successToast={t.video.startFrame}
          />
        </div>
        <div className={loopActive ? "pointer-events-none opacity-50" : ""}>
          <Label className="mb-1.5 block text-xs text-muted-foreground">{t.video.endFrame}</Label>
          <ImageDropzone
            value={value.endFrame}
            onChange={(v) => onChange({ endFrame: v })}
            title={t.video.endFrame}
            subtitle="PNG / JPG / WEBP — ≤ 20 MB"
            readyLabel={t.video.endFrame}
            alt={`${t.video.endFrame} — ${t.refUpload.previewAlt}`}
            successToast={t.video.endFrame}
          />
        </div>
      </div>
      {loopActive && <p className="text-[11px] text-muted-foreground">{t.video.loopNote}</p>}

      {/* Loop frame */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{t.video.loopFrame}</Label>
        <ImageDropzone
          value={value.loopFrame}
          onChange={(v) => onChange({ loopFrame: v })}
          title={t.video.loopFrame}
          subtitle="PNG / JPG / WEBP — ≤ 20 MB"
          readyLabel={t.video.loopFrame}
          alt={`${t.video.loopFrame} — ${t.refUpload.previewAlt}`}
          successToast={t.video.loopFrame}
        />
      </div>

      {/* Image to animate */}
      <div className={settings.resolution === "1080p" ? "pointer-events-none space-y-2 opacity-50" : "space-y-2"}>
        <Label className="text-xs text-muted-foreground">{t.video.referenceLabel}</Label>
        <ImageDropzone
          value={value.refImage}
          onChange={(v) => onChange({ refImage: v })}
          title={t.video.referenceLabel}
          subtitle="PNG / JPG / WEBP — ≤ 20 MB"
          readyLabel={t.video.referenceLabel}
          alt={`${t.video.referenceLabel} — ${t.refUpload.previewAlt}`}
          successToast={t.video.referenceLabel}
        />
        <p className="text-[11px] text-muted-foreground">{t.video.referenceHint}</p>
      </div>

      {/* Keyframes */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">{t.video.keyframesLabel}</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={addKeyframe}
            disabled={keyframes.length >= VIDEO_KEYFRAMES_MAX}
          >
            <Plus className="size-3.5" />
            {t.video.keyframeAdd}
          </Button>
        </div>
        {keyframes.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-center text-[11px] text-muted-foreground">
            {t.video.keyframeTimeHint}
          </p>
        ) : (
          <div className="space-y-3">
            {keyframes.map((k, i) => (
              <div key={i} className="space-y-2 rounded-xl border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">
                    #{i + 1} — {t.video.keyframesLabel}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 hover:text-red-400"
                    aria-label={t.video.keyframeRemove}
                    onClick={() => removeKeyframe(i)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <ImageDropzone
                  value={k.url}
                  onChange={(v) => updateKeyframe(i, { url: v })}
                  title={`${t.video.keyframeAdd} #${i + 1}`}
                  subtitle="PNG / JPG / WEBP — ≤ 20 MB"
                  readyLabel={`${t.video.keyframeAdd} #${i + 1}`}
                  alt={`Keyframe ${i + 1} — ${t.refUpload.previewAlt}`}
                  successToast={t.video.keyframeAdd}
                />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t.video.keyframeTime}</Label>
                  <Input
                    type="number"
                    min={0.1}
                    max={Math.max(0.1, settings.duration - 0.5)}
                    step={0.5}
                    value={k.timestamp}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) updateKeyframe(i, { timestamp: v });
                    }}
                    className="h-9 text-sm"
                    aria-label={t.video.keyframeTime}
                  />
                  <p className="text-[10px] text-muted-foreground">{t.video.keyframeTimeHint}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Parameters */}
      <div className="grid grid-cols-2 gap-3">
        <ParamSelect
          label={t.video.aspectRatio}
          value={settings.aspectRatio}
          onChange={(v) => patchSettings({ aspectRatio: v })}
          options={ASPECT_RATIOS.map((v) => ({ value: v, label: aspectLabel(lang, v) }))}
        />
        <ParamSelect
          label={t.video.resolution}
          value={settings.resolution}
          onChange={(v) => patchSettings({ resolution: v })}
          options={VIDEO_RESOLUTIONS.map((v) => ({ value: v, label: v }))}
        />
        <div className="space-y-1.5">
          <Label htmlFor="video-duration" className="text-xs text-muted-foreground">
            {t.video.duration}
          </Label>
          <Input
            id="video-duration"
            type="number"
            min={1}
            max={15}
            step={1}
            value={settings.duration}
            onChange={(e) => {
              const v = Math.min(Math.max(Math.round(Number(e.target.value) || 8), 1), 15);
              patchSettings({ duration: v });
            }}
            className="h-10 text-sm"
          />
        </div>
        <div className="flex items-end">
          <div className="flex w-full items-start justify-between gap-2 rounded-xl border bg-muted/30 p-3">
            <div>
              <Label htmlFor="video-audio" className="text-sm">{t.video.audio}</Label>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                {t.video.audioDesc}
              </p>
            </div>
            <Switch
              id="video-audio"
              checked={settings.audio}
              onCheckedChange={(v) => patchSettings({ audio: v })}
              aria-label={t.video.audio}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function aspectLabel(lang: "ar" | "en", value: string): string {
  const o = { ar: { auto: "تلقائي" }, en: { auto: "Auto" } }[lang];
  if (value === "auto") return o.auto;
  return value;
}

function ParamSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 w-full text-sm" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-sm">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
