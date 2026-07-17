import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { LinkedPartnerRoomRow } from "@/lib/platforms/linkage.server";
import type { ChipTone } from "@/lib/partner-access/platform-linkage";
import { shortId } from "@/lib/partner-access/platform-linkage";

const toneVariant: Record<
  ChipTone,
  "success" | "warning" | "danger" | "outline"
> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  outline: "outline",
};

/**
 * Live CaneyCloud ↔ VAV connection view driven by partner_rooms linkage columns.
 */
export function LinkageOverview({ rooms }: { rooms: LinkedPartnerRoomRow[] }) {
  return (
    <section
      className="rounded-lg border bg-card p-4 space-y-3"
      style={{ borderColor: "var(--border-default)" }}
      aria-labelledby="linkage-overview-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="linkage-overview-title"
            className="text-[15px] font-medium text-text-primary"
          >
            Live connection (partner rooms)
          </h2>
          <p className="text-[12px] text-text-secondary">
            CaneyCloud tenant/property ids + VAV mirror/listing status from CRM
            partner rooms. Edit on each room&apos;s Platform linkage form.
          </p>
        </div>
        <Link
          href="/partner-access"
          className="text-[12px] text-text-secondary hover:text-text-primary underline-offset-2 hover:underline shrink-0"
        >
          All rooms
        </Link>
      </div>

      {rooms.length === 0 ? (
        <p className="text-[12px] text-text-secondary rounded-md border border-dashed px-3 py-4">
          No partner rooms with platform linkage yet. Open a room → Platform
          linkage, or seed the Ucaima pilot ids from the close-loop checklist.
        </p>
      ) : (
        <ul className="space-y-2">
          {rooms.map((room) => (
            <li
              key={room.id}
              className="rounded-md border px-3 py-2.5 space-y-2"
              style={{ borderColor: "var(--border-default)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/partner-access/rooms/${room.id}`}
                  className="text-[13px] font-medium text-text-primary hover:underline underline-offset-2"
                >
                  {room.name}
                </Link>
                <span className="font-mono text-[11px] text-text-secondary tabular-nums">
                  {room.caneyPropertyId
                    ? shortId(room.caneyPropertyId, 8)
                    : shortId(room.vavPmsPropertyId, 8)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {room.chips.map((chip) => (
                  <Badge
                    key={chip.id}
                    variant={toneVariant[chip.tone]}
                    className="gap-1"
                  >
                    <span className="font-medium">{chip.label}</span>
                    <span className="opacity-75">{chip.detail}</span>
                  </Badge>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
