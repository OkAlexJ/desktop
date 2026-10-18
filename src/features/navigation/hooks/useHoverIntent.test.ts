import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHoverIntent } from "./useHoverIntent";

describe("createHoverIntent", () => {
  let changes: boolean[];
  let intent: ReturnType<typeof createHoverIntent>;

  beforeEach(() => {
    vi.useFakeTimers();
    changes = [];
    intent = createHoverIntent((open) => changes.push(open), { openDelay: 250, closeDelay: 200 });
  });
  afterEach(() => {
    intent.dispose();
    vi.useRealTimers();
  });

  it("opens only after the open delay", () => {
    intent.enter("trigger");
    vi.advanceTimersByTime(249);
    expect(intent.isOpen()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(intent.isOpen()).toBe(true);
    expect(changes).toEqual([true]);
  });

  it("does not open when the pointer just sweeps past", () => {
    intent.enter("trigger");
    vi.advanceTimersByTime(120);
    intent.leave("trigger");
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([]);
  });

  it("stays open while crossing from the trigger into the panel", () => {
    intent.enter("trigger");
    vi.advanceTimersByTime(250);
    intent.leave("trigger");
    vi.advanceTimersByTime(150);
    intent.enter("panel");
    vi.advanceTimersByTime(1000);
    expect(intent.isOpen()).toBe(true);
    expect(changes).toEqual([true]);
  });

  it("closes after the grace period once the pointer leaves both", () => {
    intent.enter("trigger");
    vi.advanceTimersByTime(250);
    intent.leave("trigger");
    intent.enter("panel");
    intent.leave("panel");
    vi.advanceTimersByTime(199);
    expect(intent.isOpen()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(intent.isOpen()).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it("re-entering the trigger during the grace period keeps it open without flicker", () => {
    intent.enter("trigger");
    vi.advanceTimersByTime(250);
    intent.leave("trigger");
    vi.advanceTimersByTime(100);
    intent.enter("trigger");
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([true]);
  });

  it("the panel cannot open a closed menu", () => {
    intent.enter("panel");
    vi.advanceTimersByTime(1000);
    expect(intent.isOpen()).toBe(false);
  });

  it("opens on keyboard focus and stays open while the pointer leaves", () => {
    intent.enter("trigger", "focus");
    vi.advanceTimersByTime(250);
    intent.enter("trigger");
    intent.leave("trigger");
    vi.advanceTimersByTime(1000);
    expect(intent.isOpen()).toBe(true);
    intent.leave("trigger", "focus");
    vi.advanceTimersByTime(200);
    expect(intent.isOpen()).toBe(false);
  });

  it("close() shuts immediately and cancels a pending open", () => {
    intent.enter("trigger");
    vi.advanceTimersByTime(250);
    intent.close();
    expect(intent.isOpen()).toBe(false);
    intent.enter("trigger");
    vi.advanceTimersByTime(100);
    intent.close();
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([true, false]);
  });
});
