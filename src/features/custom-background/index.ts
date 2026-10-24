export {
  useCustomBackgroundStore,
  validateBackgroundFile,
  BACKGROUND_ACCEPT,
  MAX_BACKGROUND_BYTES,
  MAX_BACKGROUND_BLUR,
  MAX_BACKGROUND_DIM,
  MAX_PANEL_TRANSPARENCY,
  type BackgroundMediaKind,
  type BackgroundMediaInfo,
  type BackgroundFileError,
} from "./store/customBackgroundStore";
export {
  useBackdropMode,
  resolveBackdropMode,
  getPanelGlass,
  type BackdropMode,
  type PanelGlass,
} from "./lib/backdropMode";
export { useWindowHidden } from "./hooks/useWindowHidden";
export { default as WallpaperBackground } from "./ui/WallpaperBackground";
