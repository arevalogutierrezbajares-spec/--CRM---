"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Share2 } from "lucide-react";
import { setPresentationShareAction } from "@/app/(app)/presentations/actions";

export function ShareControls({
  presentationId,
  initialEnabled,
  initialToken,
}: {
  presentationId: string;
  initialEnabled: boolean;
  initialToken: string | null;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [token, setToken] = useState(initialToken);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const path = token ? `/p/${token}` : "";
  const displayLink = token ? (base ? `${base}${path}` : path) : "";

  function toggle(next: boolean) {
    start(async () => {
      const res = await setPresentationShareAction(presentationId, next);
      if (res.ok) {
        setEnabled(next);
        setToken(res.shareToken);
        setOpen(next);
      } else {
        toast.error(res.error);
      }
    });
  }

  function copy() {
    const abs =
      (base || (typeof window !== "undefined" ? window.location.origin : "")) +
      path;
    navigator.clipboard?.writeText(abs);
    toast.success("Share link copied");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (enabled ? setOpen((o) => !o) : toggle(true))}
        disabled={pending}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
          enabled ? "bg-emerald-500 text-white" : "bg-white/10 text-white/80 hover:bg-white/20"
        }`}
      >
        <Share2 className="h-3.5 w-3.5" />
        {enabled ? "Shared" : "Share"}
      </button>

      {open && enabled && (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-lg border border-black/10 bg-white p-3 text-black shadow-xl">
          <p className="text-xs text-black/60">
            Anyone with this link can view and comment:
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              readOnly
              value={displayLink}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-black/10 px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={copy}
              className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-black text-white"
              aria-label="Copy link"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => toggle(false)}
            className="mt-2 text-xs text-red-500 hover:text-red-600"
          >
            Stop sharing
          </button>
        </div>
      )}
    </div>
  );
}
