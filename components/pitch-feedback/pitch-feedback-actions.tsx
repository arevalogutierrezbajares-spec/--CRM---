"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Ban, Brain, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  regeneratePitchFeedbackInsightAction,
  revokePitchFeedbackInviteAction,
} from "@/app/(app)/pitch-feedback/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function PitchFeedbackInviteActions({
  inviteId,
  contactId,
  canSummarize,
  revoked,
}: {
  inviteId: string;
  contactId: string;
  canSummarize: boolean;
  revoked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function revoke() {
    startTransition(async () => {
      const res = await revokePitchFeedbackInviteAction({ inviteId, contactId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Review link revoked");
      router.refresh();
    });
  }

  function summarize() {
    startTransition(async () => {
      const res = await regeneratePitchFeedbackInsightAction({ inviteId, contactId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("AI insight generated");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <Button asChild variant="ghost" size="sm" className="h-7 px-2">
        <Link href={`/pitch-feedback/invites/${inviteId}`}>
          <ExternalLink className="h-3.5 w-3.5" />
          Details
        </Link>
      </Button>
      {canSummarize && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          disabled={pending}
          onClick={summarize}
        >
          <Brain className="h-3.5 w-3.5" />
          AI
        </Button>
      )}
      {!revoked && (
        <ConfirmDialog
          title="Revoke this feedback link?"
          description="The contact's responses stay in the CRM, but the public link will no longer open."
          confirmLabel="Revoke"
          destructive
          onConfirm={revoke}
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
      )}
    </div>
  );
}
