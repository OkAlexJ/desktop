import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ShareEntityType } from "@/shared/utils/share";
import { DEFAULT_QR_STYLE, normalizeQrStyle, type QrStyle } from "../qr/qrStyle";

export interface QrShareItem {
  type: ShareEntityType;
  id: string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
}

interface QrShareState {
  item: QrShareItem | null;
  style: QrStyle;
  open: (item: QrShareItem) => void;
  close: () => void;
  setStyle: (patch: Partial<QrStyle>) => void;
  resetStyle: () => void;
}

export const useQrShareStore = create<QrShareState>()(
  persist(
    (set) => ({
      item: null,
      style: DEFAULT_QR_STYLE,
      open: (item) => set({ item }),
      close: () => set({ item: null }),
      setStyle: (patch) => set((s) => ({ style: normalizeQrStyle({ ...s.style, ...patch }) })),
      resetStyle: () => set({ style: DEFAULT_QR_STYLE }),
    }),
    {
      name: "liner_qr_style_v1",
      partialize: (s) => ({ style: s.style }),
      merge: (persisted, current) => ({
        ...current,
        style: normalizeQrStyle((persisted as { style?: Partial<QrStyle> } | undefined)?.style),
      }),
    },
  ),
);

export const openQrShare = (item: QrShareItem) => useQrShareStore.getState().open(item);
