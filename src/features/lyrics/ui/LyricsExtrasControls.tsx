import { useEffect, useMemo, useRef } from "react";
import { CheckFill } from "@mingcute/react";
import { Emoji } from "react-apple-emojis";
import { useTranslation } from "@/languages";
import { ToggleSwitch, type SelectOption } from "@/shared/ui";
import { useLyricsExtrasStore } from "../extras/extrasStore";
import { TRANSLATION_TARGETS, type TranslationTarget } from "../extras/language";
import type { LyricsExtras } from "../extras/useLyricsExtras";

const font = { fontFamily: "var(--font-inter), sans-serif" } as const;

const FLAGS: Record<TranslationTarget, string> = {
  en: "flag-united-kingdom", es: "flag-spain", ru: "flag-russia", uk: "flag-ukraine",
  de: "flag-germany", it: "flag-italy", fr: "flag-france", pl: "flag-poland",
  tr: "flag-turkey", ja: "flag-japan", ko: "flag-south-korea", zh: "flag-china",
  pt: "flag-brazil", ar: "flag-saudi-arabia", hi: "flag-india", id: "flag-indonesia",
};

export function languageName(code: string, uiLocale: string): string {
  try {
    const name = new Intl.DisplayNames([uiLocale], { type: "language" }).of(code);
    if (name) return name[0].toLocaleUpperCase(uiLocale) + name.slice(1);
  } catch {}
  return code;
}

function Flag({ code, size = 15 }: { code: string; size?: number }) {
  const name = FLAGS[code as TranslationTarget];
  return name ? <Emoji name={name} width={size} /> : null;
}

// "auto" first (the app language), then every target, each with its flag
export function useTranslationTargetOptions(): SelectOption<TranslationTarget | "auto">[] {
  const { t, locale } = useTranslation();
  return useMemo(
    () => [
      {
        value: "auto",
        label: t("lyrics_extras.auto_language", { lang: languageName(locale, locale) }),
        icon: <Flag code={locale} />,
      },
      ...TRANSLATION_TARGETS.map((code) => ({
        value: code,
        label: languageName(code, locale),
        icon: <Flag code={code} />,
      })),
    ],
    [t, locale],
  );
}

// the status line for the island button's panel, or null when there is nothing to say
export function lyricsExtrasNotice(
  extras: LyricsExtras,
  t: (key: string, vars?: Record<string, string | number>) => string,
  locale: string,
): string | null {
  if (extras.showTranslation) {
    if (extras.translationStatus === "loading") return t("lyrics_extras.translating");
    if (extras.translationStatus === "same-language")
      return t("lyrics_extras.same_language", { lang: languageName(extras.targetLang, locale) });
    if (extras.translationError) return t(`lyrics_extras.error_${extras.translationError}`);
  }
  if (extras.showRomanization) {
    if (extras.romanUnsupportedCount > 0)
      return t("lyrics_extras.roman_unsupported", { count: String(extras.romanUnsupportedCount) });
    if (extras.romanizableCount === 0) return t("lyrics_extras.roman_nothing");
  }
  return null;
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-[10px] px-[4px]">
      <div className="flex min-w-0 flex-col">
        <span className="text-[12px] font-[600] text-text-primary" style={font}>
          {label}
        </span>
        <span className="text-[11px] text-text-primary/50 leading-snug" style={font}>
          {hint}
        </span>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} ariaLabel={label} />
    </div>
  );
}

// romanize / translate switches, target language and status, shown under the lyrics island button
export function LyricsExtrasPanel({ extras }: { extras: LyricsExtras }) {
  const { t, locale } = useTranslation();
  const setShowRomanization = useLyricsExtrasStore((s) => s.setShowRomanization);
  const setShowTranslation = useLyricsExtrasStore((s) => s.setShowTranslation);
  const value = useLyricsExtrasStore((s) => s.targetLang);
  const setValue = useLyricsExtrasStore((s) => s.setTargetLang);
  const options = useTranslationTargetOptions();
  const listRef = useRef<HTMLDivElement>(null);
  const notice = lyricsExtrasNotice(extras, t, locale);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
  }, [extras.showTranslation]);

  return (
    <div className="flex flex-col gap-[10px]">
      <SwitchRow
        label={t("lyrics_extras.romanize")}
        hint={t("lyrics_extras.romanize_hint")}
        checked={extras.showRomanization}
        onChange={setShowRomanization}
      />
      <SwitchRow
        label={t("lyrics_extras.translate")}
        hint={t("lyrics_extras.translate_hint")}
        checked={extras.showTranslation}
        onChange={setShowTranslation}
      />

      {extras.showTranslation ? (
        <div className="flex flex-col gap-[4px]">
          <span className="px-[4px] text-[10px] font-[500] uppercase tracking-[0.06em] text-text-primary/50" style={font}>
            {t("lyrics_extras.translate_to")}
          </span>
          <div
            ref={listRef}
            role="listbox"
            aria-label={t("lyrics_extras.translate_to")}
            className="flex flex-col gap-[2px] overflow-y-auto rounded-lg bg-text-primary/[0.06] p-[4px]"
            style={{ maxHeight: "min(240px, 40vh)", scrollbarWidth: "thin" }}
          >
            {options.map((opt) => {
              const selected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => setValue(opt.value)}
                  className={`flex w-full items-center gap-[8px] rounded-md border-none px-[8px] py-[6px] text-left text-[12px] cursor-pointer transition-colors ${
                    selected
                      ? "bg-text-primary/15 text-text-primary font-[500]"
                      : "bg-transparent text-text-primary/70 hover:bg-text-primary/10 hover:text-text-primary font-[400]"
                  }`}
                  style={font}
                >
                  <span className="flex w-[16px] shrink-0 justify-center">{opt.icon}</span>
                  <span className="flex-1 truncate">{opt.label}</span>
                  {selected ? <CheckFill size={14} className="shrink-0 text-text-primary" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {notice ? (
        <div role="status" className="flex items-start gap-[6px] px-[4px] text-[11px] leading-snug text-text-primary/60" style={font}>
          {extras.translationStatus === "loading" && extras.showTranslation ? (
            <span className="mt-[2px] inline-block h-[9px] w-[9px] shrink-0 animate-spin rounded-full border-[1.5px] border-text-primary/25 border-t-text-primary/70" />
          ) : null}
          <span>{notice}</span>
        </div>
      ) : null}
    </div>
  );
}

// the romanized and translated lines hung under one lyric line; inherits the line's highlight
export function LyricLineExtras({
  romanized,
  translated,
  align,
}: {
  romanized: string | null | undefined;
  translated: string | null | undefined;
  align?: "left" | "right" | "center";
}) {
  if (!romanized && !translated) return null;
  return (
    <div className="mt-[4px] flex flex-col gap-[2px]" style={{ textAlign: align }}>
      {romanized ? (
        <div className="text-[15px] font-[500] leading-[1.3] opacity-80" style={{ letterSpacing: 0 }}>
          {romanized}
        </div>
      ) : null}
      {translated ? (
        <div className="text-[15px] font-[500] leading-[1.3] opacity-60 italic" style={{ letterSpacing: 0 }}>
          {translated}
        </div>
      ) : null}
    </div>
  );
}
