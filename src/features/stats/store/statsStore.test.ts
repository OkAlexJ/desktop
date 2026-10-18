import { describe, it, expect, beforeEach } from "vitest";
import type { PlayRecord } from "../types";
import { useStatsHistoryStore } from "./statsStore";

const play = (id: string, playedAt: number): PlayRecord => ({
  id,
  playedAt,
  trackId: id,
  title: id,
  artists: "A",
  durationMs: 180_000,
  listenedMs: 60_000,
  source: "stream",
});

describe("useStatsHistoryStore.clearHistory", () => {
  beforeEach(async () => {
    await useStatsHistoryStore.getState().clearHistory();
  });

  it("empties the history", async () => {
    useStatsHistoryStore.getState().recordPlay(play("a", Date.now()));
    expect(useStatsHistoryStore.getState().plays).toHaveLength(1);
    await useStatsHistoryStore.getState().clearHistory();
    expect(useStatsHistoryStore.getState().plays).toHaveLength(0);
  });

  it("ignores later updates to a play that started before the clear", async () => {
    const startedEarlier = play("running", Date.now() - 60_000);
    useStatsHistoryStore.getState().recordPlay(startedEarlier);
    await useStatsHistoryStore.getState().clearHistory();

    // the counter flushes the same session again on pause or track change
    useStatsHistoryStore.getState().recordPlay({ ...startedEarlier, listenedMs: 120_000 });
    expect(useStatsHistoryStore.getState().plays).toHaveLength(0);

    const startedAfter = play("next", Date.now() + 1);
    useStatsHistoryStore.getState().recordPlay(startedAfter);
    expect(useStatsHistoryStore.getState().plays.map((p) => p.id)).toEqual(["next"]);
  });
});
