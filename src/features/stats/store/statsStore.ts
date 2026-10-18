import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { debouncedStorage } from "@/shared/utils/storage";
import type { PlayRecord } from "../types";
import { statsDb } from "./statsDb";

interface StatsSettingsState {
  trackingPaused: boolean;
  setTrackingPaused: (paused: boolean) => void;
}

export const useStatsSettingsStore = create<StatsSettingsState>()(
  persist(
    (set) => ({
      trackingPaused: false,
      setTrackingPaused: (trackingPaused) => set({ trackingPaused }),
    }),
    { name: "liner_stats_settings_v1", storage: createJSONStorage(() => debouncedStorage) },
  ),
);

interface StatsHistoryState {
  /** Oldest first. */
  plays: PlayRecord[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Inserts or updates a play by id and writes it to IndexedDB. */
  recordPlay: (record: PlayRecord) => void;
  clearHistory: () => Promise<void>;
}

function upsert(plays: PlayRecord[], record: PlayRecord): PlayRecord[] {
  const index = plays.findIndex((p) => p.id === record.id);
  if (index >= 0) {
    const next = plays.slice();
    next[index] = record;
    return next;
  }
  const next = [...plays, record];
  if (plays.length > 0 && plays[plays.length - 1].playedAt > record.playedAt) {
    next.sort((a, b) => a.playedAt - b.playedAt);
  }
  return next;
}

let loading: Promise<void> | null = null;
// plays that started before the last clear are dropped, so a session still running or a load
// that was already in flight can't bring cleared history back
let clearedAt = 0;
const afterClear = (p: PlayRecord) => p.playedAt >= clearedAt;

export const useStatsHistoryStore = create<StatsHistoryState>((set, get) => ({
  plays: [],
  loaded: false,
  load: () => {
    if (get().loaded) return Promise.resolve();
    loading ??= statsDb
      .getAllPlays()
      .then((stored) => {
        let plays = stored.filter(afterClear);
        // keep anything recorded while the read was in flight
        for (const p of get().plays) plays = upsert(plays, p);
        set({ plays, loaded: true });
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  },
  recordPlay: (record) => {
    if (!afterClear(record)) return;
    set({ plays: upsert(get().plays, record) });
    void statsDb.putPlay(record);
  },
  clearHistory: async () => {
    clearedAt = Date.now();
    set({ plays: [] });
    await statsDb.clear();
  },
}));
