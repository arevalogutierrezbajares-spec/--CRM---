"use client";

/**
 * Feature a product demo inside a partner room. Pick one of the workspace's
 * demos; it renders as a "Demo access" card on the room's public page. Pick
 * "None" to remove it.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setRoomDemoLinkAction } from "@/app/(app)/partner-access/actions";

export type DemoOption = {
  id: string;
  label: string;
  platformName: string;
};

export function RoomDemoPicker({
  roomId,
  selectedDemoLinkId,
  options,
}: {
  roomId: string;
  selectedDemoLinkId: string | null;
  options: DemoOption[];
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
    </div>
  );
}
