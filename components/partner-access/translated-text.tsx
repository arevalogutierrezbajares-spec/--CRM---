"use client";

import { useState } from "react";
import { useRoomI18n } from "./room-i18n";
import type { RoomLocale } from "@/lib/partner-room-i18n";

// Toggle labels live here (not in RoomDict) because they only ever appear on
// machine-translated content — i.e. in pt/ru/ar rooms — and are a peripheral
// affordance. Keyed by the room locale from context.
const LABELS: Record<RoomLocale, { showOriginal: string; showTranslation: string }> = {
  es: { showOriginal: "Ver original", showTranslation: "Ver traducción" },
  en: { showOriginal: "Show original", showTranslation: "Show translation" },
  pt: { showOriginal: "Ver original", showTranslation: "Ver tradução" },
  ru: { showOriginal: "Показать оригинал", showTranslation: "Показать перевод" },
  ar: { showOriginal: "عرض النص الأصلي", showTranslation: "عرض الترجمة" },
};

/**
 * Renders machine-translated operator content with a subtle "show original"
 * toggle. When `original` is empty or identical to `display` (e.g. es/en rooms,
 * or nothing was translated), it renders plain text with no toggle — so it's
 * safe to use everywhere, translated or not.
 */
export function TranslatedText({
  display,
  original,
  className,
}: {
  display: string;
  original: string;
  className?: string;
}) {
  const { locale } = useRoomI18n();
  const [showOriginal, setShowOriginal] = useState(false);

  const hasToggle =
    original.trim() !== "" && original.trim() !== display.trim();
  const text = showOriginal ? original : display;
  const labels = LABELS[locale] ?? LABELS.es;

  return (
    <span className={className}>
      {text}
      {hasToggle && (
        <button
          type="button"
          onClick={() => setShowOriginal((v) => !v)}
          className="ms-2 align-baseline text-[11px] font-medium text-[var(--primary)] underline decoration-dotted underline-offset-2 hover:opacity-80"
        >
          {showOriginal ? labels.showTranslation : labels.showOriginal}
        </button>
      )}
    </span>
  );
}
