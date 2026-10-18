// local-only "recently opened" list behind the sidebar library flyout

export type RecentItemType = "playlist" | "artist" | "album";

export const RECENT_ITEM_TYPES: readonly RecentItemType[] = ["playlist", "artist", "album"];

export interface RecentItem {
  type: RecentItemType;
  id: string;
  title: string;
  coverUrl?: string;
  /** Route to open, e.g. "/artist?id=…". */
  href: string;
  openedAt: number;
}

/** How many entries are kept on disk; the flyout shows at most 10. */
export const RECENT_ITEMS_CAP = 30;

export const recentItemKey = (item: Pick<RecentItem, "type" | "id">) => `${item.type}:${item.id}`;

/** Newest first, one entry per type+id, at most `cap` long. */
export function addRecentItem(
  list: readonly RecentItem[],
  item: RecentItem,
  cap = RECENT_ITEMS_CAP,
): RecentItem[] {
  const key = recentItemKey(item);
  const rest = list.filter((entry) => recentItemKey(entry) !== key);
  return [item, ...rest].slice(0, Math.max(0, cap));
}

const isRecentItemType = (value: unknown): value is RecentItemType =>
  RECENT_ITEM_TYPES.includes(value as RecentItemType);

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** Keeps only well-formed entries from saved data, deduped and capped like `addRecentItem`. */
export function normalizeRecentItems(value: unknown, cap = RECENT_ITEMS_CAP): RecentItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: RecentItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { type, id, title, coverUrl, href, openedAt } = entry as Record<string, unknown>;
    if (!isRecentItemType(type) || !isNonEmptyString(id) || !isNonEmptyString(title) || !isNonEmptyString(href)) {
      continue;
    }
    const key = recentItemKey({ type, id });
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      type,
      id,
      title,
      coverUrl: isNonEmptyString(coverUrl) ? coverUrl : undefined,
      href,
      openedAt: typeof openedAt === "number" && Number.isFinite(openedAt) ? openedAt : 0,
    });
    if (items.length >= cap) break;
  }
  return items;
}

/** Saved type filter in canonical order; falls back to every type when nothing valid is left. */
export function normalizeRecentItemTypes(value: unknown): RecentItemType[] {
  const saved = Array.isArray(value) ? value : [];
  const types = RECENT_ITEM_TYPES.filter((type) => saved.includes(type));
  return types.length > 0 ? types : [...RECENT_ITEM_TYPES];
}

export function selectRecentItems(
  list: readonly RecentItem[],
  options: { types: readonly RecentItemType[]; limit: number },
): RecentItem[] {
  const allowed = new Set(options.types);
  return list.filter((item) => allowed.has(item.type)).slice(0, Math.max(0, options.limit));
}
