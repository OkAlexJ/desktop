import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  addRecentItem,
  RECENT_ITEM_TYPES,
  type RecentItem,
  type RecentItemType,
} from "../lib/recentItems";

interface RecentItemsState {
  /** Newest first. */
  items: RecentItem[];
  record: (item: Omit<RecentItem, "openedAt"> & { openedAt?: number }) => void;
  clear: () => void;
}

export const useRecentItemsStore = create<RecentItemsState>()(
  persist(
    (set, get) => ({
      items: [],
      record: (item) => {
        set({ items: addRecentItem(get().items, { ...item, openedAt: item.openedAt ?? Date.now() }) });
      },
      clear: () => set({ items: [] }),
    }),
    { name: "liner_recent_items_v1" },
  ),
);

export type LibraryFlyoutCount = 5 | 8 | 10;
export const LIBRARY_FLYOUT_COUNTS: readonly LibraryFlyoutCount[] = [5, 8, 10];

interface LibraryFlyoutSettingsState {
  enabled: boolean;
  count: LibraryFlyoutCount;
  types: RecentItemType[];
  setEnabled: (enabled: boolean) => void;
  setCount: (count: LibraryFlyoutCount) => void;
  toggleType: (type: RecentItemType) => void;
}

export const useLibraryFlyoutSettings = create<LibraryFlyoutSettingsState>()(
  persist(
    (set, get) => ({
      enabled: true,
      count: 8,
      types: [...RECENT_ITEM_TYPES],
      setEnabled: (enabled) => set({ enabled }),
      setCount: (count) => set({ count }),
      toggleType: (type) => {
        const current = get().types;
        const next = current.includes(type)
          ? current.filter((t) => t !== type)
          : RECENT_ITEM_TYPES.filter((t) => t === type || current.includes(t));
        // an empty flyout is just "off", keep at least one type
        if (next.length > 0) set({ types: next });
      },
    }),
    { name: "liner_library_flyout_v1" },
  ),
);

/** Records the page once its title is known; re-records if the title or cover changes. */
export function useRecordRecentItem(item: Omit<RecentItem, "openedAt"> | null) {
  const record = useRecentItemsStore((s) => s.record);
  const type = item?.type;
  const id = item?.id;
  const title = item?.title;
  const coverUrl = item?.coverUrl;
  const href = item?.href;
  useEffect(() => {
    if (!type || !id || !title || !href) return;
    record({ type, id, title, coverUrl: coverUrl || undefined, href });
  }, [record, type, id, title, coverUrl, href]);
}
