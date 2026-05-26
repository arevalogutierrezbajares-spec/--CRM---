"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTouch } from "@/app/(app)/touches/actions";

type Channel =
  | "email"
  | "whatsapp"
  | "call"
  | "meeting"
  | "voice_memo"
  | "manual"
  | "obsidian";

export function TouchForm({
  contactId,
  projectId,
}: {
  contactId: string;
  projectId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<Channel>("manual");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!body.trim()) return;
        startTransition(async () => {
          const res = await createTouch({
            contactId,
            projectId: projectId ?? null,
            channel,
            body,
          });
          if (!res.ok) {
            setError(res.error);
            toast.error(res.error);
            return;
          }
          toast.success("Touch logged");
          setBody("");
          router.refresh();
        });
      }}
      className="space-y-3"
    >
      <div className="flex items-end gap-2">
        <div className="w-36 space-y-1">
          <Label htmlFor="touch-channel">Channel</Label>
          <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
            <SelectTrigger id="touch-channel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual note</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="call">Call</SelectItem>
              <SelectItem value="meeting">Meeting</SelectItem>
              <SelectItem value="voice_memo">Voice memo</SelectItem>
              <SelectItem value="obsidian">Obsidian</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="touch-body">Note</Label>
        <Textarea
          id="touch-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What happened? Quick context for future you."
        />
      </div>
      {error && (
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      )}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!body.trim()}
          loading={pending}
          loadingText="Saving…"
        >
          Add touch
        </Button>
      </div>
    </form>
  );
}
