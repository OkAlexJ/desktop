import type { Track } from "@/shared/types";
import type { PlayRecord, PlaySource } from "../types";

/** A play counts once this much has been heard, or half the track if that is shorter. */
export const PLAY_THRESHOLD_MS = 30_000;
/** Forward position steps larger than this are seeks, not listening (timeupdate fires ~4x/s). */
export const MAX_LISTEN_STEP_MS = 5_000;
/** A jump back to the first few seconds from the last few seconds is a repeat, not a seek. */
export const RESTART_WINDOW_MS = 3_000;
export const END_WINDOW_MS = 5_000;

export function playThresholdMs(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return PLAY_THRESHOLD_MS;
  return Math.min(PLAY_THRESHOLD_MS, durationMs / 2);
}

/** One reading of the player: what is loaded, where it is and whether it is audibly playing. */
export interface PlayerSample {
  track: Track | null;
  positionMs: number;
  durationMs: number;
  playing: boolean;
  source: PlaySource;
  now: number;
}

interface ListenSession {
  track: Track;
  source: PlaySource;
  startedAt: number | null;
  lastPositionMs: number;
  durationMs: number;
  listenedMs: number;
  playing: boolean;
  record: PlayRecord | null;
  savedListenedMs: number;
}

export type PlaySink = (record: PlayRecord) => void;

let idCounter = 0;
function defaultId(now: number): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${now.toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function artistNames(track: Track): string[] | undefined {
  const names = (track.artistList ?? [])
    .map((a) => a?.name?.trim())
    .filter((n): n is string => !!n);
  return names.length > 0 ? names : undefined;
}

function artistIds(track: Track): (string | null)[] | undefined {
  const list = track.artistList ?? [];
  if (list.length === 0 || !list.some((a) => (a as { id?: string }).id)) return undefined;
  return list.map((a) => (a as { id?: string }).id ?? null);
}

/**
 * Turns a stream of player samples into play records. Listening time only grows
 * by small forward steps while playing, so pauses, seeks and buffering never add
 * time. A record is emitted when the threshold is crossed and again (same id)
 * whenever its listened time changes on pause or when the session ends, so the
 * sink should upsert by id.
 *
 * Sessions end when the track id changes (skip, next track, queue end) or
 * when the same track jumps from its end back to its start (repeat-one, replay).
 */
export class PlayCounter {
  private session: ListenSession | null = null;

  constructor(
    private readonly sink: PlaySink,
    private readonly newId: (now: number) => string = defaultId,
  ) {}

  observe(sample: PlayerSample): void {
    const { track } = sample;
    if (!track) {
      this.flush();
      return;
    }

    const s = this.session;
    if (!s || s.track.id !== track.id) {
      this.flush();
      this.session = this.startSession(sample);
      return;
    }

    if (sample.durationMs > 0) s.durationMs = sample.durationMs;
    s.track = track;

    const delta = sample.positionMs - s.lastPositionMs;
    if (delta < 0 && this.isRestart(s, sample.positionMs)) {
      this.flush();
      this.session = this.startSession(sample);
      return;
    }

    if (sample.playing && s.playing && delta > 0 && delta <= MAX_LISTEN_STEP_MS) {
      s.listenedMs += delta;
    }
    if (sample.playing && s.startedAt === null) s.startedAt = sample.now;
    s.lastPositionMs = sample.positionMs;

    const wasPlaying = s.playing;
    s.playing = sample.playing;

    if (!s.record && s.listenedMs >= playThresholdMs(s.durationMs)) {
      s.record = this.buildRecord(s, sample.now);
      this.save(s);
    } else if (wasPlaying && !sample.playing) {
      this.save(s);
    }
  }

  /** Ends the current session, saving its final listened time. */
  flush(): void {
    const s = this.session;
    this.session = null;
    if (s) this.save(s);
  }

  /** For tests and debugging. */
  get currentListenedMs(): number {
    return this.session?.listenedMs ?? 0;
  }

  private startSession(sample: PlayerSample): ListenSession {
    const track = sample.track!;
    return {
      track,
      source: sample.source,
      startedAt: sample.playing ? sample.now : null,
      lastPositionMs: sample.positionMs,
      durationMs: sample.durationMs > 0 ? sample.durationMs : track.durationMs || 0,
      listenedMs: 0,
      playing: sample.playing,
      record: null,
      savedListenedMs: 0,
    };
  }

  private isRestart(s: ListenSession, positionMs: number): boolean {
    if (positionMs > RESTART_WINDOW_MS) return false;
    if (s.durationMs <= 0) return false;
    return s.lastPositionMs >= s.durationMs - END_WINDOW_MS;
  }

  private buildRecord(s: ListenSession, now: number): PlayRecord {
    const { track } = s;
    const genre = (track as Track & { genre?: unknown }).genre;
    return {
      id: this.newId(now),
      playedAt: s.startedAt ?? now,
      trackId: track.id,
      title: track.title,
      artists: track.artists,
      artistNames: artistNames(track),
      artistIds: artistIds(track),
      albumId: track.album?.id,
      albumTitle: track.album?.title,
      coverUrl: track.coverUrl || undefined,
      durationMs: Math.round(s.durationMs),
      listenedMs: 0,
      source: s.source,
      ...(typeof genre === "string" && genre.trim() ? { genre: genre.trim() } : {}),
    };
  }

  private save(s: ListenSession): void {
    if (!s.record) return;
    const listenedMs = Math.round(s.listenedMs);
    if (listenedMs === s.savedListenedMs) return;
    s.savedListenedMs = listenedMs;
    s.record = { ...s.record, listenedMs };
    this.sink(s.record);
  }
}
