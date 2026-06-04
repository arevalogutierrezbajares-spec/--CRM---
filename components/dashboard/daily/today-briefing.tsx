"use client";

import { motion } from "framer-motion";
import { Sparkles, AlertTriangle, CalendarClock, Ban, CheckCircle2 } from "lucide-react";

/**
 * The "knows your day" banner — full-width at the top of Home. Surfaces the
 * AI-computed triage (overdue / next meeting / blocked) as the first thing the
 * eye lands on, so Home opens by telling you what needs you.
 */
function iconFor(bullet: string) {
  const b = bullet.toLowerCase();
  if (b.includes("overdue")) return AlertTriangle;
  if (b.includes("meeting")) return CalendarClock;
  if (b.includes("blocked")) return Ban;
  return Sparkles;
}

export function TodayBriefing({ greeting, bullets }: { greeting: string; bullets: string[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-xl border-l-[3px] border-y border-r px-4 py-3"
      style={{
        background: "var(--ai-bg)",
        borderLeftColor: "var(--purple-mid)",
        borderTopColor: "var(--ai-border)",
        borderRightColor: "var(--ai-border)",
        borderBottomColor: "var(--ai-border)",
      }}
    >
      <div className="flex items-center gap-1.5">
        <Sparkles size={14} style={{ color: "var(--ai-text)" }} />
        <span className="text-[13px] font-medium" style={{ color: "var(--ai-text)" }}>
          {greeting}
        </span>
      </div>

      {bullets.length === 0 ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-text-secondary">
          <CheckCircle2 size={13} className="text-green-mid" />
          Nothing pressing — clear runway. Good time to get ahead.
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
          {bullets.map((b, i) => {
            const Icon = iconFor(b);
            return (
              <motion.div
                key={b}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
                className="flex items-center gap-1.5 text-[12.5px]"
                style={{ color: "var(--ai-subtext)" }}
              >
                <Icon size={13} className="shrink-0" style={{ color: "var(--ai-text)" }} />
                <span>{b}</span>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
