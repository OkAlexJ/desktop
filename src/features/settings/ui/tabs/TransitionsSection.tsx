import { useTranslation } from "@/languages";
import { usePlayerStore } from "@/features/player";
import { Slider, ToggleSwitch } from "@/shared/ui";
import { MAX_CROSSFADE_SEC } from "@/features/player/engine/transitions";
import { SettingRow, SettingSection } from "../controls";

export function TransitionsSection({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const crossfadeSec = usePlayerStore((s) => s.crossfadeSec);
  const setCrossfadeSec = usePlayerStore((s) => s.setCrossfadeSec);
  const gaplessPlayback = usePlayerStore((s) => s.gaplessPlayback);
  const setGaplessPlayback = usePlayerStore((s) => s.setGaplessPlayback);

  return (
    <SettingSection label={t("settings.transitions.title")}>
      <SettingRow
        title={t("settings.transitions.crossfade_title")}
        description={t("settings.transitions.crossfade_description")}
        titleKey="settings.transitions.crossfade_title"
        descKey="settings.transitions.crossfade_description"
        searchQuery={searchQuery}
        control={
          <Slider
            className="w-[180px]"
            ariaLabel={t("settings.transitions.crossfade_title")}
            min={0}
            max={MAX_CROSSFADE_SEC}
            step={0.5}
            value={crossfadeSec}
            onChange={setCrossfadeSec}
            formatValue={(v) => (v === 0 ? t("settings.transitions.off") : `${v} s`)}
          />
        }
      />
      <SettingRow
        title={t("settings.transitions.gapless_title")}
        description={t("settings.transitions.gapless_description")}
        titleKey="settings.transitions.gapless_title"
        descKey="settings.transitions.gapless_description"
        searchQuery={searchQuery}
        control={
          <ToggleSwitch
            checked={gaplessPlayback}
            onChange={setGaplessPlayback}
            ariaLabel={t("settings.transitions.gapless_title")}
          />
        }
      />
    </SettingSection>
  );
}
