import { useCallback, useEffect, useRef, useState, type FocusEvent } from "react";

export interface HoverIntentOptions {
  /** Wait before opening, so sweeping past the icon doesn't pop the menu. */
  openDelay?: number;
  /** Grace period after leaving the trigger or panel, enough to cross the gap between them. */
  closeDelay?: number;
}

export type HoverZone = "trigger" | "panel";

/**
 * Timer logic for a hover/focus menu, kept free of React so it can be tested with fake timers.
 * The menu stays open while the pointer or focus is inside either zone.
 */
export function createHoverIntent(
  onChange: (open: boolean) => void,
  { openDelay = 250, closeDelay = 200 }: HoverIntentOptions = {},
) {
  let open = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const inside = new Set<string>();

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const set = (next: boolean) => {
    clear();
    if (open === next) return;
    open = next;
    onChange(next);
  };
  const schedule = () => {
    clear();
    if (inside.size > 0 && !open) {
      timer = setTimeout(() => set(true), openDelay);
    } else if (inside.size === 0 && open) {
      timer = setTimeout(() => set(false), closeDelay);
    }
  };

  return {
    enter(zone: HoverZone, via: "pointer" | "focus" = "pointer") {
      // the panel only keeps an open menu alive, it never opens one
      if (zone === "panel" && !open) return;
      inside.add(`${zone}:${via}`);
      schedule();
    },
    leave(zone: HoverZone, via: "pointer" | "focus" = "pointer") {
      inside.delete(`${zone}:${via}`);
      schedule();
    },
    /** Esc, a click or navigation: shut right away and forget where the pointer was. */
    close() {
      inside.clear();
      set(false);
    },
    isOpen: () => open,
    dispose() {
      clear();
      inside.clear();
    },
  };
}

function isFocusVisible(el: Element) {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

export function useHoverIntent(options: HoverIntentOptions & { disabled?: boolean } = {}) {
  const { openDelay, closeDelay, disabled = false } = options;
  const [open, setOpen] = useState(false);
  const intentRef = useRef<ReturnType<typeof createHoverIntent> | null>(null);

  useEffect(() => {
    const intent = createHoverIntent(setOpen, { openDelay, closeDelay });
    intentRef.current = intent;
    return () => {
      intent.dispose();
      intentRef.current = null;
    };
  }, [openDelay, closeDelay]);

  useEffect(() => {
    if (disabled) intentRef.current?.close();
  }, [disabled]);

  // focus that is still on the trigger after a close (Esc, click) must not reopen the menu
  const triggerFocusedRef = useRef(false);
  const suppressFocusRef = useRef(false);

  const close = useCallback(() => {
    suppressFocusRef.current = triggerFocusedRef.current;
    intentRef.current?.close();
  }, []);

  const zoneProps = useCallback(
    (zone: HoverZone) => ({
      onPointerEnter: () => {
        if (!disabled) intentRef.current?.enter(zone);
      },
      onPointerLeave: () => intentRef.current?.leave(zone),
      onFocus: (event: FocusEvent) => {
        if (zone === "trigger") triggerFocusedRef.current = true;
        if (disabled || (zone === "trigger" && suppressFocusRef.current)) return;
        // only keyboard focus opens it; a mouse click focusing the link is handled by hover
        if (zone === "trigger" && !isFocusVisible(event.currentTarget)) return;
        intentRef.current?.enter(zone, "focus");
      },
      onBlur: (event: FocusEvent) => {
        // focus moving between children of the same zone isn't a leave
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        if (zone === "trigger") {
          triggerFocusedRef.current = false;
          suppressFocusRef.current = false;
        }
        intentRef.current?.leave(zone, "focus");
      },
    }),
    [disabled],
  );

  return { open: open && !disabled, close, triggerProps: zoneProps("trigger"), panelProps: zoneProps("panel") };
}
