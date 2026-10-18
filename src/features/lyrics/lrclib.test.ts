import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseLrc, serializeLrc, normalizeLrc, formatLrcTimestamp } from "./lrclib/lrcParser";
import {
  fetchLrclibLyrics,
  clearLrclibSessionCache,
  toLrclibCandidate,
  pickBestSearchResult,
  isLrclibProvider,
  LRCLIB_PROVIDER,
  type LrclibRecord,
} from "./lrclib/lrclibClient";
import { mergeLrclibProvider, shouldActivateLrclib, toProviderOption } from "./lrclib/lrclibMerge";
import { parseRawLyrics } from "./engine/lyricsParser";
import type { LyricsCandidate, LyricsSyncLevel } from "@/shared/contracts/lyrics";

function makeCandidate(provider: string, syncLevel: LyricsSyncLevel, total: number, content = "[00:01.00]x"): LyricsCandidate {
  return {
    provider,
    contentKind: syncLevel === "plain" ? "plain" : syncLevel === "line_level" ? "line_synced" : "word_synced",
    syncLevel,
    quality: { total, match: 0, content: 0, sync: 0, source: 0, reasons: [] },
    lyrics: { format: syncLevel === "plain" ? "plain" : "lrc", content },
  };
}

const record = (over: Partial<LrclibRecord> = {}): LrclibRecord => ({
  id: 1,
  trackName: "Song",
  artistName: "Artist",
  albumName: "Album",
  duration: 200,
  instrumental: false,
  plainLyrics: "hello\nworld",
  syncedLyrics: "[00:01.00]hello\n[00:02.50]world",
  ...over,
});

describe("lrc parser", () => {
  it("parses timestamps with 2- and 3-digit fractions and no fraction", () => {
    const { lines } = parseLrc("[00:01.5]a\n[00:02.25]b\n[00:03.125]c\n[01:04]d");
    expect(lines).toEqual([
      { timeMs: 1500, text: "a" },
      { timeMs: 2250, text: "b" },
      { timeMs: 3125, text: "c" },
      { timeMs: 64000, text: "d" },
    ]);
  });

  it("drops metadata tags and expands repeated timestamps in order", () => {
    const { lines } = parseLrc("[ar:Artist]\n[ti:Title]\n[00:20.00][00:05.00]chorus\n[00:10.00]verse\nnot a lyric");
    expect(lines.map((l) => [l.timeMs, l.text])).toEqual([
      [5000, "chorus"],
      [10000, "verse"],
      [20000, "chorus"],
    ]);
  });

  it("applies the offset tag and handles CRLF", () => {
    const { lines, offsetMs } = parseLrc("[offset:+500]\r\n[00:02.00]a\r\n[00:00.20]b");
    expect(offsetMs).toBe(500);
    expect(lines).toEqual([
      { timeMs: 0, text: "b" },
      { timeMs: 1500, text: "a" },
    ]);
  });

  it("keeps empty timed lines as gaps", () => {
    const { lines } = parseLrc("[00:01.00]a\n[00:02.00]\n[00:03.00]b");
    expect(lines[1]).toEqual({ timeMs: 2000, text: "" });
  });

  it("serializes canonical lrc and round-trips", () => {
    expect(formatLrcTimestamp(65_432)).toBe("[01:05.43]");
    const text = serializeLrc([{ timeMs: 1000, text: "a" }, { timeMs: 125_500, text: "b" }]);
    expect(text).toBe("[00:01.00]a\n[02:05.50]b");
    expect(parseLrc(text).lines).toEqual([{ timeMs: 1000, text: "a" }, { timeMs: 125_500, text: "b" }]);
  });

  it("normalizeLrc returns null when there are no timed lyric lines", () => {
    expect(normalizeLrc(null)).toBeNull();
    expect(normalizeLrc("just text")).toBeNull();
    expect(normalizeLrc("[00:01.00]\n[ar:x]")).toBeNull();
  });

  it("produces content the app's lyrics parser reads as synced lines", () => {
    const normalized = normalizeLrc("[00:03.00]third\n[00:01.00]first")!;
    const parsed = parseRawLyrics(normalized, "lrc");
    expect(parsed.syncedLines.map((l) => [l.timeMs, l.text])).toEqual([
      [1000, "first"],
      [3000, "third"],
    ]);
  });
});

describe("lrclib candidates", () => {
  it("prefers synced lyrics", () => {
    const c = toLrclibCandidate(record())!;
    expect(c.provider).toBe(LRCLIB_PROVIDER);
    expect(c.syncLevel).toBe("line_level");
    expect(c.lyrics).toEqual({ format: "lrc", content: "[00:01.00]hello\n[00:02.50]world" });
  });

  it("falls back to plain lyrics, and skips instrumentals and empty records", () => {
    const plain = toLrclibCandidate(record({ syncedLyrics: null }))!;
    expect(plain.syncLevel).toBe("plain");
    expect(plain.lyrics).toEqual({ format: "plain", content: "hello\nworld" });
    expect(toLrclibCandidate(record({ instrumental: true }))).toBeNull();
    expect(toLrclibCandidate(record({ syncedLyrics: "", plainLyrics: "  " }))).toBeNull();
  });

  it("picks the best search hit by duration and sync", () => {
    const far = record({ id: 1, duration: 260 });
    const plainNear = record({ id: 2, duration: 200, syncedLyrics: null });
    const syncedNear = record({ id: 3, duration: 202 });
    expect(pickBestSearchResult([far, plainNear, syncedNear], 200_000)?.id).toBe(3);
    expect(pickBestSearchResult([far], 200_000)).toBeNull();
  });

  it("recognizes lrclib provider names", () => {
    expect(isLrclibProvider("lrclib")).toBe(true);
    expect(isLrclibProvider("LRCLIB")).toBe(true);
    expect(isLrclibProvider("lrclib.net")).toBe(true);
    expect(isLrclibProvider("cadence")).toBe(false);
  });
});

describe("fetchLrclibLyrics", () => {
  beforeEach(() => clearLrclibSessionCache());
  const query = { title: "Song", artist: "Artist", album: "Album", durationMs: 200_400 };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("uses /api/get with all fields and sends the client header", async () => {
    const fetchImpl = vi.fn(async () => json(record()));
    const c = await fetchLrclibLyrics(query, { fetchImpl });
    expect(c?.syncLevel).toBe("line_level");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://lrclib.net/api/get?track_name=Song&artist_name=Artist&album_name=Album&duration=200");
    expect((init.headers as Record<string, string>)["Lrclib-Client"]).toMatch(/Liner/);
  });

  it("falls back to /api/search on 404", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("/api/get") ? json({ statusCode: 404 }, 404) : json([record({ id: 9 })]),
    );
    const c = await fetchLrclibLyrics(query, { fetchImpl });
    expect(c).not.toBeNull();
    expect(fetchImpl.mock.calls[1][0]).toBe("https://lrclib.net/api/search?track_name=Song&artist_name=Artist");
  });

  it("skips /api/get when album or duration is missing", async () => {
    const fetchImpl = vi.fn(async (_url: string) => json([]));
    expect(await fetchLrclibLyrics({ title: "Song", artist: "Artist" }, { fetchImpl })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain("/api/search");
  });

  it("caches results (including not-found) for the session", async () => {
    const fetchImpl = vi.fn(async () => json({}, 404));
    expect(await fetchLrclibLyrics(query, { fetchImpl })).toBeNull();
    expect(await fetchLrclibLyrics(query, { fetchImpl })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2); // get + search, once
  });

  it("resolves null on network errors and retries next time", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await fetchLrclibLyrics(query, { fetchImpl: failing })).toBeNull();
    const ok = vi.fn(async () => json(record()));
    expect(await fetchLrclibLyrics(query, { fetchImpl: ok })).not.toBeNull();
  });

  it("resolves null on server errors", async () => {
    const fetchImpl = vi.fn(async () => json({}, 500));
    expect(await fetchLrclibLyrics(query, { fetchImpl })).toBeNull();
  });
});

describe("lrclib provider merge", () => {
  const ours = toLrclibCandidate(record())!;

  it("adds lrclib alongside server providers, sorted by rank", () => {
    const server = [toProviderOption(makeCandidate("cadence", "word_level", 90))];
    const merged = mergeLrclibProvider(server, ours);
    expect(merged.map((p) => p.provider)).toEqual(["cadence", LRCLIB_PROVIDER]);
  });

  it("adds lrclib when the server returned nothing", () => {
    expect(mergeLrclibProvider([], ours).map((p) => p.provider)).toEqual([LRCLIB_PROVIDER]);
  });

  it("does not duplicate when the server already has an lrclib provider", () => {
    const server = [toProviderOption(makeCandidate("lrclib", "line_level", 65))];
    expect(mergeLrclibProvider(server, ours)).toBe(server);
    const withOurs = [...server, toProviderOption(ours)];
    expect(mergeLrclibProvider(withOurs, ours).map((p) => p.provider)).toEqual(["lrclib"]);
  });

  it("returns the same array when already merged, and removes ours when no result", () => {
    const merged = mergeLrclibProvider([], ours);
    expect(mergeLrclibProvider(merged, ours)).toBe(merged);
    expect(mergeLrclibProvider(merged, null)).toEqual([]);
    const empty: never[] = [];
    expect(mergeLrclibProvider(empty, null)).toBe(empty);
  });

  it("activates lrclib only when loading is done and nothing else is active", () => {
    const providers = mergeLrclibProvider([], ours);
    expect(shouldActivateLrclib({ lyricsLoading: true, activeProvider: null, availableProviders: providers })).toBe(false);
    expect(shouldActivateLrclib({ lyricsLoading: false, activeProvider: null, availableProviders: providers })).toBe(true);
    const both = mergeLrclibProvider([toProviderOption(makeCandidate("cadence", "word_level", 90))], ours);
    expect(shouldActivateLrclib({ lyricsLoading: false, activeProvider: "cadence", availableProviders: both })).toBe(false);
    expect(shouldActivateLrclib({ lyricsLoading: false, activeProvider: null, availableProviders: [] })).toBe(false);
  });
});
