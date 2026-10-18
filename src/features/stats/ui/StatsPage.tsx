import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { PlayFill, SparklesFill, Music2Line } from "@mingcute/react";
import { playerEngine } from "@/features/player";
import { CoverImage } from "@/features/covers";
import { useTranslation } from "@/languages";
import { PillTabs } from "@/shared/ui/PillTabs";
import type { Track } from "@/shared/types";
import {
  dailyListening,
  filterPlays,
  hourHeatmap,
  listeningStreak,
  rangeStart,
  summarize,
  topAlbums,
  topArtists,
  topTracks,
  type TopTrack,
} from "../lib/aggregate";
import { useStatsHistoryStore, useStatsSettingsStore } from "../store/statsStore";
import { STATS_RANGES, type StatsRange } from "../types";
import { ListeningBarChart, ListeningHeatmap, groupDaily } from "./StatsCharts";
import { formatListening, toPlayableTrack } from "./format";
import { RecapView } from "./RecapView";

const RANGE_STORAGE_KEY = "liner_stats_range";

function readRange(): StatsRange {
  try {
    const v = localStorage.getItem(RANGE_STORAGE_KEY);
    if (v && (STATS_RANGES as readonly string[]).includes(v)) return v as StatsRange;
  } catch {}
  return "4w";
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border-alpha-14 bg-bg-toolbox p-5">
      <div className="flex flex-col gap-[2px]">
        <h2 className="m-0 text-[16px] font-medium text-text-primary">{title}</h2>
        {hint ? <p className="m-0 text-[12.5px] text-text-tertiary">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border-alpha-14 bg-bg-toolbox px-5 py-4">
      <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-tertiary">{label}</span>
      <span className="truncate text-[26px] font-semibold leading-tight text-text-primary">{value}</span>
      {sub ? <span className="truncate text-[12.5px] text-text-secondary">{sub}</span> : null}
    </div>
  );
}

function Cover({ src, round = false }: { src?: string; round?: boolean }) {
  return (
    <div
      className={`relative h-11 w-11 shrink-0 overflow-hidden bg-bg-panel ${round ? "rounded-full" : "rounded-md"}`}
    >
      {src ? (
        <CoverImage src={src} alt="" fill sizes="44px" className="object-cover" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-text-tertiary">
          <Music2Line size={18} />
        </div>
      )}
    </div>
  );
}

function Initial({ name }: { name: string }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg-panel text-[16px] font-semibold text-text-secondary">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function Row({
  rank,
  media,
  title,
  subtitle,
  meta,
  onClick,
  actionLabel,
}: {
  rank: number;
  media: ReactNode;
  title: string;
  subtitle?: string;
  meta: string;
  onClick?: () => void;
  actionLabel?: string;
}) {
  const content = (
    <>
      <span className="w-5 shrink-0 text-right text-[13px] tabular-nums text-text-tertiary">{rank}</span>
      {media}
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-[14.5px] text-text-primary">{title}</span>
        {subtitle ? <span className="truncate text-[12.5px] text-text-secondary">{subtitle}</span> : null}
      </span>
      <span className="shrink-0 text-[12.5px] tabular-nums text-text-tertiary">{meta}</span>
    </>
  );
  const cls = "group flex w-full items-center gap-3 rounded-lg border-0 bg-transparent px-2 py-[6px]";
  return onClick ? (
    <button type="button" onClick={onClick} aria-label={actionLabel} className={`${cls} cursor-pointer hover:bg-border-alpha-14`}>
      {content}
    </button>
  ) : (
    <div className={cls}>{content}</div>
  );
}

export default function StatsPage() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const plays = useStatsHistoryStore((s) => s.plays);
  const loaded = useStatsHistoryStore((s) => s.loaded);
  const load = useStatsHistoryStore((s) => s.load);
  const trackingPaused = useStatsSettingsStore((s) => s.trackingPaused);
  const setTrackingPaused = useStatsSettingsStore((s) => s.setTrackingPaused);
  const [range, setRangeState] = useState<StatsRange>(readRange);
  const [recapOpen, setRecapOpen] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const setRange = (next: StatsRange) => {
    setRangeState(next);
    try {
      localStorage.setItem(RANGE_STORAGE_KEY, next);
    } catch {}
  };

  const now = useMemo(() => Date.now(), [plays, range]);
  const from = range === "all" ? (plays[0]?.playedAt ?? now) : rangeStart(range, now);
  const inRange = useMemo(() => filterPlays(plays, from), [plays, from]);
  const summary = useMemo(() => summarize(inRange), [inRange]);
  const tracks = useMemo(() => topTracks(inRange, 10), [inRange]);
  const artists = useMemo(() => topArtists(inRange, 10), [inRange]);
  const albums = useMemo(() => topAlbums(inRange, 10), [inRange]);
  const heatmap = useMemo(() => hourHeatmap(inRange), [inRange]);
  const chart = useMemo(() => groupDaily(dailyListening(inRange, from, now), locale), [inRange, from, now, locale]);
  const streak = useMemo(() => listeningStreak(plays, now), [plays, now]);
  const recapYear = new Date(now).getFullYear();
  const dayCount = Math.max(1, Math.round((now - from) / 86_400_000));

  const fmt = (ms: number) => formatListening(ms, t);
  const playsLabel = (count: number) => t("stats.plays_count", { count });

  const playTop = (top: TopTrack) => {
    const queue = tracks.map(toPlayableTrack).filter((x): x is Track => !!x);
    const track = queue.find((x) => x.id === top.trackId) ?? toPlayableTrack(top);
    if (!track) return;
    void playerEngine.playTrack(track, queue.length ? queue : [track], t("stats.top_tracks"), null);
  };

  const unitHint =
    chart.unit === "day" ? t("stats.chart.per_day") : chart.unit === "week" ? t("stats.chart.per_week") : t("stats.chart.per_month");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-8 pb-32 pt-10">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto flex flex-col">
            <h1 className="m-0 text-[28px] font-medium text-text-primary">{t("stats.title")}</h1>
            <span className="text-[12.5px] text-text-tertiary">{t("stats.private")}</span>
          </div>
          <button
            type="button"
            onClick={() => setRecapOpen(true)}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border-alpha-14 bg-transparent px-3 text-[14px] text-text-primary hover:bg-border-alpha-14"
          >
            <SparklesFill size={16} /> {t("stats.recap.open", { year: recapYear })}
          </button>
        </div>

        <PillTabs<StatsRange>
          tabs={STATS_RANGES.map((id) => ({ id, label: t(`stats.ranges.${id}`) }))}
          activeTab={range}
          onChange={setRange}
          size="sm"
          className="self-start"
        />

        {trackingPaused && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-alpha-14 px-4 py-3 text-[13px] text-text-secondary">
            <span className="mr-auto">{t("stats.paused_banner")}</span>
            <button
              type="button"
              onClick={() => setTrackingPaused(false)}
              className="cursor-pointer rounded-lg border border-border-alpha-14 bg-transparent px-3 py-1 text-[13px] text-text-primary"
            >
              {t("stats.resume")}
            </button>
          </div>
        )}

        {loaded && plays.length === 0 ? (
          <p className="m-0 max-w-[560px] text-[15px] text-text-secondary">{t("stats.empty")}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Tile
                label={t("stats.total_time")}
                value={fmt(summary.totalMs)}
                sub={t("stats.per_day_average", { time: fmt(summary.totalMs / dayCount) })}
              />
              <Tile label={t("stats.plays")} value={new Intl.NumberFormat(locale).format(summary.playCount)} />
              <Tile label={t("stats.unique_tracks")} value={new Intl.NumberFormat(locale).format(summary.uniqueTracks)} />
              <Tile label={t("stats.unique_artists")} value={new Intl.NumberFormat(locale).format(summary.uniqueArtists)} />
              <Tile
                label={t("stats.streak")}
                value={t("stats.days_count", { count: streak.current })}
                sub={t("stats.longest_streak", { count: streak.longest })}
              />
            </div>

            <Panel title={t("stats.chart.title")} hint={unitHint}>
              <ListeningBarChart buckets={chart.buckets} formatValue={fmt} />
            </Panel>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Panel title={t("stats.top_tracks")}>
                {tracks.length === 0 ? (
                  <p className="m-0 text-[13px] text-text-tertiary">{t("stats.nothing_in_range")}</p>
                ) : (
                  tracks.map((tr, i) => (
                    <Row
                      key={tr.trackId}
                      rank={i + 1}
                      media={
                        <div className="relative">
                          <Cover src={tr.coverUrl} />
                          <span className="absolute inset-0 hidden items-center justify-center rounded-md bg-black/50 text-white group-hover:flex">
                            <PlayFill size={16} />
                          </span>
                        </div>
                      }
                      title={tr.title}
                      subtitle={tr.artists}
                      meta={playsLabel(tr.plays)}
                      onClick={() => playTop(tr)}
                      actionLabel={t("stats.play_track", { title: tr.title })}
                    />
                  ))
                )}
              </Panel>

              <Panel title={t("stats.top_artists")}>
                {artists.length === 0 ? (
                  <p className="m-0 text-[13px] text-text-tertiary">{t("stats.nothing_in_range")}</p>
                ) : (
                  artists.map((a, i) => (
                    <Row
                      key={a.key}
                      rank={i + 1}
                      media={<Initial name={a.name} />}
                      title={a.name}
                      subtitle={fmt(a.listenedMs)}
                      meta={playsLabel(a.plays)}
                      onClick={a.id ? () => navigate(`/artist?id=${encodeURIComponent(a.id!)}`) : undefined}
                      actionLabel={a.name}
                    />
                  ))
                )}
              </Panel>

              <Panel title={t("stats.top_albums")}>
                {albums.length === 0 ? (
                  <p className="m-0 text-[13px] text-text-tertiary">{t("stats.nothing_in_range")}</p>
                ) : (
                  albums.map((al, i) => (
                    <Row
                      key={al.key}
                      rank={i + 1}
                      media={<Cover src={al.coverUrl} />}
                      title={al.title}
                      subtitle={al.artists}
                      meta={playsLabel(al.plays)}
                      onClick={
                        al.id && !al.local
                          ? () => navigate(`/collection?type=album&id=${encodeURIComponent(al.id!)}`)
                          : undefined
                      }
                      actionLabel={al.title}
                    />
                  ))
                )}
              </Panel>
            </div>

            <Panel title={t("stats.heatmap.title")} hint={t("stats.heatmap.hint")}>
              <ListeningHeatmap grid={heatmap} locale={locale} formatValue={fmt} />
            </Panel>
          </>
        )}
      </div>

      {recapOpen && <RecapView year={recapYear} plays={plays} onClose={() => setRecapOpen(false)} />}
    </div>
  );
}
