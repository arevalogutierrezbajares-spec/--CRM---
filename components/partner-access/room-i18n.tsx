"use client";

import { createContext, useContext, useMemo } from "react";
import {
  formatRoomRelative,
  getRoomDict,
  resolveRoomLocale,
  type RoomDict,
  type RoomLocale,
} from "@/lib/partner-room-i18n";

type RoomI18n = {
  /** The resolved dictionary for this room's language. */
  t: RoomDict;
  locale: RoomLocale;
  /** Locale-bound relative time — `rel(date)` instead of threading locale. */
  rel: (value: Date | string | number | null | undefined) => string;
};

const RoomI18nContext = createContext<RoomI18n | null>(null);

/**
 * Provides the guest-room dictionary + locale to every client component in the
 * room tree. The server page selects the room's `locale` and wraps the content;
 * leaf components call `useRoomI18n()` / `useRoomDict()` instead of receiving a
 * dict prop. Defaults to Spanish if a component renders outside a provider
 * (keeps prior behavior for any untouched surface).
 */
export function RoomI18nProvider({
  locale,
  children,
}: {
  locale: string | null | undefined;
  children: React.ReactNode;
}) {
  const value = useMemo<RoomI18n>(() => {
    const resolved = resolveRoomLocale(locale);
    return {
      t: getRoomDict(resolved),
      locale: resolved,
      rel: (v) => formatRoomRelative(v, resolved),
    };
  }, [locale]);
  return <RoomI18nContext.Provider value={value}>{children}</RoomI18nContext.Provider>;
}

export function useRoomI18n(): RoomI18n {
  const ctx = useContext(RoomI18nContext);
  if (ctx) return ctx;
  // Fallback for components rendered outside a provider — Spanish, matching the
  // pre-i18n default. Memo-free: the dict reference is stable per locale.
  const resolved = resolveRoomLocale("es");
  return {
    t: getRoomDict(resolved),
    locale: resolved,
    rel: (v) => formatRoomRelative(v, resolved),
  };
}

export function useRoomDict(): RoomDict {
  return useRoomI18n().t;
}
