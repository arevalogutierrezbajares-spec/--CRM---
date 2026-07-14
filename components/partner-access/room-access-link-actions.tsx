"use client";

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
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
  guestUrl,
  tokenCreatedAt,
  lastViewedAt,
}: {
  roomId: string;
  status: PartnerRoomStatus;
  hasAccessToken: boolean;
  /** Decrypted, re-copyable guest link — null for rooms minted before storage. */
  guestUrl: string | null;
  tokenCreatedAt: string | null;
  lastViewedAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Freshly-minted link shows immediately; otherwise the persisted one is used.
  const [justMinted, setJustMinted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const shownUrl = justMinted ?? guestUrl;

  function regenerate() {
    startTransition(async () => {
      const res = await regeneratePartnerRoomAccessLinkAction({ roomId });
      if (res.ok && res.accessPath) {
        setJustMinted(`${window.location.origin}${res.accessPath}`);
        toast.success(hasAccessToken ? "Access link regenerated" : "Access link created");
        router.refresh();
      } else if (!res.ok) {
        toast.error(res.error);
      }
    });
  }

  async function copy() {
    if (!shownUrl) return;
    await navigator.clipboard.writeText(shownUrl);
    setCopied(true);
    toast.success("Guest link copied");
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Fact
          label="Link"
          value={shownUrl ? "Ready" : hasAccessToken ? "Regenerate to view" : "Not created"}
        />
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

      {shownUrl ? (
        <div className="rounded-md border border-[var(--border)] p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <ExternalLink className="h-4 w-4" />
            Guest link
          </div>
          <div className="flex gap-2">
            <Input value={shownUrl} readOnly className="font-mono text-xs" />
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              Copy
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open(shownUrl, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-4 w-4" />
              Open
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
            Share this with your partner — it stays here, copy it anytime. Only you
            (signed in) can see it.
          </p>
        </div>
      ) : hasAccessToken ? (
        <p className="rounded-md border border-dashed border-[var(--border)] p-2 text-xs text-[var(--muted-foreground)]">
          This room&rsquo;s link predates copy-from-here. The current link still
          works; regenerate once to get a copyable link (that replaces the old one).
        </p>
      ) : null}

      {status === "revoked" ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Revoked rooms cannot issue new public access links.
        </p>
      ) : hasAccessToken ? (
        <ConfirmDialog
          title="Regenerate access link?"
          description="The current partner room URL will stop working and be replaced by a new one. Anyone holding the old link loses access."
          confirmLabel="Regenerate link"
          onConfirm={regenerate}
          trigger={(open) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={open}
              className="text-[var(--muted-foreground)]"
            >
              <RefreshCw className="h-4 w-4" />
              Regenerate (invalidates current)
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
