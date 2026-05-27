import Link from "next/link";
import { Heart } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { DashBadge, type BadgeVariant } from "../shared/badge";
import type { RelationshipRow } from "@/db/queries/dashboard";

interface RelationshipHealthProps {
  rows: RelationshipRow[];
}

const BAND_BADGE: Record<
  RelationshipRow["band"],
  { variant: BadgeVariant; label: string; barClass: string }
> = {
  warm: { variant: "green", label: "warm", barClass: "bg-green-mid" },
  neutral: { variant: "amber", label: "neutral", barClass: "bg-amber-mid" },
  cold: { variant: "red", label: "cold", barClass: "bg-red-mid" },
};

export function RelationshipHealth({ rows }: RelationshipHealthProps) {
  return (
    <DashCard>
      <SectionLabel
        icon={Heart}
        right={
          <Link
            href="/contacts"
            className="text-tiny text-text-secondary hover:text-text-primary"
          >
            All
          </Link>
        }
      >
        Relationships
      </SectionLabel>

      {rows.length === 0 ? (
        <p className="text-[12px] py-3 text-text-secondary">No contacts yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const meta = BAND_BADGE[r.band];
            return (
              <li key={r.contactId} className="flex items-center gap-2">
                <Link
                  href={`/contacts/${r.contactId}`}
                  className="text-[12px] text-text-primary truncate flex-1 hover:underline"
                >
                  {r.name}
                </Link>
                <div className="h-1 w-12 rounded-full bg-surface overflow-hidden shrink-0">
                  <div
                    className={`h-full rounded-full ${meta.barClass}`}
                    style={{ width: `${r.score}%` }}
                  />
                </div>
                <DashBadge variant={meta.variant} className="shrink-0">
                  {meta.label}
                </DashBadge>
              </li>
            );
          })}
        </ul>
      )}
    </DashCard>
  );
}
