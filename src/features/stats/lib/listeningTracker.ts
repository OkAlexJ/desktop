import { usePlayerStore, type PlayerState } from "@/features/player/store/playerStore";
import type { Track } from "@/shared/types";
import type { PlayRecord, PlaySource } from "../types";
import { PlayCounter, type PlayerSample } from "./playCounter";
import { useStatsHistoryStore, useStatsSettingsStore } from "../store/statsStore";

export function playSourceOf(_track: Track): PlaySource {
  return "stream";
}

export interface ListeningTrackerOptions {
  sink?: (record: PlayRecord) => void;
  sourceOf?: (track: Track) => PlaySource;
  now?: () => number;
}

/**
 * Feeds the player store into a PlayCounter. The store's position comes from
 * the active <audio> element, and the engine switches currentTrack the moment
 * the next track starts, so the counter sees one clean track change.
 * Returns a stop function.
 */
export function startListeningTracker(options: ListeningTrackerOptions = {}): () => void {
  const sink = options.sink ?? ((r: PlayRecord) => useStatsHistoryStore.getState().recordPlay(r));
  const sourceOf = options.sourceOf ?? playSourceOf;
  const now = options.now ?? Date.now;
  const counter = new PlayCounter(sink);

  let lastTrack: Track | null = null;
  let lastSource: PlaySource = "stream";

  const sample = (state: PlayerState): PlayerSample => {
    const track = state.currentTrack;
    if (track && track.id !== lastTrack?.id) lastSource = sourceOf(track);
    lastTrack = track;
    return {
      track,
      positionMs: state.positionMs,
      durationMs: state.durationMs,
      playing: state.status === "playing",
      source: lastSource,
      now: now(),
    };
  };

  const onPlayer = (state: PlayerState, prev?: PlayerState) => {
    if (useStatsSettingsStore.getState().trackingPaused) return;
    if (
      prev &&
      state.currentTrack === prev.currentTrack &&
      state.positionMs === prev.positionMs &&
      state.durationMs === prev.durationMs &&
      state.status === prev.status
    ) {
      return;
    }
    counter.observe(sample(state));
  };

  const unsubPlayer = usePlayerStore.subscribe(onPlayer);
  const unsubSettings = useStatsSettingsStore.subscribe((s, prev) => {
    if (s.trackingPaused === prev.trackingPaused) return;
    if (s.trackingPaused) counter.flush();
    else counter.observe(sample(usePlayerStore.getState()));
  });
  const onUnload = () => counter.flush();
  if (typeof window !== "undefined") window.addEventListener("beforeunload", onUnload);

  onPlayer(usePlayerStore.getState());

  return () => {
    unsubPlayer();
    unsubSettings();
    if (typeof window !== "undefined") window.removeEventListener("beforeunload", onUnload);
    counter.flush();
  };
}
