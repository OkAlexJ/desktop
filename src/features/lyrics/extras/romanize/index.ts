import { detectCyrillicLang, hasCyrillic, romanizeCyrillic, type CyrillicLang } from "./cyrillic";
import { hasGreek, romanizeGreek } from "./greek";
import { hasHangul, romanizeHangul } from "./hangul";
import { hasHan, hasKana, romanizeKana } from "./kana";

export { detectCyrillicLang, romanizeCyrillic, type CyrillicLang } from "./cyrillic";
export { romanizeGreek } from "./greek";
export { romanizeHangul } from "./hangul";
export { romanizeKana } from "./kana";

export type RomanizeResult =
  | { kind: "latin" }
  | { kind: "ok"; text: string }
  // the line has Chinese characters/kanji or a script with no offline scheme here
  | { kind: "unsupported" };

// letters that are neither Latin nor a script handled below
const OTHER_SCRIPT_RE =
  /[֐-ࣿऀ-෿฀-໿ༀ-ჿᄀ-ᇿ㄰-㆏㐀-䶿一-鿿豈-﫿]/;

export function romanizeLine(text: string, cyrillicLang: CyrillicLang = "ru"): RomanizeResult {
  const cyr = hasCyrillic(text);
  const greek = hasGreek(text);
  const hangul = hasHangul(text);
  const kana = hasKana(text);
  if (hasHan(text) || OTHER_SCRIPT_RE.test(text)) return { kind: "unsupported" };
  if (!cyr && !greek && !hangul && !kana) return { kind: "latin" };

  let out = text;
  if (cyr) out = romanizeCyrillic(out, cyrillicLang);
  if (greek) out = romanizeGreek(out);
  if (hangul) out = romanizeHangul(out);
  if (kana) out = romanizeKana(out);
  return { kind: "ok", text: out };
}

export interface SongRomanization {
  // keyed by cleaned line text; latin lines are absent
  byText: Map<string, string>;
  unsupportedCount: number;
}

export function romanizeSong(lines: string[]): SongRomanization {
  const cyrillicLang = detectCyrillicLang(lines.join("\n"));
  const byText = new Map<string, string>();
  const unsupported = new Set<string>();
  for (const line of lines) {
    if (!line || byText.has(line) || unsupported.has(line)) continue;
    const res = romanizeLine(line, cyrillicLang);
    if (res.kind === "ok") byText.set(line, res.text);
    else if (res.kind === "unsupported") unsupported.add(line);
  }
  return { byText, unsupportedCount: unsupported.size };
}
