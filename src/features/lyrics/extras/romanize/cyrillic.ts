import { applyCase } from "./caseUtil";

export type CyrillicLang = "ru" | "uk" | "be" | "bg" | "sr";

// plain-ASCII schemes people actually type (no academic diacritics); Serbian uses its own Latin alphabet
const COMMON: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya", ё: "yo",
};

const TABLES: Record<CyrillicLang, Record<string, string>> = {
  ru: COMMON,
  uk: { ...COMMON, г: "h", ґ: "g", и: "y", і: "i", ї: "yi", є: "ye", "'": "", "’": "", ʼ: "" },
  be: { ...COMMON, г: "h", і: "i", ў: "u", "'": "", "’": "", ʼ: "" },
  bg: { ...COMMON, х: "h", щ: "sht", ъ: "a", ь: "y" },
  sr: {
    а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "đ", е: "e", ж: "ž", з: "z", и: "i",
    ј: "j", к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o", п: "p", р: "r",
    с: "s", т: "t", ћ: "ć", у: "u", ф: "f", х: "h", ц: "c", ч: "č", џ: "dž", ш: "š",
  },
};

const CYRILLIC_RE = /[Ѐ-ӿ]/;

export function hasCyrillic(text: string): boolean {
  return CYRILLIC_RE.test(text);
}

// guesses the language from letters only one of them uses; works best on the whole song
export function detectCyrillicLang(text: string): CyrillicLang {
  const lower = text.toLowerCase();
  if (/[ђјљњћџ]/.test(lower)) return "sr";
  if (/ў/.test(lower)) return "be";
  if (/[ґєї]/.test(lower)) return "uk";
  const hasI = /і/.test(lower);
  const hasRuOnly = /[ыэё]/.test(lower);
  if (hasI && hasRuOnly) return "be";
  if (hasI) return "uk";
  if (!hasRuOnly && /[а-я]ъ[а-я]/.test(lower) && /щ/.test(lower)) return "bg";
  return "ru";
}

export function romanizeCyrillic(text: string, lang: CyrillicLang = "ru"): string {
  const table = TABLES[lang];
  const chars = Array.from(text);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const lower = ch.toLowerCase();
    const next = chars[i + 1];
    const nextLower = next?.toLowerCase();
    const afterNext = chars[i + 2];
    const wordEnds = afterNext === undefined || !/\p{L}/u.test(afterNext);

    // Russian adjective endings read better collapsed: "красивый" -> "krasivy", "синий" -> "siniy"
    if (lang === "ru" && lower === "ы" && nextLower === "й" && wordEnds) {
      out += applyCase("y", ch, next);
      i++;
      continue;
    }
    if (lang === "ru" && lower === "и" && nextLower === "й" && wordEnds) {
      out += applyCase("iy", ch, next);
      i++;
      continue;
    }

    const mapped = table[lower];
    if (mapped === undefined) {
      out += ch;
      continue;
    }
    out += applyCase(mapped, ch, next);
  }
  return out;
}
