import type { PlayRecord, StatsRange } from "../types";

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local calendar day, e.g. "2026-10-18". */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(dayStart: number, days: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** First millisecond included in a range; ranges always end now. */
export function rangeStart(range: StatsRange, now: number): number {
  const today = startOfDay(now);
  switch (range) {
    case "7d":
      return addDays(today, -6);
    case "4w":
      return addDays(today, -27);
    case "6m": {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 6);
      return d.getTime();
    }
    case "1y": {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() - 1);
      return d.getTime();
    }
    case "all":
      return 0;
  }
}

export function filterPlays(plays: PlayRecord[], from: number, to: number = Infinity): PlayRecord[] {
  return plays.filter((p) => p.playedAt >= from && p.playedAt < to);
}

export interface StatsSummary {
  totalMs: number;
  playCount: number;
  uniqueTracks: number;
  uniqueArtists: number;
}

export function summarize(plays: PlayRecord[]): StatsSummary {
  const tracks = new Set<string>();
  const artists = new Set<string>();
  let totalMs = 0;
  for (const p of plays) {
    totalMs += p.listenedMs;
    tracks.add(p.trackId);
    for (const a of playArtists(p)) artists.add(a.key);
  }
  return { totalMs, playCount: plays.length, uniqueTracks: tracks.size, uniqueArtists: artists.size };
}

export interface PlayArtist {
  key: string;
  id?: string;
  name: string;
}

/** Splits "A, B & C feat. D" when the catalog did not give a list. */
export function splitArtistString(artists: string): string[] {
  return artists
    .split(/\s*,\s*|\s+&\s+|\s+(?:feat\.?|ft\.?|featuring)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function playArtists(p: PlayRecord): PlayArtist[] {
  const names = p.artistNames?.length ? p.artistNames : splitArtistString(p.artists || "");
  const seen = new Set<string>();
  const out: PlayArtist[] = [];
  names.forEach((name, i) => {
    const id = p.artistIds?.[i] ?? undefined;
    const key = id ? `id:${id}` : `name:${name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, id, name });
  });
  return out;
}

export interface TopTrack {
  trackId: string;
  title: string;
  artists: string;
  coverUrl?: string;
  albumId?: string;
  albumTitle?: string;
  durationMs: number;
  source: PlayRecord["source"];
  plays: number;
  listenedMs: number;
}

export interface TopArtist {
  key: string;
  id?: string;
  name: string;
  coverUrl?: string;
  plays: number;
  listenedMs: number;
}

export interface TopAlbum {
  key: string;
  id?: string;
  title: string;
  artists: string;
  coverUrl?: string;
  /** From the local library, so the id is not a catalog album. */
  local: boolean;
  plays: number;
  listenedMs: number;
}

function byPlaysThenTime<T extends { plays: number; listenedMs: number }>(a: T, b: T): number {
  return b.plays - a.plays || b.listenedMs - a.listenedMs;
}

/** Plays are expected oldest first; later plays refresh titles and covers. */
export function topTracks(plays: PlayRecord[], limit = 10): TopTrack[] {
  const map = new Map<string, TopTrack>();
  for (const p of plays) {
    const t = map.get(p.trackId);
    if (t) {
      t.plays += 1;
      t.listenedMs += p.listenedMs;
      t.title = p.title;
      t.artists = p.artists;
      if (p.coverUrl) t.coverUrl = p.coverUrl;
    } else {
      map.set(p.trackId, {
        trackId: p.trackId,
        title: p.title,
        artists: p.artists,
        coverUrl: p.coverUrl,
        albumId: p.albumId,
        albumTitle: p.albumTitle,
        durationMs: p.durationMs,
        source: p.source,
        plays: 1,
        listenedMs: p.listenedMs,
      });
    }
  }
  return [...map.values()].sort(byPlaysThenTime).slice(0, limit);
}

export function topArtists(plays: PlayRecord[], limit = 10): TopArtist[] {
  const map = new Map<string, TopArtist>();
  for (const p of plays) {
    for (const a of playArtists(p)) {
      const t = map.get(a.key);
      if (t) {
        t.plays += 1;
        t.listenedMs += p.listenedMs;
        if (p.coverUrl) t.coverUrl = p.coverUrl;
      } else {
        map.set(a.key, { key: a.key, id: a.id, name: a.name, coverUrl: p.coverUrl, plays: 1, listenedMs: p.listenedMs });
      }
    }
  }
  return [...map.values()].sort(byPlaysThenTime).slice(0, limit);
}

export function topAlbums(plays: PlayRecord[], limit = 10): TopAlbum[] {
  const map = new Map<string, TopAlbum>();
  for (const p of plays) {
    if (!p.albumId && !p.albumTitle) continue;
    const key = p.albumId ? `id:${p.albumId}` : `name:${(p.albumTitle ?? "").toLowerCase()}|${(p.artists ?? "").toLowerCase()}`;
    const t = map.get(key);
    if (t) {
      t.plays += 1;
      t.listenedMs += p.listenedMs;
      if (p.coverUrl) t.coverUrl = p.coverUrl;
    } else {
      map.set(key, {
        key,
        id: p.albumId,
        title: p.albumTitle ?? "",
        artists: p.artists,
        coverUrl: p.coverUrl,
        local: p.source === "local",
        plays: 1,
        listenedMs: p.listenedMs,
      });
    }
  }
  return [...map.values()].sort(byPlaysThenTime).slice(0, limit);
}

export interface Ranked {
  name: string;
  plays: number;
  listenedMs: number;
}

export function topGenres(plays: PlayRecord[], limit = 5): Ranked[] {
  const map = new Map<string, Ranked>();
  for (const p of plays) {
    if (!p.genre) continue;
    const key = p.genre.toLowerCase();
    const t = map.get(key);
    if (t) {
      t.plays += 1;
      t.listenedMs += p.listenedMs;
    } else {
      map.set(key, { name: p.genre, plays: 1, listenedMs: p.listenedMs });
    }
  }
  return [...map.values()].sort(byPlaysThenTime).slice(0, limit);
}

/**
 * Listening time by weekday (rows, Monday first) and hour (columns), in local time.
 * A play is put in the hour it started.
 */
export function hourHeatmap(plays: PlayRecord[]): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const p of plays) {
    const d = new Date(p.playedAt);
    const row = (d.getDay() + 6) % 7;
    grid[row][d.getHours()] += p.listenedMs;
  }
  return grid;
}

export interface DailyBucket {
  day: string;
  start: number;
  ms: number;
}

/** One bucket per local day from `from` up to and including the day of `now`. */
export function dailyListening(plays: PlayRecord[], from: number, now: number): DailyBucket[] {
  const first = startOfDay(from);
  const last = startOfDay(now);
  const buckets: DailyBucket[] = [];
  const index = new Map<string, DailyBucket>();
  for (let day = first; day <= last; day = addDays(day, 1)) {
    const bucket = { day: dayKey(day), start: day, ms: 0 };
    buckets.push(bucket);
    index.set(bucket.day, bucket);
  }
  for (const p of plays) {
    const b = index.get(dayKey(p.playedAt));
    if (b) b.ms += p.listenedMs;
  }
  return buckets;
}

export interface Streak {
  current: number;
  longest: number;
}

/**
 * Days in a row with at least one play. The current streak stays alive through
 * today until midnight, so it counts back from yesterday when today has none yet.
 */
export function listeningStreak(plays: PlayRecord[], now: number): Streak {
  const days = new Set(plays.map((p) => dayKey(p.playedAt)));
  if (days.size === 0) return { current: 0, longest: 0 };

  const today = startOfDay(now);
  let cursor = days.has(dayKey(today)) ? today : addDays(today, -1);
  let current = 0;
  while (days.has(dayKey(cursor))) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const key of sorted) {
    const [y, m, d] = key.split("-").map(Number);
    const start = new Date(y, m - 1, d).getTime();
    run = prev !== null && dayKey(addDays(prev, 1)) === key ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = start;
  }
  return { current, longest: Math.max(longest, current) };
}

export interface YearRecap {
  year: number;
  summary: StatsSummary;
  topArtist: TopArtist | null;
  topArtists: TopArtist[];
  topTrack: TopTrack | null;
  topTracks: TopTrack[];
  topGenre: Ranked | null;
  topMonth: { month: number; ms: number } | null;
  longestStreak: number;
}

export function yearRecap(plays: PlayRecord[], year: number, now: number = Date.now()): YearRecap {
  const from = new Date(year, 0, 1).getTime();
  const to = new Date(year + 1, 0, 1).getTime();
  const inYear = filterPlays(plays, from, to);
  const tracks = topTracks(inYear, 5);
  const artists = topArtists(inYear, 5);
  const genres = topGenres(inYear, 1);

  const months = new Array<number>(12).fill(0);
  for (const p of inYear) months[new Date(p.playedAt).getMonth()] += p.listenedMs;
  let topMonth: YearRecap["topMonth"] = null;
  months.forEach((ms, month) => {
    if (ms > 0 && (!topMonth || ms > topMonth.ms)) topMonth = { month, ms };
  });

  return {
    year,
    summary: summarize(inYear),
    topArtist: artists[0] ?? null,
    topArtists: artists,
    topTrack: tracks[0] ?? null,
    topTracks: tracks,
    topGenre: genres[0] ?? null,
    topMonth,
    longestStreak: listeningStreak(inYear, Math.min(to - 1, now)).longest,
  };
}
