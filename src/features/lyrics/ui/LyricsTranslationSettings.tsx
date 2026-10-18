import { useTranslation } from "@/languages";
import { Select, TextInput, ToggleSwitch } from "@/shared/ui";
import { SettingRow, SettingSection, SegmentedControl } from "@/features/settings/ui/controls";
import { useLyricsExtrasStore } from "../extras/extrasStore";
import { useTranslationTargetOptions } from "./LyricsExtrasControls";

export function LyricsTranslationSettings({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const s = useLyricsExtrasStore();
  const targetOptions = useTranslationTargetOptions();

  return (
    <SettingSection label={t("lyrics_extras.settings.section")}>
      <SettingRow
        title={t("lyrics_extras.settings.romanize_title")}
        description={t("lyrics_extras.settings.romanize_desc")}
        titleKey="lyrics_extras.settings.romanize_title"
        descKey="lyrics_extras.settings.romanize_desc"
        searchQuery={searchQuery}
        control={<ToggleSwitch checked={s.showRomanization} onChange={s.setShowRomanization} />}
      />
      <SettingRow
        title={t("lyrics_extras.settings.translate_title")}
        description={t("lyrics_extras.settings.translate_desc")}
        titleKey="lyrics_extras.settings.translate_title"
        descKey="lyrics_extras.settings.translate_desc"
        searchQuery={searchQuery}
        control={<ToggleSwitch checked={s.showTranslation} onChange={s.setShowTranslation} />}
      />
      <SettingRow
        title={t("lyrics_extras.settings.target_title")}
        description={t("lyrics_extras.settings.target_desc")}
        titleKey="lyrics_extras.settings.target_title"
        descKey="lyrics_extras.settings.target_desc"
        searchQuery={searchQuery}
        control={
          <div className="w-[190px]">
            <Select
              aria-label={t("lyrics_extras.settings.target_title")}
              value={s.targetLang}
              onChange={s.setTargetLang}
              options={targetOptions}
              align="bottom-right"
              className="w-full"
            />
          </div>
        }
      />
      <SettingRow
        title={t("lyrics_extras.settings.provider_title")}
        description={t("lyrics_extras.settings.provider_desc")}
        titleKey="lyrics_extras.settings.provider_title"
        descKey="lyrics_extras.settings.provider_desc"
        searchQuery={searchQuery}
        control={
          <SegmentedControl
            ariaLabel={t("lyrics_extras.settings.provider_title")}
            value={s.provider}
            onChange={s.setProvider}
            options={[
              { value: "mymemory", label: "MyMemory" },
              { value: "libretranslate", label: "LibreTranslate" },
            ]}
          />
        }
      />
      {s.provider === "mymemory" ? (
        <SettingRow
          title={t("lyrics_extras.settings.email_title")}
          description={t("lyrics_extras.settings.email_desc")}
          titleKey="lyrics_extras.settings.email_title"
          descKey="lyrics_extras.settings.email_desc"
          searchQuery={searchQuery}
          control={
            <TextInput
              size="sm"
              type="email"
              className="w-[220px]"
              placeholder="you@example.com"
              value={s.myMemoryEmail}
              onChange={(e) => s.setMyMemoryEmail(e.target.value)}
            />
          }
        />
      ) : (
        <>
          <SettingRow
            title={t("lyrics_extras.settings.libre_url_title")}
            description={t("lyrics_extras.settings.libre_url_desc")}
            titleKey="lyrics_extras.settings.libre_url_title"
            descKey="lyrics_extras.settings.libre_url_desc"
            searchQuery={searchQuery}
            control={
              <TextInput
                size="sm"
                type="url"
                className="w-[220px]"
                placeholder="https://libretranslate.com"
                value={s.libreUrl}
                onChange={(e) => s.setLibreUrl(e.target.value)}
              />
            }
          />
          <SettingRow
            title={t("lyrics_extras.settings.libre_key_title")}
            description={t("lyrics_extras.settings.libre_key_desc")}
            titleKey="lyrics_extras.settings.libre_key_title"
            descKey="lyrics_extras.settings.libre_key_desc"
            searchQuery={searchQuery}
            control={
              <TextInput
                size="sm"
                type="password"
                autoComplete="off"
                className="w-[220px]"
                value={s.libreApiKey}
                onChange={(e) => s.setLibreApiKey(e.target.value)}
              />
            }
          />
        </>
      )}
    </SettingSection>
  );
}
