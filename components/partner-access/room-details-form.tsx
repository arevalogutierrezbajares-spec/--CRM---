"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { updatePartnerRoomDetailsAction } from "@/app/(app)/partner-access/actions";
import { Button } from "@/components/ui/button";
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
  type PartnerKind,
} from "@/lib/partner-access";
import { LanguageSelect } from "@/components/partner-access/language-select";

export type RoomDetailsFormValue = {
  id: string;
  name: string;
  partnerKind: PartnerKind;
  language: string;
  summary: string | null;
  welcomeMessage: string | null;
  expiresAt: string | null;
};

function toDateInput(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

export function RoomDetailsForm({ room }: { room: RoomDetailsFormValue }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(room.name);
  const [partnerKind, setPartnerKind] = useState<PartnerKind>(room.partnerKind);
  const [language, setLanguage] = useState(room.language);
  const [summary, setSummary] = useState(room.summary ?? "");
  const [welcomeMessage, setWelcomeMessage] = useState(
    room.welcomeMessage ?? "",
  );
  const [expiresAt, setExpiresAt] = useState(toDateInput(room.expiresAt));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const res = await updatePartnerRoomDetailsAction({
        roomId: room.id,
        name,
        partnerKind,
        language,
        summary,
        welcomeMessage,
        expiresAt: expiresAt || null,
      });

      if (res.ok) {
        toast.success("Room details updated");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="partner-room-name">Room name</Label>
        <Input
          id="partner-room-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Partner room name"
          disabled={pending}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Partner type</Label>
          <Select
            value={partnerKind}
            onValueChange={(value) => setPartnerKind(value as PartnerKind)}
            disabled={pending}
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

        <LanguageSelect
          id="partner-room-language"
          value={language}
          onChange={setLanguage}
          label="Room language"
          disabled={pending}
        />

        <div className="space-y-2">
          <Label htmlFor="partner-room-expires">Room expires</Label>
          <Input
            id="partner-room-expires"
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            disabled={pending}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="partner-room-summary">Internal summary</Label>
        <Textarea
          id="partner-room-summary"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="What this partner should understand about the relationship."
          rows={3}
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="partner-room-welcome">Partner welcome message</Label>
        <Textarea
          id="partner-room-welcome"
          value={welcomeMessage}
          onChange={(event) => setWelcomeMessage(event.target.value)}
          placeholder="Short note shown at the top of their access room."
          rows={3}
          disabled={pending}
        />
      </div>

      <Button type="submit" size="sm" disabled={pending || !name.trim()}>
        <Save className="h-4 w-4" />
        {pending ? "Saving..." : "Save room"}
      </Button>
    </form>
  );
}
