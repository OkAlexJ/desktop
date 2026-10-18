// modified Hepburn for hiragana and katakana; kanji needs a dictionary and is left to the caller
const KANA: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n", ゔ: "vu",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o", ゃ: "ya", ゅ: "yu", ょ: "yo", ゎ: "wa",
  "、": ", ", "。": ". ", "「": "\"", "」": "\"", "　": " ", "！": "!", "？": "?", "・": " ",
};

// a kana followed by a small one forms a single sound
const COMBOS: Record<string, string> = {
  きゃ: "kya", きゅ: "kyu", きょ: "kyo", ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  しゃ: "sha", しゅ: "shu", しょ: "sho", しぇ: "she", じゃ: "ja", じゅ: "ju", じょ: "jo", じぇ: "je",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho", ちぇ: "che", ぢゃ: "ja", ぢゅ: "ju", ぢょ: "jo",
  にゃ: "nya", にゅ: "nyu", にょ: "nyo", ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo",
  びゃ: "bya", びゅ: "byu", びょ: "byo", ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
  みゃ: "mya", みゅ: "myu", みょ: "myo", りゃ: "rya", りゅ: "ryu", りょ: "ryo",
  ふぁ: "fa", ふぃ: "fi", ふぇ: "fe", ふぉ: "fo", てぃ: "ti", でぃ: "di", とぅ: "tu", どぅ: "du",
  うぃ: "wi", うぇ: "we", うぉ: "wo", ゔぁ: "va", ゔぃ: "vi", ゔぇ: "ve", ゔぉ: "vo", つぁ: "tsa",
};

const KANA_RE = /[ぁ-ゖァ-ヺー]/;
const KANJI_RE = /[㐀-䶿一-鿿豈-﫿]/;

export function hasKana(text: string): boolean {
  return KANA_RE.test(text);
}

export function hasHan(text: string): boolean {
  return KANJI_RE.test(text);
}

function toHiragana(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code >= 0x30a1 && code <= 0x30f6) return String.fromCharCode(code - 0x60);
  return ch;
}

function lastVowel(s: string): string {
  const m = s.match(/[aeiou](?=[^aeiou]*$)/);
  return m ? m[0] : "";
}

export function romanizeKana(text: string): string {
  const chars = Array.from(text).map(toHiragana);
  let out = "";
  let geminate = false;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === "っ") {
      geminate = true;
      continue;
    }
    if (ch === "ー") {
      out += lastVowel(out);
      continue;
    }

    let syllable: string | undefined = COMBOS[ch + (chars[i + 1] ?? "")];
    if (syllable !== undefined) i++;
    else syllable = KANA[ch];

    if (syllable === undefined) {
      if (geminate) geminate = false;
      out += ch;
      continue;
    }
    if (geminate) {
      geminate = false;
      if (/^[a-z]/.test(syllable) && !/^[aeiou]/.test(syllable)) {
        out += syllable.startsWith("ch") ? "t" : syllable[0];
      }
    }
    out += syllable;
  }
  return out.replace(/ {2,}/g, " ").trimEnd();
}
