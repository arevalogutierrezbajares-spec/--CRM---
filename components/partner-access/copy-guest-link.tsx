"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

/**
 * Compact "copy the guest link" button for room-list / contact rows. Renders
 * nothing when there is no recoverable link (so old rooms simply don't show a
 * dead control — the room editor is where you regenerate to get one).
 */
export function CopyGuestLink({
  url,
  className = "",
}: {
  url: string | null;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!url) return null;

  async function copy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await navigator.clipboard.writeText(url!);
    setCopied(true);
    toast.success("Guest link copied");
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy guest link"
      aria-label="Copy guest link"
      className={`inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] ${className}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      Link
    </button>
  );
}
