"use client";

import { useTransition } from "react";
import { Ban, Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updatePartnerRoomStatusAction } from "@/app/(app)/partner-access/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { PartnerRoomStatus } from "@/lib/partner-access";

export function RoomStatusActions({
  roomId,
  status,
}: {
  roomId: string;
  status: PartnerRoomStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function update(statusValue: PartnerRoomStatus) {
    startTransition(async () => {
      const res = await updatePartnerRoomStatusAction({
        roomId,
        status: statusValue,
      });

      if (res.ok) {
        toast.success(`Room ${statusValue}`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (status === "revoked") {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        This room is revoked. Share a project asset again to create a new access room.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant={status === "active" ? "secondary" : "outline"}
        size="sm"
        disabled={pending || status === "active"}
        onClick={() => update("active")}
      >
        <Play className="h-4 w-4" />
        Activate
      </Button>
      <Button
        type="button"
        variant={status === "paused" ? "secondary" : "outline"}
        size="sm"
        disabled={pending || status === "paused"}
        onClick={() => update("paused")}
      >
        <Pause className="h-4 w-4" />
        Pause
      </Button>
      <ConfirmDialog
        title="Revoke this room?"
        description="The public access room will stop working and all active shares in the room will be marked revoked."
        confirmLabel="Revoke room"
        destructive
        onConfirm={() => update("revoked")}
        trigger={(open) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-[var(--destructive)]"
            disabled={pending}
            onClick={open}
          >
            <Ban className="h-4 w-4" />
            Revoke
          </Button>
        )}
      />
    </div>
  );
}
