"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteMeetingAction } from "@/app/(app)/meetings/actions";

/** Delete the current meeting from its detail page, then return to the list. */
export function MeetingDeleteButton({
  meetingId,
  title,
}: {
  meetingId: string;
  title: string;
}) {
  const router = useRouter();

  return (
    <ConfirmDialog
      title="Delete this meeting?"
      description={
        <>
          <span className="font-medium text-[var(--foreground)]">{title}</span> and
          its attendee touches will be removed. Notes shared to partner rooms and
          call recordings are kept. This can&apos;t be undone.
        </>
      }
      confirmLabel="Delete meeting"
      destructive
      onConfirm={async () => {
        const res = await deleteMeetingAction(meetingId);
        if (res.ok) {
          toast.success("Meeting deleted");
          router.push("/meetings");
        } else {
          toast.error(res.error);
        }
      }}
      trigger={(open) => (
        <Button
          variant="outline"
          size="sm"
          onClick={open}
          className="gap-1.5 text-[var(--destructive)] hover:bg-[var(--destructive)]/10 hover:text-[var(--destructive)]"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      )}
    />
  );
}
