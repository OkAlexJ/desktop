import {
  QR_DARK,
  deepenForContrast,
  parseHex,
  type QrEyeShape,
  type QrModuleShape,
  type QrRenderOptions,
  type QrCover,
} from "./qrImage";

export type QrColourSource = "black" | "accent" | "custom";
export type QrBackground = "white" | "cover";

export interface QrStyle {
  modules: QrModuleShape;
  eyes: QrEyeShape;
  colour: QrColourSource;
  custom: string;
  gradient: boolean;
  gradientTo: string;
  background: QrBackground;
  logo: boolean;
}

export const DEFAULT_QR_STYLE: QrStyle = {
  modules: "square",
  eyes: "square",
  colour: "black",
  custom: "#1d4ed8",
  gradient: false,
  gradientTo: "#7c3aed",
  background: "white",
  logo: true,
};

// fills in fields missing from an older saved style and drops bad colours
export function normalizeQrStyle(saved: Partial<QrStyle> | null | undefined): QrStyle {
  const s = { ...DEFAULT_QR_STYLE, ...(saved ?? {}) };
  if (!["square", "rounded", "dots"].includes(s.modules)) s.modules = DEFAULT_QR_STYLE.modules;
  if (!["square", "rounded"].includes(s.eyes)) s.eyes = DEFAULT_QR_STYLE.eyes;
  if (!["black", "accent", "custom"].includes(s.colour)) s.colour = DEFAULT_QR_STYLE.colour;
  if (!["white", "cover"].includes(s.background)) s.background = DEFAULT_QR_STYLE.background;
  if (!parseHex(s.custom)) s.custom = DEFAULT_QR_STYLE.custom;
  if (!parseHex(s.gradientTo)) s.gradientTo = DEFAULT_QR_STYLE.gradientTo;
  s.gradient = !!s.gradient;
  s.logo = !!s.logo;
  return s;
}

export function readThemeAccent(): string | null {
  if (typeof document === "undefined") return null;
  const value = getComputedStyle(document.documentElement).getPropertyValue("--accent-primary").trim();
  return parseHex(value) ? value : null;
}

// the theme accent is deepened until it scans well; a custom pick is used as-is
// so the contrast warning can tell the user about it
export function resolveQrColors(style: QrStyle, accent: string | null): string[] {
  const base =
    style.colour === "accent"
      ? deepenForContrast(accent ?? QR_DARK)
      : style.colour === "custom"
        ? style.custom
        : QR_DARK;
  return style.gradient ? [base, style.gradientTo] : [base];
}

export function qrRenderOptions(style: QrStyle, accent: string | null, cover: QrCover | null): QrRenderOptions {
  return {
    modules: style.modules,
    eyes: style.eyes,
    logo: style.logo,
    colors: resolveQrColors(style, accent),
    cover: style.background === "cover" ? cover : null,
  };
}
