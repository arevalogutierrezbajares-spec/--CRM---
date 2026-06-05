"use client";

import { useTransition } from "react";
import { Ban, CheckCheck, Eye } from "lucide-react";
import { toast } from "sonner";
import { trackPartnerShareAction } from "@/app/(app)/partner-access/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function ShareLedgerActions({
  shareId,
  viewed,
  downloaded,
  revoked,
}: {
  shareId: string;
  viewed: boolean;
  downloaded: boolean;
  revoked: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function track(event: "viewed" | "downloaded" | "revoked") {
    startTransition(async () => {
      const res = await trackPartnerShareAction({ shareId, event });
      if (res.ok) {
        const label =
          event === "viewed"
            ? "Marked viewed"
            : event === "downloaded"
              ? "Marked downloaded"
              : "Share revoked";
        toast.success(label);
      } else {
        toast.error(res.error);
      }
    });
  }

  if (revoked) {
    return (
      <span className="text-[11px] text-[var(--muted-foreground)]">
        No active access
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        disabled={pending || viewed}
        onClick={() => track("viewed")}
      >
        <Eye className="h-3.5 w-3.5" />
        Viewed
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        disabled={pending || downloaded}
        onClick={() => track("downloaded")}
      >
        <CheckCheck className="h-3.5 w-3.5" />
        Downloaded
      </Button>
      <ConfirmDialog
        title="Revoke this share?"
        description="The share will stay in the ledger, but it will no longer count as active access."
        confirmLabel="Revoke"
        destructive
        onConfirm={() => track("revoked")}
        trigger={(open) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[var(--destructive)]"
            disabled={pending}
            onClick={open}
          >
            <Ban className="h-3.5 w-3.5" />
            Revoke
          </Button>
        )}
      />
    </div>
  );
}
