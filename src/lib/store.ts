"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { GenerationItem, GenerationMode, KeyUsageInfo, VideoItem } from "@/lib/types";

export type KeyStatus = "empty" | "checking" | "valid" | "invalid";

function generateUserToken(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `FLR-${out.slice(0, 5)}-${out.slice(5)}`;
}

export interface FlareSettings {
  size: string;
  quality: string;
  outputFormat: string;
  n: number;
  background: string;
  autoEnhance: boolean;
}

interface FlareState {
  // Identity (persisted)
  userToken: string;
  ensureToken: () => void;
  rotateToken: () => void;

  // CometAPI key (persisted locally in the browser only)
  apiKey: string;
  setApiKey: (key: string) => void;
  keyStatus: KeyStatus;
  keyUsage: KeyUsageInfo | null;
  setKeyStatus: (status: KeyStatus, usage?: KeyUsageInfo | null) => void;

  // kie.ai key for video generation (persisted locally in the browser only)
  kieKey: string;
  setKieKey: (key: string) => void;
  kieKeyStatus: KeyStatus;
  kieCredits: number | null;
  setKieKeyStatus: (status: KeyStatus, credits?: number | null) => void;

  // Generator settings (persisted)
  mode: GenerationMode;
  setMode: (mode: GenerationMode) => void;
  settings: FlareSettings;
  updateSettings: (patch: Partial<FlareSettings>) => void;

  // Sketch source image (not persisted — data URL)
  sketchImage: string | null;
  setSketchImage: (dataUrl: string | null) => void;

  // Optional reference image for text-to-image (not persisted — data URL)
  refImage: string | null;
  setRefImage: (dataUrl: string | null) => void;

  // Results & gallery (server state)
  latest: GenerationItem[];
  gallery: GenerationItem[];
  galleryLoading: boolean;
  prependResults: (items: GenerationItem[]) => void;
  setGallery: (items: GenerationItem[]) => void;
  setGalleryLoading: (loading: boolean) => void;
  removeItem: (id: string) => void;
  clearGalleryLocal: () => void;

  // Video library (server state)
  latestVideos: VideoItem[];
  videoList: VideoItem[];
  prependVideoResults: (items: VideoItem[]) => void;
  setVideoList: (items: VideoItem[]) => void;
  removeVideoItem: (id: string) => void;

  // Viewer
  viewerId: string | null;
  openViewer: (id: string) => void;
  closeViewer: () => void;
}

export const useFlareStore = create<FlareState>()(
  persist(
    (set, get) => ({
      userToken: "",
      ensureToken: () => {
        if (!get().userToken) set({ userToken: generateUserToken() });
      },
      rotateToken: () => set({ userToken: generateUserToken() }),

      apiKey: "",
      setApiKey: (key) => set({ apiKey: key.trim(), keyStatus: key.trim() ? "unknown" : "empty", keyUsage: null }),
      keyStatus: "empty",
      keyUsage: null,
      setKeyStatus: (status, usage = null) => set({ keyStatus: status, keyUsage: usage }),

      kieKey: "",
      setKieKey: (key) =>
        set({ kieKey: key.trim(), kieKeyStatus: key.trim() ? "unknown" : "empty", kieCredits: null }),
      kieKeyStatus: "empty",
      kieCredits: null,
      setKieKeyStatus: (status, credits = null) => set({ kieKeyStatus: status, kieCredits: credits }),

      mode: "generate",
      setMode: (mode) => set({ mode }),
      settings: {
        size: "1024x1024",
        quality: "auto",
        outputFormat: "png",
        n: 1,
        background: "auto",
        autoEnhance: true,
      },
      updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),

      sketchImage: null,
      setSketchImage: (dataUrl) => set({ sketchImage: dataUrl }),

      refImage: null,
      setRefImage: (dataUrl) => set({ refImage: dataUrl }),

      latest: [],
      gallery: [],
      galleryLoading: false,
      prependResults: (items) =>
        set((state) => ({
          latest: [...items, ...state.latest].slice(0, 12),
          gallery: [...items, ...state.gallery].slice(0, 200),
        })),
      setGallery: (items) => set({ gallery: items }),
      setGalleryLoading: (loading) => set({ galleryLoading: loading }),
      removeItem: (id) =>
        set((state) => ({
          latest: state.latest.filter((i) => i.id !== id),
          gallery: state.gallery.filter((i) => i.id !== id),
        })),
      clearGalleryLocal: () => set({ gallery: [], latest: [] }),

      latestVideos: [],
      videoList: [],
      prependVideoResults: (items) =>
        set((state) => ({
          latestVideos: [...items, ...state.latestVideos].slice(0, 8),
          videoList: [...items, ...state.videoList].slice(0, 60),
        })),
      setVideoList: (items) => set({ videoList: items }),
      removeVideoItem: (id) =>
        set((state) => ({
          latestVideos: state.latestVideos.filter((v) => v.id !== id),
          videoList: state.videoList.filter((v) => v.id !== id),
        })),

      viewerId: null,
      openViewer: (id) => set({ viewerId: id }),
      closeViewer: () => set({ viewerId: null }),
    }),
    {
      name: "flare-studio-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        userToken: state.userToken,
        apiKey: state.apiKey,
        kieKey: state.kieKey,
        mode: state.mode,
        settings: state.settings,
      }),
      // Avoid SSR hydration mismatches: rehydrate manually after mount.
      skipHydration: true,
    }
  )
);

export function imageUrlFor(id: string, token: string): string {
  return `/api/image/${id}?token=${encodeURIComponent(token)}`;
}
