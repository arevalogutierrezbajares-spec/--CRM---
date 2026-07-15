"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Save } from "lucide-react";
import { toast } from "sonner";
import { updatePartnerRoomDetailsAction } from "@/app/(app)/partner-access/actions";
import { Badge } from "@/components/ui/badge";
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
  CANEY_ONBOARDING_STATUSES,
  deriveLinkageChips,
  type CaneyOnboardingStatus,
  type ChipTone,
} from "@/lib/partner-access/platform-linkage";
import type { PartnerKind } from "@/lib/partner-access";

export type PlatformLinkageFormValue = {
  id: string;
  name: string;
  partnerKind: PartnerKind;
  language: string;
  summary: string | null;
  welcomeMessage: string | null;
  expiresAt: string | null;
  caneyTenantId: string | null;
  caneyPropertyId: string | null;
  vavPmsPropertyId: string | null;
  vavListingId: string | null;
  caneyOnboardingStatus: string | null;
  integrationNotes: string | null;
};

const STATUS_LABELS: Record<CaneyOnboardingStatus, string> = {
  not_started: "Not started",
  configured: "Configured (PMS)",
  awaiting_channel: "Awaiting VAV channel",
  live: "Live on VAV",
  blocked: "Blocked",
};

function chipVariant(tone: ChipTone) {
  if (tone === "success") return "success" as const;
  if (tone === "warning") return "warning" as const;
  if (tone === "danger") return "danger" as const;
  return "outline" as const;
}

export function PlatformLinkageForm({ room }: { room: PlatformLinkageFormValue }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [caneyTenantId, setCaneyTenantId] = useState(room.caneyTenantId ?? "");
  const [caneyPropertyId, setCaneyPropertyId] = useState(room.caneyPropertyId ?? "");
  const [vavPmsPropertyId, setVavPmsPropertyId] = useState(room.vavPmsPropertyId ?? "");
  const [vavListingId, setVavListingId] = useState(room.vavListingId ?? "");
  const [status, setStatus] = useState(room.caneyOnboardingStatus ?? "");
  const [notes, setNotes] = useState(room.integrationNotes ?? "");

  const chips = useMemo(
    () =>
      deriveLinkageChips({
        caneyTenantId: caneyTenantId || null,
        caneyPropertyId: caneyPropertyId || null,
        vavPmsPropertyId: vavPmsPropertyId || null,
        vavListingId: vavListingId || null,
        caneyOnboardingStatus: status || null,
      }),
    [caneyTenantId, caneyPropertyId, vavPmsPropertyId, vavListingId, status],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      // Preserve identity fields; this action still requires the full details payload.
      const res = await updatePartnerRoomDetailsAction({
        roomId: room.id,
        name: room.name,
        partnerKind: room.partnerKind,
        language: room.language,
        summary: room.summary,
        welcomeMessage: room.welcomeMessage,
        expiresAt: room.expiresAt ? room.expiresAt.slice(0, 10) : null,
        caneyTenantId,
        caneyPropertyId,
        vavPmsPropertyId,
        vavListingId,
        caneyOnboardingStatus: status || null,
        integrationNotes: notes,
      });

      if (res.ok) {
        toast.success("Platform linkage saved");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="h-4 w-4 text-[var(--muted-foreground)]" />
        {chips.map((chip) => (
          <Badge key={chip.id} variant={chipVariant(chip.tone)} title={chip.detail}>
            {chip.label}: {chip.detail}
          </Badge>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="caney-tenant-id">CaneyCloud tenant id</Label>
          <Input
            id="caney-tenant-id"
            value={caneyTenantId}
            onChange={(e) => setCaneyTenantId(e.target.value)}
            placeholder="UUID"
            className="font-mono text-xs"
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="caney-property-id">CaneyCloud property id</Label>
          <Input
            id="caney-property-id"
            value={caneyPropertyId}
            onChange={(e) => setCaneyPropertyId(e.target.value)}
            placeholder="UUID"
            className="font-mono text-xs"
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vav-pms-property-id">VAV pms_property_id</Label>
          <Input
            id="vav-pms-property-id"
            value={vavPmsPropertyId}
            onChange={(e) => setVavPmsPropertyId(e.target.value)}
            placeholder="Same as Caney property id, or vav-pending-…"
            className="font-mono text-xs"
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vav-listing-id">VAV listing id / slug</Label>
          <Input
            id="vav-listing-id"
            value={vavListingId}
            onChange={(e) => setVavListingId(e.target.value)}
            placeholder="Optional"
            className="font-mono text-xs"
            disabled={pending}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Onboarding / go-live status</Label>
        <Select
          value={status || "__none__"}
          onValueChange={(v) => setStatus(v === "__none__" ? "" : v)}
          disabled={pending}
        >
          <SelectTrigger>
            <SelectValue placeholder="Unset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Unset</SelectItem>
            {CANEY_ONBOARDING_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="integration-notes">Integration notes</Label>
        <Textarea
          id="integration-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. packages live in CC; channel not connected; VAV shell is vav-pending"
          rows={3}
          disabled={pending}
        />
      </div>

      <Button type="submit" size="sm" disabled={pending}>
        <Save className="h-4 w-4" />
        {pending ? "Saving…" : "Save linkage"}
      </Button>
    </form>
  );
}
