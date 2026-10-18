import { detectLyricsLanguage } from "../language";
import {
  translateWithProvider,
  TranslationQuotaError,
  TranslationRequestError,
  type FetchLike,
  type TranslationSettings,
} from "./providers";
import {
  translationCache,
  translationCacheKey,
  type TranslationCacheLike,
} from "./translationCache";

export type TranslateOutcome =
  | { status: "ok"; lines: Record<string, string> }
  | { status: "same-language"; lang: string }
  | { status: "error"; reason: "quota" | "network" | "config" };

// strips the "<right,pink>" layout tags Liner lyrics may carry and outer whitespace
export function cleanLyricText(text: string | null | undefined): string {
  return (text ?? "").replace(/^\s*<[^>]+>/, "").trim();
}

// distinct lines worth sending: choruses go once, "•••" and "♪" never
export function uniqueLyricLines(texts: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of texts) {
    const text = cleanLyricText(raw);
    if (!text || seen.has(text) || !/\p{L}/u.test(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

// translation per displayed line, by index, so synced timestamps stay with their original line
export function alignToLines(
  lines: { text: string }[],
  byText: Record<string, string> | Map<string, string> | null | undefined,
): (string | null)[] {
  if (!byText) return lines.map(() => null);
  const lookup = byText instanceof Map ? (k: string) => byText.get(k) : (k: string) => byText[k];
  return lines.map((line) => {
    const value = lookup(cleanLyricText(line.text));
    return value ? value : null;
  });
}

function sameText(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return norm(a) === norm(b);
}

function sameLanguage(detected: string | null, target: string): boolean {
  return detected !== null && detected.split("-")[0] === target.split("-")[0];
}

export interface TranslateRequest {
  trackId: string;
  texts: (string | null | undefined)[];
  target: string;
  settings: TranslationSettings;
  fetchImpl?: FetchLike;
  cache?: TranslationCacheLike;
}

const inflight = new Map<string, Promise<TranslateOutcome>>();

export function translateSongLines(req: TranslateRequest): Promise<TranslateOutcome> {
  const unique = uniqueLyricLines(req.texts);
  if (unique.length === 0) return Promise.resolve({ status: "ok", lines: {} });
  const key = translationCacheKey(req.settings.provider, req.trackId, req.target, unique);
  const pending = inflight.get(key);
  if (pending) return pending;
  const run = runTranslation(req, unique, key).finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

async function runTranslation(req: TranslateRequest, unique: string[], key: string): Promise<TranslateOutcome> {
  const cache = req.cache ?? translationCache;
  const cached = await cache.get(key);
  if (cached) {
    return cached.sameLanguage
      ? { status: "same-language", lang: req.target }
      : { status: "ok", lines: cached.lines };
  }

  const detected = detectLyricsLanguage(unique);
  if (sameLanguage(detected, req.target)) {
    await cache.set({ key, lines: {}, sameLanguage: true, savedAt: Date.now() });
    return { status: "same-language", lang: req.target };
  }

  if (req.settings.provider === "libretranslate" && !req.settings.libreUrl.trim()) {
    return { status: "error", reason: "config" };
  }

  let translated: string[];
  try {
    translated = await translateWithProvider(
      unique,
      detected,
      req.target,
      req.settings,
      req.fetchImpl ?? ((input, init) => fetch(input, init)),
    );
  } catch (err) {
    if (err instanceof TranslationQuotaError) return { status: "error", reason: "quota" };
    if (err instanceof TranslationRequestError && /no server/.test(err.message)) {
      return { status: "error", reason: "config" };
    }
    return { status: "error", reason: "network" };
  }

  const lines: Record<string, string> = {};
  let changed = 0;
  unique.forEach((orig, i) => {
    const t = translated[i] ?? "";
    if (t && !sameText(t, orig)) {
      lines[orig] = t;
      changed++;
    } else {
      lines[orig] = "";
    }
  });

  // the service echoed everything back: the song is already in the target language
  const isSame = changed === 0;
  await cache.set({ key, lines, sameLanguage: isSame, savedAt: Date.now() });
  return isSame ? { status: "same-language", lang: req.target } : { status: "ok", lines };
}
