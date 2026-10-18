// keeps the source letter's case on a multi-letter romanization ("Ж" -> "Zh", "ЖИ" -> "ZHI")
export function applyCase(latin: string, source: string, nextSource: string | undefined): string {
  if (!latin) return latin;
  const isUpper = source !== source.toLowerCase();
  if (!isUpper) return latin;
  const nextIsUpper =
    nextSource !== undefined &&
    nextSource !== nextSource.toLowerCase() &&
    nextSource.toUpperCase() === nextSource;
  if (nextIsUpper || latin.length === 1) return latin.toUpperCase();
  return latin[0].toUpperCase() + latin.slice(1);
}
