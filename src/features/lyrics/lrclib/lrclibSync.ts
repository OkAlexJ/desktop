import type { LyricsCandidate } from "@/shared/contracts/lyrics";
import type { Track } from "@/shared/types";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useLyricsStore } from "../store/lyricsStore";
import { fetchLrclibLyrics, LRCLIB_PROVIDER } from "./lrclibClient";
import { mergeLrclibProvider, shouldActivateLrclib } from "./lrclibMerge";

const results = new Map<string, LyricsCandidate | null>();
const pending = new Set<string>();
let started = false;
let applying = false;

function queryFor(track: Track) {
  const artist = track.artistList?.[0]?.name || track.artists.split(",")[0] || "";
  return {
    title: track.title,
    artist: artist.trim(),
    album: track.album?.title,
    durationMs: track.durationMs,
  };
}

// keeps the lyrics store's provider list in sync with the lrclib result for the current track
function apply() {
  if (applying) return;
  const state = useLyricsStore.getState();
  const trackId = state.currentLyricsTrackId;
  if (!trackId || !results.has(trackId)) return;

  applying = true;
  try {
    const merged = mergeLrclibProvider(state.availableProviders, results.get(trackId) ?? null);
    if (merged !== state.availableProviders) {
      state.setLyricsState({ availableProviders: merged });
    }
    const next = useLyricsStore.getState();
    if (shouldActivateLrclib(next)) {
      next.setLyricsState({ lyricsError: null });
      next.selectProvider(LRCLIB_PROVIDER);
    }
  } finally {
    applying = false;
  }
}

// true once the server lookup for the current track has finished with no providers of its own
export function serverReturnedNoLyrics(state: {
  lyricsLoading: boolean;
  availableProviders: { provider: string }[];
}): boolean {
  return !state.lyricsLoading && state.availableProviders.every((p) => p.provider === LRCLIB_PROVIDER);
}

// asks lrclib only as a fallback, so no track metadata leaves the app when the server has lyrics
function maybeFetch() {
  const state = useLyricsStore.getState();
  const trackId = state.currentLyricsTrackId;
  if (!trackId || results.has(trackId) || pending.has(trackId)) return;
  if (!serverReturnedNoLyrics(state)) return;
  const track = usePlayerStore.getState().currentTrack;
  if (!track || track.id !== trackId) return;

  pending.add(trackId);
  void fetchLrclibLyrics(queryFor(track)).then((candidate) => {
    pending.delete(trackId);
    results.set(trackId, candidate);
    apply();
  });
}

function onLyricsChange() {
  apply();
  maybeFetch();
}

// starts the client-side lrclib provider; safe to call more than once
export function initLrclibLyrics(): void {
  if (started) return;
  started = true;
  useLyricsStore.subscribe(onLyricsChange);
  onLyricsChange();
}
