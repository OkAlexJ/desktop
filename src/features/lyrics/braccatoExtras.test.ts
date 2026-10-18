import { describe, it, expect, vi } from "vitest";
import { applyBraccatoExtras } from "./extras/braccatoExtras";

function fakeElement(count: number) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const lines = Array.from({ length: count }, (_, i) => {
    const lyricElement = document.createElement("div");
    lyricElement.textContent = `line ${i}`;
    host.appendChild(lyricElement);
    return { lyricElement } as any;
  });
  const scheduleLyricPositionUpdate = vi.fn();
  Object.assign(host, { renderer: { lines, scheduleLyricPositionUpdate } });
  return { host: host as any, lines, scheduleLyricPositionUpdate };
}

describe("applyBraccatoExtras", () => {
  it("waits until the element has built its lines", () => {
    expect(applyBraccatoExtras(document.createElement("div") as any, [], [])).toBe(false);
  });

  it("hangs romanized and translated lines under the matching line, then re-measures", () => {
    const { host, lines, scheduleLyricPositionUpdate } = fakeElement(3);
    expect(applyBraccatoExtras(host, ["Privet", null, null], ["Hello", null, "Bye"])).toBe(true);
    expect(lines[0].lyricElement.querySelector(".blyrics--romanized")?.textContent).toBe("Privet");
    expect(lines[0].lyricElement.querySelector(".blyrics--translated")?.textContent).toBe("Hello");
    expect(lines[1].lyricElement.querySelector(".blyrics--translated")).toBeNull();
    expect(lines[2].lyricElement.querySelector(".blyrics--translated")?.textContent).toBe("Bye");
    expect(scheduleLyricPositionUpdate).toHaveBeenCalledTimes(1);
  });

  it("replaces or removes old decorations when the extras change", () => {
    const { host, lines, scheduleLyricPositionUpdate } = fakeElement(1);
    applyBraccatoExtras(host, [null], ["Bonjour"]);
    applyBraccatoExtras(host, [null], ["Hola"]);
    expect(lines[0].lyricElement.querySelectorAll(".blyrics--translated")).toHaveLength(1);
    expect(lines[0].lyricElement.querySelector(".blyrics--translated")?.textContent).toBe("Hola");
    applyBraccatoExtras(host, [null], [null]);
    expect(lines[0].lyricElement.querySelector(".blyrics--translated")).toBeNull();
    applyBraccatoExtras(host, [null], [null]);
    expect(scheduleLyricPositionUpdate).toHaveBeenCalledTimes(3);
  });
});
