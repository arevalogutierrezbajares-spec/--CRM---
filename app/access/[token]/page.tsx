import {
  ArrowUpRight,
  CalendarClock,
  CheckSquare,
  Download,
  FileText,
  Lock,
  MessageSquare,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/project-files/limits";
import { formatRelative } from "@/lib/utils";
import {
  getPartnerRoomMember,
  getPublicPartnerRoomByToken,
  recordPublicPartnerRoomView,
  type PublicPartnerRoom,
} from "@/db/queries/partner-access";
import { listPartnerNextStepsByRoom } from "@/db/queries/partner-next-steps";
import { listPartnerUploadsByRoom } from "@/db/queries/partner-uploads";
import { listPartnerRoomMessages } from "@/db/queries/partner-messages";
import { partnerKindLabel } from "@/lib/partner-access";
import {
  getPartnerMemberIdFromCookies,
  isPartnerRoomUnlocked,
} from "@/lib/partner-room-gate.server";
import { materialType } from "@/lib/materials/material-type";
import { PublicUploadForm } from "@/components/partner-access/public-upload-form";
import { PublicNextSteps } from "@/components/partner-access/public-next-steps";
import { PublicIdentify } from "@/components/partner-access/public-identify";
import { PublicRoomMessages } from "@/components/partner-access/public-room-messages";
import { RoomGate } from "@/components/partner-access/room-gate";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

export default async function PublicAccessRoomPage({
  params,
}: {
  params: Params;
}) {
  const { token } = await params;
  const access = await getPublicPartnerRoomByToken({ token }).catch(() => null);
  if (!access) return <UnavailableRoom />;

  if (!(await isPartnerRoomUnlocked(access.room))) {
    return <RoomGate token={token} roomName={access.room.name} />;
  }

  const memberId = await getPartnerMemberIdFromCookies(access.room.id);
  const member = memberId
    ? await getPartnerRoomMember({
        roomId: access.room.id,
        memberId,
      }).catch(() => null)
    : null;

  await recordPublicPartnerRoomView({
    roomId: access.room.id,
    workspaceId: access.room.workspaceId,
    contactId: access.contact.id,
    memberId: member?.id ?? null,
    memberEmail: member?.email ?? null,
  }).catch(() => {});

  const [nextSteps, partnerUploads, messages] = await Promise.all([
    listPartnerNextStepsByRoom({ roomId: access.room.id }).catch(() => []),
    listPartnerUploadsByRoom({ roomId: access.room.id }).catch(() => []),
    listPartnerRoomMessages({ roomId: access.room.id }).catch(() => []),
  ]);

  const shares = access.shares;
  const projects = Array.from(
    new Set(shares.map((share) => share.projectTitle).filter(Boolean)),
  );
  const lastShared = shares[0]?.sharedAt ?? access.room.updatedAt;
  const openSteps = nextSteps.filter((s) => !s.completedAt);

  return (
    <main className="min-h-screen bg-[var(--bg-page)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-5 md:px-8 md:py-8">
        <header className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{partnerKindLabel(access.room.partnerKind)}</Badge>
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                  <Lock className="h-3.5 w-3.5" />
                  Private access room
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
                {access.room.name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
                {access.room.welcomeMessage ??
                  "A curated view of the project materials, context, and next steps shared with you."}
              </p>
            </div>

            <div className="grid min-w-[220px] grid-cols-2 gap-2 lg:grid-cols-1">
              <Fact label="Shared files" value={shares.length} />
              {openSteps.length > 0 && <Fact label="Open actions" value={openSteps.length} />}
              <Fact label="Last update" value={formatRelative(lastShared)} />
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                <div>
                  <h2 className="text-base font-semibold">Shared Materials</h2>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    Only the items explicitly shared for this room are visible.
                  </p>
                </div>
                <Badge variant="secondary">{shares.length}</Badge>
              </div>

              {shares.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title="No materials are active"
                    body="The owner has not shared any active files or links in this room yet."
                  />
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {shares.map((share) => (
                    <li key={share.id} className="p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--secondary)]">
                              <FileText className="h-4 w-4 text-[var(--muted-foreground)]" />
                            </span>
                            <div className="min-w-0">
                              <h3 className="truncate text-sm font-medium">
                                {share.liveLabel ?? share.labelSnapshot}
                              </h3>
                              <p className="text-xs text-[var(--muted-foreground)]">
                                {share.projectTitle ?? "Project"} · {share.kindSnapshot}
                                {share.sizeBytes ? ` · ${formatBytes(share.sizeBytes)}` : ""}
                              </p>
                            </div>
                          </div>
                          {share.description && (
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
                              {share.description}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {share.permissions.map((permission) => (
                              <span
                                key={permission}
                                className="inline-flex items-center gap-1 rounded-md bg-[var(--secondary)] px-2 py-1 text-[11px] text-[var(--secondary-foreground)]"
                              >
                                <ShieldCheck className="h-3 w-3" />
                                {permission}
                              </span>
                            ))}
                            {share.expiresAt && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--amber-bg)] px-2 py-1 text-[11px] text-[var(--amber-text)]">
                                <CalendarClock className="h-3 w-3" />
                                expires {formatRelative(share.expiresAt)}
                              </span>
                            )}
                          </div>
                        </div>

                        <ShareAction token={token} share={share} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Messages section */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
                <MessageSquare className="h-4 w-4 text-[var(--muted-foreground)]" />
                <div>
                  <h2 className="text-base font-semibold">Messages</h2>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    Questions, notes, and updates between you and the team.
                  </p>
                </div>
              </div>
              <div className="p-4">
                <PublicRoomMessages
                  token={token}
                  ownerLabel="The team"
                  initialMessages={messages.map((m) => ({
                    id: m.id,
                    body: m.body,
                    authorKind: m.authorKind,
                    authorName: m.authorName,
                    createdAt: m.createdAt.toISOString(),
                  }))}
                />
              </div>
            </div>

            {/* Partner uploads section */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
                <Upload className="h-4 w-4 text-[var(--muted-foreground)]" />
                <div>
                  <h2 className="text-base font-semibold">Send Files</h2>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    Upload documents back to the team — contracts, signatures, assets.
                  </p>
                </div>
              </div>
              <div className="p-4">
                <PublicUploadForm token={token} />
                {partnerUploads.length > 0 && (
                  <div className="mt-4 border-t border-[var(--border)] pt-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      Previously sent
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {partnerUploads.map((u) => (
                        <li key={u.id} className="flex items-center gap-2 text-sm">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
                          <span className="truncate">{u.label || u.originalFilename}</span>
                          <span className="ml-auto shrink-0 text-xs text-[var(--muted-foreground)]">
                            {formatRelative(u.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <PublicIdentify
              token={token}
              identifiedAs={
                member ? { email: member.email, name: member.displayName } : null
              }
            />

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <h2 className="text-base font-semibold">Room Status</h2>
              <div className="mt-3 space-y-3 text-sm">
                <RoomRow label="For" value={access.contact.name ?? "Partner"} />
                {access.contact.organization && (
                  <RoomRow label="Org" value={access.contact.organization} />
                )}
                <RoomRow
                  label="Projects"
                  value={projects.length > 0 ? projects.join(", ") : "Shared context"}
                />
                <RoomRow label="Access" value="Active" />
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-[var(--muted-foreground)]" />
                <h2 className="text-base font-semibold">Next Steps</h2>
                {openSteps.length > 0 && (
                  <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    {openSteps.length} open
                  </span>
                )}
              </div>
              <div className="mt-3">
                <PublicNextSteps token={token} initialSteps={nextSteps} />
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function ShareAction({
  token,
  share,
}: {
  token: string;
  share: PublicPartnerRoom["shares"][number];
}) {
  if (share.kindSnapshot === "link" && share.urlSnapshot) {
    return (
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <a
          href={`/access/${token}/open/${share.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ArrowUpRight className="h-4 w-4" />
          Open
        </a>
      </Button>
    );
  }

  if (share.kindSnapshot === "file" && share.storagePath) {
    const isHtmlDeck =
      materialType(
        share.kindSnapshot,
        share.mimeType,
        share.originalFilename ?? share.labelSnapshot,
      ).key === "html";
    const canDownload = share.permissions.includes("download");

    if (isHtmlDeck || canDownload) {
      return (
        <div className="flex shrink-0 items-center gap-2">
          {isHtmlDeck && (
            // Renders the deck as a page via our proxy (Supabase stores it as
            // text/plain). Works even for view-only shares.
            <Button asChild variant="outline" size="sm">
              <a
                href={`/access/${token}/deck/${share.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ArrowUpRight className="h-4 w-4" />
                View deck
              </a>
            </Button>
          )}
          {canDownload && (
            <Button asChild size="sm">
              <a
                href={`/access/${token}/download/${share.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="h-4 w-4" />
                Download
              </a>
            </Button>
          )}
        </div>
      );
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled className="shrink-0">
      View only
    </Button>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

function RoomRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-2 last:border-0 last:pb-0">
      <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </span>
      <span className="max-w-[190px] text-right">{value}</span>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border)] p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-1 max-w-prose text-sm text-[var(--muted-foreground)]">
        {body}
      </p>
    </div>
  );
}

function UnavailableRoom() {
  return (
    <main className="min-h-screen bg-[var(--bg-page)]">
      <div className="mx-auto grid min-h-screen w-full max-w-2xl place-items-center px-5 py-10">
        <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--secondary)]">
            <Lock className="h-5 w-5 text-[var(--muted-foreground)]" />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Access unavailable</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">
            This room may have expired, been paused, or been replaced with a new
            link. Ask the person who shared it to send the latest access link.
          </p>
        </div>
      </div>
    </main>
  );
}
