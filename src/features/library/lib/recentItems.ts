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

export function selectRecentItems(
  list: readonly RecentItem[],
  options: { types: readonly RecentItemType[]; limit: number },
): RecentItem[] {
  const allowed = new Set(options.types);
  return list.filter((item) => allowed.has(item.type)).slice(0, Math.max(0, options.limit));
}
