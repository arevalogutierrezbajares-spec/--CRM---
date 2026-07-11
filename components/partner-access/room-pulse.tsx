"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const HEARTBEAT_MS = 60_000;
const REFRESH_MS = 45_000;

/**
 * Keeps an open room alive without websockets: a presence heartbeat (so "en
 * línea ahora" in La alianza is honest) plus a periodic `router.refresh()`
 * that re-renders the server snapshot — new team messages, steps and documents
 * appear while the guest is looking. Both only run while the tab is visible;
 * returning to the tab pings + refreshes immediately.
 */
export function RoomPulse({ token }: { token: string }) {
  const router = useRouter();

  useEffect(() => {
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void fetch(`/api/access/${token}/heartbeat`, { method: "POST" }).catch(
        () => {},
      );
    };
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    beat();
    const beatId = setInterval(beat, HEARTBEAT_MS);
    const refreshId = setInterval(refresh, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        beat();
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(beatId);
      clearInterval(refreshId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, router]);

  return null;
}
