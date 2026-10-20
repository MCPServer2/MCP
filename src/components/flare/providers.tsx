"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { useFlareStore } from "@/lib/store";
import { useLangStore } from "@/lib/lang-store";
import { translations } from "@/lib/i18n";

const emptySubscribe = () => () => {};

export function useHasMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const lang = useLangStore((s) => s.lang);

  // Text-only i18n: the document direction/lang follow the chosen language
  // (Arabic = rtl, the original layout; English = ltr). Design never changes.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.title = translations[lang].docTitle;
  }, [lang]);

  useEffect(() => {
    const run = async () => {
      await Promise.all([useFlareStore.persist.rehydrate(), useLangStore.persist.rehydrate()]);
      useFlareStore.getState().ensureToken();
      const { apiKey, keyStatus, setKeyStatus } = useFlareStore.getState();
      if (apiKey && keyStatus === "empty") setKeyStatus("unknown");
    };
    run();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      {children}
      <Toaster position="bottom-left" richColors closeButton />
    </ThemeProvider>
  );
}
