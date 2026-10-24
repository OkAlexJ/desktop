import { usePageBackdropStore } from "@/shared/lib";
import { useCustomBackgroundStore } from "../store/customBackgroundStore";

/**
 * What sits behind the app shell:
 * - "wallpaper": the user's custom background, panels turn to glass
 * - "cover": the blurred cover a page registered through `usePageBackdrop`
 * - "none": the plain canvas
 */
export type BackdropMode = "wallpaper" | "cover" | "none";

export function resolveBackdropMode({
  hasWallpaper,
  hasPageCover,
  useCoversOnPages,
}: {
  hasWallpaper: boolean;
  hasPageCover: boolean;
  useCoversOnPages: boolean;
}): BackdropMode {
  if (hasWallpaper && !(useCoversOnPages && hasPageCover)) return "wallpaper";
  return hasPageCover ? "cover" : "none";
}

export function useBackdropMode(): BackdropMode {
  const hasPageCover = usePageBackdropStore((s) => Boolean(s.coverUrl));
  // keyed on the stored file rather than the blob url so the layout doesn't
  // jump while the file is still being read on startup
  const hasWallpaper = useCustomBackgroundStore((s) => s.media !== null);
  const useCoversOnPages = useCustomBackgroundStore((s) => s.useCoversOnPages);
  return resolveBackdropMode({ hasWallpaper, hasPageCover, useCoversOnPages });
}

export interface PanelGlass {
  /** share of the panel colour mixed over the wallpaper, 0..1 */
  tint: number;
  /** backdrop blur in px */
  blur: number;
}

// floor keeps text readable on busy wallpapers even at full transparency
const MAX_TINT = 0.92;
const MIN_TINT = 0.3;
const MIN_GLASS_BLUR = 16;
const MAX_GLASS_BLUR = 32;

export function getPanelGlass(transparency: number): PanelGlass {
  const t =
    Math.max(
      0,
      Math.min(100, Number.isFinite(transparency) ? transparency : 0),
    ) / 100;
  return {
    tint: Math.round((MAX_TINT - (MAX_TINT - MIN_TINT) * t) * 100) / 100,
    blur: Math.round(MIN_GLASS_BLUR + (MAX_GLASS_BLUR - MIN_GLASS_BLUR) * t),
  };
}
