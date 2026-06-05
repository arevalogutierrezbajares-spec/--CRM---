"use client";

import { useState, useTransition } from "react";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { regeneratePartnerRoomAccessLinkAction } from "@/app/(app)/partner-access/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import type { PartnerRoomStatus } from "@/lib/partner-access";
import { formatRelative } from "@/lib/utils";

export function RoomAccessLinkActions({
  roomId,
  status,
  hasAccessToken,
  tokenCreatedAt,
  lastViewedAt,
}: {
  roomId: string;
  status: PartnerRoomStatus;
  hasAccessToken: boolean;
  tokenCreatedAt: string | null;
  lastViewedAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [accessUrl, setAccessUrl] = useState<string | null>(null);

  function regenerate() {
    startTransition(async () => {
      const res = await regeneratePartnerRoomAccessLinkAction({ roomId });

      if (res.ok && res.accessPath) {
        setAccessUrl(`${window.location.origin}${res.accessPath}`);
        toast.success(hasAccessToken ? "Access link regenerated" : "Access link created");
        router.refresh();
      } else if (!res.ok) {
        toast.error(res.error);
      }
    });
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success("Access link copied");
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Fact label="Link" value={hasAccessToken ? "Configured" : "Not created"} />
        <Fact label="Last viewed" value={formatRelative(lastViewedAt)} />
        <Fact label="Issued" value={formatRelative(tokenCreatedAt)} />
        <Fact label="Room status" value={status} />
      </div>

      {status === "paused" && (
        <p className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-2 text-xs text-[var(--muted-foreground)]">
          The link can be copied, but partners will see an unavailable room until
          the room is active.
        </p>
      )}

      {accessUrl && (
        <div className="rounded-md border border-[var(--border)] p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <ExternalLink className="h-4 w-4" />
            One-time access URL
          </div>
          <div className="flex gap-2">
            <Input value={accessUrl} readOnly className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copy(accessUrl)}
            >
              <Copy className="h-4 w-4" />
              Copy
            </Button>
          </div>
        </div>
      )}

      {status === "revoked" ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Revoked rooms cannot issue new public access links.
        </p>
      ) : hasAccessToken ? (
        <ConfirmDialog
          title="Regenerate access link?"
          description="The current partner room URL will stop working. Copy the new URL before leaving this page."
          confirmLabel="Regenerate link"
          onConfirm={regenerate}
          trigger={(open) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={open}
            >
              <RefreshCw className="h-4 w-4" />
              Regenerate link
            </Button>
          )}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={regenerate}
        >
          <ExternalLink className="h-4 w-4" />
          Create access link
        </Button>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}
