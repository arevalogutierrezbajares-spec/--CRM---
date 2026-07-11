"use client";

import { createContext, useContext, useState } from "react";

/**
 * Same-page live counters for the room hero chips ("N pasos para ti",
 * "N firmas pendientes"). The server render seeds the counts; client
 * interactions (step toggles, signatures) update them so the hero never
 * contradicts the section the guest just acted in.
 *
 * `router.refresh()` re-renders the page with fresh server counts — the
 * provider adopts them (adjust-state-during-render pattern) because every
 * client mutation was persisted before the refresh, so server wins.
 */
type RoomActivity = {
  openSteps: number;
  setOpenSteps: (count: number) => void;
  pendingSignatures: number;
  signatureSigned: () => void;
};

const RoomActivityContext = createContext<RoomActivity | null>(null);

/** Null outside the provider (e.g. the owner preview page) — callers no-op. */
export function useRoomActivity() {
  return useContext(RoomActivityContext);
}

export function RoomActivityProvider({
  initialOpenSteps,
  initialPendingSignatures,
  children,
}: {
  initialOpenSteps: number;
  initialPendingSignatures: number;
  children: React.ReactNode;
}) {
  const [steps, setSteps] = useState({
    seed: initialOpenSteps,
    value: initialOpenSteps,
  });
  const [signatures, setSignatures] = useState({
    seed: initialPendingSignatures,
    value: initialPendingSignatures,
  });

  // Server refresh delivered new counts — adopt them during render.
  if (steps.seed !== initialOpenSteps) {
    setSteps({ seed: initialOpenSteps, value: initialOpenSteps });
  }
  if (signatures.seed !== initialPendingSignatures) {
    setSignatures({
      seed: initialPendingSignatures,
      value: initialPendingSignatures,
    });
  }

  return (
    <RoomActivityContext.Provider
      value={{
        openSteps: steps.value,
        setOpenSteps: (count) =>
          setSteps((prev) => ({ ...prev, value: Math.max(0, count) })),
        pendingSignatures: signatures.value,
        signatureSigned: () =>
          setSignatures((prev) => ({
            ...prev,
            value: Math.max(0, prev.value - 1),
          })),
      }}
    >
      {children}
    </RoomActivityContext.Provider>
  );
}
