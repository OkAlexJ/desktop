import type { Track } from "@/shared/types";

export type PlaylistSortKey =
  | "custom"
  | "title"
  | "artist"
  | "album"
  | "duration"
  | "addedAt";

export type PlaylistSortDirection = "asc" | "desc";

export interface PlaylistSort {
  key: PlaylistSortKey;
  direction: PlaylistSortDirection;
}

export const PLAYLIST_SORT_KEYS: PlaylistSortKey[] = [
  "custom",
  "title",
  "artist",
  "album",
  "duration",
  "addedAt",
];

export const DEFAULT_PLAYLIST_SORT: PlaylistSort = { key: "custom", direction: "asc" };

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

type SortValue = string | number | null;

function sortValue(track: Track, key: PlaylistSortKey): SortValue {
  switch (key) {
    case "title":
      return track.title?.trim() || null;
    case "artist":
      return track.artists?.trim() || null;
    case "album":
      return track.album?.title?.trim() || null;
    case "duration":
      return track.durationMs > 0 ? track.durationMs : null;
    case "addedAt": {
      const time = track.addedAt ? Date.parse(track.addedAt) : NaN;
      return Number.isFinite(time) ? time : null;
    }
    default:
      return null;
  }
}

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

// view-only sort: missing values always sink to the bottom, ties keep the playlist's own order
export function sortPlaylistTracks(tracks: Track[], sort: PlaylistSort): Track[] {
  if (sort.key === "custom") {
    return sort.direction === "desc" ? [...tracks].reverse() : tracks;
  }
  const factor = sort.direction === "desc" ? -1 : 1;
  return tracks
    .map((track, index) => ({ track, index, value: sortValue(track, sort.key) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value === b.value) return a.index - b.index;
        return a.value === null ? 1 : -1;
      }
      return compareValues(a.value, b.value) * factor || a.index - b.index;
    })
    .map((entry) => entry.track);
}

export interface PlannedMove {
  itemId: string;
  beforeItemId: string | null;
}

function longestIncreasingSubsequence(values: number[]): Set<number> {
  const tails: number[] = [];
  const prev = new Array<number>(values.length).fill(-1);
  for (let i = 0; i < values.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[tails[mid]] < values[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const keep = new Set<number>();
  let k = tails.length ? tails[tails.length - 1] : -1;
  while (k !== -1) {
    keep.add(k);
    k = prev[k];
  }
  return keep;
}

// fewest single-item moves that turn `current` into `target`; items already in relative order stay put
export function planReorderMoves(current: string[], target: string[]): PlannedMove[] {
  const position = new Map(current.map((id, index) => [id, index]));
  const ids = target.filter((id) => position.has(id));
  if (ids.length !== current.length) {
    throw new Error("Target order must contain the same items as the current order");
  }
  const keep = longestIncreasingSubsequence(ids.map((id) => position.get(id)!));
  const moves: PlannedMove[] = [];
  for (let i = ids.length - 1; i >= 0; i--) {
    if (keep.has(i)) continue;
    moves.push({ itemId: ids[i], beforeItemId: ids[i + 1] ?? null });
  }
  return moves;
}

export function applyMove(order: string[], move: PlannedMove): string[] {
  const next = order.filter((id) => id !== move.itemId);
  const at = move.beforeItemId === null ? next.length : next.indexOf(move.beforeItemId);
  next.splice(at < 0 ? next.length : at, 0, move.itemId);
  return next;
}

export interface ApplyOrderOptions {
  moves: PlannedMove[];
  revision: number;
  move: (move: PlannedMove, revision: number) => Promise<{ revision?: number } | void>;
  onProgress?: (done: number, total: number) => void;
  // checked before each move; returning false stops the run early
  shouldContinue?: () => boolean;
}

// runs moves one by one, threading the revision each call returns; stops at the first failure
export async function applyPlannedMoves({ moves, revision, move, onProgress, shouldContinue }: ApplyOrderOptions) {
  let current = revision;
  onProgress?.(0, moves.length);
  for (let i = 0; i < moves.length; i++) {
    if (shouldContinue && !shouldContinue()) break;
    const result = await move(moves[i], current);
    current = result?.revision ?? current + 1;
    onProgress?.(i + 1, moves.length);
  }
  return current;
}

const SORT_STORAGE_KEY = "liner:playlist-sort-v1";

function isSort(value: unknown): value is PlaylistSort {
  if (!value || typeof value !== "object") return false;
  const { key, direction } = value as PlaylistSort;
  return PLAYLIST_SORT_KEYS.includes(key) && (direction === "asc" || direction === "desc");
}

function readSortMap(): Record<string, PlaylistSort> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadPlaylistSort(playlistId: string | null): PlaylistSort {
  if (!playlistId) return DEFAULT_PLAYLIST_SORT;
  const stored = readSortMap()[playlistId];
  return isSort(stored) ? stored : DEFAULT_PLAYLIST_SORT;
}

export function savePlaylistSort(playlistId: string | null, sort: PlaylistSort) {
  if (!playlistId) return;
  const map = readSortMap();
  if (sort.key === DEFAULT_PLAYLIST_SORT.key && sort.direction === DEFAULT_PLAYLIST_SORT.direction) {
    delete map[playlistId];
  } else {
    map[playlistId] = sort;
  }
  try {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}
