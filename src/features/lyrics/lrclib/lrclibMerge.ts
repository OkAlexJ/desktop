import type { LyricsCandidate } from "@/shared/contracts/lyrics";
import { compareLyricsCandidates } from "../store/lyricsCache";
import type { LyricsProviderOption } from "../store/lyricsStore";
import { LRCLIB_PROVIDER, isLrclibProvider } from "./lrclibClient";

export function toProviderOption(candidate: LyricsCandidate): LyricsProviderOption {
  return {
    provider: candidate.provider,
    syncLevel: candidate.syncLevel,
    quality: candidate.quality.total,
    candidate,
  };
}

// adds the client-side lrclib option to the server's providers.
// if the server already returned an lrclib provider, ours is dropped so it is never shown twice.
// returns the same array instance when nothing changes, so callers can skip store updates.
export function mergeLrclibProvider(
  providers: LyricsProviderOption[],
  candidate: LyricsCandidate | null,
): LyricsProviderOption[] {
  const ours = providers.filter((p) => p.provider === LRCLIB_PROVIDER);
  const serverHasLrclib = providers.some(
    (p) => p.provider !== LRCLIB_PROVIDER && isLrclibProvider(p.provider),
  );

  if (!candidate || serverHasLrclib) {
    return ours.length === 0 ? providers : providers.filter((p) => p.provider !== LRCLIB_PROVIDER);
  }

  if (ours.length === 1 && ours[0].candidate.lyrics.content === candidate.lyrics.content) {
    return providers;
  }

  return [...providers.filter((p) => p.provider !== LRCLIB_PROVIDER), toProviderOption(candidate)].sort(
    (a, b) => compareLyricsCandidates(a.candidate, b.candidate),
  );
}

// lrclib becomes the active source only when nothing else is showing once the server is done
export function shouldActivateLrclib(state: {
  lyricsLoading: boolean;
  activeProvider: string | null;
  availableProviders: LyricsProviderOption[];
}): boolean {
  if (state.lyricsLoading) return false;
  if (!state.availableProviders.some((p) => p.provider === LRCLIB_PROVIDER)) return false;
  return (
    !state.activeProvider ||
    !state.availableProviders.some((p) => p.provider === state.activeProvider)
  );
}
