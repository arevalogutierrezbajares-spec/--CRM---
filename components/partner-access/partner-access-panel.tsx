import Link from "next/link";
import { ChevronRight, DoorOpen, FileText, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ShareLedgerActions } from "@/components/partner-access/share-ledger-actions";
import type { PartnerAccessOverview } from "@/db/queries/partner-access";
import {
  partnerKindLabel,
  partnerShareChannelLabel,
} from "@/lib/partner-access";
import { formatRelative } from "@/lib/utils";

function statusVariant(status: string) {
  if (status === "active") return "success";
  if (status === "paused" || status === "draft") return "warning";
  if (status === "revoked") return "danger";
  return "outline";
}

export function PartnerAccessPanel({
  access,
}: {
  access: PartnerAccessOverview;
}) {
  const lastShare = access.shares[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <DoorOpen className="h-4 w-4" />
            Partner Access
          </span>
          <Button asChild variant="ghost" size="sm" className="h-7 px-2">
            <Link href="/partner-access">Open</Link>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {access.rooms.length === 0 && access.shares.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--border)] p-3">
            <p className="text-sm font-medium">No access shared yet.</p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Share a project document to create the first room and ledger entry.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <SummaryTile label="Rooms" value={access.rooms.length} />
              <SummaryTile
                label="Last share"
                value={lastShare ? formatRelative(lastShare.sharedAt) : "never"}
              />
            </div>

            {access.rooms.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  Rooms
                </div>
                <ul className="space-y-1.5">
                  {access.rooms.slice(0, 3).map((room) => (
                    <li key={room.id}>
                      <Link
                        href={`/partner-access/rooms/${room.id}`}
                        className="block rounded-md border border-[var(--border)] bg-[var(--background)] p-2 hover:bg-[var(--accent)]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {room.name}
                            </div>
                            <div className="text-xs text-[var(--muted-foreground)]">
                              {partnerKindLabel(room.partnerKind)} · {room.shareCount} shared
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Badge variant={statusVariant(room.status)}>
                              {room.status}
                            </Badge>
                            <ChevronRight className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {access.shares.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                    Share ledger
                  </div>
                  <ul className="space-y-2">
                    {access.shares.slice(0, 5).map((share) => (
                      <li key={share.id} className="space-y-1">
                        <div className="flex items-start gap-2">
                          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm">
                              {share.liveLabel ?? share.labelSnapshot}
                            </div>
                            <div className="text-xs text-[var(--muted-foreground)]">
                              {share.projectTitle ?? "Project"} · {partnerShareChannelLabel(share.channel)} · {formatRelative(share.sharedAt)}
                            </div>
                          </div>
                          {share.revokedAt ? (
                            <Badge variant="danger">revoked</Badge>
                          ) : share.downloadedAt ? (
                            <Badge variant="success">downloaded</Badge>
                          ) : share.viewedAt ? (
                            <Badge variant="success">viewed</Badge>
                          ) : (
                            <Badge variant="outline">sent</Badge>
                          )}
                        </div>
                        <div className="ml-5 flex flex-wrap gap-1">
                          {share.permissions.map((permission) => (
                            <span
                              key={permission}
                              className="inline-flex items-center gap-1 rounded bg-[var(--secondary)] px-1.5 py-0.5 text-[10px] text-[var(--secondary-foreground)]"
                            >
                              <ShieldCheck className="h-2.5 w-2.5" />
                              {permission}
                            </span>
                          ))}
                        </div>
                        <div className="ml-5">
                          <ShareLedgerActions
                            shareId={share.id}
                            viewed={Boolean(share.viewedAt)}
                            downloaded={Boolean(share.downloadedAt)}
                            revoked={Boolean(share.revokedAt)}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}
