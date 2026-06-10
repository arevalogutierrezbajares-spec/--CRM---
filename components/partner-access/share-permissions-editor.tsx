"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateSharePermissionsAction } from "@/app/(app)/partner-access/actions";
import type { PartnerPermission } from "@/lib/partner-access";

const EDITABLE: PartnerPermission[] = ["download", "comment", "upload"];

/**
 * Click-to-toggle permission chips on a share. "view" is the baseline and not
 * removable; download/comment/upload flip in place, optimistically.
 */
export function SharePermissionsEditor({
  shareId,
  permissions,
  disabled,
}: {
  shareId: string;
  permissions: PartnerPermission[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState<PartnerPermission[]>(permissions);

  function toggle(permission: PartnerPermission) {
    const has = current.includes(permission);
    const next = has
      ? current.filter((p) => p !== permission)
      : [...current, permission];
    const previous = current;
    setCurrent(next);
    startTransition(async () => {
      const res = await updateSharePermissionsAction({
        shareId,
        permissions: next,
      });
      if (!res.ok) {
        setCurrent(previous);
        toast.error(res.error);
      } else {
        toast.success(has ? `${permission} disabled` : `${permission} enabled`);
        router.refresh();
      }
    });
  }

  if (disabled) {
    return (
      <div className="flex flex-wrap gap-1">
        {current.map((permission) => (
          <span
            key={permission}
            className="inline-flex items-center rounded bg-[var(--secondary)] px-1.5 py-0.5 text-[10px] text-[var(--secondary-foreground)]"
          >
            {permission}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="inline-flex min-h-[24px] items-center rounded bg-[var(--secondary)] px-2 py-1 text-[10px] text-[var(--secondary-foreground)]">
        view
      </span>
      {EDITABLE.map((permission) => {
        const active = current.includes(permission);
        return (
          <button
            key={permission}
            type="button"
            disabled={pending}
            onClick={() => toggle(permission)}
            aria-pressed={active}
            title={active ? `Remove ${permission}` : `Allow ${permission}`}
            className={`inline-flex min-h-[24px] items-center rounded px-2 py-1 text-[10px] transition disabled:opacity-50 ${
              active
                ? "bg-[var(--secondary)] text-[var(--secondary-foreground)] ring-1 ring-inset ring-[var(--border)]"
                : "border border-dashed border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {active ? permission : `+ ${permission}`}
          </button>
        );
      })}
    </div>
  );
}
