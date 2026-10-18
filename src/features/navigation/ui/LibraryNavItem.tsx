import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { AlbumFill, MicFill, PlaylistFill } from "@mingcute/react";
import AppImage from "@/features/covers/ui/AppImage";
import { useTranslation } from "@/languages";
import { Tooltip } from "@/shared/ui";
import { selectRecentItems, recentItemKey, type RecentItemType } from "@/features/library/lib/recentItems";
import { useLibraryFlyoutSettings, useRecentItemsStore } from "@/features/library/store/recentItemsStore";
import { useHoverIntent } from "../hooks/useHoverIntent";

const font = { fontFamily: "var(--font-inter), sans-serif" } as const;
const PANEL_WIDTH = 264;
// transparent strip between the icon and the panel that still counts as "inside"
const BRIDGE = 18;

const typeIcons: Record<RecentItemType, typeof PlaylistFill> = {
  playlist: PlaylistFill,
  artist: MicFill,
  album: AlbumFill,
};

interface LibraryNavItemProps {
  href: string;
  active: boolean;
  label: string;
  children: ReactNode;
}

/** The sidebar Library icon plus its "recently opened" hover flyout. */
export default function LibraryNavItem({ href, active, label, children }: LibraryNavItemProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const enabled = useLibraryFlyoutSettings((s) => s.enabled);
  const count = useLibraryFlyoutSettings((s) => s.count);
  const types = useLibraryFlyoutSettings((s) => s.types);
  const allItems = useRecentItemsStore((s) => s.items);
  const items = useMemo(() => selectRecentItems(allItems, { types, limit: count }), [allItems, types, count]);

  const { open, close, triggerProps, panelProps } = useHoverIntent({ disabled: !enabled });
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // navigation (including from the flyout itself) closes it
  useEffect(() => {
    close();
  }, [location.pathname, location.search, close]);

  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const height = panelRef.current?.offsetHeight ?? 0;
    const margin = 8;
    const top = Math.max(margin, Math.min(rect.top - 14, window.innerHeight - height - margin));
    setPos({ top, left: rect.right });
  }, [open, items.length]);

  const focusPanelItem = (delta: 1 | -1 | 0) => {
    const links = Array.from(panelRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-flyout-item]") ?? []);
    if (links.length === 0) return;
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = delta === 0 ? 0 : (index + delta + links.length) % links.length;
    links[next]?.focus();
  };

  const closeAndRefocus = () => {
    triggerRef.current?.focus({ preventScroll: true });
    close();
  };

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusPanelItem(0);
    }
  };

  const onPanelKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRefocus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusPanelItem(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusPanelItem(-1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      triggerRef.current?.focus({ preventScroll: true });
    }
  };

  // Esc while the pointer is elsewhere and focus is on the page
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const trigger = (
    <Link
      ref={triggerRef}
      to={href}
      aria-current={active ? "page" : undefined}
      aria-haspopup={enabled ? "menu" : undefined}
      aria-expanded={enabled ? open : undefined}
      aria-label={label}
      onClick={close}
      onKeyDown={onTriggerKeyDown}
      {...triggerProps}
      className="group relative inline-flex items-center justify-center cursor-pointer active:scale-[0.96] transition-transform duration-100"
    >
      {children}
    </Link>
  );

  if (!enabled) {
    return (
      <Tooltip content={label} side="right" sideOffset={12}>
        {trigger}
      </Tooltip>
    );
  }

  return (
    <>
      {trigger}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                key="library-flyout"
                ref={panelRef}
                role="menu"
                aria-label={t("library_flyout.title")}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                className="fixed z-[400]"
                style={{ top: pos.top, left: pos.left, paddingLeft: BRIDGE, width: PANEL_WIDTH + BRIDGE }}
                onKeyDown={onPanelKeyDown}
                {...panelProps}
              >
                <div className="overflow-hidden rounded-lg border border-border-primary/80 bg-bg-primary/95 backdrop-blur-md p-1 shadow-xl">
                  <div className="flex items-baseline justify-between px-2.5 pt-1.5 pb-1">
                    <span className="text-text-primary text-[13px] font-[600]" style={font}>
                      {label}
                    </span>
                    <span className="text-text-tertiary text-[11px] uppercase tracking-[0.07em] font-[600]" style={font}>
                      {t("library_flyout.title")}
                    </span>
                  </div>

                  {items.length === 0 ? (
                    <p className="m-0 px-2.5 py-2 text-text-tertiary text-[12.5px] leading-relaxed" style={font}>
                      {t("library_flyout.empty")}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {items.map((item) => {
                        const Icon = typeIcons[item.type];
                        const rounded = item.type === "artist" ? "rounded-full" : "rounded-[4px]";
                        return (
                          <Link
                            key={recentItemKey(item)}
                            to={item.href}
                            role="menuitem"
                            data-flyout-item
                            onClick={close}
                            className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 no-underline text-text-primary outline-none hover:bg-border-alpha-14 focus-visible:bg-border-alpha-14 transition-colors"
                            style={font}
                          >
                            <span className={`relative shrink-0 w-[34px] h-[34px] overflow-hidden bg-border-alpha-14 flex items-center justify-center ${rounded}`}>
                              {item.coverUrl ? (
                                <AppImage
                                  src={item.coverUrl}
                                  alt=""
                                  width={34}
                                  height={34}
                                  className={`w-[34px] h-[34px] object-cover ${rounded}`}
                                  draggable={false}
                                />
                              ) : (
                                <Icon size={16} className="text-text-tertiary" />
                              )}
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-[13px] leading-tight">{item.title}</span>
                              <span className="truncate text-[11.5px] leading-tight text-text-tertiary">
                                {t(`library_flyout.type_${item.type}`)}
                              </span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-1 border-t border-border-primary/80 pt-1">
                    <Link
                      to={href}
                      role="menuitem"
                      data-flyout-item
                      onClick={close}
                      className="flex items-center justify-between rounded-md px-2.5 py-1.5 no-underline text-[12.5px] text-text-secondary hover:text-text-primary hover:bg-border-alpha-14 focus-visible:bg-border-alpha-14 outline-none transition-colors"
                      style={font}
                    >
                      {t("library_flyout.show_all")}
                      <span aria-hidden>→</span>
                    </Link>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
