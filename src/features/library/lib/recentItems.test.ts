import { beforeEach, describe, expect, it } from "vitest";
import {
  addRecentItem,
  normalizeRecentItems,
  normalizeRecentItemTypes,
  RECENT_ITEMS_CAP,
  selectRecentItems,
  type RecentItem,
} from "./recentItems";
import {
  normalizeLibraryFlyoutSettings,
  useLibraryFlyoutSettings,
  useRecentItemsStore,
} from "../store/recentItemsStore";

const item = (type: RecentItem["type"], id: string, openedAt: number, title = id): RecentItem => ({
  type,
  id,
  title,
  href: `/${type}?id=${id}`,
  openedAt,
});

describe("addRecentItem", () => {
  it("puts the newest item first", () => {
    let list: RecentItem[] = [];
    list = addRecentItem(list, item("playlist", "a", 1));
    list = addRecentItem(list, item("artist", "b", 2));
    list = addRecentItem(list, item("album", "c", 3));
    expect(list.map((i) => i.id)).toEqual(["c", "b", "a"]);
  });

  it("moves a reopened item to the front instead of duplicating it", () => {
    let list = [item("album", "c", 3), item("artist", "b", 2), item("playlist", "a", 1)];
    list = addRecentItem(list, item("playlist", "a", 4, "Renamed"));
    expect(list.map((i) => i.id)).toEqual(["a", "c", "b"]);
    expect(list[0].title).toBe("Renamed");
    expect(list).toHaveLength(3);
  });

  it("keeps the same id under different types apart", () => {
    let list = addRecentItem([], item("playlist", "x", 1));
    list = addRecentItem(list, item("album", "x", 2));
    expect(list.map((i) => i.type)).toEqual(["album", "playlist"]);
  });

  it("drops the oldest entries past the cap", () => {
    let list: RecentItem[] = [];
    for (let n = 0; n < RECENT_ITEMS_CAP + 5; n++) list = addRecentItem(list, item("artist", `a${n}`, n));
    expect(list).toHaveLength(RECENT_ITEMS_CAP);
    expect(list[0].id).toBe(`a${RECENT_ITEMS_CAP + 4}`);
    expect(list[list.length - 1].id).toBe("a5");
    expect(addRecentItem(list, item("album", "z", 99), 3).map((i) => i.id)).toEqual([
      "z",
      `a${RECENT_ITEMS_CAP + 4}`,
      `a${RECENT_ITEMS_CAP + 3}`,
    ]);
  });

  it("does not mutate the input", () => {
    const list = [item("artist", "b", 2)];
    addRecentItem(list, item("artist", "c", 3));
    expect(list.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("selectRecentItems", () => {
  const list = [
    item("album", "1", 6),
    item("artist", "2", 5),
    item("playlist", "3", 4),
    item("album", "4", 3),
    item("artist", "5", 2),
  ];

  it("filters by type and keeps the order", () => {
    expect(selectRecentItems(list, { types: ["album", "playlist"], limit: 10 }).map((i) => i.id)).toEqual([
      "1",
      "3",
      "4",
    ]);
  });

  it("limits after filtering", () => {
    expect(selectRecentItems(list, { types: ["artist", "album"], limit: 3 }).map((i) => i.id)).toEqual([
      "1",
      "2",
      "4",
    ]);
  });
});

describe("normalizeRecentItems", () => {
  it("returns an empty list for anything that is not an array", () => {
    expect(normalizeRecentItems(undefined)).toEqual([]);
    expect(normalizeRecentItems({ items: [] })).toEqual([]);
    expect(normalizeRecentItems("x")).toEqual([]);
  });

  it("drops malformed entries and keeps the rest in order", () => {
    const saved = [
      item("artist", "a", 3),
      null,
      { type: "podcast", id: "p", title: "P", href: "/p", openedAt: 1 },
      { type: "album", id: "", title: "B", href: "/b", openedAt: 1 },
      { type: "album", id: "b", title: "B", openedAt: 1 },
      { type: "playlist", id: "c", title: "C", href: "/c", coverUrl: 5 },
      item("artist", "a", 1),
    ];
    expect(normalizeRecentItems(saved)).toEqual([
      item("artist", "a", 3),
      { type: "playlist", id: "c", title: "C", href: "/c", coverUrl: undefined, openedAt: 0 },
    ]);
  });

  it("caps the list", () => {
    const saved = Array.from({ length: RECENT_ITEMS_CAP + 5 }, (_, i) => item("album", String(i), i));
    expect(normalizeRecentItems(saved)).toHaveLength(RECENT_ITEMS_CAP);
  });
});

describe("normalizeRecentItemTypes", () => {
  it("keeps valid types in canonical order", () => {
    expect(normalizeRecentItemTypes(["album", "nope", "playlist"])).toEqual(["playlist", "album"]);
  });

  it("falls back to every type when nothing valid is saved", () => {
    expect(normalizeRecentItemTypes([])).toEqual(["playlist", "artist", "album"]);
    expect(normalizeRecentItemTypes("artist")).toEqual(["playlist", "artist", "album"]);
  });
});

describe("normalizeLibraryFlyoutSettings", () => {
  it("keeps valid saved settings", () => {
    expect(normalizeLibraryFlyoutSettings({ enabled: false, count: 5, types: ["artist"] })).toEqual({
      enabled: false,
      count: 5,
      types: ["artist"],
    });
  });

  it("replaces missing or out-of-range values with defaults", () => {
    expect(normalizeLibraryFlyoutSettings({ enabled: "yes", count: 42, types: null })).toEqual({
      enabled: true,
      count: 8,
      types: ["playlist", "artist", "album"],
    });
    expect(normalizeLibraryFlyoutSettings(undefined)).toEqual({
      enabled: true,
      count: 8,
      types: ["playlist", "artist", "album"],
    });
  });
});

describe("recent items stores", () => {
  beforeEach(() => {
    useRecentItemsStore.setState({ items: [] });
    useLibraryFlyoutSettings.setState({ enabled: true, count: 8, types: ["playlist", "artist", "album"] });
  });

  it("records with a timestamp and dedupes", () => {
    const { record } = useRecentItemsStore.getState();
    record({ type: "artist", id: "a", title: "A", href: "/artist?id=a", openedAt: 1 });
    record({ type: "album", id: "b", title: "B", href: "/collection?type=album&id=b" });
    record({ type: "artist", id: "a", title: "A", href: "/artist?id=a" });
    const items = useRecentItemsStore.getState().items;
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(items[0].openedAt).toBeGreaterThan(1);
  });

  it("never lets the type filter become empty", () => {
    const { toggleType } = useLibraryFlyoutSettings.getState();
    toggleType("artist");
    toggleType("album");
    toggleType("playlist");
    expect(useLibraryFlyoutSettings.getState().types).toEqual(["playlist"]);
    toggleType("album");
    expect(useLibraryFlyoutSettings.getState().types).toEqual(["playlist", "album"]);
  });

  it("normalizes malformed saved data when rehydrating", async () => {
    localStorage.setItem(
      "liner_recent_items_v1",
      JSON.stringify({ state: { items: [item("album", "x", 1), { id: 3 }], record: "nope" }, version: 0 }),
    );
    localStorage.setItem(
      "liner_library_flyout_v1",
      JSON.stringify({ state: { enabled: false, count: 99, types: "album" }, version: 0 }),
    );
    await useRecentItemsStore.persist.rehydrate();
    await useLibraryFlyoutSettings.persist.rehydrate();
    expect(useRecentItemsStore.getState().items.map((i) => i.id)).toEqual(["x"]);
    expect(typeof useRecentItemsStore.getState().record).toBe("function");
    const settings = useLibraryFlyoutSettings.getState();
    expect([settings.enabled, settings.count, settings.types]).toEqual([false, 8, ["playlist", "artist", "album"]]);
  });

  it("persists only the durable fields", () => {
    useRecentItemsStore.getState().record({ type: "artist", id: "a", title: "A", href: "/artist?id=a" });
    useLibraryFlyoutSettings.getState().setCount(5);
    const recent = JSON.parse(localStorage.getItem("liner_recent_items_v1") ?? "{}").state;
    const flyout = JSON.parse(localStorage.getItem("liner_library_flyout_v1") ?? "{}").state;
    expect(Object.keys(recent)).toEqual(["items"]);
    expect(Object.keys(flyout).sort()).toEqual(["count", "enabled", "types"]);
  });
});
