import { describe, it, expect } from "vitest";
import type { PlayRecord } from "../types";
import {
  dailyListening,
  filterPlays,
  hourHeatmap,
  listeningStreak,
  playArtists,
  rangeStart,
  splitArtistString,
  summarize,
  topAlbums,
  topArtists,
  topTracks,
  yearRecap,
} from "./aggregate";

let n = 0;
function play(at: Date, over: Partial<PlayRecord> = {}): PlayRecord {
  n += 1;
  return {
    id: `p${n}`,
    playedAt: at.getTime(),
    trackId: "t1",
    title: "One",
    artists: "Alpha",
    durationMs: 180_000,
    listenedMs: 180_000,
    source: "stream",
    ...over,
  };
}

const now = new Date(2026, 9, 18, 15, 0).getTime(); // Sun 18 Oct 2026, local time

describe("rangeStart", () => {
  it("starts 7d and 4w at local midnight, today included", () => {
    expect(new Date(rangeStart("7d", now))).toEqual(new Date(2026, 9, 12));
    expect(new Date(rangeStart("4w", now))).toEqual(new Date(2026, 8, 21));
  });
  it("goes back calendar months and years", () => {
    expect(new Date(rangeStart("6m", now))).toEqual(new Date(2026, 3, 18));
    expect(new Date(rangeStart("1y", now))).toEqual(new Date(2025, 9, 18));
    expect(rangeStart("all", now)).toBe(0);
  });
  it("filters by the range", () => {
    const plays = [play(new Date(2026, 9, 11, 23)), play(new Date(2026, 9, 12, 0, 5)), play(new Date(2026, 9, 18, 9))];
    expect(filterPlays(plays, rangeStart("7d", now))).toHaveLength(2);
  });
});

describe("summarize", () => {
  it("adds up time, plays, unique tracks and unique artists", () => {
    const plays = [
      play(new Date(2026, 9, 18, 1), { listenedMs: 60_000 }),
      play(new Date(2026, 9, 18, 2), { listenedMs: 30_000 }),
      play(new Date(2026, 9, 18, 3), { trackId: "t2", artists: "Alpha, Beta", listenedMs: 10_000 }),
    ];
    expect(summarize(plays)).toEqual({ totalMs: 100_000, playCount: 3, uniqueTracks: 2, uniqueArtists: 2 });
  });
});

describe("artists", () => {
  it("splits joined artist strings", () => {
    expect(splitArtistString("A, B & C feat. D")).toEqual(["A", "B", "C", "D"]);
    expect(splitArtistString("Simon & Garfunkel ft. X")).toEqual(["Simon", "Garfunkel", "X"]);
  });
  it("prefers the artist list and its ids", () => {
    const p = play(new Date(), { artists: "Whatever", artistNames: ["A", "B"], artistIds: ["id-a", null] });
    expect(playArtists(p)).toEqual([
      { key: "id:id-a", id: "id-a", name: "A" },
      { key: "name:b", id: undefined, name: "B" },
    ]);
  });
});

describe("top lists", () => {
  const plays = [
    play(new Date(2026, 9, 1), { trackId: "a", title: "A", artists: "X", albumId: "al1", albumTitle: "One", coverUrl: "a.jpg" }),
    play(new Date(2026, 9, 2), { trackId: "a", title: "A", artists: "X", albumId: "al1", albumTitle: "One" }),
    play(new Date(2026, 9, 3), { trackId: "b", title: "B", artists: "X, Y", albumId: "al2", albumTitle: "Two", listenedMs: 500_000 }),
    play(new Date(2026, 9, 4), { trackId: "c", title: "C", artists: "Y", listenedMs: 10_000 }),
  ];

  it("ranks tracks by plays, then listening time", () => {
    expect(topTracks(plays).map((t) => [t.trackId, t.plays])).toEqual([
      ["a", 2],
      ["b", 1],
      ["c", 1],
    ]);
    expect(topTracks(plays)[0].coverUrl).toBe("a.jpg");
    expect(topTracks(plays, 1)).toHaveLength(1);
  });

  it("credits every artist on a track", () => {
    expect(topArtists(plays).map((a) => [a.name, a.plays])).toEqual([
      ["X", 3],
      ["Y", 2],
    ]);
  });

  it("groups albums and skips plays with no album", () => {
    expect(topAlbums(plays).map((a) => [a.title, a.plays])).toEqual([
      ["One", 2],
      ["Two", 1],
    ]);
  });
});

describe("hourHeatmap", () => {
  it("puts listening time by weekday (Monday first) and start hour", () => {
    const grid = hourHeatmap([
      play(new Date(2026, 9, 12, 8, 30), { listenedMs: 1_000 }), // Monday
      play(new Date(2026, 9, 18, 23, 59), { listenedMs: 2_000 }), // Sunday
      play(new Date(2026, 9, 18, 23, 1), { listenedMs: 3_000 }),
    ]);
    expect(grid).toHaveLength(7);
    expect(grid[0][8]).toBe(1_000);
    expect(grid[6][23]).toBe(5_000);
  });
});

describe("dailyListening", () => {
  it("has one bucket per day, empty days included", () => {
    const days = dailyListening(
      [play(new Date(2026, 9, 16, 10), { listenedMs: 60_000 }), play(new Date(2026, 9, 18, 1), { listenedMs: 120_000 })],
      rangeStart("7d", now),
      now,
    );
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.ms)).toEqual([0, 0, 0, 0, 60_000, 0, 120_000]);
    expect(days[6].day).toBe("2026-10-18");
  });

  it("covers a history longer than ten years up to today", () => {
    const from = new Date(2014, 0, 1).getTime();
    const days = dailyListening([play(new Date(2026, 9, 18, 1), { listenedMs: 5_000 })], from, now);
    expect(days.length).toBeGreaterThan(3700);
    expect(days[days.length - 1].day).toBe("2026-10-18");
    expect(days[days.length - 1].ms).toBe(5_000);
  });
});

describe("listeningStreak", () => {
  it("counts days in a row up to today", () => {
    const plays = [15, 16, 17, 18].map((d) => play(new Date(2026, 9, d, 12)));
    expect(listeningStreak(plays, now)).toEqual({ current: 4, longest: 4 });
  });
  it("keeps the streak alive until today is over", () => {
    const plays = [16, 17].map((d) => play(new Date(2026, 9, d, 12)));
    expect(listeningStreak(plays, now).current).toBe(2);
  });
  it("breaks after a missed day and remembers the longest run", () => {
    const plays = [1, 2, 3, 4, 5, 10, 18].map((d) => play(new Date(2026, 9, d, 12)));
    expect(listeningStreak(plays, now)).toEqual({ current: 1, longest: 5 });
  });
  it("runs across month ends", () => {
    const plays = [play(new Date(2026, 8, 30, 12)), play(new Date(2026, 9, 1, 12))];
    expect(listeningStreak(plays, new Date(2026, 9, 1, 20).getTime())).toEqual({ current: 2, longest: 2 });
  });
  it("is zero with no plays", () => {
    expect(listeningStreak([], now)).toEqual({ current: 0, longest: 0 });
  });
});

describe("yearRecap", () => {
  it("only looks at the chosen year", () => {
    const plays = [
      play(new Date(2025, 11, 31, 23), { trackId: "old", artists: "Old" }),
      play(new Date(2026, 2, 1), { trackId: "a", title: "A", artists: "X", genre: "Jazz", listenedMs: 60_000 }),
      play(new Date(2026, 2, 2), { trackId: "a", title: "A", artists: "X", genre: "jazz", listenedMs: 60_000 }),
      play(new Date(2026, 6, 1), { trackId: "b", title: "B", artists: "Y", listenedMs: 30_000 }),
    ];
    const recap = yearRecap(plays, 2026, now);
    expect(recap.summary.playCount).toBe(3);
    expect(recap.summary.totalMs).toBe(150_000);
    expect(recap.topTrack?.trackId).toBe("a");
    expect(recap.topArtist?.name).toBe("X");
    expect(recap.topGenre).toMatchObject({ name: "Jazz", plays: 2 });
    expect(recap.topMonth).toEqual({ month: 2, ms: 120_000 });
    expect(recap.longestStreak).toBe(2);
  });
  it("has no genre when no play has one", () => {
    expect(yearRecap([play(new Date(2026, 1, 1))], 2026, now).topGenre).toBeNull();
  });
});
