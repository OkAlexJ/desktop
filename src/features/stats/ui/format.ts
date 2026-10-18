import type { TFunction } from "@/languages/translator";
import type { Track } from "@/shared/types";
import type { TopTrack } from "../lib/aggregate";

export function formatListening(ms: number, t: TFunction): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return t("stats.units.minutes", { m: totalMin });
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? t("stats.units.hours_minutes", { h, m }) : t("stats.units.hours", { h });
}

export function formatMinutes(ms: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(Math.round(ms / 60_000));
}

/** Rebuilds a playable track from a history entry. */
export function toPlayableTrack(top: TopTrack): Track | null {
  return {
    id: top.trackId,
    title: top.title,
    artists: top.artists,
    coverUrl: top.coverUrl ?? "",
    durationMs: top.durationMs,
    playCount: 0,
    album: top.albumId && top.albumTitle ? { id: top.albumId, title: top.albumTitle } : undefined,
  };
}
