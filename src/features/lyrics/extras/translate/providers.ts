export type TranslationProviderId = "mymemory" | "libretranslate";

export interface TranslationSettings {
  provider: TranslationProviderId;
  // optional contact email MyMemory asks for; raises its free limit from 5k to 50k chars/day
  myMemoryEmail: string;
  libreUrl: string;
  libreApiKey: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class TranslationQuotaError extends Error {}
export class TranslationRequestError extends Error {}

// MyMemory caps q at 500 bytes of UTF-8; leave room for the joiners
export const MYMEMORY_MAX_BYTES = 480;
const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const LIBRE_BATCH_LINES = 120;

const MYMEMORY_CODES: Record<string, string> = { zh: "zh-CN", he: "he-IL", pt: "pt-PT" };

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

// groups lines into as few requests as fit the byte cap; a line too long alone gets its own chunk
export function chunkLines(lines: string[], maxBytes: number, joiner = "\n"): string[][] {
  const joinerBytes = utf8Bytes(joiner);
  const chunks: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const line of lines) {
    const bytes = utf8Bytes(line);
    const added = current.length === 0 ? bytes : bytes + joinerBytes;
    if (current.length > 0 && size + added > maxBytes) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(line);
    size += current.length === 1 ? bytes : bytes + joinerBytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function myMemoryRequest(
  q: string,
  source: string | null,
  target: string,
  settings: TranslationSettings,
  fetchImpl: FetchLike,
): Promise<string> {
  const from = source ? (MYMEMORY_CODES[source] ?? source) : "Autodetect";
  const to = MYMEMORY_CODES[target] ?? target;
  const params = new URLSearchParams({ q, langpair: `${from}|${to}` });
  const email = settings.myMemoryEmail.trim();
  if (email) params.set("de", email);
  const res = await fetchImpl(`${MYMEMORY_URL}?${params.toString()}`);
  if (res.status === 429) throw new TranslationQuotaError("quota");
  if (!res.ok) throw new TranslationRequestError(`http ${res.status}`);
  const data = (await res.json()) as {
    responseStatus?: number | string;
    responseData?: { translatedText?: string };
    quotaFinished?: boolean;
  };
  const text = data.responseData?.translatedText ?? "";
  if (data.quotaFinished || /MYMEMORY WARNING/i.test(text) || Number(data.responseStatus) === 429) {
    throw new TranslationQuotaError("quota");
  }
  if (Number(data.responseStatus) !== 200) throw new TranslationRequestError(text || "bad status");
  return text;
}

// one request per chunk joined by newlines; a chunk whose line count comes back different
// is redone line by line so every translation still lands on its own line
async function translateMyMemory(
  lines: string[],
  source: string | null,
  target: string,
  settings: TranslationSettings,
  fetchImpl: FetchLike,
): Promise<string[]> {
  const out: string[] = [];
  for (const chunk of chunkLines(lines, MYMEMORY_MAX_BYTES)) {
    const tooLong = chunk.length === 1 && utf8Bytes(chunk[0]) > MYMEMORY_MAX_BYTES;
    if (tooLong) {
      out.push("");
      continue;
    }
    const joined = await myMemoryRequest(chunk.join("\n"), source, target, settings, fetchImpl);
    const parts = joined.split(/\r?\n/);
    if (parts.length === chunk.length) {
      out.push(...parts.map((p) => p.trim()));
      continue;
    }
    for (const line of chunk) {
      out.push((await myMemoryRequest(line, source, target, settings, fetchImpl)).trim());
    }
  }
  return out;
}

async function translateLibre(
  lines: string[],
  source: string | null,
  target: string,
  settings: TranslationSettings,
  fetchImpl: FetchLike,
): Promise<string[]> {
  const base = settings.libreUrl.trim().replace(/\/+$/, "");
  if (!base) throw new TranslationRequestError("no server");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += LIBRE_BATCH_LINES) {
    const batch = lines.slice(i, i + LIBRE_BATCH_LINES);
    const body: Record<string, unknown> = {
      q: batch,
      source: source ?? "auto",
      target,
      format: "text",
    };
    if (settings.libreApiKey.trim()) body.api_key = settings.libreApiKey.trim();
    const res = await fetchImpl(`${base}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429) throw new TranslationQuotaError("quota");
    if (!res.ok) throw new TranslationRequestError(`http ${res.status}`);
    const data = (await res.json()) as { translatedText?: string | string[] };
    const translated = Array.isArray(data.translatedText) ? data.translatedText : null;
    if (!translated || translated.length !== batch.length) {
      throw new TranslationRequestError("line count mismatch");
    }
    out.push(...translated.map((t) => String(t ?? "").trim()));
  }
  return out;
}

export function translateWithProvider(
  lines: string[],
  source: string | null,
  target: string,
  settings: TranslationSettings,
  fetchImpl: FetchLike,
): Promise<string[]> {
  if (settings.provider === "libretranslate") {
    return translateLibre(lines, source, target, settings, fetchImpl);
  }
  return translateMyMemory(lines, source, target, settings, fetchImpl);
}
