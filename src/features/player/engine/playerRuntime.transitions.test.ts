import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./streamResolver", () => ({ resolvePlaybackStream: vi.fn() }));

import { playerRuntime } from "./playerRuntime";
import { usePlayerStore } from "../store/playerStore";
import { linerDb } from "@/shared/storage";
import type { Track } from "@/shared/types";

const current: Track = { id: "a", title: "A", artists: "X", durationMs: 200_000, coverUrl: "", playCount: 0 };
const next: Track = { id: "b", title: "B", artists: "X", durationMs: 180_000, coverUrl: "", playCount: 0 };

const runtime = playerRuntime as any;

function setMedia(el: HTMLAudioElement, props: Record<string, unknown>) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(el, key, { value, configurable: true, writable: true });
  }
}

function fireTimeupdate(positionSec: number) {
  setMedia(runtime.audio, { currentTime: positionSec, duration: 200, paused: false });
  runtime.audio.dispatchEvent(new Event("timeupdate"));
}

describe("PlayerRuntime track transitions", () => {
  const getUpcomingTrack = vi.fn(() => ({ track: next, index: 1 }));
  const onTransitionStarted = vi.fn();

  beforeEach(() => {
    runtime.currentTrackId = current.id;
    runtime.getUpcomingTrack = getUpcomingTrack;
    runtime.onTransitionStarted = onTransitionStarted;
    usePlayerStore.setState({
      status: "playing",
      currentTrack: current,
      queue: [current, next],
      currentIndex: 0,
      volume: 0.8,
      repeat: "off",
      crossfadeSec: 0,
      gaplessPlayback: false,
    });
    (URL as any).createObjectURL = vi.fn(() => "blob:next");
    (URL as any).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    getUpcomingTrack.mockClear();
    onTransitionStarted.mockClear();
  });

  it("does nothing near the end when crossfade and gapless are off", () => {
    fireTimeupdate(199);
    expect(getUpcomingTrack).not.toHaveBeenCalled();
    expect(document.getElementById("liner-audio-standby")).toBeNull();
    expect(runtime.transitionStartTimer).toBeNull();
  });

  it("prepares the cached next track, then crossfades and swaps the primary element", async () => {
    usePlayerStore.setState({ crossfadeSec: 4 });
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
    vi.spyOn(linerDb, "getAudio").mockResolvedValue({ blob, byteSize: 3 } as any);

    // 200 s track, 4 s fade → starts at 196 s; prepare window is 8 s before that.
    fireTimeupdate(150);
    expect(runtime.standbyTrack).toBeNull();

    fireTimeupdate(190);
    await vi.waitFor(() => expect(runtime.standbyTrack?.id).toBe("b"));
    const standby: HTMLAudioElement = runtime.standby;
    expect(standby.id).toBe("liner-audio-standby");
    standby.dispatchEvent(new Event("canplay"));
    expect(runtime.standbyReady).toBe(true);

    const old: HTMLAudioElement = runtime.audio;
    setMedia(old, { currentTime: 196, duration: 200, paused: false, playbackRate: 1 });
    await runtime.startTransition(4);

    expect(runtime.audio).toBe(standby);
    expect(standby.id).toBe("liner-audio");
    expect(old.id).toBe("liner-audio-fading");
    expect((window as any).__liner_audio).toBe(standby);
    expect(runtime.currentTrackId).toBe("b");
    expect(onTransitionStarted).toHaveBeenCalledWith(next, 1);
    expect(runtime.fadingOut?.el).toBe(old);

    // Fade completes (or is cut short): the old element becomes the next standby.
    runtime.finishFadeOut();
    expect(runtime.fadingOut).toBeNull();
    expect(old.id).toBe("liner-audio-standby");
    expect(runtime.standby).toBe(old);
  });

  it("drops the standby instead of swapping when the queue changed after the timer was armed", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
    vi.spyOn(linerDb, "getAudio").mockResolvedValue({ blob, byteSize: 3 } as any);
    const old: HTMLAudioElement = runtime.audio;
    runtime.standbyAttempt = null;
    await runtime.prepareStandby(next);
    const standby: HTMLAudioElement = runtime.standby;
    standby.dispatchEvent(new Event("canplay"));
    expect(runtime.standbyReady).toBe(true);

    // e.g. the user cleared the queue or removed "b" in the last second
    getUpcomingTrack.mockReturnValueOnce(null as any);
    setMedia(old, { currentTime: 196, duration: 200, paused: false, playbackRate: 1 });
    await runtime.startTransition(4);

    expect(runtime.audio).toBe(old);
    expect(runtime.currentTrackId).toBe("a");
    expect(runtime.standbyTrack).toBeNull();
    expect(onTransitionStarted).not.toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("skips the transition for repeat-one (engine returns no upcoming track)", () => {
    usePlayerStore.setState({ gaplessPlayback: true });
    getUpcomingTrack.mockReturnValueOnce(null as any);
    fireTimeupdate(199.5);
    expect(runtime.transitionStartTimer).toBeNull();
  });
});
