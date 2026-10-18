import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  addRecentItem,
  normalizeRecentItems,
  normalizeRecentItemTypes,
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
    {
      name: "liner_recent_items_v1",
      partialize: ({ items }) => ({ items }),
      merge: (persisted, current) => ({
        ...current,
        items: normalizeRecentItems((persisted as { items?: unknown } | undefined)?.items),
      }),
    },
  ),
);

export type LibraryFlyoutCount = 5 | 8 | 10;
export const LIBRARY_FLYOUT_COUNTS: readonly LibraryFlyoutCount[] = [5, 8, 10];

interface LibraryFlyoutSettings {
  enabled: boolean;
  count: LibraryFlyoutCount;
  types: RecentItemType[];
}

const DEFAULT_LIBRARY_FLYOUT_SETTINGS: LibraryFlyoutSettings = {
  enabled: true,
  count: 8,
  types: [...RECENT_ITEM_TYPES],
};

/** Fills in defaults for anything missing or out of range in the saved settings. */
export function normalizeLibraryFlyoutSettings(value: unknown): LibraryFlyoutSettings {
  const saved = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    enabled: typeof saved.enabled === "boolean" ? saved.enabled : DEFAULT_LIBRARY_FLYOUT_SETTINGS.enabled,
    count: LIBRARY_FLYOUT_COUNTS.includes(saved.count as LibraryFlyoutCount)
      ? (saved.count as LibraryFlyoutCount)
      : DEFAULT_LIBRARY_FLYOUT_SETTINGS.count,
    types: normalizeRecentItemTypes(saved.types),
  };
}

interface LibraryFlyoutSettingsState extends LibraryFlyoutSettings {
  setEnabled: (enabled: boolean) => void;
  setCount: (count: LibraryFlyoutCount) => void;
  toggleType: (type: RecentItemType) => void;
}

export const useLibraryFlyoutSettings = create<LibraryFlyoutSettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_LIBRARY_FLYOUT_SETTINGS,
      types: [...DEFAULT_LIBRARY_FLYOUT_SETTINGS.types],
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
    {
      name: "liner_library_flyout_v1",
      partialize: ({ enabled, count, types }) => ({ enabled, count, types }),
      merge: (persisted, current) => ({ ...current, ...normalizeLibraryFlyoutSettings(persisted) }),
    },
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
