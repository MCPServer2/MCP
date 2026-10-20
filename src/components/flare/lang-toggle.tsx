"use client";

import { useLangStore, useT } from "@/lib/lang-store";
import type { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Lang; label: string; aria: string }[] = [
  { value: "en", label: "EN", aria: "English" },
  { value: "ar", label: "AR", aria: "العربية" },
];

/** Compact EN / AR segmented switch shown at the top of the page. */
export function LangToggle() {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const t = useT();

  return (
    <div
      role="group"
      aria-label={t.langToggle.aria}
      className="flex shrink-0 items-center rounded-full border border-border/60 bg-muted/60 p-0.5"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setLang(opt.value)}
          aria-pressed={lang === opt.value}
          aria-label={opt.aria}
          className={cn(
            "h-8 min-w-10 rounded-full px-2 text-xs font-bold leading-none transition-colors",
            lang === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
