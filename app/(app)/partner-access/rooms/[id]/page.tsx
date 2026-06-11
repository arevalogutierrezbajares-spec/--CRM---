import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  CalendarClock,
  CheckSquare,
  ChevronLeft,
  DoorOpen,
  Eye,
  FileText,
  FileUp,
  FolderOpen,
  Image as ImageIcon,
  MessageSquare,
  UsersRound,
} from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DbBanner } from "@/components/db-banner";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { AddDocsDialog } from "@/components/partner-access/add-docs-dialog";
import { ClientLogoControl } from "@/components/partner-access/client-logo-control";
import { HeroVideoPicker } from "@/components/partner-access/hero-video-picker";
import { RoomGuestsManager } from "@/components/partner-access/room-guests-manager";
import { RepositoryManager } from "@/components/partner-access/repository-manager";
import { listRoomItems, listRoomComments } from "@/db/queries/partner-repository";
import { RoomAccessLinkActions } from "@/components/partner-access/room-access-link-actions";
import { RoomDetailsForm } from "@/components/partner-access/room-details-form";
import { RoomMessagesManager } from "@/components/partner-access/room-messages-manager";
import { RoomPasscodeControls } from "@/components/partner-access/room-passcode-controls";
import { RoomStatusActions } from "@/components/partner-access/room-status-actions";
import { ShareLedgerActions } from "@/components/partner-access/share-ledger-actions";
import { SharePermissionsEditor } from "@/components/partner-access/share-permissions-editor";
import { PartnerNextStepsManager } from "@/components/partner-access/partner-next-steps-manager";
import { PartnerUploadsPanel } from "@/components/partner-access/partner-uploads-panel";
import {
  getPartnerAccessRoom,
  resolveRoomBrandLogos,
  listLogoBrands,
} from "@/db/queries/partner-access";
import { listWorkspaceEmailMembers } from "@/db/queries/email";
import { RoomTeamManager } from "@/components/partner-access/room-team-manager";
import { listPartnerNextSteps } from "@/db/queries/partner-next-steps";
import { listPartnerUploads } from "@/db/queries/partner-uploads";
import { listPartnerRoomMessages } from "@/db/queries/partner-messages";
import { requireUser } from "@/lib/current-user";
import { safeRead } from "@/lib/db-status";
import {
  partnerKindLabel,
  partnerRoomStatusLabel,
  partnerShareChannelLabel,
  type PartnerKind,
  type PartnerRoomStatus,
} from "@/lib/partner-access";
import { formatDate, formatRelative } from "@/lib/utils";

type Params = Promise<{ id: string }>;

function statusVariant(status: string) {
  if (status === "active") return "success";
  if (status === "paused" || status === "draft") return "warning";
  if (status === "revoked") return "danger";
  return "outline";
}

function shareStatus(share: {
  revokedAt: Date | null;
  downloadedAt: Date | null;
  viewedAt: Date | null;
}) {
  if (share.revokedAt) return { label: "revoked", variant: "danger" as const };
  if (share.downloadedAt) return { label: "downloaded", variant: "success" as const };
  if (share.viewedAt) return { label: "viewed", variant: "success" as const };
  return { label: "sent", variant: "outline" as const };
}

function eventLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function PartnerAccessRoomPage(props: { params: Params }) {
  const user = await requireUser();
  const { id } = await props.params;
  const roomRes = await safeRead(
    () => getPartnerAccessRoom({ workspaceId: user.workspaceId, roomId: id }),
    null,
  );

  if (roomRes.ok && !roomRes.data) notFound();

  const detail = roomRes.data;

  const [nextStepsRes, uploadsRes, messagesRes, itemsRes, commentsRes, brandsRes, membersRes] = detail
    ? await Promise.all([
        safeRead(() => listPartnerNextSteps({ workspaceId: user.workspaceId, roomId: id }), []),
        safeRead(() => listPartnerUploads({ workspaceId: user.workspaceId, roomId: id }), []),
        safeRead(() => listPartnerRoomMessages({ roomId: id }), []),
        safeRead(() => listRoomItems({ roomId: id }), []),
        safeRead(() => listRoomComments({ roomId: id }), []),
        safeRead(() => listLogoBrands({ workspaceId: user.workspaceId }), []),
        safeRead(() => listWorkspaceEmailMembers(user.workspaceId), []),
      ])
    : [
        { ok: true as const, data: [] },
        { ok: true as const, data: [] },
        { ok: true as const, data: [] },
        { ok: true as const, data: [] },
        { ok: true as const, data: [] },
        { ok: true as const, data: [] },
        { ok: true as const, data: [] },
      ];
  if (!detail) {
    const error = roomRes.ok ? "Room not found" : roomRes.error;
    return (
      <>
        <TopBar email={user.email} displayName={user.displayName} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
          <DbBanner error={error} />
        </main>
      </>
    );
  }

  const { room } = detail;
  const activeShares = detail.shares.filter((share) => !share.revokedAt);
  const brandLogosRes = await safeRead(
    () =>
      resolveRoomBrandLogos({
        workspaceId: user.workspaceId,
        brandLobIds: room.brandLobIds ?? null,
        shares: activeShares,
      }),
    [],
  );
  const brandLogos = brandLogosRes.data;

  const commentsByTarget: Record<
    string,
    Array<{ id: string; body: string; authorKind: string; authorName: string | null; createdAt: string }>
  > = {};
  for (const c of commentsRes.data) {
    const key = `${c.targetKind}:${c.targetId}`;
    (commentsByTarget[key] ??= []).push({
      id: c.id,
      body: c.body,
      authorKind: c.authorKind,
      authorName: c.authorName,
      createdAt: c.createdAt.toISOString(),
    });
  }
  const totalComments = commentsRes.data.length;
  const viewedShares = detail.shares.filter((share) => share.viewedAt);
  const downloadedShares = detail.shares.filter((share) => share.downloadedAt);

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <Link
          href="/partner-access"
          className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          Partner Access
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(room.status)}>
                {partnerRoomStatusLabel(room.status)}
              </Badge>
              <Badge variant="outline">{partnerKindLabel(room.partnerKind)}</Badge>
            </div>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">
              {room.name}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">
              {detail.contact.id ? (
                <>
                  Gateway for{" "}
                  <Link
                    href={`/contacts/${detail.contact.id}`}
                    className="font-medium text-[var(--foreground)] hover:underline"
                  >
                    {detail.contact.name ?? "contact"}
                  </Link>
                  {detail.contact.organization
                    ? ` at ${detail.contact.organization}`
                    : ""}
                  .
                </>
              ) : (
                "Gateway contact has been removed."
              )}{" "}
              Created by {detail.createdByName ?? "AGB"}.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/partner-access/rooms/${id}/preview`} target="_blank">
              <Eye className="h-4 w-4" />
              Preview as partner
            </Link>
          </Button>
        </div>

        {!roomRes.ok && <DbBanner error={roomRes.error} />}

        <div className="grid gap-3 md:grid-cols-5">
          <Summary label="Active shares" value={activeShares.length} />
          <Summary label="Viewed" value={viewedShares.length} />
          <Summary label="Downloaded" value={downloadedShares.length} />
          <Summary label="Members" value={detail.members.length} />
          <Summary label="Last activity" value={formatRelative(room.lastActivityAt ?? room.updatedAt)} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Shared Materials
                  <span className="ml-auto">
                    <AddDocsDialog roomId={id} />
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detail.shares.length === 0 ? (
                  <EmptyState
                    title="No materials"
                    body="Use “Add documents” to place project files, docs, or links in this room."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                        <tr>
                          <th className="py-2 pr-4 font-medium">Asset</th>
                          <th className="py-2 pr-4 font-medium">Project</th>
                          <th className="py-2 pr-4 font-medium">
                            Permissions
                            <span className="ml-1 font-normal normal-case text-[var(--muted-foreground)]">
                              (tap to toggle)
                            </span>
                          </th>
                          <th className="py-2 pr-4 font-medium">Status</th>
                          <th className="py-2 pr-4 font-medium">Shared</th>
                          <th className="py-2 font-medium">Controls</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {detail.shares.map((share) => {
                          const status = shareStatus(share);
                          return (
                            <tr key={share.id} className="align-top">
                              <td className="py-3 pr-4">
                                <div className="max-w-[280px] truncate font-medium">
                                  {share.liveLabel ?? share.labelSnapshot}
                                </div>
                                <div className="text-xs text-[var(--muted-foreground)]">
                                  {share.kindSnapshot}
                                  {share.categorySnapshot
                                    ? ` · ${share.categorySnapshot}`
                                    : ""}
                                </div>
                              </td>
                              <td className="py-3 pr-4">
                                {share.lobId ? (
                                  <Link
                                    href={`/lob/${share.lobId}`}
                                    className="font-medium hover:underline"
                                  >
                                    {share.projectTitle ?? "Project"}
                                  </Link>
                                ) : (
                                  <span className="text-[var(--muted-foreground)]">
                                    Project removed
                                  </span>
                                )}
                                <div className="text-xs text-[var(--muted-foreground)]">
                                  {partnerShareChannelLabel(share.channel)}
                                </div>
                                {share.meetingId && share.meetingTitle && (
                                  <Link
                                    href={`/meetings/${share.meetingId}`}
                                    className="mt-1 inline-flex items-center gap-1 rounded bg-[var(--secondary)] px-1.5 py-0.5 text-[10px] text-[var(--secondary-foreground)] hover:underline"
                                  >
                                    <CalendarClock className="h-2.5 w-2.5" />
                                    {share.meetingTitle}
                                  </Link>
                                )}
                              </td>
                              <td className="py-3 pr-4">
                                <SharePermissionsEditor
                                  key={`${share.id}:${share.permissions.join(",")}`}
                                  shareId={share.id}
                                  permissions={share.permissions}
                                  disabled={Boolean(share.revokedAt)}
                                />
                              </td>
                              <td className="py-3 pr-4">
                                <Badge variant={status.variant}>
                                  {status.label}
                                </Badge>
                              </td>
                              <td className="py-3 pr-4 text-[var(--muted-foreground)]">
                                {formatRelative(share.sharedAt)}
                              </td>
                              <td className="py-3">
                                <ShareLedgerActions
                                  shareId={share.id}
                                  viewed={Boolean(share.viewedAt)}
                                  downloaded={Boolean(share.downloadedAt)}
                                  revoked={Boolean(share.revokedAt)}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" />
                  Repository
                  {totalComments > 0 && (
                    <Badge variant="secondary" className="ml-auto">
                      {totalComments} comment{totalComments === 1 ? "" : "s"}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RepositoryManager
                  roomId={room.id}
                  partnerLabel={detail.contact.name ?? "your client"}
                  items={itemsRes.data.map((it) => ({
                    id: it.id,
                    kind: it.kind,
                    title: it.title,
                    description: it.description,
                    category: it.category,
                    url: it.url,
                    mimeType: it.mimeType,
                    sizeBytes: it.sizeBytes,
                  }))}
                  shares={activeShares.map((s) => ({
                    id: s.id,
                    title: s.liveLabel ?? s.labelSnapshot,
                    projectTitle: s.projectTitle,
                    kindSnapshot: s.kindSnapshot,
                    sizeBytes: null,
                    description: null,
                    roomSection: s.roomSection,
                  }))}
                  commentsByTarget={commentsByTarget}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Messages
                  {messagesRes.data.length > 0 && (
                    <Badge variant="secondary" className="ml-auto">
                      {messagesRes.data.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RoomMessagesManager
                  roomId={id}
                  partnerLabel={detail.contact.name ?? "your partner"}
                  mentionCandidates={detail.members
                    .filter((m) => m.email && m.displayName)
                    .map((m) => m.displayName as string)}
                  initialMessages={messagesRes.data.map((m) => ({
                    id: m.id,
                    body: m.body,
                    authorKind: m.authorKind,
                    authorName: m.authorName,
                    createdAt: m.createdAt.toISOString(),
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileUp className="h-4 w-4" />
                  Partner Uploads
                  {uploadsRes.data.length > 0 && (
                    <Badge variant="secondary" className="ml-auto">{uploadsRes.data.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PartnerUploadsPanel
                  roomId={id}
                  initialUploads={uploadsRes.data}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4" />
                  Next Steps
                  {nextStepsRes.data.filter((s) => !s.completedAt).length > 0 && (
                    <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      {nextStepsRes.data.filter((s) => !s.completedAt).length} open
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PartnerNextStepsManager
                  roomId={id}
                  initialSteps={nextStepsRes.data}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detail.events.length === 0 ? (
                  <EmptyState
                    title="No activity"
                    body="Room updates, public views, downloads, and revocations will appear here."
                  />
                ) : (
                  <ul className="space-y-3">
                    {detail.events.map((event) => (
                      <li
                        key={event.id}
                        className="rounded-md border border-[var(--border)] p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">
                            {eventLabel(event.eventType)}
                          </div>
                          <div className="text-xs text-[var(--muted-foreground)]">
                            {formatRelative(event.createdAt)}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {event.shareLabel ?? "Room"} ·{" "}
                          {event.actorName ?? "Partner access"}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DoorOpen className="h-4 w-4" />
                  Room Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <RoomStatusActions
                  roomId={room.id}
                  status={room.status as PartnerRoomStatus}
                />
                <RoomAccessLinkActions
                  roomId={room.id}
                  status={room.status as PartnerRoomStatus}
                  hasAccessToken={Boolean(room.publicAccessTokenHash)}
                  tokenCreatedAt={
                    room.publicAccessTokenCreatedAt?.toISOString() ?? null
                  }
                  lastViewedAt={
                    room.publicAccessLastViewedAt?.toISOString() ?? null
                  }
                />
                <div className="border-t border-[var(--border)] pt-4">
                  <RoomPasscodeControls
                    roomId={room.id}
                    hasPasscode={Boolean(room.passcodeHash)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UsersRound className="h-4 w-4" />
                  Guests &amp; seats
                  {detail.members.length > 0 && (
                    <Badge variant="secondary" className="ml-auto">
                      {detail.members.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RoomGuestsManager
                  roomId={room.id}
                  seatLimit={room.seatLimit}
                  members={detail.members.map((m) => ({
                    id: m.id,
                    displayName: m.displayName,
                    email: m.email,
                    roleLabel: m.roleLabel,
                    claimedAt: m.claimedAt?.toISOString() ?? null,
                    lastViewedAt: m.lastViewedAt?.toISOString() ?? null,
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UsersRound className="h-4 w-4" />
                  Room Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RoomDetailsForm
                  room={{
                    id: room.id,
                    name: room.name,
                    partnerKind: room.partnerKind as PartnerKind,
                    summary: room.summary,
                    welcomeMessage: room.welcomeMessage,
                    expiresAt: room.expiresAt?.toISOString() ?? null,
                  }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Co-branding
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ClientLogoControl
                  roomId={room.id}
                  contactId={detail.contact.id}
                  contactName={detail.contact.name}
                  clientLogoUrl={detail.contact.logoUrl}
                  brandLogos={brandLogos}
                  availableBrands={brandsRes.data}
                  selectedBrandLobIds={room.brandLobIds ?? null}
                />
                <div className="mt-5 border-t border-[var(--border)] pt-4">
                  <p className="text-sm font-medium">Background video</p>
                  <div className="mt-2">
                    <HeroVideoPicker
                      roomId={room.id}
                      heroVideoKey={room.heroVideoKey ?? null}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UsersRound className="h-4 w-4" />
                  Team for this client
                  {detail.team.length > 0 && (
                    <Badge variant="secondary" className="ml-auto">
                      {detail.team.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RoomTeamManager
                  roomId={room.id}
                  team={detail.team.map((t) => ({
                    id: t.id,
                    userId: t.userId,
                    displayName: t.displayName,
                    email: t.email,
                    title: t.title,
                  }))}
                  workspaceMembers={membersRes.data.map((m) => ({
                    userId: m.userId,
                    displayName: m.displayName,
                    email: m.email,
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Room Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <ProfileRow label="Created" value={formatDate(room.createdAt)} />
                <ProfileRow label="Expires" value={formatDate(room.expiresAt)} />
                <ProfileRow
                  label="Partner type"
                  value={partnerKindLabel(room.partnerKind)}
                />
                <ProfileRow
                  label="Status"
                  value={partnerRoomStatusLabel(room.status)}
                />
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </>
  );
}

function Summary({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className="mt-2 truncate text-xl font-semibold tabular-nums">
        {value}
      </div>
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

function ProfileRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2 last:border-0">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  );
}
