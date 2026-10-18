import { describe, it, expect } from "vitest";
import { buildShareUrl } from "@/shared/utils/share";
import {
  contrastRatio,
  deepenForContrast,
  encodePng,
  logoBadge,
  qrContrastLevel,
  qrModules,
  renderQrBitmap,
  renderQrPng,
  type QrCover,
  type QrRenderOptions,
} from "./qrImage";
import { luma, readPng, scan } from "./qrTestUtils";

const URLS = (["track", "album", "artist", "playlist"] as const).map((type) =>
  buildShareUrl(type, `${type}-id/with spaces?&`),
);

// a busy, dark-ish stand-in for real cover art
const COVER: QrCover = (() => {
  const side = 24;
  const data = new Uint8Array(side * side * 4);
  for (let i = 0; i < side * side; i++) {
    data.set([(i * 37) % 200, (i * 11) % 120, (i * 5) % 255, 255], i * 4);
  }
  return { width: side, height: side, data };
})();

const STYLES: Record<string, QrRenderOptions> = {
  classic: {},
  "classic + logo": { logo: true },
  rounded: { modules: "rounded", logo: true },
  dots: { modules: "dots", logo: true },
  "rounded eyes": { eyes: "rounded" },
  "dots + rounded eyes": { modules: "dots", eyes: "rounded", logo: true },
  accent: { colors: [deepenForContrast("#ff3b3b")], logo: true },
  gradient: { modules: "rounded", eyes: "rounded", colors: ["#1d4ed8", "#7c3aed"], logo: true },
  "cover art": { cover: COVER, logo: true },
  everything: { modules: "dots", eyes: "rounded", colors: ["#0f766e", "#1e3a8a"], cover: COVER, logo: true },
};

// rendering and scanning every style is slow when the whole suite runs in parallel
describe("renderQrBitmap styles", { timeout: 30_000 }, () => {
  it.each(Object.entries(STYLES))("%s keeps the module matrix of the URL", (_name, opts) => {
    for (const url of [URLS[0], URLS[3]]) {
      const modules = qrModules(url);
      const n = modules.size;
      const scale = 10;
      const margin = 4;
      const offset = margin + (opts.cover ? 3 : 0);
      const bitmap = renderQrBitmap(url, { ...opts, scale, margin });
      expect(bitmap.size).toBe((n + offset * 2) * scale);

      const badge = opts.logo ? logoBadge(n) : null;
      const center = (m: number) => (offset + m) * scale + scale / 2;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          // the logo covers these on purpose; level H error correction restores them
          if (badge && c + 1 > badge.x0 && c < badge.x1 && r + 1 > badge.x0 && r < badge.x1) continue;
          expect(luma(bitmap, center(c), center(r)) < 128, `module ${r},${c}`).toBe(modules.get(r, c));
        }
      }

      // the two quiet-zone modules next to the code stay pure white
      for (let k = -2; k < n + 2; k++) {
        for (const edge of [-2, -1, n, n + 1]) {
          expect(luma(bitmap, center(k), center(edge))).toBe(255);
          expect(luma(bitmap, center(edge), center(k))).toBe(255);
        }
      }

      expect(scan(bitmap)).toBe(url);
    }
  });

  it.each(URLS)("scans back to %s in every style", (url) => {
    for (const opts of Object.values(STYLES)) expect(scan(renderQrBitmap(url, opts))).toBe(url);
  });

  it("frames the quiet zone with the cover art", () => {
    const bitmap = renderQrBitmap(URLS[1], { cover: COVER, scale: 4 });
    expect(luma(bitmap, 1, Math.floor(bitmap.size / 2))).toBeLessThan(250);
    expect(luma(bitmap, 4 * 3 + 6, Math.floor(bitmap.size / 2))).toBe(255);
  });

  it("keeps the logo badge to a small centre area", () => {
    const plain = renderQrBitmap(URLS[3]);
    const logo = renderQrBitmap(URLS[3], { logo: true });
    let changed = 0;
    for (let i = 0; i < plain.pixels.length; i += 3) if (plain.pixels[i] !== logo.pixels[i]) changed++;
    expect(changed).toBeGreaterThan(0);
    expect(changed / (plain.size * plain.size)).toBeLessThan(0.06);
  });
});

describe("contrast", () => {
  it("measures WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("grades colours against the white quiet zone", () => {
    expect(qrContrastLevel(["#111111"])).toBe("ok");
    expect(qrContrastLevel(["#ff3b3b"])).toBe("low");
    expect(qrContrastLevel(["#ffde9e"])).toBe("blocked");
    expect(qrContrastLevel(["#111111", "#fde047"])).toBe("blocked");
  });

  it("deepens a light accent until it scans well, keeping the hue", () => {
    for (const hex of ["#ff3b3b", "#ffde9e", "#22d3ee"]) {
      const deep = deepenForContrast(hex);
      expect(contrastRatio(deep, "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(qrContrastLevel([deep])).toBe("ok");
    }
    expect(deepenForContrast("#111111")).toBe("#111111");
  });
});

describe("encodePng", { timeout: 30_000 }, () => {
  it("writes a valid 8-bit RGB PNG holding the styled bitmap", async () => {
    const bitmap = renderQrBitmap(URLS[1], STYLES.everything);
    const png = readPng(await encodePng(bitmap));
    expect(png).toMatchObject({ width: bitmap.size, height: bitmap.size, bitDepth: 8, colorType: 2 });
    expect(png.pixels).toEqual(bitmap.pixels);
    expect(scan(png)).toBe(URLS[1]);
  });

  it("renderQrPng returns an image/png blob", async () => {
    const blob = await renderQrPng(URLS[2], STYLES.gradient);
    expect(blob.type).toBe("image/png");
    const png = readPng(new Uint8Array(await blob.arrayBuffer()));
    expect(png.width).toBeGreaterThan(200);
    expect(scan(png)).toBe(URLS[2]);
  });
});
