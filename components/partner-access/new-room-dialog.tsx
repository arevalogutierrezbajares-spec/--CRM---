"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, DoorOpen, Plus } from "lucide-react";
import { toast } from "sonner";
import { createPartnerRoomAction } from "@/app/(app)/partner-access/actions";
import { Button } from "@/components/ui/button";
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
import { PARTNER_KIND_OPTIONS } from "@/lib/partner-access";
import { LanguageSelect } from "@/components/partner-access/language-select";

export type NewRoomContactOption = {
  id: string;
  name: string;
  organization: string | null;
};

/**
 * Create a client/partner room directly — no document required. When a
 * single contact is passed (contact page) the picker is hidden.
 */
export function NewRoomDialog({
  contacts,
  fixedContact,
  triggerLabel = "New room",
  triggerVariant = "outline",
}: {
  contacts?: NewRoomContactOption[];
  fixedContact?: NewRoomContactOption;
  triggerLabel?: string;
  triggerVariant?: "outline" | "default" | "ghost";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState(fixedContact?.id ?? "");
  const [partnerKind, setPartnerKind] = useState("client");
  const [language, setLanguage] = useState("es");
  const [name, setName] = useState("");
  const [accessUrl, setAccessUrl] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedContact =
    fixedContact ?? (contacts ?? []).find((c) => c.id === contactId) ?? null;

  function create() {
    if (!selectedContact) {
      toast.error("Pick a contact first");
      return;
    }
    startTransition(async () => {
      const res = await createPartnerRoomAction({
        contactId: selectedContact.id,
        partnerKind,
        language,
        name: name.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.existed) {
        toast.info("A room for this contact already exists — opening it");
        setOpen(false);
        router.push(`/partner-access/rooms/${res.roomId}`);
        return;
      }
      setRoomId(res.roomId);
      setAccessUrl(
        res.accessPath ? `${window.location.origin}${res.accessPath}` : null,
      );
      toast.success("Room created");
      router.refresh();
    });
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success("Access link copied");
  }

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setAccessUrl(null);
      setRoomId(null);
      setName("");
      if (!fixedContact) setContactId("");
    }
  }

  return (
    <>
      <Button type="button" variant={triggerVariant} size="sm" onClick={() => reset(true)}>
        <Plus className="h-4 w-4" />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={reset}>
        <DialogContent className="max-w-md">
          {accessUrl !== null || roomId ? (
            <>
              <DialogHeader>
                <DialogTitle>Room ready</DialogTitle>
                <DialogDescription>
                  Send this private link to {selectedContact?.name ?? "your contact"}.
                  You can add documents and a 4-digit code from the room page.
                </DialogDescription>
              </DialogHeader>
              {accessUrl && (
                <div className="space-y-1.5">
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
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Share this with your partner. You can view and copy it again
                    anytime from the room&rsquo;s page.
                  </p>
                </div>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    reset(false);
                    if (roomId) router.push(`/partner-access/rooms/${roomId}`);
                  }}
                >
                  <DoorOpen className="h-4 w-4" />
                  Open room
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>New client room</DialogTitle>
                <DialogDescription>
                  A private workspace with its own sign-in link — share documents,
                  messages, and next steps with one contact.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                {!fixedContact &&
                  ((contacts ?? []).length === 0 ? (
                    <div className="rounded-md border border-dashed border-[var(--border)] p-3 text-sm">
                      <p className="font-medium">No contacts yet</p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        A room belongs to a contact.{" "}
                        <Link
                          href="/contacts"
                          className="font-medium text-[var(--foreground)] underline"
                        >
                          Add a contact
                        </Link>{" "}
                        first, then create their room.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label htmlFor="new-room-contact">Contact</Label>
                      <Select value={contactId} onValueChange={setContactId}>
                        <SelectTrigger id="new-room-contact">
                          <SelectValue placeholder="Pick a contact" />
                        </SelectTrigger>
                        <SelectContent>
                          {(contacts ?? []).map((contact) => (
                            <SelectItem key={contact.id} value={contact.id}>
                              {contact.name}
                              {contact.organization ? ` — ${contact.organization}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-room-kind">Relationship</Label>
                    <Select value={partnerKind} onValueChange={setPartnerKind}>
                      <SelectTrigger id="new-room-kind">
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

                  <LanguageSelect
                    id="new-room-language"
                    value={language}
                    onChange={setLanguage}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-room-name">Room name</Label>
                  <Input
                    id="new-room-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={
                      selectedContact ? `${selectedContact.name} Room` : "Room name"
                    }
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => reset(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={create}
                  disabled={pending || !selectedContact}
                >
                  {pending ? "Creating…" : "Create room"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
