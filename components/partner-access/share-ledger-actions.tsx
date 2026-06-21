"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { trackPartnerShareAction } from "@/app/(app)/partner-access/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Owner-side share control. Views and downloads are tracked automatically when
 * the recipient opens the link (recordPublicPartnerShareEvent), so this no
 * longer carries manual "mark viewed/downloaded" toggles — only Revoke, which
 * is a deliberate owner decision.
 */
export function ShareLedgerActions({
  shareId,
  revoked,
}: {
  shareId: string;
  revoked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function track(event: "viewed" | "downloaded" | "revoked") {
    startTransition(async () => {
      const res = await trackPartnerShareAction({ shareId, event });
      if (res.ok) {
        toast.success(event === "revoked" ? "Share revoked" : "Updated");
        router.refresh();
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
