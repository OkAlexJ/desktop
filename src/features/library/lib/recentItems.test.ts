import { beforeEach, describe, expect, it } from "vitest";
import { addRecentItem, RECENT_ITEMS_CAP, selectRecentItems, type RecentItem } from "./recentItems";
import { useLibraryFlyoutSettings, useRecentItemsStore } from "../store/recentItemsStore";

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
});
