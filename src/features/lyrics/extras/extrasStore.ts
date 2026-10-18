import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { debouncedStorage } from "@/shared/utils/storage";
import { isTranslationTarget, type TranslationTarget } from "./language";
import type { TranslationProviderId, TranslationSettings } from "./translate/providers";

export interface LyricsExtrasState extends TranslationSettings {
  showRomanization: boolean;
  showTranslation: boolean;
  // "auto" follows the app's UI language
  targetLang: TranslationTarget | "auto";
  setShowRomanization: (on: boolean) => void;
  setShowTranslation: (on: boolean) => void;
  setTargetLang: (lang: TranslationTarget | "auto") => void;
  setProvider: (provider: TranslationProviderId) => void;
  setMyMemoryEmail: (email: string) => void;
  setLibreUrl: (url: string) => void;
  setLibreApiKey: (key: string) => void;
}

export const useLyricsExtrasStore = create<LyricsExtrasState>()(
  persist(
    (set) => ({
      showRomanization: false,
      showTranslation: false,
      targetLang: "auto",
      provider: "mymemory",
      myMemoryEmail: "",
      libreUrl: "",
      libreApiKey: "",
      setShowRomanization: (showRomanization) => set({ showRomanization }),
      setShowTranslation: (showTranslation) => set({ showTranslation }),
      setTargetLang: (targetLang) => set({ targetLang }),
      setProvider: (provider) => set({ provider }),
      setMyMemoryEmail: (myMemoryEmail) => set({ myMemoryEmail }),
      setLibreUrl: (libreUrl) => set({ libreUrl }),
      setLibreApiKey: (libreApiKey) => set({ libreApiKey }),
    }),
    {
      name: "liner_lyrics_extras_v1",
      storage: createJSONStorage(() => debouncedStorage),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (state.targetLang !== "auto" && !isTranslationTarget(state.targetLang)) state.targetLang = "auto";
        if (state.provider !== "mymemory" && state.provider !== "libretranslate") state.provider = "mymemory";
      },
      partialize: (s) => ({
        showRomanization: s.showRomanization,
        showTranslation: s.showTranslation,
        targetLang: s.targetLang,
        provider: s.provider,
        myMemoryEmail: s.myMemoryEmail,
        libreUrl: s.libreUrl,
        libreApiKey: s.libreApiKey,
      }),
    },
  ),
);
