import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import LibraryNavItem from "./LibraryNavItem";
import { useLibraryFlyoutSettings, useRecentItemsStore } from "@/features/library/store/recentItemsStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pointer = (el: Element, type: "pointerover" | "pointerout", relatedTarget: Element | null = null) =>
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget }));

describe("LibraryNavItem", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    useLibraryFlyoutSettings.setState({ enabled: true, count: 5, types: ["playlist", "artist", "album"] });
    useRecentItemsStore.setState({
      items: Array.from({ length: 7 }, (_, n) => ({
        type: (["playlist", "artist", "album"] as const)[n % 3],
        id: `id${n}`,
        title: `Item ${n}`,
        href: `/artist?id=id${n}`,
        openedAt: 100 - n,
      })),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter>
          <LibraryNavItem href="/library" active={false} label="Library">
            <span>icon</span>
          </LibraryNavItem>
        </MemoryRouter>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  const trigger = () => container.querySelector("a[href='/library']")!;
  const menu = () => document.querySelector("[role='menu']");

  it("opens after the hover delay with the configured number of items", () => {
    act(() => pointer(trigger(), "pointerover"));
    expect(menu()).toBeNull();
    act(() => vi.advanceTimersByTime(250));
    expect(menu()).not.toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    const titles = Array.from(menu()!.querySelectorAll("a[data-flyout-item]")).map((a) => a.textContent);
    // 5 recent items plus "Show all"
    expect(titles).toHaveLength(6);
    expect(titles[0]).toContain("Item 0");
  });

  it("closes on Escape", () => {
    act(() => pointer(trigger(), "pointerover"));
    act(() => vi.advanceTimersByTime(250));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("does nothing when turned off in settings", () => {
    act(() => useLibraryFlyoutSettings.setState({ enabled: false }));
    act(() => pointer(trigger(), "pointerover"));
    act(() => vi.advanceTimersByTime(1000));
    expect(menu()).toBeNull();
  });
});
