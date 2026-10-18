export {
  parseRawLyrics,
  applyLyricsOffset,
  type ParsedLyrics,
  type WordData,
} from "./engine/lyricsParser";
export { braccatoThemeCss } from "./engine/braccatoTheme";
export {
  useLyricsStore,
  hasSyncedLyricsSources,
  type LyricsProviderOption,
} from "./store/lyricsStore";
export {
  lyricsCache,
  shouldCacheLyricsCandidate,
  compareLyricsCandidates,
  isBetterLyricsCandidate,
  isWordLevelSync,
  type CachedLyricsItem,
} from "./store/lyricsCache";
export {
  useLyricsAnimator,
  type LyricsWord,
  type SyncedLine,
} from "./hooks/useLyricsAnimator";
export { LyricsProviderIsland } from "./ui/LyricsProviderIsland";
export { useLyricsExtras, type LyricsExtras } from "./extras/useLyricsExtras";
export { useLyricsExtrasStore } from "./extras/extrasStore";
export { LyricsExtrasPanel, LyricLineExtras } from "./ui/LyricsExtrasControls";
export { LyricsTranslationSettings } from "./ui/LyricsTranslationSettings";
export { applyBraccatoExtras } from "./extras/braccatoExtras";
