import { injectRomanization, injectTranslation, type LineData } from "@braccato/core";

const DECORATION_SELECTOR = ".blyrics--romanized, .blyrics--translated";

interface BraccatoElementLike extends HTMLElement {
  renderer?: {
    lines?: readonly LineData[];
    scheduleLyricPositionUpdate?: (isTicking: () => boolean, retick: () => void) => void;
  } | null;
}

/**
 * braccato builds lines from words only and leaves translation/romanization to the consumer,
 * so hang ours off the built lines (one per lyric, in order) and let it re-measure the layout.
 * Returns false while the element has not built its lines yet.
 */
export function applyBraccatoExtras(
  element: BraccatoElementLike | null,
  romanized: (string | null)[],
  translated: (string | null)[],
): boolean {
  const lines = element?.renderer?.lines;
  if (!element || !lines || lines.length === 0) return false;
  const doc = element.ownerDocument;
  let changed = false;

  lines.forEach((line, i) => {
    const el = line.lyricElement;
    const roman = romanized[i] ?? null;
    const trans = translated[i] ?? null;
    const currentRoman = el.querySelector(".blyrics--romanized")?.textContent ?? null;
    const currentTrans = el.querySelector(".blyrics--translated")?.textContent ?? null;
    if (currentRoman === roman && currentTrans === trans) return;
    el.querySelectorAll(DECORATION_SELECTOR).forEach((node) => node.remove());
    if (roman) injectRomanization(doc, el, line, roman);
    if (trans) injectTranslation(doc, el, trans);
    changed = true;
  });

  if (changed) element.renderer?.scheduleLyricPositionUpdate?.(() => element.isConnected, () => {});
  return true;
}
