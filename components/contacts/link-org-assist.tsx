"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { resolveContactOrg } from "@/app/(app)/contacts/actions";

/**
 * Shown on a person whose `organization` is still free text (no structured
 * primaryOrgId link). One click matches/creates the org entity and links it, so
 * the org becomes a real, navigable record (and the person shows up in the
 * org's Team list).
 */
export function LinkOrgAssist({
  contactId,
  organization,
}: {
  contactId: string;
  organization: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function link() {
    start(async () => {
      const res = await resolveContactOrg(contactId);
      if (res.ok) {
        toast.success("Linked to organization");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <span className="mt-1 inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
      {organization}
      <button
        type="button"
        onClick={link}
        disabled={pending}
        title="Make this organization a linked record"
        className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] hover:bg-[var(--secondary)] disabled:opacity-50"
      >
        <Link2 className="h-3 w-3" />
        {pending ? "Linking…" : "Link as org"}
      </button>
    </span>
  );
}
