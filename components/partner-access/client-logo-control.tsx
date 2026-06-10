"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import { setRoomClientLogoAction } from "@/app/(app)/partner-access/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BrandLogo } from "@/db/queries/partner-access";

/**
 * Owner control for a room's co-branding: shows which project logos auto-appear
 * (your side, derived from shared docs) and lets you set the client's logo URL.
 */
export function ClientLogoControl({
  roomId,
  contactId,
  contactName,
  clientLogoUrl,
  brandLogos,
}: {
  roomId: string;
  contactId: string | null;
  contactName: string | null;
  clientLogoUrl: string | null;
  brandLogos: BrandLogo[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(clientLogoUrl ?? "");

  if (!contactId) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        Attach a contact to this room to add their logo.
      </p>
    );
  }

  function save(next: string | null) {
    startTransition(async () => {
      const res = await setRoomClientLogoAction({
        roomId,
        contactId: contactId as string,
        logoUrl: next,
      });
      if (res.ok) {
        toast.success(next ? "Client logo updated" : "Client logo removed");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const trimmed = value.trim();
  const dirty = trimmed !== (clientLogoUrl ?? "");

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          Your projects
        </p>
        {brandLogos.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Project logos appear here automatically once you share a document
            from a project that has a logo.
          </p>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {brandLogos.map((logo) => (
              <span
                key={logo.lobId}
                className="grid h-9 w-9 place-items-center overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)] p-1"
                title={logo.title}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logo.logoUrl}
                  alt={`${logo.title} logo`}
                  className="max-h-full max-w-full object-contain"
                />
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {contactName ? `${contactName}'s logo` : "Client logo"}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)]">
            {clientLogoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={clientLogoUrl}
                alt="Client logo"
                className="max-h-full max-w-full object-contain p-1"
              />
            ) : (
              <ImageIcon className="h-4 w-4 text-[var(--muted-foreground)]" />
            )}
          </span>
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (dirty) save(trimmed || null);
              }
            }}
            placeholder="https://… or /logos/client.svg"
            aria-label="Client logo URL"
            className="font-mono text-xs"
          />
          {clientLogoUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setValue("");
                save(null);
              }}
              aria-label="Remove client logo"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending || !dirty}
            onClick={() => save(trimmed || null)}
          >
            {pending ? "Saving…" : "Save logo"}
          </Button>
          <p className="text-xs text-[var(--muted-foreground)]">
            Paste an image URL. Shown to {contactName ?? "the client"} in every room.
          </p>
        </div>
      </div>
    </div>
  );
}
