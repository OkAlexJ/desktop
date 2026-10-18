import { useTranslation } from "@/languages";
import { ToggleSwitch } from "@/shared/ui";
import { SegmentedControl, SettingRow, SettingSection } from "@/features/settings/ui/controls";
import { RECENT_ITEM_TYPES } from "@/features/library/lib/recentItems";
import {
  LIBRARY_FLYOUT_COUNTS,
  useLibraryFlyoutSettings,
  type LibraryFlyoutCount,
} from "@/features/library/store/recentItemsStore";

const font = { fontFamily: "var(--font-inter), sans-serif" } as const;

export function LibraryFlyoutSettings({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const enabled = useLibraryFlyoutSettings((s) => s.enabled);
  const count = useLibraryFlyoutSettings((s) => s.count);
  const types = useLibraryFlyoutSettings((s) => s.types);
  const setEnabled = useLibraryFlyoutSettings((s) => s.setEnabled);
  const setCount = useLibraryFlyoutSettings((s) => s.setCount);
  const toggleType = useLibraryFlyoutSettings((s) => s.toggleType);

  return (
    <SettingSection label={t("library_flyout.settings.section")}>
      <SettingRow
        title={t("library_flyout.settings.enabled_title")}
        description={t("library_flyout.settings.enabled_description")}
        titleKey="library_flyout.settings.enabled_title"
        descKey="library_flyout.settings.enabled_description"
        searchQuery={searchQuery}
        control={<ToggleSwitch checked={enabled} onChange={setEnabled} />}
      />
      <SettingRow
        title={t("library_flyout.settings.count_title")}
        description={t("library_flyout.settings.count_description")}
        titleKey="library_flyout.settings.count_title"
        descKey="library_flyout.settings.count_description"
        searchQuery={searchQuery}
        control={
          <SegmentedControl
            ariaLabel={t("library_flyout.settings.count_title")}
            disabled={!enabled}
            value={String(count)}
            onChange={(next) => setCount(Number(next) as LibraryFlyoutCount)}
            options={LIBRARY_FLYOUT_COUNTS.map((n) => ({ value: String(n), label: String(n) }))}
          />
        }
      />
      <SettingRow
        title={t("library_flyout.settings.types_title")}
        description={t("library_flyout.settings.types_description")}
        titleKey="library_flyout.settings.types_title"
        descKey="library_flyout.settings.types_description"
        searchQuery={searchQuery}
        control={
          <div
            role="group"
            aria-label={t("library_flyout.settings.types_title")}
            className={`inline-flex items-center gap-[1px] rounded-lg p-[3px] bg-border-alpha-14 ${
              enabled ? "" : "opacity-50 pointer-events-none"
            }`}
          >
            {RECENT_ITEM_TYPES.map((type) => {
              const on = types.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  disabled={!enabled}
                  onClick={() => toggleType(type)}
                  className={`inline-flex h-[26px] items-center whitespace-nowrap rounded-md border-0 px-[11px] text-[12.5px] leading-none transition-colors cursor-pointer ${
                    on ? "bg-bg-primary text-text-primary" : "bg-transparent text-text-secondary hover:text-text-primary"
                  }`}
                  style={{ ...font, fontWeight: on ? 500 : 400 }}
                >
                  {t(`library_flyout.types_plural.${type}`)}
                </button>
              );
            })}
          </div>
        }
      />
    </SettingSection>
  );
}
