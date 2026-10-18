import { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { PlayRecord } from "../types";
import { useStatsHistoryStore } from "../store/statsStore";
import StatsPage from "./StatsPage";

// @ts-expect-error - act support flag in vitest browserless DOM environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/features/covers", () => ({ CoverImage: () => null }));
vi.mock("@/features/player", () => ({ playerEngine: { playTrack: vi.fn() } }));

const play = (over: Partial<PlayRecord>): PlayRecord => ({
  id: Math.random().toString(36),
  playedAt: Date.now() - 3_600_000,
  trackId: "t1",
  title: "First Song",
  artists: "Some Artist",
  albumId: "al1",
  albumTitle: "Some Album",
  durationMs: 200_000,
  listenedMs: 200_000,
  source: "stream",
  ...over,
});

describe("StatsPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the empty state with no history", () => {
    useStatsHistoryStore.setState({ plays: [], loaded: true });
    act(() =>
      root.render(
        <MemoryRouter>
          <StatsPage />
        </MemoryRouter>,
      ),
    );
    expect(container.textContent).toContain("No plays yet");
  });

  it("renders totals and top lists from history", () => {
    useStatsHistoryStore.setState({
      loaded: true,
      plays: [play({}), play({}), play({ trackId: "t2", title: "Second Song", artists: "Other" })],
    });
    act(() =>
      root.render(
        <MemoryRouter>
          <StatsPage />
        </MemoryRouter>,
      ),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("10 min");
    expect(text).toContain("First Song");
    expect(text).toContain("2 plays");
    expect(text).toContain("Some Album");
    expect(text).toContain("1 day");
  });
});
