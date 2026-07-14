"use client";

/**
 * Feature a product demo inside a partner room. Pick one of the workspace's
 * demos; it renders as a "Demo access" card on the room's public page. Pick
 * "None" to remove it.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { setRoomDemoLinkAction } from "@/app/(app)/partner-access/actions";

export type DemoOption = {
  id: string;
  label: string;
  platformName: string;
};

export type SelectedDemo = {
  id: string;
  label: string;
  url: string | null;
  username: string | null;
  password: string | null;
  shareUrl: string | null;
};

export function RoomDemoPicker({
  roomId,
  selectedDemoLinkId,
  options,
  selectedDemo = null,
}: {
  roomId: string;
  selectedDemoLinkId: string | null;
  options: DemoOption[];
  selectedDemo?: SelectedDemo | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(selectedDemoLinkId ?? "");

  function onChange(next: string) {
    setValue(next);
    startTransition(async () => {
      const res = await setRoomDemoLinkAction({
        roomId,
        demoLinkId: next || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        setValue(selectedDemoLinkId ?? "");
        return;
      }
      toast.success(next ? "Demo featured in this room" : "Demo removed");
      router.refresh();
    });
  }

  if (options.length === 0) {
    return (
      <p className="text-[13px] text-[var(--muted-foreground)]">
        No demos yet. Add one in{" "}
        <a href="/platforms" className="underline hover:text-[var(--foreground)]">
          Platform Management → Demo links
        </a>
        , then feature it here.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        className="h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-2.5 text-[13px] outline-none focus:ring-1 focus:ring-[var(--ring)] disabled:opacity-50"
      >
        <option value="">None</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.platformName} · {o.label}
          </option>
        ))}
      </select>
      <p className="text-[12px] text-[var(--muted-foreground)]">
        Shows a copy-ready demo account + launch button at the top of the room.
      </p>

      {/* The featured demo's actual account — view + copy right here, no trip to
          Platform Management. Reflects the saved selection (refreshes on change). */}
      {selectedDemo && (value === selectedDemo.id) && (
        <div className="mt-1 space-y-1.5 rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium">{selectedDemo.label}</span>
            {selectedDemo.url && (
              <a
                href={selectedDemo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-[var(--primary)] hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Open
              </a>
            )}
          </div>
          {selectedDemo.url && <DemoField label="URL" value={selectedDemo.url} />}
          {selectedDemo.username && (
            <DemoField label="User" value={selectedDemo.username} />
          )}
          {selectedDemo.password && (
            <DemoField label="Pass" value={selectedDemo.password} mono />
          )}
          {selectedDemo.shareUrl && (
            <DemoField label="Share" value={selectedDemo.shareUrl} />
          )}
        </div>
      )}
    </div>
  );
}

function DemoField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(`${label} copied`);
    // Reset the check glyph shortly after; a stale check reads as "still copied".
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-[12px] ${mono ? "font-mono" : ""}`}
        title={value}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="shrink-0 rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
