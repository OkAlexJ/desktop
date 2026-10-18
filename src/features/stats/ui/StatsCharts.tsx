import { useMemo, useState } from "react";
import type { DailyBucket } from "../lib/aggregate";

export type ChartBucket = { label: string; start: number; ms: number };

/** Keeps bar charts readable: days up to two months, then weeks, then months. */
export function groupDaily(days: DailyBucket[], locale: string): { buckets: ChartBucket[]; unit: "day" | "week" | "month" } {
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  if (days.length <= 62) {
    return { unit: "day", buckets: days.map((d) => ({ label: dayFmt.format(d.start), start: d.start, ms: d.ms })) };
  }
  if (days.length <= 400) {
    const buckets: ChartBucket[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      buckets.push({ label: dayFmt.format(chunk[0].start), start: chunk[0].start, ms: chunk.reduce((s, d) => s + d.ms, 0) });
    }
    return { unit: "week", buckets };
  }
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
  const map = new Map<string, ChartBucket>();
  for (const d of days) {
    const date = new Date(d.start);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const b = map.get(key);
    if (b) b.ms += d.ms;
    else map.set(key, { label: monthFmt.format(new Date(date.getFullYear(), date.getMonth(), 1)), start: d.start, ms: d.ms });
  }
  return { unit: "month", buckets: [...map.values()] };
}

export function ListeningBarChart({
  buckets,
  formatValue,
}: {
  buckets: ChartBucket[];
  formatValue: (ms: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => Math.max(1, ...buckets.map((b) => b.ms)), [buckets]);
  const width = 720;
  const height = 160;
  const gap = buckets.length > 60 ? 1 : 3;
  const barW = Math.max(1, (width - gap * (buckets.length - 1)) / Math.max(1, buckets.length));
  const shown = hover !== null ? buckets[hover] : null;
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 7));

  return (
    <div className="flex flex-col gap-2">
      <div className="h-[18px] text-[12px] text-text-secondary">
        {shown ? `${shown.label} · ${formatValue(shown.ms)}` : " "}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height + 18}`}
        className="h-auto w-full"
        role="img"
        onMouseLeave={() => setHover(null)}
      >
        <line x1={0} x2={width} y1={height} y2={height} stroke="var(--border-white-alpha-33)" strokeWidth={1} />
        {buckets.map((b, i) => {
          const h = b.ms > 0 ? Math.max(2, (b.ms / max) * (height - 4)) : 0;
          const x = i * (barW + gap);
          return (
            <g key={b.start} onMouseEnter={() => setHover(i)}>
              <rect x={x} y={0} width={barW + gap} height={height} fill="transparent" />
              <rect
                x={x}
                y={height - h}
                width={barW}
                height={h}
                rx={Math.min(3, barW / 2)}
                fill="var(--accent-primary)"
                opacity={hover === null || hover === i ? 0.9 : 0.45}
              >
                <title>{`${b.label}: ${formatValue(b.ms)}`}</title>
              </rect>
              {i % labelEvery === 0 && (
                <text x={x} y={height + 14} fontSize={11} fill="var(--text-tertiary)">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** 7 x 24 grid, rows Monday..Sunday, cell strength = share of the busiest hour. */
export function ListeningHeatmap({
  grid,
  locale,
  formatValue,
}: {
  grid: number[][];
  locale: string;
  formatValue: (ms: number) => string;
}) {
  const max = Math.max(1, ...grid.flat());
  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  // 2024-01-01 was a Monday
  const weekdays = Array.from({ length: 7 }, (_, i) => weekdayFmt.format(new Date(2024, 0, 1 + i)));

  return (
    <div className="flex flex-col gap-1 overflow-x-auto">
      <div className="grid min-w-[520px] grid-cols-[44px_repeat(24,minmax(0,1fr))] gap-[3px]">
        {grid.map((row, r) => (
          <div key={r} className="contents">
            <div className="pr-2 text-right text-[11px] leading-[16px] text-text-tertiary">{weekdays[r]}</div>
            {row.map((ms, h) => {
              const strength = ms / max;
              return (
                <div
                  key={h}
                  title={`${weekdays[r]} ${String(h).padStart(2, "0")}:00 · ${formatValue(ms)}`}
                  className="h-4 rounded-[3px]"
                  style={{
                    background:
                      ms > 0
                        ? `color-mix(in srgb, var(--accent-primary) ${Math.round(18 + strength * 82)}%, transparent)`
                        : "var(--border-white-alpha-14)",
                  }}
                />
              );
            })}
          </div>
        ))}
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-center text-[10px] text-text-tertiary">
            {h % 3 === 0 ? h : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
