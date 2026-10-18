import type { LyricsCandidate } from "@/shared/contracts/lyrics";
import type { Track } from "@/shared/types";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useLyricsStore } from "../store/lyricsStore";
import { fetchLrclibLyrics, LRCLIB_PROVIDER } from "./lrclibClient";
import { mergeLrclibProvider, shouldActivateLrclib } from "./lrclibMerge";

const results = new Map<string, LyricsCandidate | null>();
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

function loadFor(track: Track | null) {
  if (!track || results.has(track.id)) {
    apply();
    return;
  }
  const trackId = track.id;
  void fetchLrclibLyrics(queryFor(track)).then((candidate) => {
    results.set(trackId, candidate);
    apply();
  });
}

// starts the client-side lrclib provider; safe to call more than once
export function initLrclibLyrics(): void {
  if (started) return;
  started = true;

  let lastTrackId: string | null = null;
  const onPlayer = () => {
    const track = usePlayerStore.getState().currentTrack;
    if ((track?.id ?? null) === lastTrackId) return;
    lastTrackId = track?.id ?? null;
    loadFor(track);
  };
  usePlayerStore.subscribe(onPlayer);
  useLyricsStore.subscribe(apply);
  onPlayer();
}
