import { useEffect, useState } from "react";
import { useTranslation } from "@/languages";
import { Button, ToggleSwitch, useToast } from "@/shared/ui";
import { SettingRow, SettingSection } from "@/features/settings/ui/controls";
import { useStatsHistoryStore, useStatsSettingsStore } from "../store/statsStore";
import { historyFilename, historyToCsv, historyToJson, saveTextFile } from "../lib/exportHistory";

export function ListeningStatsSettings({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const trackingPaused = useStatsSettingsStore((s) => s.trackingPaused);
  const setTrackingPaused = useStatsSettingsStore((s) => s.setTrackingPaused);
  const plays = useStatsHistoryStore((s) => s.plays);
  const load = useStatsHistoryStore((s) => s.load);
  const clearHistory = useStatsHistoryStore((s) => s.clearHistory);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  const exportAs = async (format: "json" | "csv") => {
    await load();
    const all = useStatsHistoryStore.getState().plays;
    if (all.length === 0) {
      toast(t("settings.stats.nothing_to_export"), "info");
      return;
    }
    if (format === "json") saveTextFile(historyFilename("json"), historyToJson(all), "application/json");
    else saveTextFile(historyFilename("csv"), historyToCsv(all), "text/csv");
  };

  const onClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    await clearHistory();
    toast(t("settings.stats.cleared"), "success");
  };

  return (
    <SettingSection label={t("settings.stats.section")}>
      <SettingRow
        title={t("settings.stats.pause_title")}
        description={t("settings.stats.pause_description")}
        titleKey="settings.stats.pause_title"
        descKey="settings.stats.pause_description"
        searchQuery={searchQuery}
        control={<ToggleSwitch checked={trackingPaused} onChange={setTrackingPaused} />}
      />
      <SettingRow
        title={t("settings.stats.export_title")}
        description={t("settings.stats.export_description", { count: plays.length })}
        titleKey="settings.stats.export_title"
        descKey="settings.stats.export_description"
        searchQuery={searchQuery}
        control={
          <div className="flex gap-[6px]">
            <Button variant="secondary" size="sm" type="button" onClick={() => void exportAs("json")}>
              JSON
            </Button>
            <Button variant="secondary" size="sm" type="button" onClick={() => void exportAs("csv")}>
              CSV
            </Button>
          </div>
        }
      />
      <SettingRow
        title={t("settings.stats.clear_title")}
        description={t("settings.stats.clear_description")}
        titleKey="settings.stats.clear_title"
        descKey="settings.stats.clear_description"
        searchQuery={searchQuery}
        control={
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => void onClear()}
            className={confirmClear ? "!text-red-400" : ""}
          >
            {confirmClear ? t("settings.stats.clear_confirm") : t("settings.stats.clear_button")}
          </Button>
        }
      />
    </SettingSection>
  );
}
