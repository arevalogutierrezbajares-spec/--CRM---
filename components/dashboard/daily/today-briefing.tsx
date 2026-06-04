"use client";

import { motion } from "framer-motion";
import { Sparkles, CheckCircle2 } from "lucide-react";

/**
 * The greeting banner at the top of Home. The actionable triage (overdue / next
 * meeting / blocked) lives in the "Needs you now" lane just below — so this is
 * intentionally just the greeting, plus a "clear runway" note when nothing is
 * pressing. `hasUrgent` is the count of items the lane is showing, so the two
 * never say the same thing twice.
 */
export function TodayBriefing({ greeting, hasUrgent }: { greeting: string; hasUrgent: boolean }) {
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

      {!hasUrgent && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-text-secondary">
          <CheckCircle2 size={13} className="text-green-mid" />
          Nothing pressing — clear runway. Good time to get ahead.
        </div>
      )}
    </motion.div>
  );
}
