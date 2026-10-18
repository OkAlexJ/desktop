import { describe, it, expect } from "vitest";
import {
  GAPLESS_LEAD_SEC,
  PREPARE_AHEAD_SEC,
  clampCrossfade,
  crossfadeGains,
  effectiveFadeSec,
  formatCrossfadeSeconds,
  planTransition,
  transitionsEnabled,
} from "./transitions";

const off = { crossfadeSec: 0, gapless: false };

describe("transition settings", () => {
  it("clamps crossfade to 0–12 s in half-second steps", () => {
    expect(clampCrossfade(-3)).toBe(0);
    expect(clampCrossfade(30)).toBe(12);
    expect(clampCrossfade(4.3)).toBe(4.5);
    expect(clampCrossfade(Number.NaN)).toBe(0);
  });

  it("is disabled only when crossfade is 0 and gapless is off", () => {
    expect(transitionsEnabled(off)).toBe(false);
    expect(transitionsEnabled({ crossfadeSec: 0, gapless: true })).toBe(true);
    expect(transitionsEnabled({ crossfadeSec: 3, gapless: false })).toBe(true);
  });
});

describe("planTransition", () => {
  it("returns null when transitions are off (today's behaviour)", () => {
    expect(planTransition({ durationSec: 200, positionSec: 190, settings: off })).toBeNull();
  });

  it("returns null for unknown durations", () => {
    const settings = { crossfadeSec: 5, gapless: false };
    expect(planTransition({ durationSec: Number.NaN, positionSec: 0, settings })).toBeNull();
    expect(planTransition({ durationSec: Infinity, positionSec: 0, settings })).toBeNull();
    expect(planTransition({ durationSec: 0, positionSec: 0, settings })).toBeNull();
  });

  it("starts the next track fadeSec before the end", () => {
    const plan = planTransition({
      durationSec: 200,
      positionSec: 180,
      settings: { crossfadeSec: 6, gapless: false },
    })!;
    expect(plan.fadeSec).toBe(6);
    expect(plan.startAtPositionSec).toBe(194);
    expect(plan.secondsUntilStart).toBe(14);
    expect(plan.secondsUntilPrepare).toBe(14 - PREPARE_AHEAD_SEC);
  });

  it("accounts for playback rate in both media and wall time", () => {
    const plan = planTransition({
      durationSec: 200,
      positionSec: 180,
      playbackRate: 2,
      settings: { crossfadeSec: 5, gapless: false },
    })!;
    // 5 wall seconds at 2x consume 10 media seconds.
    expect(plan.startAtPositionSec).toBe(190);
    expect(plan.secondsUntilStart).toBe(5);
  });

  it("gapless starts just before the end with no fade", () => {
    const plan = planTransition({
      durationSec: 100,
      positionSec: 99,
      settings: { crossfadeSec: 0, gapless: true },
    })!;
    expect(plan.fadeSec).toBe(0);
    expect(plan.startAtPositionSec).toBeCloseTo(100 - GAPLESS_LEAD_SEC, 6);
    expect(plan.secondsUntilStart).toBeCloseTo(1 - GAPLESS_LEAD_SEC, 6);
  });

  it("never schedules in the past", () => {
    const plan = planTransition({
      durationSec: 100,
      positionSec: 99.9,
      settings: { crossfadeSec: 8, gapless: false },
    })!;
    expect(plan.secondsUntilStart).toBe(0);
    expect(plan.secondsUntilPrepare).toBe(0);
  });

  it("shortens the fade for short tracks and falls back to a cut when tiny", () => {
    const settings = { crossfadeSec: 12, gapless: false };
    expect(effectiveFadeSec(settings, 30)).toBe(10);
    expect(effectiveFadeSec(settings, 300, 9)).toBe(3);
    expect(effectiveFadeSec(settings, 1)).toBe(0);
    const plan = planTransition({ durationSec: 1.2, positionSec: 0, settings })!;
    expect(plan.fadeSec).toBe(0);
    expect(plan.startAtPositionSec).toBeCloseTo(1.2 - GAPLESS_LEAD_SEC, 6);
  });
});

describe("crossfadeGains", () => {
  it("runs from full-out to full-in", () => {
    expect(crossfadeGains(0)).toEqual({ out: 1, in: 0 });
    const end = crossfadeGains(1);
    expect(end.out).toBeCloseTo(0, 10);
    expect(end.in).toBe(1);
  });

  it("keeps constant power through the overlap", () => {
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const { out, in: gainIn } = crossfadeGains(p);
      expect(out * out + gainIn * gainIn).toBeCloseTo(1, 10);
    }
    expect(crossfadeGains(0.5).out).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it("clamps out-of-range progress", () => {
    expect(crossfadeGains(-1)).toEqual({ out: 1, in: 0 });
    expect(crossfadeGains(2).in).toBe(1);
  });
});

describe("formatCrossfadeSeconds", () => {
  it("uses the locale's decimal separator and unit", () => {
    expect(formatCrossfadeSeconds(4.5, "en")).toMatch(/^4\.5\s?s$/);
    expect(formatCrossfadeSeconds(4.5, "de")).toMatch(/^4,5\s/);
    expect(formatCrossfadeSeconds(4, "fr")).not.toContain(".");
  });
});
