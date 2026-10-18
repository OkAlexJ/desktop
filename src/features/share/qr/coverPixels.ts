import { getCoverElement, preloadCoverArt } from "@/features/covers/lib/coverArt";
import type { QrCover } from "./qrImage";

// a tiny copy of the cover; upscaling it in the renderer gives the blur
const SIDE = 24;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function loadCoverPixels(url: string | undefined): Promise<QrCover | null> {
  if (!url) return null;
  try {
    await preloadCoverArt(url).catch(() => {});
    const img = getCoverElement(url) ?? (await loadImage(url));
    const canvas = document.createElement("canvas");
    canvas.width = SIDE;
    canvas.height = SIDE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const w = img.naturalWidth || SIDE;
    const h = img.naturalHeight || SIDE;
    const side = Math.min(w, h);
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIDE, SIDE);
    // throws when the image tainted the canvas
    const { data } = ctx.getImageData(0, 0, SIDE, SIDE);
    return { width: SIDE, height: SIDE, data };
  } catch {
    return null;
  }
}
