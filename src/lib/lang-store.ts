"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { translations, type Dict, type Lang } from "./i18n";

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

/**
 * Language preference (persisted in localStorage).
 * Uses skipHydration like the main store: the first render matches the
 * server (Arabic default), then providers.tsx rehydrates it after mount.
 */
export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: "ar",
      setLang: (lang) => set({ lang }),
    }),
    {
      name: "flare-lang-v1",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    }
  )
);

/** Current translated dictionary (stable object reference per language). */
export function useT(): Dict {
  return translations[useLangStore((s) => s.lang)];
}
