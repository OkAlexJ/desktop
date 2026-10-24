import { useEffect, useState } from "react";

/**
 * True while the window is minimized or hidden. The main window runs with
 * backgroundThrottling off, so document.hidden alone never flips there; the
 * window-state events from the main process cover that case.
 */
export function useWindowHidden(): boolean {
  const [docHidden, setDocHidden] = useState(() =>
    typeof document !== "undefined" ? document.hidden : false,
  );
  const [windowHidden, setWindowHidden] = useState(false);

  useEffect(() => {
    const onVisibility = () => setDocHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);

    const api =
      typeof window !== "undefined" ? window.linerElectron : undefined;
    const offState = api?.onWindowStateChange?.((state) => {
      if (typeof state?.isVisible === "boolean")
        setWindowHidden(!state.isVisible);
    });
    const offMinimized = api?.onWindowMinimized?.(() => setWindowHidden(true));
    const offRestored = api?.onWindowRestored?.(() => setWindowHidden(false));

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      offState?.();
      offMinimized?.();
      offRestored?.();
    };
  }, []);

  return docHidden || windowHidden;
}
