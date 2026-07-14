"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, DoorOpen, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { shareProjectLinkAction } from "@/app/(app)/partner-access/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PARTNER_KIND_OPTIONS,
  PARTNER_PERMISSION_OPTIONS,
  PARTNER_SHARE_CHANNEL_OPTIONS,
  type PartnerKind,
  type PartnerPermission,
  type PartnerShareChannel,
} from "@/lib/partner-access";

export type ShareContactOption = {
  id: string;
  name: string;
  organization: string | null;
  relationshipType: "friend" | "lead" | "partner" | "prospect";
};

export type ShareableProjectLink = {
  id: string;
  label: string;
  kind: "note" | "link" | "file" | "doc";
};

function defaultPartnerKind(contact?: ShareContactOption): PartnerKind {
  if (!contact) return "strategic";
  if (contact.relationshipType === "partner") return "strategic";
  if (contact.relationshipType === "lead") return "client";
  return "strategic";
}

export function ShareLinkModal({
  projectId,
  link,
  contacts,
  open,
  onOpenChange,
}: {
  projectId: string;
  link: ShareableProjectLink | null;
  contacts: ShareContactOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [partnerKind, setPartnerKind] = useState<PartnerKind>(
    defaultPartnerKind(contacts[0]),
  );
  const [channel, setChannel] = useState<PartnerShareChannel>("manual");
  const [permissions, setPermissions] = useState<PartnerPermission[]>([
    "view",
    "download",
  ]);
  const [expiresAt, setExpiresAt] = useState("");
  const [message, setMessage] = useState("");
  const [accessUrl, setAccessUrl] = useState<string | null>(null);
  const [roomPath, setRoomPath] = useState<string | null>(null);
  const shareComplete = Boolean(accessUrl || roomPath);

  function togglePermission(permission: PartnerPermission, checked: boolean) {
    if (permission === "view") return;
    setPermissions((current) => {
      const next = new Set(current);
      if (checked) next.add(permission);
      else next.delete(permission);
      next.add("view");
      return Array.from(next);
    });
  }

  function submit() {
    if (!link) return;
    if (!contactId) {
      toast.error("Choose a contact");
      return;
    }
    startTransition(async () => {
      const res = await shareProjectLinkAction({
        projectId,
        projectLinkId: link.id,
        contactId,
        partnerKind,
        channel,
        permissions,
        expiresAt: expiresAt || null,
        message: message || null,
      });
      if (res.ok) {
        toast.success("Partner share logged");
        if (res.accessPath) {
          const url = `${window.location.origin}${res.accessPath}`;
          setAccessUrl(url);
          setRoomPath(null);
        } else {
          setRoomPath(`/partner-access/rooms/${res.roomId}`);
        }
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setAccessUrl(null);
          setRoomPath(null);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share to Partner Access</DialogTitle>
          <DialogDescription>
            {link ? link.label : "Select a document to share."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {accessUrl && (
            <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-3">
              <div className="text-sm font-medium">Access room created</div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Share it with your partner — you can copy it again anytime from
                the room.
              </p>
              <div className="mt-2 flex gap-2">
                <Input value={accessUrl} readOnly className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(accessUrl);
                    toast.success("Access link copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </div>
            </div>
          )}

          {roomPath && (
            <div className="rounded-md border border-[var(--border)] bg-[var(--secondary)] p-3">
              <div className="text-sm font-medium">Material added to room</div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                This partner already has a room. Open room controls to copy or
                rotate the partner URL before sending it.
              </p>
              <div className="mt-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={roomPath}>
                    <DoorOpen className="h-4 w-4" />
                    Open room
                  </Link>
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Contact</Label>
            <Select
              value={contactId}
              onValueChange={(value) => {
                setContactId(value);
                setPartnerKind(
                  defaultPartnerKind(
                    contacts.find((contact) => contact.id === value),
                  ),
                );
              }}
              disabled={shareComplete}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose contact" />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.name}
                    {contact.organization ? ` · ${contact.organization}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Partner type</Label>
              <Select
                value={partnerKind}
                onValueChange={(value) => setPartnerKind(value as PartnerKind)}
                disabled={shareComplete}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTNER_KIND_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Channel</Label>
              <Select
                value={channel}
                onValueChange={(value) => setChannel(value as PartnerShareChannel)}
                disabled={shareComplete}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTNER_SHARE_CHANNEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Permissions</Label>
            <div className="grid grid-cols-2 gap-2">
              {PARTNER_PERMISSION_OPTIONS.map((option) => {
                const checked = permissions.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={option.value === "view" || pending || shareComplete}
                      onCheckedChange={(value) =>
                        togglePermission(option.value, Boolean(value))
                      }
                    />
                    <ShieldCheck className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="partner-share-expires">Expires</Label>
            <Input
              id="partner-share-expires"
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              disabled={shareComplete}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="partner-share-message">Message</Label>
            <Textarea
              id="partner-share-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Optional internal note or send context"
              rows={3}
              disabled={shareComplete}
            />
          </div>

          {contacts.length === 0 && (
            <p className="text-sm text-[var(--destructive)]">
              Add a contact before sharing partner access.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant={accessUrl ? "outline" : "ghost"}
            onClick={() => {
              setAccessUrl(null);
              setRoomPath(null);
              onOpenChange(false);
            }}
            disabled={pending}
          >
            {shareComplete ? "Done" : "Cancel"}
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={pending || !link || contacts.length === 0 || shareComplete}
          >
            <Send className="h-4 w-4" />
            Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
