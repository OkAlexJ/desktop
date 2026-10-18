import { CheckLine } from "@mingcute/react";
import { LuArrowDownUp, LuArrowDown, LuArrowUp, LuSave } from "react-icons/lu";
import DropdownMenu from "@/shared/ui/DropdownMenu";
import type { DropdownMenuItem } from "@/shared/ui/DropdownMenu";
import { useTranslation } from "@/languages";
import {
  PLAYLIST_SORT_KEYS,
  type PlaylistSort,
  type PlaylistSortKey,
} from "../lib/playlistSort";

const LABEL_KEYS: Record<PlaylistSortKey, string> = {
  custom: "playlist.sort_custom",
  title: "playlist.sort_title",
  artist: "playlist.sort_artist",
  album: "playlist.sort_album",
  duration: "playlist.sort_duration",
  addedAt: "playlist.sort_added",
};

interface PlaylistSortControlProps {
  sort: PlaylistSort;
  onChange: (sort: PlaylistSort) => void;
  canApply: boolean;
  onApply: () => void;
  progress: { done: number; total: number } | null;
  hasCustomBg: boolean;
}

export default function PlaylistSortControl({
  sort,
  onChange,
  canApply,
  onApply,
  progress,
  hasCustomBg,
}: PlaylistSortControlProps) {
  const { t } = useTranslation();
  const isDefault = sort.key === "custom" && sort.direction === "asc";
  const busy = progress !== null;

  const check = (active: boolean) =>
    active ? <CheckLine size={15} /> : <span className="inline-block w-[15px]" />;

  const items: DropdownMenuItem[] = [
    ...PLAYLIST_SORT_KEYS.map((key) => ({
      id: `sort-${key}`,
      icon: check(sort.key === key),
      label: t(LABEL_KEYS[key]),
      disabled: busy,
      onClick: () =>
        onChange(
          sort.key === key
            ? { key, direction: sort.direction === "asc" ? "desc" : "asc" }
            : { key, direction: "asc" },
        ),
    })),
    {
      id: "sort-asc",
      icon: check(sort.direction === "asc"),
      label: t("playlist.sort_ascending"),
      disabled: busy,
      onClick: () => onChange({ ...sort, direction: "asc" }),
    },
    {
      id: "sort-desc",
      icon: check(sort.direction === "desc"),
      label: t("playlist.sort_descending"),
      disabled: busy,
      onClick: () => onChange({ ...sort, direction: "desc" }),
    },
    ...(canApply && !isDefault
      ? [
          {
            id: "sort-apply",
            icon: <LuSave size={15} />,
            label: t("playlist.sort_apply"),
            disabled: busy,
            onClick: onApply,
          },
        ]
      : []),
  ];

  const pillClass = hasCustomBg
    ? "apple-glass-pill"
    : "bg-bg-panel border border-border-primary/40 text-text-tertiary hover:text-text-primary";

  return (
    <DropdownMenu
      trigger={
        <button
          type="button"
          data-no-tooltip="true"
          disabled={busy}
          title={isDefault ? undefined : t("playlist.sort_drag_disabled")}
          className={`inline-flex h-[26px] items-center gap-[6px] rounded-md px-[8px] text-[12px] font-[400] select-none cursor-pointer transition-colors ${pillClass}`}
        >
          <LuArrowDownUp size={13} className="shrink-0" />
          <span>
            {busy
              ? t("playlist.sort_applying", { done: progress.done, total: progress.total })
              : t(LABEL_KEYS[sort.key])}
          </span>
          {!busy && sort.direction === "desc" && <LuArrowDown size={12} className="shrink-0" />}
          {!busy && sort.direction === "asc" && sort.key !== "custom" && (
            <LuArrowUp size={12} className="shrink-0" />
          )}
        </button>
      }
      items={items}
    />
  );
}
