"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRoomDict } from "@/components/partner-access/room-i18n";

/**
 * Time-aware welcome headline. The server can't know the guest's local hour, so
 * we render the neutral "Te damos la bienvenida" on the server + first paint
 * (no hydration mismatch), then swap to a "Buenos días/tardes/noches" greeting
 * in the viewer's own timezone once mounted. The swap fades gently in so it
 * reads as the room coming to life, not a flash of changing text. Reduced motion
 * collapses the fade to instant via the app-wide MotionConfig.
 */
function greetingKey(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 19) return "afternoon";
  return "evening";
}

export function LiveGreeting({
  firstName,
  subline,
  className,
  sublineOnVideo = false,
}: {
  firstName: string | null;
  subline?: string | null;
  className?: string;
  sublineOnVideo?: boolean;
}) {
  const t = useRoomDict();
  const base = t.greeting.neutral;
  const [lead, setLead] = useState(base);

  // setState lives in an async rAF callback (not the effect body) to satisfy the
  // repo's no-setState-in-effect rule; it also defers the time read to the
  // client so the server/first-paint text stays neutral (no hydration drift).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setLead(t.greeting[greetingKey(new Date().getHours())]);
    });
    return () => cancelAnimationFrame(id);
  }, [t]);

  const timeAware = lead !== base;

  return (
    <>
      <h1 className={className}>
        <motion.span
          key={lead}
          initial={timeAware ? { opacity: 0, y: 6 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="inline-block"
        >
          {firstName ? t.greeting.withName(lead, firstName) : lead}
        </motion.span>
      </h1>
      {subline && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          className={`mt-2 inline-flex items-center gap-2 text-sm ${
            sublineOnVideo ? "text-white/75" : "text-[var(--muted-foreground)]"
          }`}
        >
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          {subline}
        </motion.p>
      )}
    </>
  );
}
