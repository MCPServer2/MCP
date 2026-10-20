"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Eraser, Pencil, Redo2, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useT } from "@/lib/lang-store";
import { fmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const CANVAS_W = 1024;
const CANVAS_H = 768;
const MAX_UNDO = 30;

const COLORS = [
  { value: "#18181b", key: "colorBlack" },
  { value: "#6b7280", key: "colorGray" },
  { value: "#dc2626", key: "colorRed" },
  { value: "#ea580c", key: "colorOrange" },
  { value: "#16a34a", key: "colorGreen" },
  { value: "#2563eb", key: "colorBlue" },
] as const;

interface UndoSnapshot {
  data: string;
  strokes: number;
}

/**
 * Freehand sketch canvas (mouse / touch / stylus via pointer events).
 * Every finished stroke, undo or clear automatically emits the canvas
 * content (or null while still blank) so it can be used as the Sketch source.
 */
export function SketchDrawer({ onSourceChange }: { onSourceChange: (dataUrl: string | null) => void }) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<UndoSnapshot[]>([]);
  const strokeCountRef = useRef(0);
  const redoStackRef = useRef<UndoSnapshot[]>([]);

  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [size, setSize] = useState(6);
  const [color, setColor] = useState<string>(COLORS[0].value);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Paint the white surface once on mount.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }, []);

  const fillWhite = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }, []);

  const restoreSnapshot = useCallback(
    (snap: UndoSnapshot) => {
      const img = new Image();
      img.onload = () => {
        const ctx = canvasRef.current?.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.drawImage(img, 0, 0);
        strokeCountRef.current = snap.strokes;
        const ready = snap.strokes > 0;
        setHasDrawn(ready);
        onSourceChange(ready ? canvasRef.current?.toDataURL("image/png") ?? null : null);
      };
      img.src = snap.data;
    },
    [onSourceChange]
  );

  const pushUndo = useCallback(() => {
    const data = canvasRef.current?.toDataURL("image/png");
    if (!data) return;
    undoStackRef.current.push({ data, strokes: strokeCountRef.current });
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    setCanUndo(true);
  }, []);

  const posFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const dot = (p: { x: number; y: number }) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const lw = tool === "eraser" ? size * 3 : size;
    ctx.fillStyle = tool === "eraser" ? "#ffffff" : color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, lw / 2, 0, Math.PI * 2);
    ctx.fill();
    lastRef.current = p;
  };

  const strokeTo = (p: { x: number; y: number }) => {
    const ctx = canvasRef.current?.getContext("2d");
    const from = lastRef.current;
    if (!ctx || !from) return;
    ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
    ctx.lineWidth = tool === "eraser" ? size * 3 : size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
  };

  const emitSource = useCallback(() => {
    const ready = strokeCountRef.current > 0;
    setHasDrawn(ready);
    onSourceChange(ready ? canvasRef.current?.toDataURL("image/png") ?? null : null);
  }, [onSourceChange]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    try {
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture is best-effort
    }
    pushUndo();
    redoStackRef.current = [];
    setCanRedo(false);
    drawingRef.current = true;
    strokeCountRef.current += 1;
    dot(posFromEvent(e));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    strokeTo(posFromEvent(e));
  };

  const endStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    emitSource();
  };

  const undo = () => {
    const snap = undoStackRef.current.pop();
    setCanUndo(undoStackRef.current.length > 0);
    if (!snap) return;
    const current = canvasRef.current?.toDataURL("image/png");
    if (current) {
      redoStackRef.current.push({ data: current, strokes: strokeCountRef.current });
      setCanRedo(true);
    }
    restoreSnapshot(snap);
  };

  const redo = () => {
    const snap = redoStackRef.current.pop();
    setCanRedo(redoStackRef.current.length > 0);
    if (!snap) return;
    const current = canvasRef.current?.toDataURL("image/png");
    if (current) {
      undoStackRef.current.push({ data: current, strokes: strokeCountRef.current });
      setCanUndo(true);
    }
    restoreSnapshot(snap);
  };

  const clear = () => {
    if (strokeCountRef.current === 0 && undoStackRef.current.length === 0) return;
    pushUndo();
    redoStackRef.current = [];
    setCanRedo(false);
    fillWhite();
    strokeCountRef.current = 0;
    setHasDrawn(false);
    onSourceChange(null);
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-muted/30 p-2.5">
        <div className="flex items-center gap-1" role="group" aria-label={t.sketch.toolsAria}>
          <Button
            type="button"
            size="sm"
            variant={tool === "pen" ? "default" : "outline"}
            onClick={() => setTool("pen")}
            aria-pressed={tool === "pen"}
            className="h-9 gap-1.5"
          >
            <Pencil className="size-4" />
            {t.sketch.pen}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tool === "eraser" ? "default" : "outline"}
            onClick={() => setTool("eraser")}
            aria-pressed={tool === "eraser"}
            className="h-9 gap-1.5"
          >
            <Eraser className="size-4" />
            {t.sketch.eraser}
          </Button>
        </div>

        <div className="flex min-w-32 items-center gap-2" aria-label={t.sketch.sizeAria}>
          <span className="text-[11px] text-muted-foreground">{t.sketch.sizeLabel}</span>
          <Slider
            value={[size]}
            onValueChange={(v) => setSize(v[0] ?? 6)}
            min={2}
            max={36}
            step={1}
            className="w-24 sm:w-28"
            aria-label={t.sketch.sizeAria}
          />
          <span className="w-6 text-center text-[11px] tabular-nums text-muted-foreground">{size}</span>
        </div>

        <div className="flex items-center gap-1.5" role="group" aria-label={t.sketch.colorsAria}>
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-label={fmt(t.sketch.colorAria, { n: t.sketch[c.key] })}
              aria-pressed={color === c.value}
              onClick={() => {
                setColor(c.value);
                setTool("pen");
              }}
              className={cn(
                "size-6 rounded-full border-2 transition-transform",
                color === c.value && tool === "pen"
                  ? "scale-110 border-foreground"
                  : "border-border hover:scale-105"
              )}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>

        <div className="ms-auto flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={undo}
            disabled={!canUndo}
            aria-label={t.sketch.undo}
            title={t.sketch.undo}
            className="size-9"
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={redo}
            disabled={!canRedo}
            aria-label={t.sketch.redo}
            title={t.sketch.redo}
            className="size-9"
          >
            <Redo2 className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={clear}
            disabled={!hasDrawn}
            aria-label={t.sketch.clear}
            title={t.sketch.clear}
            className="size-9 hover:text-red-400"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block h-auto w-full cursor-crosshair touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
          aria-label={t.sketch.canvasAria}
          role="img"
        />
        {!hasDrawn && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-lg bg-background/85 px-4 py-2 text-center text-sm text-muted-foreground backdrop-blur-sm">
              {t.sketch.placeholder}
            </p>
          </div>
        )}
        {hasDrawn && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[11px] font-medium text-white shadow">
            <Check className="size-3.5" />
            {t.sketch.ready}
          </div>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">{t.sketch.hint}</p>
    </div>
  );
}
