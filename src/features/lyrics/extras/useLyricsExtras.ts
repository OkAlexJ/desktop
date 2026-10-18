import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/languages";
import { useLyricsExtrasStore } from "./extrasStore";
import { romanizeSong } from "./romanize";
import {
  alignToLines,
  cleanLyricText,
  translateSongLines,
  uniqueLyricLines,
  type TranslateOutcome,
} from "./translate/translateLyrics";

export type TranslationStatus = "off" | "loading" | "ok" | "same-language" | "error";

export interface LyricsExtras {
  // index-aligned with the lines passed in; null where nothing should be shown
  romanized: (string | null)[];
  translated: (string | null)[];
  showRomanization: boolean;
  showTranslation: boolean;
  translationStatus: TranslationStatus;
  translationError: "quota" | "network" | "config" | null;
  targetLang: string;
  romanizableCount: number;
  romanUnsupportedCount: number;
  hasText: boolean;
}

interface Result {
  key: string;
  outcome: TranslateOutcome;
}

// romanization and translation for the lines on screen, shared by the side panel and fullscreen
export function useLyricsExtras(trackId: string | null | undefined, texts: string[]): LyricsExtras {
  const { locale } = useTranslation();
  const showRomanization = useLyricsExtrasStore((s) => s.showRomanization);
  const showTranslation = useLyricsExtrasStore((s) => s.showTranslation);
  const targetSetting = useLyricsExtrasStore((s) => s.targetLang);
  const provider = useLyricsExtrasStore((s) => s.provider);
  const myMemoryEmail = useLyricsExtrasStore((s) => s.myMemoryEmail);
  const libreUrl = useLyricsExtrasStore((s) => s.libreUrl);
  const libreApiKey = useLyricsExtrasStore((s) => s.libreApiKey);
  const targetLang = targetSetting === "auto" ? locale : targetSetting;

  const textKey = texts.join("\n");
  const lines = useMemo(() => texts.map((text) => ({ text })), [textKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const cleaned = useMemo(() => lines.map((l) => cleanLyricText(l.text)), [lines]);
  const hasText = useMemo(() => uniqueLyricLines(cleaned).length > 0, [cleaned]);

  const roman = useMemo(() => romanizeSong(cleaned), [cleaned]);

  const requestKey = `${trackId}|${targetLang}|${provider}|${myMemoryEmail}|${libreUrl}|${libreApiKey}|${textKey}`;
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!showTranslation || !trackId || !hasText) return;
    let cancelled = false;
    void translateSongLines({
      trackId,
      texts: cleaned,
      target: targetLang,
      settings: { provider, myMemoryEmail, libreUrl, libreApiKey },
    }).then((outcome) => {
      if (!cancelled) setResult({ key: requestKey, outcome });
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey, showTranslation, hasText]); // eslint-disable-line react-hooks/exhaustive-deps

  const outcome = result && result.key === requestKey ? result.outcome : null;
  const translationStatus: TranslationStatus = !showTranslation || !hasText
    ? "off"
    : !outcome
      ? "loading"
      : outcome.status;

  const romanized = useMemo(
    () => (showRomanization ? alignToLines(lines, roman.byText) : lines.map(() => null)),
    [showRomanization, lines, roman],
  );
  const translated = useMemo(
    () =>
      showTranslation && outcome?.status === "ok"
        ? alignToLines(lines, outcome.lines)
        : lines.map(() => null),
    [showTranslation, outcome, lines],
  );

  return {
    romanized,
    translated,
    showRomanization,
    showTranslation,
    translationStatus,
    translationError: outcome?.status === "error" ? outcome.reason : null,
    targetLang,
    romanizableCount: roman.byText.size,
    romanUnsupportedCount: roman.unsupportedCount,
    hasText,
  };
}
