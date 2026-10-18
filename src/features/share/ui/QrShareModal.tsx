import { useCallback, useEffect, useMemo, useState } from "react";
import { LuCopy, LuDownload, LuImage, LuTriangleAlert, LuRotateCcw } from "react-icons/lu";
import Dialog from "@/shared/ui/Dialog";
import Button from "@/shared/ui/Button";
import { ToggleSwitch, useToast } from "@/shared/ui";
import { PillTabs } from "@/shared/ui/PillTabs";
import CoverImage from "@/features/covers/ui/CoverImage";
import { useTranslation } from "@/languages";
import { buildShareUrl } from "@/shared/utils/share";
import { useQrShareStore } from "../store/qrShareStore";
import { qrContrastLevel, renderQrPng, type QrCover } from "../qr/qrImage";
import { qrRenderOptions, readThemeAccent, resolveQrColors, type QrStyle } from "../qr/qrStyle";
import { loadCoverPixels } from "../qr/coverPixels";

function fileSlug(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 48);
  return slug || "share";
}

function StyleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <span className="text-[12px] font-[500] text-text-tertiary">{label}</span>
      <div className="flex items-center gap-[8px] flex-wrap">{children}</div>
    </div>
  );
}

function ColourInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <input
      type="color"
      value={value}
      aria-label={label}
      title={label}
      onChange={(e) => onChange(e.target.value)}
      className="h-[28px] w-[36px] cursor-pointer rounded-md border border-border-alpha-14 bg-transparent p-[2px]"
    />
  );
}

export default function QrShareModal() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const item = useQrShareStore((s) => s.item);
  const close = useQrShareStore((s) => s.close);
  const style = useQrShareStore((s) => s.style);
  const setStyle = useQrShareStore((s) => s.setStyle);
  const resetStyle = useQrShareStore((s) => s.resetStyle);

  const url = useMemo(() => (item ? buildShareUrl(item.type, item.id) : ""), [item]);
  const [accent, setAccent] = useState<string | null>(null);
  const [cover, setCover] = useState<{ url: string; pixels: QrCover | null } | null>(null);
  const [png, setPng] = useState<{ blob: Blob; src: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (item) setAccent(readThemeAccent());
  }, [item]);

  const coverUrl = item?.coverUrl;
  const wantsCover = style.background === "cover" && !!coverUrl;
  useEffect(() => {
    if (!wantsCover || !coverUrl || cover?.url === coverUrl) return;
    let cancelled = false;
    void loadCoverPixels(coverUrl).then((pixels) => {
      if (!cancelled) setCover({ url: coverUrl, pixels });
    });
    return () => {
      cancelled = true;
    };
  }, [wantsCover, coverUrl, cover?.url]);

  const coverLoaded = !!cover && cover.url === coverUrl;
  const coverPixels = coverLoaded ? cover.pixels : null;
  const coverPending = wantsCover && !coverLoaded;
  const coverFailed = wantsCover && coverLoaded && !cover.pixels;

  const colors = useMemo(() => resolveQrColors(style, accent), [style, accent]);
  const contrast = qrContrastLevel(colors);
  const blocked = contrast === "blocked";

  useEffect(() => {
    if (!url || coverPending) return;
    let cancelled = false;
    setFailed(false);
    renderQrPng(url, qrRenderOptions(style, accent, coverPixels))
      .then((blob) => {
        if (cancelled) return;
        const src = URL.createObjectURL(blob);
        // keep the old image up until the restyled one is ready
        setPng((prev) => {
          if (prev) URL.revokeObjectURL(prev.src);
          return { blob, src };
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url, style, accent, coverPixels, coverPending]);

  useEffect(() => {
    if (item) return;
    setPng((prev) => {
      if (prev) URL.revokeObjectURL(prev.src);
      return null;
    });
  }, [item]);

  const handleCopyLink = useCallback(() => {
    if (!url) return;
    navigator.clipboard
      ?.writeText(url)
      .then(() => toast(t("common.link_copied"), "checkmark", { description: item?.title }))
      .catch(() => toast(t("qr_share.copy_failed"), "error"));
  }, [url, item, toast, t]);

  const handleSave = useCallback(() => {
    if (!png || !item || blocked) return;
    // Electron answers an <a download> with its native save dialog
    const a = document.createElement("a");
    a.href = png.src;
    a.download = `liner-${item.type}-${fileSlug(item.title)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [png, item, blocked]);

  const handleCopyImage = useCallback(async () => {
    if (!png || blocked) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png.blob })]);
      toast(t("qr_share.image_copied"), "checkmark", { description: item?.title });
    } catch {
      toast(t("qr_share.copy_failed"), "error");
    }
  }, [png, item, blocked, toast, t]);

  const set = <K extends keyof QrStyle>(key: K) => (value: QrStyle[K]) => setStyle({ [key]: value } as Partial<QrStyle>);
  const actionClass = "!h-auto !gap-[4px] !px-[6px] !py-[8px] !text-[12px] flex-col";

  return (
    <Dialog open={!!item} onOpenChange={(next) => (!next ? close() : undefined)} maxWidth={640}>
      {item && (
        <div className="flex flex-col sm:flex-row gap-[20px] px-[20px] pb-[20px] overflow-y-auto" data-testid="qr-share-modal">
          <div className="flex flex-col w-full sm:w-[264px] shrink-0 min-w-0">
            <div className="flex items-center gap-[12px] mb-[14px] min-w-0">
              <div
                className={`relative h-[44px] w-[44px] shrink-0 overflow-hidden bg-border-alpha-14 ${
                  item.type === "artist" ? "rounded-full" : "rounded-md"
                }`}
              >
                {item.coverUrl && (
                  <CoverImage
                    src={item.coverUrl}
                    alt={item.title}
                    fill
                    sizes="44px"
                    className="object-cover"
                    draggable={false}
                  />
                )}
              </div>
              <div className="flex flex-col min-w-0 gap-[2px]">
                <h3
                  className="text-[15px] font-[600] text-text-primary m-0 truncate"
                  style={{ fontFamily: "var(--font-inter), sans-serif", letterSpacing: "-0.01em" }}
                >
                  {item.title}
                </h3>
                {item.subtitle && (
                  <span className="text-[12px] text-text-tertiary truncate">{item.subtitle}</span>
                )}
              </div>
            </div>

            {/* modules always sit on white so phone cameras read them in any theme */}
            <div className="mx-auto flex h-[248px] w-[248px] items-center justify-center rounded-lg bg-white overflow-hidden">
              {png ? (
                <img
                  src={png.src}
                  alt={t("qr_share.title")}
                  data-qr-url={url}
                  className="h-[248px] w-[248px]"
                  draggable={false}
                />
              ) : failed ? (
                <span className="px-[16px] text-center text-[12px] text-black/60">
                  {t("qr_share.render_failed")}
                </span>
              ) : (
                <span className="inline-block h-[18px] w-[18px] rounded-full border-[2px] border-black/15 border-t-black/60 animate-spin" />
              )}
            </div>

            <p className="mt-[10px] mb-0 text-center text-[12px] text-text-tertiary">{t("qr_share.hint")}</p>
            <p
              className="mt-[4px] mb-[14px] text-center text-[12px] text-text-secondary break-all select-text"
              data-testid="qr-share-url"
            >
              {url}
            </p>

            <div className="grid grid-cols-3 gap-[8px]">
              <Button variant="secondary" onClick={handleCopyLink} className={actionClass}>
                <LuCopy size={15} />
                {t("qr_share.copy_link")}
              </Button>
              <Button variant="secondary" onClick={handleSave} disabled={!png || blocked} className={actionClass}>
                <LuDownload size={15} />
                {t("qr_share.save_png")}
              </Button>
              <Button variant="secondary" onClick={handleCopyImage} disabled={!png || blocked} className={actionClass}>
                <LuImage size={15} />
                {t("qr_share.copy_image")}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-[14px] flex-1 min-w-0" data-testid="qr-style-picker">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-[600] text-text-primary">{t("qr_share.style")}</span>
              <Button variant="ghost" size="sm" onClick={resetStyle} className="!h-[28px] !px-[8px] !gap-[4px] !text-[12px]">
                <LuRotateCcw size={13} />
                {t("qr_share.reset_style")}
              </Button>
            </div>

            <StyleRow label={t("qr_share.modules")}>
              <PillTabs
                variant="solid"
                size="sm"
                activeTab={style.modules}
                onChange={set("modules")}
                tabs={[
                  { id: "square", label: t("qr_share.modules_square") },
                  { id: "rounded", label: t("qr_share.modules_rounded") },
                  { id: "dots", label: t("qr_share.modules_dots") },
                ]}
              />
            </StyleRow>

            <StyleRow label={t("qr_share.eyes")}>
              <PillTabs
                variant="solid"
                size="sm"
                activeTab={style.eyes}
                onChange={set("eyes")}
                tabs={[
                  { id: "square", label: t("qr_share.eyes_square") },
                  { id: "rounded", label: t("qr_share.eyes_rounded") },
                ]}
              />
            </StyleRow>

            <StyleRow label={t("qr_share.colour")}>
              <PillTabs
                variant="solid"
                size="sm"
                activeTab={style.colour}
                onChange={set("colour")}
                tabs={[
                  { id: "black", label: t("qr_share.colour_black") },
                  { id: "accent", label: t("qr_share.colour_accent") },
                  { id: "custom", label: t("qr_share.colour_custom") },
                ]}
              />
              {style.colour === "custom" && (
                <ColourInput value={style.custom} onChange={set("custom")} label={t("qr_share.colour_custom")} />
              )}
            </StyleRow>

            <label className="flex items-center justify-between gap-[12px] text-[13px] text-text-secondary">
              <span className="flex items-center gap-[8px]">
                {t("qr_share.gradient")}
                {style.gradient && (
                  <ColourInput value={style.gradientTo} onChange={set("gradientTo")} label={t("qr_share.gradient_to")} />
                )}
              </span>
              <ToggleSwitch checked={style.gradient} onChange={set("gradient")} ariaLabel={t("qr_share.gradient")} />
            </label>

            <StyleRow label={t("qr_share.background")}>
              <PillTabs
                variant="solid"
                size="sm"
                activeTab={style.background}
                onChange={set("background")}
                tabs={[
                  { id: "white", label: t("qr_share.background_white") },
                  { id: "cover", label: t("qr_share.background_cover"), disabled: !item.coverUrl },
                ]}
              />
            </StyleRow>
            {coverFailed && <span className="-mt-[8px] text-[12px] text-text-tertiary">{t("qr_share.cover_unavailable")}</span>}

            <label className="flex items-center justify-between gap-[12px] text-[13px] text-text-secondary">
              {t("qr_share.show_logo")}
              <ToggleSwitch checked={style.logo} onChange={set("logo")} ariaLabel={t("qr_share.show_logo")} />
            </label>

            {contrast !== "ok" && (
              <div
                role="alert"
                data-contrast={contrast}
                className={`flex items-start gap-[8px] rounded-md px-[10px] py-[8px] text-[12px] leading-snug ${
                  blocked ? "bg-red-500/10 text-red-500" : "bg-accent-warning/10 text-accent-warning"
                }`}
              >
                <LuTriangleAlert size={14} className="mt-[1px] shrink-0" />
                {blocked ? t("qr_share.contrast_blocked") : t("qr_share.contrast_low")}
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
