import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@/shared/types";
import {
  applyMove,
  applyPlannedMoves,
  loadPlaylistSort,
  planReorderMoves,
  savePlaylistSort,
  sortPlaylistTracks,
} from "./playlistSort";

function track(id: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    playlistItemId: `item-${id}`,
    title: id,
    artists: "",
    coverUrl: "",
    durationMs: 0,
    playCount: 0,
    ...overrides,
  };
}

const ids = (tracks: Track[]) => tracks.map((t) => t.id);

describe("sortPlaylistTracks", () => {
  const tracks = [
    track("a", { title: "beta", artists: "Zed", album: { id: "1", title: "Live" }, durationMs: 200_000, addedAt: "2024-03-01T00:00:00Z" }),
    track("b", { title: "Alpha", artists: "adele", durationMs: 100_000, addedAt: "2024-01-01T00:00:00Z" }),
    track("c", { title: "track 10", artists: "Muse", album: { id: "2", title: "Absolution" }, addedAt: "2024-02-01T00:00:00Z" }),
    track("d", { title: "track 2", artists: "muse", album: { id: "3", title: "absolution" }, durationMs: 300_000 }),
  ];

  it("keeps the playlist order for custom and reverses it for custom desc", () => {
    expect(ids(sortPlaylistTracks(tracks, { key: "custom", direction: "asc" }))).toEqual(["a", "b", "c", "d"]);
    expect(ids(sortPlaylistTracks(tracks, { key: "custom", direction: "desc" }))).toEqual(["d", "c", "b", "a"]);
  });

  it("sorts titles case-insensitively with numeric awareness", () => {
    expect(ids(sortPlaylistTracks(tracks, { key: "title", direction: "asc" }))).toEqual(["b", "a", "d", "c"]);
    expect(ids(sortPlaylistTracks(tracks, { key: "title", direction: "desc" }))).toEqual(["c", "d", "a", "b"]);
  });

  it("breaks ties with the original order in both directions", () => {
    expect(ids(sortPlaylistTracks(tracks, { key: "artist", direction: "asc" }))).toEqual(["b", "c", "d", "a"]);
    expect(ids(sortPlaylistTracks(tracks, { key: "artist", direction: "desc" }))).toEqual(["a", "c", "d", "b"]);
  });

  it("puts missing values last regardless of direction", () => {
    expect(ids(sortPlaylistTracks(tracks, { key: "album", direction: "asc" }))).toEqual(["c", "d", "a", "b"]);
    expect(ids(sortPlaylistTracks(tracks, { key: "album", direction: "desc" }))).toEqual(["a", "c", "d", "b"]);
    expect(ids(sortPlaylistTracks(tracks, { key: "duration", direction: "asc" }))).toEqual(["b", "a", "d", "c"]);
    expect(ids(sortPlaylistTracks(tracks, { key: "duration", direction: "desc" }))).toEqual(["d", "a", "b", "c"]);
    expect(ids(sortPlaylistTracks(tracks, { key: "addedAt", direction: "asc" }))).toEqual(["b", "c", "a", "d"]);
    expect(ids(sortPlaylistTracks(tracks, { key: "addedAt", direction: "desc" }))).toEqual(["a", "c", "b", "d"]);
  });

  it("does not mutate the input", () => {
    const copy = [...tracks];
    sortPlaylistTracks(tracks, { key: "title", direction: "desc" });
    expect(tracks).toEqual(copy);
  });
});

describe("planReorderMoves", () => {
  const simulate = (current: string[], target: string[]) =>
    planReorderMoves(current, target).reduce(applyMove, current);

  it("returns no moves when the order already matches", () => {
    expect(planReorderMoves(["a", "b", "c"], ["a", "b", "c"])).toEqual([]);
  });

  it("moves only what is out of place", () => {
    const moves = planReorderMoves(["a", "b", "c", "d"], ["a", "c", "d", "b"]);
    expect(moves).toEqual([{ itemId: "b", beforeItemId: null }]);
  });

  it("reaches the target order for reversals and shuffles", () => {
    const current = ["a", "b", "c", "d", "e", "f", "g"];
    const reversed = [...current].reverse();
    expect(simulate(current, reversed)).toEqual(reversed);
    expect(planReorderMoves(current, reversed)).toHaveLength(current.length - 1);
    for (let seed = 1; seed < 30; seed++) {
      const target = [...current].sort((x, y) => ((x.charCodeAt(0) * seed) % 7) - ((y.charCodeAt(0) * seed) % 7));
      expect(simulate(current, target)).toEqual(target);
    }
  });

  it("rejects targets with different items", () => {
    expect(() => planReorderMoves(["a", "b"], ["a", "c"])).toThrow();
  });
});

describe("applyPlannedMoves", () => {
  it("threads revisions and reports progress", async () => {
    const move = vi.fn(async (_m, revision: number) => ({ revision: revision + 10 }));
    const progress = vi.fn();
    const final = await applyPlannedMoves({
      moves: [
        { itemId: "a", beforeItemId: null },
        { itemId: "b", beforeItemId: "a" },
      ],
      revision: 1,
      move,
      onProgress: progress,
    });
    expect(move.mock.calls.map((c) => c[1])).toEqual([1, 11]);
    expect(final).toBe(21);
    expect(progress.mock.calls).toEqual([[0, 2], [1, 2], [2, 2]]);
  });

  it("stops early when shouldContinue turns false", async () => {
    let keepGoing = true;
    const move = vi.fn(async () => {
      keepGoing = false;
      return { revision: 2 };
    });
    await applyPlannedMoves({
      moves: [
        { itemId: "a", beforeItemId: null },
        { itemId: "b", beforeItemId: null },
      ],
      revision: 1,
      move,
      shouldContinue: () => keepGoing,
    });
    expect(move).toHaveBeenCalledTimes(1);
  });

  it("stops at the first failure", async () => {
    const move = vi.fn().mockResolvedValueOnce({ revision: 2 }).mockRejectedValueOnce(new Error("409"));
    await expect(
      applyPlannedMoves({
        moves: [
          { itemId: "a", beforeItemId: null },
          { itemId: "b", beforeItemId: null },
          { itemId: "c", beforeItemId: null },
        ],
        revision: 1,
        move,
      }),
    ).rejects.toThrow("409");
    expect(move).toHaveBeenCalledTimes(2);
  });
});

describe("playlist sort persistence", () => {
  beforeEach(() => localStorage.clear());

  it("remembers the choice per playlist", () => {
    savePlaylistSort("p1", { key: "title", direction: "desc" });
    savePlaylistSort("p2", { key: "duration", direction: "asc" });
    expect(loadPlaylistSort("p1")).toEqual({ key: "title", direction: "desc" });
    expect(loadPlaylistSort("p2")).toEqual({ key: "duration", direction: "asc" });
    expect(loadPlaylistSort("p3")).toEqual({ key: "custom", direction: "asc" });
  });

  it("falls back to custom for corrupt entries", () => {
    localStorage.setItem("liner:playlist-sort-v1", JSON.stringify({ p1: { key: "bogus", direction: "up" } }));
    expect(loadPlaylistSort("p1")).toEqual({ key: "custom", direction: "asc" });
    localStorage.setItem("liner:playlist-sort-v1", "not json");
    expect(loadPlaylistSort("p1")).toEqual({ key: "custom", direction: "asc" });
  });
});
