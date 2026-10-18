import { expect } from "vitest";
import { inflateSync } from "node:zlib";
import jsQR from "jsqr";
import { crc32, type QrBitmap } from "./qrImage";

// minimal reader for the 8-bit RGB files encodePng writes; checks every CRC
export function readPng(bytes: Uint8Array): QrBitmap & { width: number; height: number; bitDepth: number; colorType: number } {
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let ihdr: DataView | null = null;
  const idat: Uint8Array[] = [];
  const types: string[] = [];
  while (offset < bytes.length) {
    const len = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + len);
    expect(view.getUint32(offset + 8 + len)).toBe(crc32(bytes.subarray(offset + 4, offset + 8 + len)));
    types.push(type);
    if (type === "IHDR") ihdr = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (type === "IDAT") idat.push(data);
    offset += 12 + len;
  }
  expect(types[0]).toBe("IHDR");
  expect(types[types.length - 1]).toBe("IEND");
  const width = ihdr!.getUint32(0);
  const height = ihdr!.getUint32(4);
  const row = width * 3;
  const raw = inflateSync(Buffer.concat(idat));
  expect(raw.length).toBe((row + 1) * height);
  const pixels = new Uint8Array(row * height);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (row + 1)]).toBe(0);
    pixels.set(raw.subarray(y * (row + 1) + 1, (y + 1) * (row + 1)), y * row);
  }
  return { size: width, width, height, pixels, bitDepth: ihdr!.getUint8(8), colorType: ihdr!.getUint8(9) };
}

export function scan(bitmap: QrBitmap): string | null {
  const rgba = new Uint8ClampedArray(bitmap.size * bitmap.size * 4);
  for (let i = 0; i < bitmap.size * bitmap.size; i++) {
    rgba.set([bitmap.pixels[i * 3], bitmap.pixels[i * 3 + 1], bitmap.pixels[i * 3 + 2], 255], i * 4);
  }
  return jsQR(rgba, bitmap.size, bitmap.size)?.data ?? null;
}

export function luma(bitmap: QrBitmap, x: number, y: number): number {
  const i = (y * bitmap.size + x) * 3;
  return 0.299 * bitmap.pixels[i] + 0.587 * bitmap.pixels[i + 1] + 0.114 * bitmap.pixels[i + 2];
}
