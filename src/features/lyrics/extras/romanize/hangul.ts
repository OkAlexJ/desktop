// Revised Romanization of Korean, computed from syllable jamo with the common sound changes
// (liaison, nasalization, ㄹ assimilation, ㅎ aspiration); no dictionary, so exceptions are missed
const BASE = 0xac00;
const LAST = 0xd7a3;

const INITIALS = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const VOWELS = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];

// per final: [what stays when the rest moves to a following silent ㅇ, initial index that moves or -1]
const FINAL_SPLIT: [string, number][] = [
  ["", -1],
  ["", 0], ["", 1], ["k", 9], ["", 2], ["n", 12], ["n", 18], ["", 3], ["", 5], ["l", 0], ["l", 6],
  ["l", 7], ["l", 9], ["l", 16], ["l", 17], ["l", 18], ["", 6], ["", 7], ["p", 9], ["", 9], ["", 10],
  ["ng", 11], ["", 12], ["", 14], ["", 15], ["", 16], ["", 17], ["", 18],
];
// how each final sounds when nothing follows it
const FINAL_ALONE = [
  "", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m",
  "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t",
];

const SILENT_IEUNG = 11;
const NG_FINAL = 21;
const H_FINALS = new Set([6, 15, 27]); // ㄶ ㅀ ㅎ
const ASPIRATE: Record<number, number> = { 0: 15, 3: 16, 12: 14, 7: 17 }; // ㄱ->ㅋ ㄷ->ㅌ ㅈ->ㅊ ㅂ->ㅍ

interface Syllable {
  l: number;
  v: number;
  t: number;
}

function decompose(ch: string): Syllable | null {
  const code = ch.codePointAt(0)!;
  if (code < BASE || code > LAST) return null;
  const s = code - BASE;
  return { l: Math.floor(s / 588), v: Math.floor((s % 588) / 28), t: s % 28 };
}

function nasalize(sound: string): string {
  if (sound === "k") return "ng";
  if (sound === "t") return "n";
  if (sound === "p") return "m";
  return sound;
}

export function hasHangul(text: string): boolean {
  return /[가-힣]/.test(text);
}

export function romanizeHangul(text: string): string {
  const chars = Array.from(text);
  const syl = chars.map(decompose);
  // initial of a syllable as changed by the final before it
  const initialOverride: (string | null)[] = chars.map(() => null);
  let out = "";

  for (let i = 0; i < chars.length; i++) {
    const cur = syl[i];
    if (!cur) {
      out += chars[i];
      continue;
    }
    const next = syl[i + 1];
    const alone = FINAL_ALONE[cur.t];
    let finalText = alone;

    if (next && cur.t > 0) {
      const [kept, moved] = FINAL_SPLIT[cur.t];
      if (next.l === SILENT_IEUNG) {
        if (H_FINALS.has(cur.t)) {
          // ㅎ goes silent; ㄴ/ㄹ in front of it carries over
          finalText = "";
          if (cur.t === 6) initialOverride[i + 1] = "n";
          if (cur.t === 15) initialOverride[i + 1] = "r";
        } else if (cur.t !== NG_FINAL) {
          finalText = kept;
          initialOverride[i + 1] = INITIALS[moved];
        }
      } else if (H_FINALS.has(cur.t) && ASPIRATE[next.l] !== undefined) {
        finalText = cur.t === 27 ? "" : kept;
        initialOverride[i + 1] = INITIALS[ASPIRATE[next.l]];
      } else if (next.l === 2 || next.l === 6) {
        finalText = nasalize(alone);
        if (alone === "l" && next.l === 2) initialOverride[i + 1] = "l";
      } else if (next.l === 5) {
        if (alone === "l" || alone === "n") {
          finalText = "l";
          initialOverride[i + 1] = "l";
        } else {
          finalText = nasalize(alone);
          initialOverride[i + 1] = "n";
        }
      }
    }

    out += (initialOverride[i] ?? INITIALS[cur.l]) + VOWELS[cur.v] + finalText;
  }
  return out;
}
