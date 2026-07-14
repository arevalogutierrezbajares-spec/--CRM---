import Link from "next/link";
import { ChevronRight, DoorOpen, FileText, UsersRound } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DbBanner } from "@/components/db-banner";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { ShareLedgerActions } from "@/components/partner-access/share-ledger-actions";
import { requireUser } from "@/lib/current-user";
import { safeRead } from "@/lib/db-status";
import { formatRelative } from "@/lib/utils";
import {
  partnerKindLabel,
  partnerShareChannelLabel,
} from "@/lib/partner-access";
import { listPartnerAccessDashboard } from "@/db/queries/partner-access";
import { partnerRoomGuestUrl } from "@/lib/partner-room-link.server";
import { CopyGuestLink } from "@/components/partner-access/copy-guest-link";
import { listContacts } from "@/db/queries/contacts";
import { NewRoomDialog } from "@/components/partner-access/new-room-dialog";

function statusVariant(status: string) {
  if (status === "active") return "success";
  if (status === "paused" || status === "draft") return "warning";
  if (status === "revoked") return "danger";
  return "outline";
}

export default async function PartnerAccessPage() {
  const user = await requireUser();
  const [accessRes, contactsRes] = await Promise.all([
    safeRead(
      () => listPartnerAccessDashboard({ workspaceId: user.workspaceId }),
      { rooms: [], shares: [] },
    ),
    safeRead(() => listContacts({ workspaceId: user.workspaceId }), []),
  ]);
  const access = accessRes.data;
  const contactOptions = contactsRes.data.map((contact) => ({
    id: contact.id,
    name: contact.name,
    organization: contact.organization,
  }));
  const activeShares = access.shares.filter((share) => !share.revokedAt);
  const viewedShares = access.shares.filter((share) => share.viewedAt);
  const downloadedShares = access.shares.filter((share) => share.downloadedAt);

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Partner Access
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">
              Control what partners receive, see activity, and keep a clean ledger
              across creative, capital, strategic, operating, and advisor relationships.
            </p>
          </div>
          <NewRoomDialog contacts={contactOptions} />
        </div>

        {!accessRes.ok && <DbBanner error={accessRes.error} />}

        <div className="grid gap-3 md:grid-cols-4">
          <Summary label="Rooms" value={access.rooms.length} />
          <Summary label="Active shares" value={activeShares.length} />
          <Summary label="Viewed" value={viewedShares.length} />
          <Summary label="Downloaded" value={downloadedShares.length} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DoorOpen className="h-4 w-4" />
                Rooms
              </CardTitle>
            </CardHeader>
            <CardContent>
              {access.rooms.length === 0 ? (
                <EmptyState
                  title="No rooms yet"
                  body="Share a project document from Links & Documents to create the first room automatically."
                />
              ) : (
                <ul className="space-y-2">
                  {access.rooms.map((room) => (
                    <li key={room.id}>
                      <Link
                        href={`/partner-access/rooms/${room.id}`}
                        className="block rounded-md border border-[var(--border)] p-3 hover:bg-[var(--accent)]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {room.name}
                            </div>
                            <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                              {partnerKindLabel(room.partnerKind)} · {room.shareCount} shares
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {(room.pendingSignatures ?? 0) > 0 ? (
                              <Badge variant="warning">
                                {room.pendingSignatures} awaiting signature
                              </Badge>
                            ) : (room.signedSignatures ?? 0) > 0 ? (
                              <Badge variant="success">signed</Badge>
                            ) : null}
                            <Badge variant={statusVariant(room.status)}>
                              {room.status}
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-[var(--muted-foreground)]" />
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]">
                          <span>
                            Last activity{" "}
                            {formatRelative(room.lastActivityAt ?? room.updatedAt)}
                          </span>
                          <CopyGuestLink
                            url={partnerRoomGuestUrl(room.publicAccessTokenEnc)}
                          />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Share Ledger
              </CardTitle>
            </CardHeader>
            <CardContent>
              {access.shares.length === 0 ? (
                <EmptyState
                  title="Nothing shared"
                  body="Start from a project file, doc, or link. Every share will appear here with status and controls."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                      <tr>
                        <th className="py-2 pr-4 font-medium">Asset</th>
                        <th className="py-2 pr-4 font-medium">Partner</th>
                        <th className="py-2 pr-4 font-medium">Channel</th>
                        <th className="py-2 pr-4 font-medium">Status</th>
                        <th className="py-2 pr-4 font-medium">Shared</th>
                        <th className="py-2 font-medium">Controls</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {access.shares.map((share) => (
                        <tr key={share.id} className="align-top">
                          <td className="py-3 pr-4">
                            <div className="max-w-[260px] truncate font-medium">
                              {share.liveLabel ?? share.labelSnapshot}
                            </div>
                            <div className="text-xs text-[var(--muted-foreground)]">
                              {share.projectTitle ?? "Project"} · {share.kindSnapshot}
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            {share.contactId ? (
                              <Link
                                href={`/contacts/${share.contactId}`}
                                className="font-medium hover:underline"
                              >
                                {share.contactName ?? "Contact"}
                              </Link>
                            ) : (
                              <span className="text-[var(--muted-foreground)]">
                                Contact removed
                              </span>
                            )}
                            <div className="text-xs text-[var(--muted-foreground)]">
                              {share.roomId ? (
                                <Link
                                  href={`/partner-access/rooms/${share.roomId}`}
                                  className="hover:underline"
                                >
                                  {share.roomName ?? "Room"}
                                </Link>
                              ) : (
                                "No room"
                              )}
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            {partnerShareChannelLabel(share.channel)}
                          </td>
                          <td className="py-3 pr-4">
                            {share.revokedAt ? (
                              <Badge variant="danger">revoked</Badge>
                            ) : share.downloadedAt ? (
                              <Badge variant="success">downloaded</Badge>
                            ) : share.viewedAt ? (
                              <Badge variant="success">viewed</Badge>
                            ) : (
                              <Badge variant="outline">sent</Badge>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                            {formatRelative(share.sharedAt)}
                          </td>
                          <td className="py-3">
                            <ShareLedgerActions
                              shareId={share.id}
                              revoked={Boolean(share.revokedAt)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        <UsersRound className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--border)] p-5">
      <SectionLabel>{title}</SectionLabel>
      <p className="mt-2 max-w-prose text-sm text-[var(--muted-foreground)]">
        {body}
      </p>
    </div>
  );
}
