import { applyCase } from "./caseUtil";

// readable Greeklish close to ELOT 743 without its diacritics
const SINGLE: Record<string, string> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k",
  λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t",
  υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
};

const VOICELESS = new Set(["θ", "κ", "ξ", "π", "σ", "ς", "τ", "φ", "χ", "ψ"]);
const GREEK_RE = /[Ͱ-Ͽἀ-῿]/;
// stands in for υ with a diaeresis, which never joins a digraph
const LONE_Y = "";

export function hasGreek(text: string): boolean {
  return GREEK_RE.test(text);
}

function isLetter(ch: string | undefined): boolean {
  return ch !== undefined && /\p{L}/u.test(ch);
}

export function romanizeGreek(text: string): string {
  const prepared = text
    .replace(/[ϋΰ]/g, LONE_Y)
    .replace(/Ϋ/g, LONE_Y.toUpperCase())
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const chars = Array.from(prepared);
  let out = "";

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const lower = ch.toLowerCase();
    const next = chars[i + 1];
    const nextLower = next?.toLowerCase();
    const prevIsLetter = isLetter(chars[i - 1]);

    if (lower === LONE_Y) {
      out += applyCase("y", ch === LONE_Y ? "υ" : "Υ", next);
      continue;
    }

    const pair = nextLower ? lower + nextLower : "";
    let digraph: string | null = null;
    if (pair === "ου") digraph = "ou";
    else if (pair === "μπ") digraph = prevIsLetter ? "mp" : "b";
    else if (pair === "ντ") digraph = prevIsLetter ? "nt" : "d";
    else if (pair === "γγ") digraph = "ng";
    else if (pair === "γκ") digraph = prevIsLetter ? "ng" : "g";
    else if (pair === "αυ" || pair === "ευ" || pair === "ηυ") {
      const after = chars[i + 2]?.toLowerCase();
      const vowel = lower === "α" ? "a" : lower === "ε" ? "e" : "i";
      const unvoiced = after === undefined || !isLetter(after) || VOICELESS.has(after);
      digraph = vowel + (unvoiced ? "f" : "v");
    }

    if (digraph !== null) {
      out += applyCase(digraph, ch, next);
      i++;
      continue;
    }

    const mapped = SINGLE[lower];
    out += mapped === undefined ? ch : applyCase(mapped, ch, next);
  }
  return out;
}
