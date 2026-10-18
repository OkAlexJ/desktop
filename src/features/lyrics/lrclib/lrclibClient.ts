import type { LyricsCandidate } from "@/shared/contracts/lyrics";
import { normalizeLrc } from "./lrcParser";

// lrclib.net is the only client-side lyrics source; other providers' terms forbid this
export const LRCLIB_PROVIDER = "LRCLIB";
const LRCLIB_BASE_URL = "https://lrclib.net";
// lrclib asks clients to identify themselves (browsers drop custom User-Agent, so use its header)
const LRCLIB_CLIENT = "Liner Desktop personal build (https://github.com/tryliner/desktop)";
const DURATION_TOLERANCE_S = 3;

export interface LrclibQuery {
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
}

export interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string | null;
  duration?: number | null;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

class LrclibNetworkError extends Error {}

export function isLrclibProvider(provider: string | null | undefined): boolean {
  return (provider || "").toLowerCase().replace(/[^a-z0-9]/g, "").startsWith("lrclib");
}

// converts an lrclib record into the app's lyrics candidate shape (synced LRC preferred)
export function toLrclibCandidate(record: LrclibRecord | null): LyricsCandidate | null {
  if (!record || record.instrumental) return null;

  const matchedTrack = {
    title: record.trackName,
    artists: record.artistName ? [record.artistName] : [],
    durationMs: record.duration ? Math.round(record.duration * 1000) : undefined,
  };

  const synced = normalizeLrc(record.syncedLyrics);
  if (synced) {
    return {
      provider: LRCLIB_PROVIDER,
      contentKind: "line_synced",
      syncLevel: "line_level",
      quality: { total: 60, match: 20, content: 20, sync: 20, source: 0, reasons: ["lrclib"] },
      lyrics: { format: "lrc", content: synced },
      syncHint: "line_synced",
      matchedTrack,
    };
  }

  const plain = record.plainLyrics?.trim();
  if (plain) {
    return {
      provider: LRCLIB_PROVIDER,
      contentKind: "plain",
      syncLevel: "plain",
      quality: { total: 40, match: 20, content: 20, sync: 0, source: 0, reasons: ["lrclib"] },
      lyrics: { format: "plain", content: plain },
      syncHint: "plain",
      matchedTrack,
    };
  }

  return null;
}

function hasLyrics(r: LrclibRecord): boolean {
  return !r.instrumental && Boolean(r.syncedLyrics?.trim() || r.plainLyrics?.trim());
}

// picks the best search hit: within duration tolerance, synced first, then closest duration
export function pickBestSearchResult(
  results: LrclibRecord[],
  durationMs?: number,
): LrclibRecord | null {
  const targetS = durationMs ? durationMs / 1000 : null;
  const diff = (r: LrclibRecord) =>
    targetS !== null && r.duration ? Math.abs(r.duration - targetS) : 0;

  const usable = results.filter(
    (r) => hasLyrics(r) && (targetS === null || !r.duration || diff(r) <= DURATION_TOLERANCE_S),
  );
  usable.sort((a, b) => {
    const syncA = a.syncedLyrics?.trim() ? 1 : 0;
    const syncB = b.syncedLyrics?.trim() ? 1 : 0;
    if (syncA !== syncB) return syncB - syncA;
    return diff(a) - diff(b);
  });
  return usable[0] ?? null;
}

async function requestJson<T>(fetchImpl: FetchLike, url: string, signal?: AbortSignal): Promise<T | null> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", "Lrclib-Client": LRCLIB_CLIENT },
      signal,
    });
  } catch (err) {
    throw new LrclibNetworkError(err instanceof Error ? err.message : String(err));
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new LrclibNetworkError(`HTTP ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function queryLrclib(
  query: LrclibQuery,
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<LrclibRecord | null> {
  const title = query.title.trim();
  const artist = query.artist.trim();
  const album = query.album?.trim();
  const durationS = query.durationMs ? Math.round(query.durationMs / 1000) : 0;

  // /api/get needs every field; it is cheaper and exact, so try it first
  if (album && durationS > 0) {
    const params = new URLSearchParams({
      track_name: title,
      artist_name: artist,
      album_name: album,
      duration: String(durationS),
    });
    const exact = await requestJson<LrclibRecord>(fetchImpl, `${LRCLIB_BASE_URL}/api/get?${params}`, signal);
    if (exact && hasLyrics(exact)) return exact;
    if (exact?.instrumental) return exact;
  }

  const params = new URLSearchParams({ track_name: title, artist_name: artist });
  const results = await requestJson<LrclibRecord[]>(fetchImpl, `${LRCLIB_BASE_URL}/api/search?${params}`, signal);
  return Array.isArray(results) ? pickBestSearchResult(results, query.durationMs) : null;
}

function cacheKey(q: LrclibQuery): string {
  const norm = (s?: string) => (s || "").toLowerCase().trim();
  return [norm(q.title), norm(q.artist), norm(q.album), Math.round((q.durationMs || 0) / 1000)].join("|");
}

// session-only cache: found and not-found results are kept, network failures are retried next time
const sessionCache = new Map<string, Promise<LyricsCandidate | null>>();

export function clearLrclibSessionCache(): void {
  sessionCache.clear();
}

// never throws: network errors, 404s and aborts all resolve to null
export function fetchLrclibLyrics(
  query: LrclibQuery,
  options: { fetchImpl?: FetchLike; signal?: AbortSignal } = {},
): Promise<LyricsCandidate | null> {
  if (!query.title?.trim() || !query.artist?.trim()) return Promise.resolve(null);

  const key = cacheKey(query);
  const cached = sessionCache.get(key);
  if (cached) return cached;

  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const promise = queryLrclib(query, fetchImpl, options.signal)
    .then(toLrclibCandidate)
    .catch(() => {
      sessionCache.delete(key);
      return null;
    });
  sessionCache.set(key, promise);
  return promise;
}
