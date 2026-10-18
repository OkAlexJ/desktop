export type PlaySource = "stream" | "local" | "offline";

/** One counted play, kept only in this device's IndexedDB. */
export interface PlayRecord {
  id: string;
  /** When listening started (ms since epoch). */
  playedAt: number;
  trackId: string;
  title: string;
  /** Display string, e.g. "A, B". */
  artists: string;
  artistNames?: string[];
  /** Parallel to artistNames when the catalog gave ids. */
  artistIds?: (string | null)[];
  albumId?: string;
  albumTitle?: string;
  coverUrl?: string;
  durationMs: number;
  listenedMs: number;
  source: PlaySource;
  genre?: string;
}

export type StatsRange = "7d" | "4w" | "6m" | "1y" | "all";

export const STATS_RANGES: readonly StatsRange[] = ["7d", "4w", "6m", "1y", "all"];
