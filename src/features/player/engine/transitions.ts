/**
 * Pure scheduling maths for track transitions (crossfade / gapless early start).
 * The runtime polls `planTransition` from timeupdate and arms a timer once the
 * start point is close; everything here is wall-clock aware of playbackRate.
 */

export const MAX_CROSSFADE_SEC = 12;
/** Load the next track into the standby element this long before it starts. */
export const PREPARE_AHEAD_SEC = 8;
/** Arm a precise timer once the start point is this close (timeupdate is ~4 Hz). */
export const ARM_WINDOW_SEC = 1.5;
/** Gapless: start the next element slightly before the end to hide play() latency. */
export const GAPLESS_LEAD_SEC = 0.05;
/** Never let a fade take more than this share of either track. */
const MAX_FADE_SHARE = 1 / 3;
/** Fades shorter than this sound like a click; treat them as a gapless cut. */
const MIN_FADE_SEC = 0.5;

export interface TransitionSettings {
  crossfadeSec: number;
  gapless: boolean;
}

export interface TransitionPlan {
  /** Wall-clock length of the overlap; 0 means a gapless cut. */
  fadeSec: number;
  /** Media time in the current track at which the next one starts. */
  startAtPositionSec: number;
  /** Wall-clock seconds from now until the next track starts. */
  secondsUntilStart: number;
  /** Wall-clock seconds from now until the next track should be loaded. */
  secondsUntilPrepare: number;
}

export function clampCrossfade(sec: number): number {
  if (!Number.isFinite(sec)) return 0;
  return Math.max(0, Math.min(MAX_CROSSFADE_SEC, Math.round(sec * 2) / 2));
}

export function transitionsEnabled(settings: TransitionSettings): boolean {
  return clampCrossfade(settings.crossfadeSec) > 0 || settings.gapless;
}

/** Crossfade length after shortening it to fit both tracks. */
export function effectiveFadeSec(
  settings: TransitionSettings,
  currentDurationSec: number,
  nextDurationSec?: number | null,
): number {
  const wanted = clampCrossfade(settings.crossfadeSec);
  if (wanted <= 0) return 0;
  let limit = currentDurationSec * MAX_FADE_SHARE;
  if (nextDurationSec && Number.isFinite(nextDurationSec) && nextDurationSec > 0) {
    limit = Math.min(limit, nextDurationSec * MAX_FADE_SHARE);
  }
  const fade = Math.min(wanted, limit);
  return fade < MIN_FADE_SEC ? 0 : fade;
}

export function planTransition(input: {
  durationSec: number;
  positionSec: number;
  playbackRate?: number;
  settings: TransitionSettings;
  nextDurationSec?: number | null;
}): TransitionPlan | null {
  const { durationSec, positionSec, settings } = input;
  if (!transitionsEnabled(settings)) return null;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
  if (!Number.isFinite(positionSec) || positionSec < 0) return null;
  const rate = input.playbackRate && input.playbackRate > 0 ? input.playbackRate : 1;

  const fadeSec = effectiveFadeSec(settings, durationSec, input.nextDurationSec);
  // Crossfade on but too short to fit: fall back to a gapless cut.
  const leadWallSec = fadeSec > 0 ? fadeSec : GAPLESS_LEAD_SEC;
  // Media time advances `rate` seconds per wall second during the overlap.
  const startAtPositionSec = Math.max(0, durationSec - leadWallSec * rate);
  const secondsUntilStart = Math.max(0, (startAtPositionSec - positionSec) / rate);
  return {
    fadeSec,
    startAtPositionSec,
    secondsUntilStart,
    secondsUntilPrepare: Math.max(0, secondsUntilStart - PREPARE_AHEAD_SEC),
  };
}

/** Equal-power curves: constant perceived loudness across the overlap. */
export function crossfadeGains(progress: number): { out: number; in: number } {
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 1));
  return { out: Math.cos((p * Math.PI) / 2), in: Math.sin((p * Math.PI) / 2) };
}

/** Slider label for a non-zero crossfade length, e.g. "4.5s" in en and "4,5 Sek." in de. */
export function formatCrossfadeSeconds(sec: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "second",
    unitDisplay: "narrow",
    maximumFractionDigits: 1,
  }).format(sec);
}
