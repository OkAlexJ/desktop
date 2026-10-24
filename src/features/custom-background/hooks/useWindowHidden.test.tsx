import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { useWindowHidden } from "./useWindowHidden";
import type { WindowState } from "../../../../electron/preload";

describe("useWindowHidden", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hidden: boolean | null = null;
  let stateListener: ((state: WindowState) => void) | null = null;
  let minimizedListener: (() => void) | null = null;
  let restoredListener: (() => void) | null = null;
  const unsubscribe = vi.fn();

  function Harness() {
    hidden = useWindowHidden();
    return null;
  }

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    hidden = null;
    unsubscribe.mockClear();
    (window as any).linerElectron = {
      onWindowStateChange: (cb: (state: WindowState) => void) => {
        stateListener = cb;
        return unsubscribe;
      },
      onWindowMinimized: (cb: () => void) => {
        minimizedListener = cb;
        return unsubscribe;
      },
      onWindowRestored: (cb: () => void) => {
        restoredListener = cb;
        return unsubscribe;
      },
    };
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (window as any).linerElectron;
  });

  it("follows minimize and restore from the main process", () => {
    act(() => root.render(<Harness />));
    expect(hidden).toBe(false);

    act(() => minimizedListener?.());
    expect(hidden).toBe(true);

    act(() => restoredListener?.());
    expect(hidden).toBe(false);
  });

  it("treats a hidden window as hidden", () => {
    act(() => root.render(<Harness />));
    act(() =>
      stateListener?.({
        isMaximized: false,
        isFullScreen: false,
        isVisible: false,
      }),
    );
    expect(hidden).toBe(true);

    // older main builds don't send isVisible: keep the last known value
    act(() => stateListener?.({ isMaximized: true, isFullScreen: false }));
    expect(hidden).toBe(true);
  });

  it("unsubscribes on unmount", () => {
    act(() => root.render(<Harness />));
    act(() => root.render(<></>));
    expect(unsubscribe).toHaveBeenCalledTimes(3);
  });
});
