import { describe, it, expect, beforeEach } from "vitest";
import type { Track } from "@/shared/types";
import type { PlayRecord } from "../types";
import { PlayCounter, playThresholdMs, type PlayerSample } from "./playCounter";

const song = (id: string, durationMs: number): Track => ({
  id,
  title: `Song ${id}`,
  artists: "Artist",
  coverUrl: "",
  durationMs,
  playCount: 0,
  album: { id: `al-${id}`, title: `Album ${id}` },
});

/** Drives a counter like timeupdate does: 250 ms steps of position and wall clock. */
function harness() {
  const saved: PlayRecord[] = [];
  let n = 0;
  const counter = new PlayCounter((r) => saved.push(r), () => `p${++n}`);
  let clock = 1_000_000;
  const feed = (s: Partial<PlayerSample> & { track: Track | null }) =>
    counter.observe({
      positionMs: 0,
      durationMs: s.track?.durationMs ?? 0,
      playing: true,
      source: "stream",
      now: clock,
      ...s,
    });
  const play = (track: Track, fromMs: number, toMs: number, extra: Partial<PlayerSample> = {}) => {
    for (let pos = fromMs; pos <= toMs; pos += 250) {
      clock += 250;
      feed({ track, positionMs: pos, ...extra });
    }
  };
  /** Latest version of each record, by id. */
  const plays = () => [...new Map(saved.map((r) => [r.id, r])).values()];
  return { counter, saved, feed, play, plays, advance: (ms: number) => (clock += ms) };
}

describe("playThresholdMs", () => {
  it("is 30 s or half the track, whichever is shorter", () => {
    expect(playThresholdMs(240_000)).toBe(30_000);
    expect(playThresholdMs(40_000)).toBe(20_000);
    expect(playThresholdMs(60_000)).toBe(30_000);
    expect(playThresholdMs(0)).toBe(30_000);
  });
});

describe("PlayCounter thresholds", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it("does not count a long track before 30 s", () => {
    const a = song("a", 240_000);
    h.play(a, 0, 29_500);
    expect(h.plays()).toHaveLength(0);
  });

  it("counts a long track once 30 s were heard", () => {
    const a = song("a", 240_000);
    h.play(a, 0, 30_250);
    expect(h.plays()).toHaveLength(1);
    expect(h.plays()[0]).toMatchObject({ trackId: "a", title: "Song a", albumTitle: "Album a", source: "stream" });
  });

  it("counts a short track at half its length", () => {
    const short = song("s", 20_000);
    h.play(short, 0, 9_500);
    expect(h.plays()).toHaveLength(0);
    h.play(short, 9_750, 10_250);
    expect(h.plays()).toHaveLength(1);
  });

  it("records the time actually listened when the session ends", () => {
    const a = song("a", 240_000);
    h.play(a, 0, 90_000);
    h.feed({ track: song("b", 200_000), positionMs: 0 });
    expect(h.plays()).toHaveLength(1);
    expect(h.plays()[0].listenedMs).toBe(90_000);
  });

  it("does not count seeking forward as listening", () => {
    const a = song("a", 240_000);
    h.play(a, 0, 10_000);
    h.play(a, 200_000, 210_000);
    expect(h.counter.currentListenedMs).toBe(20_000);
    expect(h.plays()).toHaveLength(0);
  });

  it("does not count time while paused, even if the position moves", () => {
    const a = song("a", 240_000);
    h.play(a, 0, 20_000);
    h.play(a, 20_000, 40_000, { playing: false });
    expect(h.counter.currentListenedMs).toBe(20_000);
    expect(h.plays()).toHaveLength(0);
  });

  it("saves the listened time on pause and does not add a second play on resume", () => {
    const a = song("a", 240_000);
    h.play(a, 0, 40_000);
    h.feed({ track: a, positionMs: 40_000, playing: false });
    expect(h.plays()).toHaveLength(1);
    expect(h.plays()[0].listenedMs).toBe(40_000);

    h.advance(60_000);
    h.play(a, 40_000, 120_000);
    h.counter.flush();
    expect(h.plays()).toHaveLength(1);
    expect(h.plays()[0].listenedMs).toBe(120_000);
  });

  it("does not double count a backward seek in the middle of the track", () => {
    const a = song("a", 240_000);
    h.play(a, 0, 60_000);
    h.play(a, 1_000, 61_000);
    h.counter.flush();
    expect(h.plays()).toHaveLength(1);
    expect(h.plays()[0].listenedMs).toBe(120_000);
  });

  it("uses the reported duration over the catalog one", () => {
    const wrong = song("w", 600_000);
    h.play(wrong, 0, 15_250, { durationMs: 30_000 });
    expect(h.plays()).toHaveLength(1);
  });

  it("stamps the play with when listening started", () => {
    const a = song("a", 240_000);
    h.feed({ track: a, positionMs: 0, playing: false, now: 500 });
    h.feed({ track: a, positionMs: 0, playing: true, now: 9_000 });
    h.play(a, 250, 31_000);
    expect(h.plays()[0].playedAt).toBe(9_000);
  });

  it("ends the session when playback stops", () => {
    const a = song("a", 240_000);
    h.play(a, 0, 45_000);
    h.feed({ track: null });
    expect(h.plays()[0].listenedMs).toBe(45_000);
  });
});

describe("PlayCounter repeat", () => {
  it("counts every loop of repeat-one as its own play", () => {
    const h = harness();
    const a = song("a", 60_000);
    h.play(a, 0, 59_750);
    h.play(a, 0, 59_750);
    h.play(a, 0, 40_000);
    h.counter.flush();
    expect(h.plays()).toHaveLength(3);
    expect(h.plays().map((p) => p.listenedMs)).toEqual([59_750, 59_750, 40_000]);
  });

  it("does not count a restart that was not listened to again", () => {
    const h = harness();
    const a = song("a", 60_000);
    h.play(a, 0, 59_750);
    h.play(a, 0, 5_000);
    h.feed({ track: song("b", 100_000), positionMs: 0 });
    expect(h.plays()).toHaveLength(1);
  });

  it("treats replaying a single-track queue after it ended the same way", () => {
    const h = harness();
    const a = song("a", 60_000);
    h.play(a, 0, 58_000);
    // the engine goes through loading with position 0 before playing again
    h.feed({ track: a, positionMs: 0, playing: false });
    h.play(a, 0, 31_000);
    h.counter.flush();
    expect(h.plays()).toHaveLength(2);
  });
});

describe("PlayCounter overlapping track change", () => {
  it("splits plays at the swap and never credits the outgoing track's position to the next", () => {
    const h = harness();
    const a = song("a", 200_000);
    const b = song("b", 180_000);
    h.play(a, 0, 192_000);
    // the engine swaps primaries: currentTrack becomes b and the position resets
    h.feed({ track: b, positionMs: 0 });
    // the new primary has been fading in for a moment already; that is heard, so it counts
    h.play(b, 1_500, 40_000);
    h.counter.flush();
    const plays = h.plays();
    expect(plays.map((p) => p.trackId)).toEqual(["a", "b"]);
    expect(plays[0].listenedMs).toBe(192_000);
    expect(plays[1].listenedMs).toBe(40_000);
  });

  it("does not count the next track when the fade is cut short by a skip", () => {
    const h = harness();
    const a = song("a", 200_000);
    const b = song("b", 180_000);
    const c = song("c", 180_000);
    h.play(a, 0, 192_000);
    h.feed({ track: b, positionMs: 0 });
    h.play(b, 250, 10_000);
    h.feed({ track: c, positionMs: 0 });
    h.play(c, 250, 31_000);
    expect(h.plays().map((p) => p.trackId)).toEqual(["a", "c"]);
  });

  it("does not see a gapless swap into the same position as a repeat", () => {
    const h = harness();
    const a = song("a", 200_000);
    const b = song("b", 180_000);
    h.play(a, 0, 199_750);
    h.feed({ track: b, positionMs: 0 });
    h.play(b, 250, 30_250);
    expect(h.plays().map((p) => p.trackId)).toEqual(["a", "b"]);
  });
});
