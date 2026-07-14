"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRoomActivity } from "@/components/partner-access/room-activity-context";
import { useRoomDict } from "@/components/partner-access/room-i18n";

/**
 * The hero's action chips, live-wired to the room activity context: checking a
 * step or signing a document updates (or removes) the chip the guest clicked
 * from. Falls back to the server-seeded counts outside the provider.
 */
export function HeroActionChips({
  initialOpenSteps,
  initialPendingSignatures,
  onVideo,
}: {
  initialOpenSteps: number;
  initialPendingSignatures: number;
  onVideo: boolean;
}) {
  const t = useRoomDict();
  const activity = useRoomActivity();
  const openSteps = activity?.openSteps ?? initialOpenSteps;
  const pendingSignatures =
    activity?.pendingSignatures ?? initialPendingSignatures;

  const chipClass = `inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ${
    onVideo
      ? "border-white/25 bg-white/10 text-white backdrop-blur hover:bg-white/20 focus-visible:ring-white/80"
      : "border-[var(--border)] bg-[var(--background)]/60 backdrop-blur hover:bg-[var(--secondary)] focus-visible:ring-[var(--ring)]"
  }`;

  return (
    <AnimatePresence initial={false}>
      {openSteps > 0 && (
        <motion.a
          key="steps"
          href="#pasos"
          className={chipClass}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.25 }}
        >
          <ChipCount value={openSteps} />
          {t.chips.steps(openSteps)}
          <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
        </motion.a>
      )}
      {pendingSignatures > 0 && (
        <motion.a
          key="signatures"
          href="#repositorio"
          className={chipClass}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.25 }}
        >
          <ChipCount value={pendingSignatures} />
          {t.chips.signatures(pendingSignatures)}
          <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
        </motion.a>
      )}
    </AnimatePresence>
  );
}

/** Amber counter badge whose digit flips when the count changes. */
function ChipCount({ value }: { value: number }) {
  return (
    <span className="relative grid h-5 w-5 place-items-center overflow-hidden rounded-full bg-amber-400/90 text-[11px] font-semibold tabular-nums text-amber-950">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
