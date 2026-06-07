"use client";

import { useMemo, useState, useTransition } from "react";
import { Copy, Link2, Send, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createPitchFeedbackInviteAction,
  markPitchFeedbackInviteSentAction,
} from "@/app/(app)/pitch-feedback/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import type { PitchFeedbackCampaign } from "@/db/queries/pitch-feedback";

const CHANNELS = [
  { value: "link", label: "Copy link" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "signal", label: "Signal" },
  { value: "manual", label: "Manual" },
];

export function SendInviteDialog({
  contactId,
  contactName,
  campaigns,
}: {
  contactId: string;
  contactName: string;
  campaigns: PitchFeedbackCampaign[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "default");
  const [channel, setChannel] = useState("link");
  const [expiresAt, setExpiresAt] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().slice(0, 10);
  });
  const [welcomeNote, setWelcomeNote] = useState(
    `${contactName}, I would value your honest read on this. Move through it when you have a few minutes and react as you go.`,
  );
  const [sendMessage, setSendMessage] = useState(
    `Hey ${contactName.split(" ")[0] || contactName} - I made a private walkthrough and would really value your honest feedback. It is silent, quick, and you can react as you go:`,
  );
  const [generated, setGenerated] = useState<{
    inviteId: string;
    accessPath: string;
  } | null>(null);

  const absoluteUrl = useMemo(() => {
    if (!generated?.accessPath || typeof window === "undefined") return "";
    return `${window.location.origin}${generated.accessPath}`;
  }, [generated]);

  function createLink() {
    startTransition(async () => {
      const res = await createPitchFeedbackInviteAction({
        contactId,
        campaignId: campaignId === "default" ? null : campaignId,
        channel,
        expiresAt,
        welcomeNote,
        sendMessage,
      });
      if (!res.ok || !res.accessPath) {
        toast.error(res.ok ? "Link generation failed" : res.error);
        return;
      }
      setGenerated({ inviteId: res.id, accessPath: res.accessPath });
      toast.success("Private feedback link generated");
      router.refresh();
    });
  }

  function copyAndMarkSent() {
    if (!generated) return;
    startTransition(async () => {
      const url = `${window.location.origin}${generated.accessPath}`;
      await navigator.clipboard.writeText(url);
      const res = await markPitchFeedbackInviteSentAction({
        inviteId: generated.inviteId,
        contactId,
        channel,
        message: sendMessage,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(channel === "link" ? "Link copied and tracked" : "Invite marked sent");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 px-3">
          <Sparkles className="h-4 w-4" />
          Create link
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create private review link</DialogTitle>
          <DialogDescription>
            Generate a unique F&F pitch walkthrough for {contactName}. The raw
            link is shown once; tracking rolls back to this contact.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fnf-campaign">Campaign</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger id="fnf-campaign">
                  <SelectValue placeholder="Default F&F campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.length === 0 && (
                    <SelectItem value="default">Default F&F review</SelectItem>
                  )}
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fnf-channel">Delivery channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger id="fnf-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fnf-expiry">Expires</Label>
            <Input
              id="fnf-expiry"
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fnf-welcome">Recipient welcome</Label>
            <Textarea
              id="fnf-welcome"
              value={welcomeNote}
              onChange={(event) => setWelcomeNote(event.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fnf-message">Send message snapshot</Label>
            <Textarea
              id="fnf-message"
              value={sendMessage}
              onChange={(event) => setSendMessage(event.target.value)}
              rows={3}
            />
          </div>

          {generated && (
            <div className="rounded-lg bg-[var(--secondary)] p-3 shadow-[inset_0_0_0_1px_var(--border)]">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Link2 className="h-4 w-4" />
                Unique link ready
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input readOnly value={absoluteUrl} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={copyAndMarkSent}
                  disabled={pending}
                >
                  <Copy className="h-4 w-4" />
                  Copy + track
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button type="button" onClick={createLink} loading={pending}>
            <Send className="h-4 w-4" />
            Generate private link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
