import { describe, expect, it } from "vitest";
import { resolveBackdropMode, getPanelGlass } from "./backdropMode";

describe("resolveBackdropMode", () => {
  it.each([
    // hasWallpaper, hasPageCover, useCoversOnPages, expected
    [false, false, false, "none"],
    [false, true, false, "cover"],
    [false, true, true, "cover"],
    [true, false, false, "wallpaper"],
    [true, false, true, "wallpaper"],
    // the wallpaper wins over page covers unless the user opted in
    [true, true, false, "wallpaper"],
    [true, true, true, "cover"],
  ] as const)(
    "wallpaper=%s cover=%s useCovers=%s -> %s",
    (hasWallpaper, hasPageCover, useCoversOnPages, expected) => {
      expect(
        resolveBackdropMode({ hasWallpaper, hasPageCover, useCoversOnPages }),
      ).toBe(expected);
    },
  );
});

describe("getPanelGlass", () => {
  it("keeps panels nearly opaque at 0% transparency", () => {
    expect(getPanelGlass(0)).toEqual({ tint: 0.92, blur: 16 });
  });

  it("never drops below the readability floor", () => {
    expect(getPanelGlass(100)).toEqual({ tint: 0.3, blur: 32 });
    expect(getPanelGlass(500)).toEqual({ tint: 0.3, blur: 32 });
    expect(getPanelGlass(-20)).toEqual({ tint: 0.92, blur: 16 });
    expect(getPanelGlass(Number.NaN)).toEqual({ tint: 0.92, blur: 16 });
  });

  it("gets more see-through as the slider goes up", () => {
    const low = getPanelGlass(20);
    const high = getPanelGlass(70);
    expect(high.tint).toBeLessThan(low.tint);
    expect(high.blur).toBeGreaterThan(low.blur);
  });
});
