import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { CloseLine, LeftLine, RightLine, Music2Line } from "@mingcute/react";
import { CoverImage } from "@/features/covers";
import { useTranslation } from "@/languages";
import { yearRecap } from "../lib/aggregate";
import type { PlayRecord } from "../types";
import { formatMinutes } from "./format";

interface Card {
  id: string;
  body: ReactNode;
}

const SWIPE_PX = 80;

function Big({ children }: { children: ReactNode }) {
  return <div className="text-[56px] font-semibold leading-none tracking-tight text-text-primary">{children}</div>;
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-accent-primary">{children}</div>;
}

function RankList({ items }: { items: { key: string; title: string; sub: string }[] }) {
  return (
    <ol className="m-0 flex w-full list-none flex-col gap-2 p-0 text-left">
      {items.map((item, i) => (
        <li key={item.key} className="flex items-baseline gap-3">
          <span className="w-4 shrink-0 text-right text-[13px] tabular-nums text-text-tertiary">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-[15px] text-text-primary">{item.title}</span>
          <span className="shrink-0 text-[12.5px] text-text-tertiary">{item.sub}</span>
        </li>
      ))}
    </ol>
  );
}

export function RecapView({ year, plays, onClose }: { year: number; plays: PlayRecord[]; onClose: () => void }) {
  const { t, locale } = useTranslation();
  const recap = useMemo(() => yearRecap(plays, year), [plays, year]);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const cards = useMemo<Card[]>(() => {
    if (recap.summary.playCount === 0) {
      return [{ id: "empty", body: <p className="m-0 text-[17px] text-text-secondary">{t("stats.recap.empty", { year })}</p> }];
    }
    const playsLabel = (count: number) => t("stats.plays_count", { count });
    const monthName = recap.topMonth
      ? new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(year, recap.topMonth.month, 1))
      : null;
    const list: Card[] = [
      {
        id: "intro",
        body: (
          <>
            <Eyebrow>{t("stats.recap.eyebrow")}</Eyebrow>
            <Big>{year}</Big>
            <p className="m-0 text-[17px] text-text-secondary">{t("stats.recap.intro")}</p>
          </>
        ),
      },
      {
        id: "minutes",
        body: (
          <>
            <Eyebrow>{t("stats.recap.minutes_title")}</Eyebrow>
            <Big>{formatMinutes(recap.summary.totalMs, locale)}</Big>
            <p className="m-0 text-[17px] text-text-secondary">{t("stats.recap.minutes_caption")}</p>
            <p className="m-0 text-[14px] text-text-tertiary">
              {playsLabel(recap.summary.playCount)}
              {monthName ? ` · ${t("stats.recap.top_month", { month: monthName })}` : ""}
            </p>
          </>
        ),
      },
    ];
    if (recap.topArtist) {
      list.push({
        id: "artist",
        body: (
          <>
            <Eyebrow>{t("stats.recap.top_artist")}</Eyebrow>
            <div className="text-[40px] font-semibold leading-tight text-text-primary">{recap.topArtist.name}</div>
            <p className="m-0 text-[14px] text-text-tertiary">{playsLabel(recap.topArtist.plays)}</p>
            {recap.topArtists.length > 1 && (
              <RankList items={recap.topArtists.map((a) => ({ key: a.key, title: a.name, sub: playsLabel(a.plays) }))} />
            )}
          </>
        ),
      });
    }
    if (recap.topTrack) {
      const top = recap.topTrack;
      list.push({
        id: "song",
        body: (
          <>
            <Eyebrow>{t("stats.recap.top_song")}</Eyebrow>
            <div className="relative h-36 w-36 overflow-hidden rounded-xl bg-bg-panel shadow-lg">
              {top.coverUrl ? (
                <CoverImage src={top.coverUrl} alt="" fill sizes="144px" className="object-cover" draggable={false} />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-text-tertiary">
                  <Music2Line size={40} />
                </div>
              )}
            </div>
            <div className="flex flex-col items-center">
              <div className="text-[26px] font-semibold leading-tight text-text-primary">{top.title}</div>
              <div className="text-[15px] text-text-secondary">{top.artists}</div>
            </div>
            <p className="m-0 text-[14px] text-text-tertiary">{playsLabel(top.plays)}</p>
            {recap.topTracks.length > 1 && (
              <RankList items={recap.topTracks.slice(1).map((tr) => ({ key: tr.trackId, title: tr.title, sub: tr.artists }))} />
            )}
          </>
        ),
      });
    }
    if (recap.topGenre) {
      list.push({
        id: "genre",
        body: (
          <>
            <Eyebrow>{t("stats.recap.top_genre")}</Eyebrow>
            <Big>{recap.topGenre.name}</Big>
            <p className="m-0 text-[14px] text-text-tertiary">{playsLabel(recap.topGenre.plays)}</p>
          </>
        ),
      });
    }
    list.push({
      id: "outro",
      body: (
        <>
          <Eyebrow>{t("stats.recap.outro_title")}</Eyebrow>
          <div className="grid w-full grid-cols-2 gap-4 text-left">
            {[
              [t("stats.unique_artists"), new Intl.NumberFormat(locale).format(recap.summary.uniqueArtists)],
              [t("stats.unique_tracks"), new Intl.NumberFormat(locale).format(recap.summary.uniqueTracks)],
              [t("stats.recap.minutes_title"), formatMinutes(recap.summary.totalMs, locale)],
              [t("stats.recap.longest_streak"), t("stats.days_count", { count: recap.longestStreak })],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <span className="text-[12px] uppercase tracking-[0.06em] text-text-tertiary">{label}</span>
                <span className="text-[24px] font-semibold text-text-primary">{value}</span>
              </div>
            ))}
          </div>
        </>
      ),
    });
    return list;
  }, [recap, t, locale, year]);

  const go = (next: number) => {
    if (next < 0 || next >= cards.length) return;
    setDirection(next > index ? 1 : -1);
    setIndex(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.stopImmediatePropagation();
        go(index + 1);
      } else if (e.key === "ArrowLeft") {
        e.stopImmediatePropagation();
        go(index - 1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_PX || info.velocity.x < -500) go(index + 1);
    else if (info.offset.x > SWIPE_PX || info.velocity.x > 500) go(index - 1);
  };

  const card = cards[Math.min(index, cards.length - 1)];
  const arrow =
    "flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border-alpha-14 bg-bg-surface text-text-primary disabled:cursor-default disabled:opacity-30";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("stats.recap.title", { year })}
      onClick={onClose}
    >
      <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={arrow} onClick={() => go(index - 1)} disabled={index === 0} aria-label={t("stats.recap.prev")}>
          <LeftLine size={20} />
        </button>

        <div className="relative flex flex-col items-center gap-4">
          <div
            className="relative h-[560px] w-[min(400px,80vw)] overflow-hidden rounded-[28px] border border-border-alpha-14 shadow-2xl"
            style={{
              background:
                "radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, var(--accent-primary) 38%, transparent), transparent 60%), radial-gradient(100% 70% at 100% 100%, color-mix(in srgb, var(--accent-tertiary) 30%, transparent), transparent 60%), var(--bg-surface)",
            }}
          >
            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              <motion.div
                key={card.id}
                custom={direction}
                initial={{ x: direction * 120, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction * -120, opacity: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 32 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.6}
                onDragEnd={onDragEnd}
                className="absolute inset-0 flex cursor-grab flex-col items-center justify-center gap-4 px-8 text-center active:cursor-grabbing"
              >
                {card.body}
              </motion.div>
            </AnimatePresence>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("stats.recap.close")}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 bg-black/20 text-white"
            >
              <CloseLine size={16} />
            </button>
          </div>
          <div className="flex gap-[6px]">
            {cards.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`${i + 1} / ${cards.length}`}
                className={`h-[6px] cursor-pointer rounded-full border-0 p-0 transition-all ${
                  i === index ? "w-5 bg-white" : "w-[6px] bg-white/40"
                }`}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          className={arrow}
          onClick={() => go(index + 1)}
          disabled={index >= cards.length - 1}
          aria-label={t("stats.recap.next")}
        >
          <RightLine size={20} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
