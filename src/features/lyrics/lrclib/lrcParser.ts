export interface LrcLine {
  timeMs: number;
  text: string;
}

export interface ParsedLrc {
  lines: LrcLine[];
  offsetMs: number;
}

const TIMESTAMP_RE = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const LEADING_TIMESTAMPS_RE = /^(?:\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])+/;
const OFFSET_RE = /^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$/i;

function fractionToMs(fraction: string | undefined): number {
  if (!fraction) return 0;
  // ".5" -> 500ms, ".05" -> 50ms, ".005" -> 5ms
  return Math.round(Number(`0.${fraction}`) * 1000);
}

// parses LRC text into sorted timed lines; metadata tags ([ar:], [ti:], ...) are dropped,
// a line with several timestamps ("[00:10.00][00:20.00]chorus") is expanded,
// and the [offset:] tag is applied (positive offset = lyrics appear earlier)
export function parseLrc(content: string): ParsedLrc {
  const lines: LrcLine[] = [];
  let offsetMs = 0;

  for (const rawLine of content.replace(/\r\n?/g, "\n").split("\n")) {
    const offsetMatch = OFFSET_RE.exec(rawLine);
    if (offsetMatch) {
      offsetMs = Number(offsetMatch[1]) || 0;
      continue;
    }

    const prefix = LEADING_TIMESTAMPS_RE.exec(rawLine);
    if (!prefix) continue;

    const text = rawLine.slice(prefix[0].length).trim();
    for (const match of prefix[0].matchAll(TIMESTAMP_RE)) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) continue;
      lines.push({
        timeMs: minutes * 60_000 + seconds * 1000 + fractionToMs(match[3]),
        text,
      });
    }
  }

  if (offsetMs) {
    for (const line of lines) {
      line.timeMs = Math.max(0, line.timeMs - offsetMs);
    }
  }

  // stable sort keeps original order for identical timestamps
  lines.sort((a, b) => a.timeMs - b.timeMs);
  return { lines, offsetMs };
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

export function formatLrcTimestamp(timeMs: number): string {
  const ms = Math.max(0, Math.round(timeMs));
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `[${pad(minutes)}:${pad(seconds)}.${pad(centis)}]`;
}

// serializes timed lines back into canonical LRC ("[mm:ss.xx]text", one timestamp per line)
export function serializeLrc(lines: LrcLine[]): string {
  return lines.map((l) => `${formatLrcTimestamp(l.timeMs)}${l.text}`).join("\n");
}

// returns canonical LRC, or null when the input has no usable timed lyric lines
export function normalizeLrc(content: string | null | undefined): string | null {
  if (!content || !content.trim()) return null;
  const { lines } = parseLrc(content);
  if (!lines.some((l) => l.text.length > 0)) return null;
  return serializeLrc(lines);
}
