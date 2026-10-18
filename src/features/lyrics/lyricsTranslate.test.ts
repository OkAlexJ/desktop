import { describe, it, expect, vi } from "vitest";
import { chunkLines, utf8Bytes, MYMEMORY_MAX_BYTES, type TranslationSettings } from "./extras/translate/providers";
import {
  alignToLines,
  cacheProviderId,
  cleanLyricText,
  translateSongLines,
  uniqueLyricLines,
} from "./extras/translate/translateLyrics";
import { MemoryTranslationCache, translationCacheKey } from "./extras/translate/translationCache";
import { detectLyricsLanguage } from "./extras/language";

const myMemory: TranslationSettings = {
  provider: "mymemory",
  myMemoryEmail: "",
  libreUrl: "",
  libreApiKey: "",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// fake MyMemory: "translates" by prefixing every line of q
function fakeMyMemory() {
  return vi.fn(async (url: string) => {
    const q = new URL(url).searchParams.get("q") ?? "";
    const translatedText = q.split("\n").map((l) => `tr:${l}`).join("\n");
    return jsonResponse({ responseStatus: 200, responseData: { translatedText } });
  });
}

const russianSong = [
  "Я иду домой",
  "Ночь темна",
  "Я иду домой",
  "",
  "<right>Ночь темна",
  "•••",
  "Звёзды светят мне",
];

describe("chunkLines", () => {
  it("packs lines up to the byte cap", () => {
    const lines = ["a".repeat(200), "b".repeat(200), "c".repeat(200)];
    const chunks = chunkLines(lines, 450);
    expect(chunks).toEqual([[lines[0], lines[1]], [lines[2]]]);
  });

  it("counts Cyrillic as two bytes per letter", () => {
    const line = "я".repeat(100); // 200 bytes
    expect(utf8Bytes(line)).toBe(200);
    expect(chunkLines([line, line, line], MYMEMORY_MAX_BYTES)).toHaveLength(2);
  });
});

describe("uniqueLyricLines / cleanLyricText", () => {
  it("drops tags, blanks, dot lines and repeats", () => {
    expect(cleanLyricText("<right,pink> hey ")).toBe("hey");
    expect(uniqueLyricLines(russianSong)).toEqual(["Я иду домой", "Ночь темна", "Звёзды светят мне"]);
  });
});

describe("translateSongLines", () => {
  it("translates a whole song in one batched request and caches it", async () => {
    const fetchImpl = fakeMyMemory();
    const cache = new MemoryTranslationCache();
    const req = { trackId: "t1", texts: russianSong, target: "en", settings: myMemory, fetchImpl, cache };

    const first = await translateSongLines(req);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get("langpair")).toBe("ru|en");
    expect(url.searchParams.get("q")).toBe("Я иду домой\nНочь темна\nЗвёзды светят мне");
    expect(first).toEqual({
      status: "ok",
      lines: { "Я иду домой": "tr:Я иду домой", "Ночь темна": "tr:Ночь темна", "Звёзды светят мне": "tr:Звёзды светят мне" },
    });

    const second = await translateSongLines(req);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("keys the cache by provider, track, language and lyrics text", async () => {
    const fetchImpl = fakeMyMemory();
    const cache = new MemoryTranslationCache();
    await translateSongLines({ trackId: "t1", texts: russianSong, target: "en", settings: myMemory, fetchImpl, cache });
    await translateSongLines({ trackId: "t1", texts: russianSong, target: "de", settings: myMemory, fetchImpl, cache });
    await translateSongLines({ trackId: "t1", texts: [...russianSong, "Новая строка"], target: "en", settings: myMemory, fetchImpl, cache });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const key = translationCacheKey("mymemory", "t1", "en", uniqueLyricLines(russianSong));
    expect((await cache.get(key))?.lines["Ночь темна"]).toBe("tr:Ночь темна");
  });

  it("splits long songs into several requests under MyMemory's cap", async () => {
    const fetchImpl = fakeMyMemory();
    const texts = Array.from({ length: 30 }, (_, i) => `Строка номер ${i} про любовь и ночь`);
    const res = await translateSongLines({ trackId: "long", texts, target: "en", settings: myMemory, fetchImpl, cache: new MemoryTranslationCache() });
    expect(res.status).toBe("ok");
    for (const call of fetchImpl.mock.calls) {
      expect(utf8Bytes(new URL(call[0]).searchParams.get("q") ?? "")).toBeLessThanOrEqual(MYMEMORY_MAX_BYTES);
    }
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
    expect(fetchImpl.mock.calls.length).toBeLessThan(10);
    if (res.status === "ok") expect(res.lines["Строка номер 29 про любовь и ночь"]).toBe("tr:Строка номер 29 про любовь и ночь");
  });

  it("redoes a chunk line by line when the service merges lines", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const q = new URL(url).searchParams.get("q") ?? "";
      const translatedText = q.includes("\n") ? q.replace(/\n/g, " ") : `one:${q}`;
      return jsonResponse({ responseStatus: 200, responseData: { translatedText } });
    });
    const res = await translateSongLines({ trackId: "m", texts: ["Привет мир", "Пока мир"], target: "en", settings: myMemory, fetchImpl, cache: new MemoryTranslationCache() });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(res).toEqual({ status: "ok", lines: { "Привет мир": "one:Привет мир", "Пока мир": "one:Пока мир" } });
  });

  it("skips lyrics already in the target language without a request", async () => {
    const fetchImpl = fakeMyMemory();
    const res = await translateSongLines({ trackId: "same", texts: russianSong, target: "ru", settings: myMemory, fetchImpl, cache: new MemoryTranslationCache() });
    expect(res).toEqual({ status: "same-language", lang: "ru" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats a full echo as the same language", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      jsonResponse({ responseStatus: 200, responseData: { translatedText: new URL(url).searchParams.get("q") } }),
    );
    const res = await translateSongLines({ trackId: "echo", texts: ["la la la", "na na na"], target: "en", settings: myMemory, fetchImpl, cache: new MemoryTranslationCache() });
    expect(res.status).toBe("same-language");
  });

  it("reports quota and network failures without caching them", async () => {
    const cache = new MemoryTranslationCache();
    const quota = vi.fn(async () =>
      jsonResponse({ responseStatus: 429, responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY" } }),
    );
    const base = { trackId: "q", texts: russianSong, target: "en", settings: myMemory, cache };
    expect(await translateSongLines({ ...base, fetchImpl: quota })).toEqual({ status: "error", reason: "quota" });
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await translateSongLines({ ...base, fetchImpl: offline })).toEqual({ status: "error", reason: "network" });
    const ok = fakeMyMemory();
    expect((await translateSongLines({ ...base, fetchImpl: ok })).status).toBe("ok");
  });

  it("sends the whole song to LibreTranslate as one array request", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return jsonResponse({ translatedText: (body.q as string[]).map((s) => `en:${s}`) });
    });
    const settings: TranslationSettings = { ...myMemory, provider: "libretranslate", libreUrl: "https://lt.example.org/", libreApiKey: "k" };
    const res = await translateSongLines({ trackId: "lt", texts: russianSong, target: "en", settings, fetchImpl, cache: new MemoryTranslationCache() });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://lt.example.org/translate");
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ source: "ru", target: "en", api_key: "k", format: "text" });
    expect(res.status === "ok" && res.lines["Ночь темна"]).toBe("en:Ночь темна");
  });

  it("does not hand a pending request to one with different server settings", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("https://lt.e/")) throw new TypeError("Failed to fetch");
      const body = JSON.parse(String(init?.body));
      return jsonResponse({ translatedText: (body.q as string[]).map((s) => `en:${s}`) });
    });
    const base = { ...myMemory, provider: "libretranslate" as const };
    const common = { trackId: "flight", texts: russianSong, target: "en", fetchImpl, cache: new MemoryTranslationCache() };
    const partial = translateSongLines({ ...common, settings: { ...base, libreUrl: "https://lt.e" } });
    const full = translateSongLines({ ...common, settings: { ...base, libreUrl: "https://lt.example.org" } });
    expect(await partial).toEqual({ status: "error", reason: "network" });
    expect((await full).status).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps a separate cache per LibreTranslate server", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return jsonResponse({ translatedText: (body.q as string[]).map((s) => `${new URL(url).host}:${s}`) });
    });
    const base = { ...myMemory, provider: "libretranslate" as const };
    const common = { trackId: "servers", texts: russianSong, target: "en", fetchImpl, cache: new MemoryTranslationCache() };
    const a = await translateSongLines({ ...common, settings: { ...base, libreUrl: "https://a.example.org" } });
    const b = await translateSongLines({ ...common, settings: { ...base, libreUrl: "https://b.example.org/" } });
    const aAgain = await translateSongLines({ ...common, settings: { ...base, libreUrl: "https://A.example.org/" } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(a.status === "ok" && a.lines["Ночь темна"]).toBe("a.example.org:Ночь темна");
    expect(b.status === "ok" && b.lines["Ночь темна"]).toBe("b.example.org:Ночь темна");
    expect(aAgain).toEqual(a);
  });

  it("treats only the scheme and host of a server address as case-insensitive", () => {
    const lt = (libreUrl: string) => cacheProviderId({ ...myMemory, provider: "libretranslate", libreUrl });
    expect(lt("HTTPS://LT.Example.org/")).toBe(lt("https://lt.example.org"));
    expect(lt("https://lt.example.org/tenant/A")).not.toBe(lt("https://lt.example.org/tenant/a"));
    expect(cacheProviderId(myMemory)).toBe("mymemory");
  });

  it("asks for a server when LibreTranslate has none set", async () => {
    const settings: TranslationSettings = { ...myMemory, provider: "libretranslate" };
    const res = await translateSongLines({ trackId: "x", texts: russianSong, target: "en", settings, fetchImpl: vi.fn(), cache: new MemoryTranslationCache() });
    expect(res).toEqual({ status: "error", reason: "config" });
  });
});

describe("alignToLines", () => {
  it("puts each translation on its own timestamped line, repeats included", () => {
    const synced = [
      { timeMs: 1000, text: "Я иду домой" },
      { timeMs: 4000, text: "<right>Ночь темна" },
      { timeMs: 7000, text: "" },
      { timeMs: 9000, text: "Я иду домой" },
      { timeMs: 12000, text: "oh oh" },
    ];
    const aligned = alignToLines(synced, { "Я иду домой": "I'm going home", "Ночь темна": "The night is dark", "oh oh": "" });
    expect(aligned).toEqual(["I'm going home", "The night is dark", null, "I'm going home", null]);
    expect(aligned).toHaveLength(synced.length);
  });
});

describe("detectLyricsLanguage", () => {
  it("tells scripts and common Latin languages apart", () => {
    expect(detectLyricsLanguage(["사랑해 너를"])).toBe("ko");
    expect(detectLyricsLanguage(["ありがとう 君の"])).toBe("ja");
    expect(detectLyricsLanguage(["我爱你中国"])).toBe("zh");
    expect(detectLyricsLanguage(["Ти моя і все"])).toBe("uk");
    expect(detectLyricsLanguage(["I don't know what you want from me", "and the night is young"])).toBe("en");
    expect(detectLyricsLanguage(["Yo te quiero con todo mi amor", "y la noche es para los dos"])).toBe("es");
    expect(detectLyricsLanguage(["ok"])).toBeNull();
  });
});
