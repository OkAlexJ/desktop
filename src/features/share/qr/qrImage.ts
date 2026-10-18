import { create as createQr } from "qrcode";

// Renders share-link QR codes on-device: qrcode builds the module matrix, the
// styled pixels and PNG bytes are made here so the preview and the saved file
// are the same image.

// Liner mark from src/assets/logo.svg (67x78 box, absolute M/H/V/L/C/Z only)
const LOGO_PATH =
  "M35.4052 20.1572L59.0609 0.153515V22.4055H66.618V56.0198H57.5405V77.1145L35.4056 56.8031L34.3091 56.0198L33.3091 55.2263L31.4159 56.8125L8.77617 77.0264V56.0198H0V22.4055H9.07782V0L31.4159 19.912L32.3091 20.7263L33.3091 21.7263L35.4052 20.1572ZM28.5593 26.3953C20.3667 26.4 12.1781 26.3953 3.98977 26.3953V52.0301H8.77453V45.6736L28.5593 26.3953ZM38.273 26.3953L57.5405 45.69V52.0301H62.6283V26.3953C54.5149 26.3953 46.3922 26.4 38.273 26.3953ZM28.2244 22.4055L13.0676 8.89476V22.4055H28.2244ZM35.4593 29.2151V51.4486L53.5507 68.0494C53.5507 61.1388 53.5479 54.2346 53.5479 47.3248L35.4593 29.2151Z";
const LOGO_W = 67;
const LOGO_H = 78;

export const QR_DARK = "#111111";
const WHITE: Rgb = [255, 255, 255];

export type QrModuleShape = "square" | "rounded" | "dots";
export type QrEyeShape = "square" | "rounded";

// RGBA pixels, e.g. from canvas getImageData
export interface QrCover {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface QrRenderOptions {
  // pixels per module
  scale?: number;
  // quiet zone in modules (the spec asks for 4)
  margin?: number;
  // stamp the Liner mark in the centre
  logo?: boolean;
  modules?: QrModuleShape;
  eyes?: QrEyeShape;
  // one colour, or two for a top-left to bottom-right gradient
  colors?: string[];
  // blurred cover art framing the white quiet zone
  cover?: QrCover | null;
}

export interface QrBitmap {
  size: number;
  // three bytes (RGB) per pixel, row-major
  pixels: Uint8Array;
}

type Rgb = [number, number, number];
type Point = [number, number];

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

export function toHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// WCAG contrast ratio, 1..21
export function contrastRatio(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 1;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// below this phone scanners start to miss; exports are blocked
export const QR_MIN_CONTRAST = 3;
// below this it usually scans but may struggle in poor light
export const QR_GOOD_CONTRAST = 4.5;

export type QrContrastLevel = "ok" | "low" | "blocked";

// modules are always drawn on white, so that is the only pair that matters
export function qrContrastLevel(colors: string[]): QrContrastLevel {
  const worst = Math.min(...colors.map((c) => contrastRatio(c, "#ffffff")));
  if (worst < QR_MIN_CONTRAST) return "blocked";
  if (worst < QR_GOOD_CONTRAST) return "low";
  return "ok";
}

// darkens a colour (same hue) until it reaches the target contrast on white
export function deepenForContrast(hex: string, target = QR_GOOD_CONTRAST): string {
  const rgb = parseHex(hex);
  if (!rgb) return QR_DARK;
  for (let k = 1; k > 0; k -= 0.02) {
    const next = toHex(rgb.map((v) => v * k) as Rgb);
    if (contrastRatio(next, "#ffffff") >= target) return next;
  }
  return QR_DARK;
}

// splits the logo path into polygons; curves are flattened to their end point,
// which is close enough for a mark this small
function parseLogoPolygons(d: string): Point[][] {
  const tokens = d.match(/[MLHVCZ]|-?\d*\.?\d+/g) ?? [];
  const polys: Point[][] = [];
  let cur: Point[] = [];
  let x = 0;
  let y = 0;
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    switch (cmd) {
      case "M":
        if (cur.length) polys.push(cur);
        x = num();
        y = num();
        cur = [[x, y]];
        break;
      case "L":
        x = num();
        y = num();
        cur.push([x, y]);
        break;
      case "H":
        x = num();
        cur.push([x, y]);
        break;
      case "V":
        y = num();
        cur.push([x, y]);
        break;
      case "C":
        i += 4;
        x = num();
        y = num();
        cur.push([x, y]);
        break;
      case "Z":
        if (cur.length) polys.push(cur);
        cur = [];
        break;
    }
  }
  if (cur.length) polys.push(cur);
  return polys;
}

const LOGO_POLYGONS = parseLogoPolygons(LOGO_PATH);

// even-odd fill, matching fill-rule="evenodd"
function insideLogo(px: number, py: number): boolean {
  let inside = false;
  for (const poly of LOGO_POLYGONS) {
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [xa, ya] = poly[a];
      const [xb, yb] = poly[b];
      if (ya > py !== yb > py && px < ((xb - xa) * (py - ya)) / (yb - ya) + xa) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function inRoundRect(x: number, y: number, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

export interface QrMatrix {
  size: number;
  get: (row: number, col: number) => boolean;
}

export function qrModules(text: string): QrMatrix {
  // high error correction leaves room for the centre logo and styled shapes
  const qr = createQr(text, { errorCorrectionLevel: "H" });
  const { size, data } = qr.modules;
  return {
    size,
    get: (row, col) => row >= 0 && col >= 0 && row < size && col < size && data[row * size + col] === 1,
  };
}

// centre badge in module units; ~5% of the code area, well inside level H's 30%
export function logoBadge(n: number): { x0: number; x1: number } {
  const side = n * 0.22;
  return { x0: (n - side) / 2, x1: (n + side) / 2 };
}

// is the point (u, v), in module units, painted with the foreground colour
function makeShape(m: QrMatrix, opts: QrRenderOptions) {
  const n = m.size;
  const shape = opts.modules ?? "square";
  const roundEyes = opts.eyes === "rounded";
  const badge = opts.logo ? logoBadge(n) : null;
  const pad = badge ? (badge.x1 - badge.x0) * 0.16 : 0;
  const inner = badge ? badge.x1 - badge.x0 - pad * 2 : 0;
  const k = Math.min(inner / LOGO_W, inner / LOGO_H);
  const lx0 = badge ? badge.x0 + pad + (inner - LOGO_W * k) / 2 : 0;
  const ly0 = badge ? badge.x0 + pad + (inner - LOGO_H * k) / 2 : 0;

  return (u: number, v: number): boolean => {
    if (u < 0 || v < 0 || u >= n || v >= n) return false;
    if (badge && u >= badge.x0 && u <= badge.x1 && v >= badge.x0 && v <= badge.x1) {
      return insideLogo((u - lx0) / k, (v - ly0) / k);
    }
    const r = Math.floor(v);
    const c = Math.floor(u);

    // finder eyes: radii stay small enough that every module centre keeps its colour
    const ex = c < 7 ? 0 : c >= n - 7 ? n - 7 : -1;
    const ey = r < 7 ? 0 : r >= n - 7 ? n - 7 : -1;
    if (ex >= 0 && ey >= 0 && !(ex > 0 && ey > 0)) {
      if (!roundEyes) return m.get(r, c);
      const x = u - ex;
      const y = v - ey;
      return (inRoundRect(x, y, 0, 0, 7, 7, 1.3) && !inRoundRect(x, y, 1, 1, 6, 6, 0.9)) || inRoundRect(x, y, 2, 2, 5, 5, 0.8);
    }

    if (!m.get(r, c)) return false;
    const fx = u - c;
    const fy = v - r;
    if (shape === "dots") return (fx - 0.5) ** 2 + (fy - 0.5) ** 2 <= DOT_R * DOT_R;
    if (shape === "rounded") {
      // round a corner only where both neighbours on that side are empty
      const dx = fx < 0.5 ? -1 : 1;
      const dy = fy < 0.5 ? -1 : 1;
      if (m.get(r, c + dx) || m.get(r + dy, c)) return true;
      return (fx - 0.5) ** 2 + (fy - 0.5) ** 2 <= 0.25;
    }
    return true;
  };
}

// bilinear sample of the cover, cropped to a square; a tiny source reads as a blur
function sampleCover(cover: QrCover, s: number, t: number): Rgb {
  const side = Math.min(cover.width, cover.height);
  const ox = (cover.width - side) / 2;
  const oy = (cover.height - side) / 2;
  const x = Math.min(Math.max(ox + s * side - 0.5, 0), cover.width - 1);
  const y = Math.min(Math.max(oy + t * side - 0.5, 0), cover.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, cover.width - 1);
  const y1 = Math.min(y0 + 1, cover.height - 1);
  const ax = x - x0;
  const ay = y - y0;
  const out: Rgb = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    const p = (px: number, py: number) => cover.data[(py * cover.width + px) * 4 + ch];
    const top = p(x0, y0) * (1 - ax) + p(x1, y0) * ax;
    const bottom = p(x0, y1) * (1 - ax) + p(x1, y1) * ax;
    out[ch] = top * (1 - ay) + bottom * ay;
  }
  return out;
}

const SUB = [0.25, 0.75];
// touching dots: smaller ones leave gaps wide enough to confuse local-threshold scanners
const DOT_R = 0.5;
const COVER_FRAME = 3;

export function renderQrBitmap(text: string, opts: QrRenderOptions = {}): QrBitmap {
  const scale = opts.scale ?? 10;
  const margin = opts.margin ?? 4;
  const modules = qrModules(text);
  const n = modules.size;
  const frame = opts.cover ? COVER_FRAME : 0;
  const offset = margin + frame;
  const total = n + offset * 2;
  const size = total * scale;
  const pixels = new Uint8Array(size * size * 3);

  const stops = (opts.colors?.length ? opts.colors : [QR_DARK]).map((c) => parseHex(c) ?? parseHex(QR_DARK)!);
  const inside = makeShape(modules, opts);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg: Rgb = WHITE;
      if (opts.cover) {
        const u = px / scale - frame;
        const v = py / scale - frame;
        const span = n + margin * 2;
        if (!inRoundRect(u, v, 0, 0, span, span, 1.5)) {
          bg = sampleCover(opts.cover, (px + 0.5) / size, (py + 0.5) / size);
        }
      }

      let hits = 0;
      for (const sy of SUB) {
        for (const sx of SUB) {
          if (inside((px + sx) / scale - offset, (py + sy) / scale - offset)) hits++;
        }
      }

      const i = (py * size + px) * 3;
      if (hits === 0) {
        pixels[i] = bg[0];
        pixels[i + 1] = bg[1];
        pixels[i + 2] = bg[2];
        continue;
      }
      let fg = stops[0];
      if (stops.length > 1) {
        const t = Math.min(Math.max((px + py) / (2 * size), 0), 1);
        fg = [0, 1, 2].map((ch) => stops[0][ch] + (stops[1][ch] - stops[0][ch]) * t) as Rgb;
      }
      const a = hits / 4;
      for (let ch = 0; ch < 3; ch++) pixels[i + ch] = Math.round(bg[ch] * (1 - a) + fg[ch] * a);
    }
  }

  return { size, pixels };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function zlibDeflate(data: Uint8Array): Promise<Uint8Array> {
  // "deflate" here is the zlib wrapper PNG wants
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  void writer.write(data as Uint8Array<ArrayBuffer>);
  void writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

// 8-bit RGB PNG
export async function encodePng(bitmap: QrBitmap): Promise<Uint8Array> {
  const { size, pixels } = bitmap;
  const row = size * 3;
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  // compression, filter, interlace stay 0

  const raw = new Uint8Array((row + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (row + 1)] = 0; // filter: none
    raw.set(pixels.subarray(y * row, (y + 1) * row), y * (row + 1) + 1);
  }

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", await zlibDeflate(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export async function renderQrPng(text: string, opts?: QrRenderOptions): Promise<Blob> {
  const png = await encodePng(renderQrBitmap(text, opts));
  return new Blob([png as BlobPart], { type: "image/png" });
}
