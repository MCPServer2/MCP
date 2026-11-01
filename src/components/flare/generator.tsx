"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Sparkles,
  Info,
  Pencil,
  UploadCloud,
  Clapperboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useFlareStore } from "@/lib/store";
import { useLangStore, useT } from "@/lib/lang-store";
import {
  backgroundOptionLabel,
  fmt,
  formatOptionLabel,
  qualityOptionLabel,
  serverMsg,
  sizeLabel,
  translations,
} from "@/lib/i18n";
import type {
  GenerateStartResponse,
  GenerationItem,
  GenerationMode,
  JobStatusResponse,
  VideoJobStatusResponse,
  VideoStartResponse,
} from "@/lib/types";
import { BACKGROUNDS, OUTPUT_FORMATS, QUALITIES, SIZES } from "@/lib/types";
import { SketchUpload } from "./sketch-upload";
import { SketchDrawer } from "./sketch-drawer";
import { RefUpload } from "./ref-upload";
import { VideoForm, type VideoFormValue } from "./video-form";
import { KieKeyBar } from "./kie-key-bar";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_WAIT_MS = 300_000; // upstream timeout is 280s
const POLL_MAX_NET_FAILURES = 5;
const VIDEO_POLL_INTERVAL_MS = 3000;
const VIDEO_POLL_MAX_WAIT_MS = 720_000; // videos can take several minutes
const VIDEO_POLL_MAX_NET_FAILURES = 8;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function Generator() {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const apiKey = useFlareStore((s) => s.apiKey);
  const mode = useFlareStore((s) => s.mode);
  const setMode = useFlareStore((s) => s.setMode);
  const settings = useFlareStore((s) => s.settings);
  const updateSettings = useFlareStore((s) => s.updateSettings);
  const sketchImage = useFlareStore((s) => s.sketchImage);
  const setSketchImage = useFlareStore((s) => s.setSketchImage);
  const refImage = useFlareStore((s) => s.refImage);
  const prependResults = useFlareStore((s) => s.prependResults);
  const prependVideoResults = useFlareStore((s) => s.prependVideoResults);
  // Rehydrated asynchronously (skipHydration) — the resume effect waits for it.
  const userToken = useFlareStore((s) => s.userToken);

  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // Sketch source: draw directly on the canvas, or upload an existing image.
  const [sketchSource, setSketchSource] = useState<"draw" | "upload">("draw");
  // Video tab state (frames are optional — pure text-to-video is valid).
  const [video, setVideo] = useState<VideoFormValue>({
    prompt: "",
    settings: { aspectRatio: "16:9", resolution: "480p", duration: 8, audio: true },
    startFrame: null,
    endFrame: null,
    loopFrame: null,
    refImage: null,
    keyframes: [],
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const cancelledRef = useRef(false);
  const resumedRef = useRef(false);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (busy) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [busy]);

  const switchMode = (value: string) => {
    setMode(value as GenerationMode);
  };

  /**
   * Polls the async generation job until it finishes. The heavy CometAPI call
   * runs server-side in the background, so a dropped connection never loses a
   * result — the job keeps running and can even be resumed after a page reload.
   */
  const pollJob = async (jobId: string, generationMode: GenerationMode): Promise<boolean> => {
    const token = useFlareStore.getState().userToken;
    // Read the language at poll time so toasts follow the active UI language.
    const tNow = () => translations[useLangStore.getState().lang];
    const deadline = Date.now() + POLL_MAX_WAIT_MS;
    let netFailures = 0;

    while (Date.now() < deadline) {
      if (cancelledRef.current) return false;
      await sleep(POLL_INTERVAL_MS);
      if (cancelledRef.current) return false;

      let data: JobStatusResponse | null = null;
      try {
        const res = await fetch(`/api/generate/${jobId}?token=${encodeURIComponent(token)}`);
        if (res.status === 404) {
          toast.error(tNow().generator.jobLost);
          return false;
        }
        data = (await res.json()) as JobStatusResponse;
        netFailures = 0;
      } catch {
        netFailures++;
        if (netFailures >= POLL_MAX_NET_FAILURES) {
          toast.error(tNow().generator.pollDropped);
          return false;
        }
        continue;
      }

      if (data.status === "done" && data.items?.length) {
        const items = data.items as GenerationItem[];
        prependResults(items);
        toast.success(
          items.length > 1
            ? fmt(tNow().generator.successMany, { n: items.length })
            : tNow().generator.successOne
        );
        if (generationMode === "generate") setPrompt("");
        return true;
      }

      if (data.status === "error") {
        toast.error(
          serverMsg(data.error, useLangStore.getState().lang) || tNow().generator.generateFailed
        );
        return false;
      }
    }

    toast.error(tNow().generator.timeout);
    return false;
  };

  /**
   * Polls the async video job until the MP4 is stored server-side. The kie.ai
   * call runs in the background, so a dropped connection never loses a video —
   * the job keeps running and is even resumed after a page reload.
   */
  const pollVideoJob = async (jobId: string): Promise<boolean> => {
    const token = useFlareStore.getState().userToken;
    const tNow = () => translations[useLangStore.getState().lang];
    const deadline = Date.now() + VIDEO_POLL_MAX_WAIT_MS;
    let netFailures = 0;

    while (Date.now() < deadline) {
      if (cancelledRef.current) return false;
      await sleep(VIDEO_POLL_INTERVAL_MS);
      if (cancelledRef.current) return false;

      let data: VideoJobStatusResponse | null = null;
      try {
        const res = await fetch(`/api/video/${jobId}?token=${encodeURIComponent(token)}`);
        if (res.status === 404) {
          toast.error(tNow().video.jobLost);
          return false;
        }
        data = (await res.json()) as VideoJobStatusResponse;
        netFailures = 0;
      } catch {
        netFailures++;
        if (netFailures >= VIDEO_POLL_MAX_NET_FAILURES) {
          toast.error(tNow().video.pollDropped);
          return false;
        }
        continue;
      }

      if (data.status === "done" && data.items?.length) {
        prependVideoResults(data.items);
        toast.success(
          data.items.length > 1
            ? fmt(tNow().video.successMany, { n: data.items.length })
            : tNow().video.successOne
        );
        setVideo((v) => ({ ...v, prompt: "" }));
        return true;
      }

      if (data.status === "error") {
        toast.error(
          serverMsg(data.error, useLangStore.getState().lang) || tNow().video.generateFailed
        );
        return false;
      }
    }

    toast.error(tNow().video.timeout);
    return false;
  };

  const submitVideo = async (): Promise<boolean> => {
    const tNow = () => translations[useLangStore.getState().lang];
    const trimmed = video.prompt.trim();
    const hasFrame = Boolean(
      video.startFrame || video.endFrame || video.loopFrame || video.refImage || video.keyframes.some((k) => k.url)
    );
    if (!trimmed && !hasFrame) {
      toast.error(tNow().video.needPromptOrFrame);
      return false;
    }
    if (video.loopFrame && (video.startFrame || video.endFrame)) {
      toast.error(tNow().video.loopConflict);
      return false;
    }
    const badKeyframe = video.keyframes.find(
      (k) => k.url && (!Number.isFinite(k.timestamp) || k.timestamp <= 0 || k.timestamp >= video.settings.duration)
    );
    if (badKeyframe) {
      toast.error(tNow().video.keyframeTimeInvalid);
      return false;
    }

    const res = await fetch("/api/video", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      // No key header — the server uses the kie.ai key saved (encrypted) in
      // the database for this token, falling back to its built-in key.
      body: JSON.stringify({
        userToken: useFlareStore.getState().userToken,
        prompt: trimmed,
        aspectRatio: video.settings.aspectRatio,
        resolution: video.settings.resolution,
        duration: video.settings.duration,
        audio: video.settings.audio,
        startFrame: video.startFrame,
        endFrame: video.endFrame,
        loopFrame: video.loopFrame,
        referenceImage: video.refImage,
        keyframes: video.keyframes.filter((k) => k.url).map((k) => ({ url: k.url, timestamp: k.timestamp })),
      }),
    });

    const start = (await res.json()) as VideoStartResponse;
    if (!res.ok || !start.jobId) {
      toast.error(serverMsg(start.error, useLangStore.getState().lang) || tNow().video.startFailed);
      return false;
    }
    return pollVideoJob(start.jobId);
  };

  const submit = async () => {
    if (mode === "video") {
      if (busyRef.current) return;
      setBusy(true);
      try {
        await submitVideo();
      } catch {
        toast.error(t.video.network);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!apiKey) {
      toast.error(t.generator.needKey);
      return;
    }
    const trimmed = prompt.trim();
    if (mode === "generate" && !trimmed) {
      toast.error(t.generator.needPrompt);
      return;
    }
    if (mode === "sketch" && !sketchImage) {
      toast.error(t.generator.needSketch);
      return;
    }
    if (busyRef.current) return;

    setBusy(true);
    try {
      // 1) Start the job — returns immediately with a jobId.
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cometapi-key": apiKey,
        },
        body: JSON.stringify({
          userToken: useFlareStore.getState().userToken,
          mode,
          prompt: trimmed,
          size: settings.size,
          quality: settings.quality,
          outputFormat: settings.outputFormat,
          n: settings.n,
          background: mode === "generate" ? settings.background : undefined,
          autoEnhance: settings.autoEnhance,
          // sketch mode: required source drawing — generate mode: optional reference image
          image: mode === "sketch" ? sketchImage : refImage,
        }),
      });

      const start = (await res.json()) as GenerateStartResponse;
      if (!res.ok || !start.jobId) {
        toast.error(
          serverMsg(start.error, useLangStore.getState().lang) || t.generator.startFailed
        );
        return;
      }

      // 2) Poll the job until the image is ready.
      await pollJob(start.jobId, mode);
    } catch {
      toast.error(t.generator.network);
    } finally {
      setBusy(false);
    }
  };

  // Resume a pending job after a page reload (e.g. the connection dropped
  // mid-generation, or the user refreshed while the model was still working).
  // Waits for the persisted store to rehydrate (userToken to appear).
  useEffect(() => {
    if (resumedRef.current || !userToken) return;
    resumedRef.current = true;

    (async () => {
      try {
        const res = await fetch(`/api/generate?token=${encodeURIComponent(userToken)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { pending?: { id: string } | null };
        if (data.pending?.id && !busyRef.current && !cancelledRef.current) {
          toast.info(translations[useLangStore.getState().lang].generator.resumeFound);
          setBusy(true);
          try {
            await pollJob(data.pending.id, useFlareStore.getState().mode === "video" ? "generate" : useFlareStore.getState().mode);
          } finally {
            setBusy(false);
          }
        }
      } catch {
        // ignore — the gallery refresh button is the fallback
      }

      // Resume a pending video job the same way.
      try {
        const res = await fetch(`/api/video?token=${encodeURIComponent(userToken)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { pending?: { id: string } | null };
        if (data.pending?.id && !busyRef.current && !cancelledRef.current) {
          toast.info(translations[useLangStore.getState().lang].video.resumeFound);
          setBusy(true);
          try {
            await pollVideoJob(data.pending.id);
          } finally {
            setBusy(false);
          }
        }
      } catch {
        // ignore — the video library refresh button is the fallback
      }
    })();
  }, [userToken]);

  return (
    <section aria-label={t.generator.panelAria} className="rounded-2xl border bg-card text-card-foreground shadow-sm">
      <Tabs value={mode} onValueChange={switchMode} className="gap-0">
        <div className="border-b p-4 sm:p-5">
          <TabsList className="grid h-11 w-full grid-cols-3 bg-muted/60">
            <TabsTrigger value="generate" className="text-[13px] data-[state=active]:bg-background">
              {t.generator.tabGenerate}
            </TabsTrigger>
            <TabsTrigger value="sketch" className="text-[13px] data-[state=active]:bg-background">
              {t.generator.tabSketch}
            </TabsTrigger>
            <TabsTrigger value="video" className="text-[13px] data-[state=active]:bg-background">
              {t.video.tab}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <TabsContent value="generate" className="mt-0 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prompt">{t.generator.promptLabel}</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t.generator.promptPlaceholder}
                className="min-h-28 resize-y text-sm leading-relaxed"
                maxLength={8000}
              />
              <p className="text-[11px] text-muted-foreground">{t.generator.promptHint}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t.generator.refLabel}</Label>
              <RefUpload />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ParamSelect
                label={t.generator.size}
                value={settings.size}
                onChange={(v) => updateSettings({ size: v })}
                options={SIZES.map((v) => ({ value: v, label: sizeLabel(lang, v) }))}
              />
              <ParamSelect
                label={t.generator.quality}
                value={settings.quality}
                onChange={(v) => updateSettings({ quality: v })}
                options={QUALITIES.map((v) => ({ value: v, label: qualityOptionLabel(lang, v) }))}
              />
              <ParamSelect
                label={t.generator.format}
                value={settings.outputFormat}
                onChange={(v) => updateSettings({ outputFormat: v })}
                options={OUTPUT_FORMATS.map((v) => ({ value: v, label: formatOptionLabel(lang, v) }))}
              />
              <ParamSelect
                label={t.generator.background}
                value={settings.background}
                onChange={(v) => updateSettings({ background: v })}
                options={BACKGROUNDS.map((v) => ({ value: v, label: backgroundOptionLabel(lang, v) }))}
                hint={t.generator.bgHint}
              />
            </div>
          </TabsContent>

          <TabsContent value="sketch" className="mt-0 space-y-4">
            <div className="space-y-2">
              <Label>{t.generator.sketchSource}</Label>
              <div
                className="grid grid-cols-2 gap-2"
                role="group"
                aria-label={t.generator.sketchSourceAria}
              >
                <Button
                  type="button"
                  variant={sketchSource === "draw" ? "default" : "outline"}
                  onClick={() => setSketchSource("draw")}
                  aria-pressed={sketchSource === "draw"}
                  className="h-10 gap-1.5"
                >
                  <Pencil className="size-4" />
                  {t.generator.draw}
                </Button>
                <Button
                  type="button"
                  variant={sketchSource === "upload" ? "default" : "outline"}
                  onClick={() => setSketchSource("upload")}
                  aria-pressed={sketchSource === "upload"}
                  className="h-10 gap-1.5"
                >
                  <UploadCloud className="size-4" />
                  {t.generator.upload}
                  <span className="text-[10px] opacity-70">{t.generator.optional}</span>
                </Button>
              </div>
            </div>

            {sketchSource === "draw" ? (
              <SketchDrawer onSourceChange={setSketchImage} />
            ) : (
              <div className="space-y-2">
                <SketchUpload />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t.generator.uploadHint}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="sketch-prompt">{t.generator.sketchPromptLabel}</Label>
              <Textarea
                id="sketch-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t.generator.sketchPromptPlaceholder}
                className="min-h-24 resize-y text-sm leading-relaxed"
                maxLength={8000}
              />
            </div>

            <div className="flex items-start justify-between gap-3 rounded-xl border bg-muted/30 p-3">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
                <div>
                  <Label htmlFor="auto-enhance" className="text-sm">{t.generator.autoEnhance}</Label>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {t.generator.autoEnhanceDesc}
                  </p>
                </div>
              </div>
              <Switch
                id="auto-enhance"
                checked={settings.autoEnhance}
                onCheckedChange={(v) => updateSettings({ autoEnhance: v })}
                aria-label={t.generator.autoEnhance}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ParamSelect
                label={t.generator.size}
                value={settings.size}
                onChange={(v) => updateSettings({ size: v })}
                options={SIZES.map((v) => ({ value: v, label: sizeLabel(lang, v) }))}
              />
              <ParamSelect
                label={t.generator.quality}
                value={settings.quality}
                onChange={(v) => updateSettings({ quality: v })}
                options={QUALITIES.map((v) => ({ value: v, label: qualityOptionLabel(lang, v) }))}
              />
              <ParamSelect
                label={t.generator.format}
                value={settings.outputFormat}
                onChange={(v) => updateSettings({ outputFormat: v })}
                options={OUTPUT_FORMATS.map((v) => ({ value: v, label: formatOptionLabel(lang, v) }))}
              />
              <NumInput
                label={t.generator.count}
                value={settings.n}
                onChange={(v) => updateSettings({ n: v })}
              />
            </div>
          </TabsContent>

          <TabsContent value="video" className="mt-0 space-y-4">
            <KieKeyBar />
            <VideoForm
              value={video}
              onChange={(patch) => setVideo((v) => ({ ...v, ...patch }))}
            />
          </TabsContent>
        </div>
      </Tabs>

      {/* Shared row: count (generate mode) + submit */}
      <div className="space-y-3 border-t p-4 sm:p-5">
        {mode === "generate" && (
          <NumInput label={t.generator.count} value={settings.n} onChange={(v) => updateSettings({ n: v })} />
        )}

        <Button
          onClick={submit}
          disabled={busy}
          className={`h-12 w-full gap-2 text-base font-bold text-white shadow-lg ${
            mode === "video"
              ? "bg-gradient-to-l from-teal-500 via-emerald-500 to-teal-600 shadow-teal-500/25 hover:from-teal-400 hover:via-emerald-400 hover:to-teal-500"
              : "bg-gradient-to-l from-amber-500 via-orange-500 to-orange-600 shadow-orange-500/25 hover:from-amber-400 hover:via-orange-400 hover:to-orange-500"
          }`}
        >
          {busy ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              {mode === "video"
                ? fmt(t.video.generating, { n: elapsed })
                : fmt(t.generator.generating, { n: elapsed })}
            </>
          ) : (
            <>
              {mode === "video" ? <Clapperboard className="size-5" /> : <Sparkles className="size-5" />}
              {mode === "video" ? t.video.btn : mode === "generate" ? t.generator.btnGenerate : t.generator.btnSketch}
            </>
          )}
        </Button>

        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {mode === "video" ? t.video.infoNote : t.generator.infoNote}
        </p>
      </div>
    </section>
  );
}

function ParamSelect({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  hint?: string;
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
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="n-images" className="text-xs text-muted-foreground">{label}</Label>
      <Input
        id="n-images"
        type="number"
        min={1}
        max={4}
        value={value}
        onChange={(e) => {
          const v = Math.min(Math.max(Number(e.target.value) || 1, 1), 4);
          onChange(v);
        }}
        className="h-10 text-sm"
      />
    </div>
  );
}
