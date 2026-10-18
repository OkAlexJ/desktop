import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { usePlayerStore } from "@/features/player/store/playerStore";
import type { Track } from "@/shared/types";
import type { PlayRecord } from "../types";
import { useStatsSettingsStore } from "../store/statsStore";
import { historyToCsv } from "./exportHistory";
import { startListeningTracker } from "./listeningTracker";

const a: Track = { id: "a", title: "A", artists: "X", durationMs: 200_000, coverUrl: "", playCount: 0 };
const b: Track = { id: "b", title: "B", artists: "Y", durationMs: 180_000, coverUrl: "", playCount: 0 };

/** Moves the store the way the runtime's timeupdate handler does. */
function tick(fromMs: number, toMs: number) {
  for (let pos = fromMs; pos <= toMs; pos += 250) usePlayerStore.getState().setPosition(pos);
}

describe("startListeningTracker", () => {
  let saved: PlayRecord[];
  let stop: () => void;
  const latest = () => [...new Map(saved.map((r) => [r.id, r])).values()];

  beforeEach(() => {
    saved = [];
    useStatsSettingsStore.setState({ trackingPaused: false });
    usePlayerStore.setState({
      status: "playing",
      currentTrack: a,
      queue: [a, b],
      currentIndex: 0,
      positionMs: 0,
      durationMs: 200_000,
      repeat: "off",
    });
    stop = startListeningTracker({ sink: (r) => saved.push(r), sourceOf: () => "offline" });
  });

  afterEach(() => stop());

  it("follows an overlapping track change the way the engine reports it", () => {
    tick(250, 190_000);
    // PlayerEngine.handleTransitionStarted: setCurrentTrack, setPosition(0), setDuration
    const store = usePlayerStore.getState();
    store.setCurrentTrack(b, 1);
    store.setPosition(0);
    store.setDuration(b.durationMs);
    tick(250, 35_000);
    stop();
    expect(latest().map((p) => [p.trackId, p.listenedMs, p.source])).toEqual([
      ["a", 190_000, "offline"],
      ["b", 35_000, "offline"],
    ]);
  });

  it("counts repeat-one loops separately", () => {
    usePlayerStore.setState({ repeat: "one", durationMs: 60_000, currentTrack: { ...a, durationMs: 60_000 } });
    tick(250, 59_750);
    // skipNext(isAutoEnd) with repeat one: same track, loading, position 0, playing
    usePlayerStore.getState().setStatus("loading");
    usePlayerStore.getState().setPosition(0);
    usePlayerStore.getState().setStatus("playing");
    tick(250, 31_000);
    stop();
    expect(latest()).toHaveLength(2);
  });

  it("does not count while pause is on, or a pause/resume as a new play", () => {
    tick(250, 40_000);
    usePlayerStore.getState().setStatus("paused");
    usePlayerStore.getState().setStatus("playing");
    tick(40_250, 60_000);
    useStatsSettingsStore.getState().setTrackingPaused(true);
    usePlayerStore.getState().setCurrentTrack(b, 1);
    tick(250, 60_000);
    stop();
    expect(latest().map((p) => [p.trackId, p.listenedMs])).toEqual([["a", 60_000]]);
  });
});

describe("historyToCsv", () => {
  it("quotes cells and defuses formulas", () => {
    const csv = historyToCsv([
      {
        id: "1",
        playedAt: Date.UTC(2026, 0, 2, 3, 4, 5),
        trackId: "t",
        title: '=Hi, "there"',
        artists: "A, B",
        durationMs: 1,
        listenedMs: 2,
        source: "stream",
      },
    ]);
    const [header, row] = csv.trim().split("\r\n");
    expect(header).toBe("playedAt,trackId,title,artists,album,durationMs,listenedMs,source");
    expect(row).toBe(`2026-01-02T03:04:05.000Z,t,"'=Hi, ""there""","A, B",,1,2,stream`);
  });

  it("also defuses cells starting with a minus sign or a line break", () => {
    const base = { id: "1", playedAt: 0, trackId: "t", durationMs: 1, listenedMs: 2, source: "stream" as const };
    const csv = historyToCsv([
      { ...base, title: "-1+2", artists: "\nA" },
    ]);
    const body = csv.split("\r\n").slice(1).join("\r\n");
    expect(body).toContain(",'-1+2,");
    expect(body).toContain(`"'\nA"`);
  });
});
