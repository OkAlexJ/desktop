import type { PlayRecord } from "../types";

const CSV_COLUMNS = [
  "playedAt",
  "trackId",
  "title",
  "artists",
  "album",
  "durationMs",
  "listenedMs",
  "source",
] as const;

function csvCell(value: string | number | undefined): string {
  let text = value === undefined ? "" : String(value);
  // keep spreadsheets from running a title like "=HYPERLINK(...)" as a formula
  if (typeof value === "string" && /^[=+@\t]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function historyToCsv(plays: PlayRecord[]): string {
  const rows = plays.map((p) =>
    [
      new Date(p.playedAt).toISOString(),
      p.trackId,
      p.title,
      p.artists,
      p.albumTitle,
      p.durationMs,
      p.listenedMs,
      p.source,
    ]
      .map(csvCell)
      .join(","),
  );
  return [CSV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}

export function historyToJson(plays: PlayRecord[]): string {
  return JSON.stringify(
    {
      app: "liner",
      kind: "listening-history",
      version: 1,
      exportedAt: new Date().toISOString(),
      plays: plays.map((p) => ({ ...p, playedAtIso: new Date(p.playedAt).toISOString() })),
    },
    null,
    2,
  );
}

export function historyFilename(format: "json" | "csv", now = new Date()): string {
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `liner-listening-history-${stamp}.${format}`;
}

/** Hands the file to the browser download flow (Electron shows its save dialog). */
export function saveTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
