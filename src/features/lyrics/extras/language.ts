import { detectCyrillicLang } from "./romanize/cyrillic";

// languages offered in the target picker: the app's locales plus a few widely spoken ones
export const TRANSLATION_TARGETS = [
  "en", "es", "ru", "uk", "de", "it", "fr", "pl", "tr", "ja", "ko", "zh", "pt",
  "ar", "hi", "id",
] as const;
export type TranslationTarget = (typeof TRANSLATION_TARGETS)[number];

export function isTranslationTarget(v: unknown): v is TranslationTarget {
  return typeof v === "string" && (TRANSLATION_TARGETS as readonly string[]).includes(v);
}

// a handful of very frequent words per Latin-script language, enough to tell lyrics apart
const STOPWORDS: Record<string, string[]> = {
  en: ["the", "and", "you", "i", "me", "my", "is", "it", "to", "in", "of", "that", "your", "love", "don't", "i'm", "we", "be", "on", "with"],
  es: ["el", "la", "que", "de", "y", "en", "los", "las", "mi", "tu", "por", "con", "una", "es", "amor", "yo", "te", "para", "como", "pero"],
  fr: ["le", "la", "les", "et", "je", "tu", "de", "des", "un", "une", "est", "pas", "que", "dans", "mon", "moi", "toi", "avec", "pour", "c'est"],
  it: ["il", "la", "che", "di", "e", "non", "un", "una", "per", "sono", "mi", "ti", "con", "io", "tu", "amore", "come", "del", "nel", "ma"],
  de: ["der", "die", "das", "und", "ich", "du", "nicht", "ist", "ein", "eine", "mit", "mich", "dich", "zu", "es", "wir", "auf", "liebe", "mein", "sie"],
  pt: ["o", "a", "que", "de", "e", "não", "um", "uma", "eu", "você", "meu", "com", "pra", "para", "do", "da", "amor", "te", "mais", "se"],
  pl: ["i", "nie", "się", "w", "na", "to", "że", "jest", "mnie", "ja", "ty", "jak", "mi", "z", "do", "tak", "ale", "co", "mój", "czy"],
  tr: ["ve", "bir", "bu", "ben", "sen", "ne", "de", "da", "için", "gibi", "aşk", "çok", "beni", "seni", "ama", "yok", "var", "mi", "her", "o"],
  nl: ["de", "het", "een", "en", "ik", "je", "niet", "van", "is", "dat", "mijn", "jij", "we", "met", "op", "zijn", "voor", "maar", "liefde", "mij"],
  sv: ["och", "jag", "du", "det", "att", "är", "en", "inte", "på", "som", "min", "mig", "dig", "med", "för", "vi", "kärlek", "har", "till", "så"],
  cs: ["a", "je", "se", "na", "to", "že", "já", "ty", "mě", "tě", "jsem", "ale", "jak", "co", "v", "s", "do", "láska", "tak", "už"],
  id: ["aku", "kamu", "yang", "dan", "di", "ini", "itu", "tak", "tidak", "cinta", "ku", "mu", "dengan", "untuk", "akan", "ada", "dia", "kau", "hati", "selalu"],
  vi: ["anh", "em", "và", "là", "của", "không", "có", "một", "người", "yêu", "những", "cho", "với", "đã", "trong", "được", "này", "khi", "ta", "mình"],
};

// best guess at the song's language, or null when it can't tell
export function detectLyricsLanguage(lines: string[]): string | null {
  const text = lines.join("\n");
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return null;
  const share = (re: RegExp) => (text.match(re) ?? []).length / letters.length;

  if (share(/[가-힣]/g) > 0.3) return "ko";
  if (share(/[ぁ-ゖァ-ヺ]/g) > 0.1) return "ja";
  if (share(/[一-鿿]/g) > 0.3) return "zh";
  if (share(/[Ѐ-ӿ]/g) > 0.3) return detectCyrillicLang(text);
  if (share(/[Ͱ-Ͽἀ-῿]/g) > 0.3) return "el";
  if (share(/[؀-ۿ]/g) > 0.3) return "ar";
  if (share(/[ऀ-ॿ]/g) > 0.3) return "hi";
  if (share(/[฀-๿]/g) > 0.3) return "th";
  if (share(/[֐-׿]/g) > 0.3) return "he";

  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  if (words.length < 4) return null;
  const scores: [string, number][] = Object.entries(STOPWORDS).map(([lang, list]) => {
    const set = new Set(list);
    return [lang, words.filter((w) => set.has(w)).length / words.length];
  });
  scores.sort((a, b) => b[1] - a[1]);
  const [best, second] = scores;
  // needs a clear lead, short common words overlap a lot between these languages
  if (best[1] >= 0.12 && best[1] >= second[1] * 1.5) return best[0];
  return null;
}
