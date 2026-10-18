import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { buildShareUrl, type ShareEntityType } from "@/shared/utils/share";
import { useQrShareStore } from "../store/qrShareStore";
import { DEFAULT_QR_STYLE } from "../qr/qrStyle";
import { readPng, scan } from "../qr/qrTestUtils";
import QrShareModal from "./QrShareModal";

// @ts-expect-error - act support flag in vitest browserless DOM environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("framer-motion", () => {
  const cache: Record<string, any> = {};
  return {
    AnimatePresence: ({ children }: any) => <>{children}</>,
    motion: new Proxy({}, {
      get: (_target, prop: string) => {
        if (!cache[prop]) {
          cache[prop] = React.forwardRef(({ children, ...props }: any, ref: any) => {
            const clean = { ...props };
            delete clean.initial;
            delete clean.animate;
            delete clean.exit;
            delete clean.transition;
            return React.createElement(prop, { ref, ...clean }, children);
          });
        }
        return cache[prop];
      },
    }),
  };
});

vi.mock("@/features/covers/ui/CoverImage", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img data-cover src={src} alt={alt} />,
}));

const blobs = new Map<string, Blob>();
let nextBlob = 0;

async function scanPng(blob: Blob): Promise<string | null> {
  return scan(readPng(new Uint8Array(await blob.arrayBuffer())));
}

async function waitFor<T>(fn: () => T | null | undefined): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const value = fn();
    if (value) return value;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
  throw new Error("timed out");
}

describe("QrShareModal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    blobs.clear();
    localStorage.clear();
    useQrShareStore.getState().resetStyle();
    // jsdom has no object URLs; keep the blobs so the test can read them back
    URL.createObjectURL = (blob: Blob) => {
      const url = `blob:qr-${nextBlob++}`;
      blobs.set(url, blob);
      return url;
    };
    URL.revokeObjectURL = (url: string) => void blobs.delete(url);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<QrShareModal />));
  });

  afterEach(() => {
    act(() => {
      useQrShareStore.getState().close();
      root.unmount();
    });
    container.remove();
  });

  it.each<ShareEntityType>(["track", "album", "artist", "playlist"])(
    "encodes the share link for each item type (%s)",
    async (type) => {
      const id = `${type}:42/x y`;
      const expected = buildShareUrl(type, id);
      act(() =>
        useQrShareStore.getState().open({ type, id, title: `My ${type}`, coverUrl: "https://img/x.jpg" }),
      );

      const img = await waitFor(() => document.querySelector<HTMLImageElement>("img[data-qr-url]"));
      expect(img.dataset.qrUrl).toBe(expected);
      expect(document.querySelector('[data-testid="qr-share-url"]')?.textContent).toBe(expected);
      expect(document.body.textContent).toContain(`My ${type}`);
      expect(document.querySelector("img[data-cover]")?.getAttribute("src")).toBe("https://img/x.jpg");

      const blob = blobs.get(img.getAttribute("src")!);
      expect(blob?.type).toBe("image/png");
      expect(await scanPng(blob!)).toBe(expected);
    },
  );

  it("closes on Escape", async () => {
    act(() => useQrShareStore.getState().open({ type: "album", id: "a1", title: "Album" }));
    await waitFor(() => document.querySelector('[data-testid="qr-share-modal"]'));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(useQrShareStore.getState().item).toBeNull();
    expect(document.querySelector('[data-testid="qr-share-modal"]')).toBeNull();
  });

  const button = (label: string) =>
    [...document.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement;

  it("exports the chosen style and remembers it", async () => {
    const expected = buildShareUrl("album", "styled");
    act(() => useQrShareStore.getState().open({ type: "album", id: "styled", title: "Styled" }));
    const first = await waitFor(() => document.querySelector<HTMLImageElement>("img[data-qr-url]")?.getAttribute("src"));

    act(() => button("Dots").click());
    act(() => button("Custom").click());
    act(() => useQrShareStore.getState().setStyle({ custom: "#0f766e", gradient: true, eyes: "rounded" }));
    const styled = await waitFor(() => {
      const src = document.querySelector<HTMLImageElement>("img[data-qr-url]")?.getAttribute("src");
      return src && src !== first ? src : null;
    });

    const png = readPng(new Uint8Array(await blobs.get(styled)!.arrayBuffer()));
    expect(scan(png)).toBe(expected);
    // the dark modules carry the custom colour, not black
    let teal = 0;
    for (let i = 0; i < png.pixels.length; i += 3) {
      if (png.pixels[i + 1] > png.pixels[i] + 40 && png.pixels[i + 1] < 160) teal++;
    }
    expect(teal).toBeGreaterThan(100);

    const saved = JSON.parse(localStorage.getItem("liner_qr_style_v1") ?? "{}");
    expect(saved.state.style).toMatchObject({ modules: "dots", colour: "custom", custom: "#0f766e", gradient: true, eyes: "rounded" });
    expect(saved.state.item).toBeUndefined();
  });

  it("warns on low contrast and blocks exports when it cannot scan", async () => {
    act(() => useQrShareStore.getState().open({ type: "track", id: "t1", title: "Track" }));
    await waitFor(() => document.querySelector("img[data-qr-url]"));
    expect(document.querySelector("[data-contrast]")).toBeNull();
    expect(button("Save PNG").disabled).toBe(false);

    act(() => useQrShareStore.getState().setStyle({ colour: "custom", custom: "#ff3b3b" }));
    expect(document.querySelector("[data-contrast]")?.getAttribute("data-contrast")).toBe("low");
    expect(button("Save PNG").disabled).toBe(false);

    act(() => useQrShareStore.getState().setStyle({ custom: "#ffde9e" }));
    expect(document.querySelector("[data-contrast]")?.getAttribute("data-contrast")).toBe("blocked");
    expect(button("Save PNG").disabled).toBe(true);
    expect(button("Copy image").disabled).toBe(true);
    expect(button("Copy link").disabled).toBe(false);
  });

  it("starts from the default style", () => {
    expect(useQrShareStore.getState().style).toEqual(DEFAULT_QR_STYLE);
  });
});
