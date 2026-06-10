/**
 * Admin-only preview that renders the partner room exactly as the partner
 * sees it — without needing the public access token. Auth-gated.
 */
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  CalendarClock,
  CheckSquare,
  Download,
  Eye,
  FileText,
  Lock,
  MessageSquare,
  ShieldCheck,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/current-user";
import { getPartnerAccessRoom } from "@/db/queries/partner-access";
import { listPartnerNextStepsByRoom } from "@/db/queries/partner-next-steps";
import { listPartnerUploadsByRoom } from "@/db/queries/partner-uploads";
import { listPartnerRoomMessages } from "@/db/queries/partner-messages";
import { resolveRoomBrandLogos } from "@/db/queries/partner-access";
import { CoBrandLockup } from "@/components/partner-access/co-brand-lockup";
import { RoomTeamDisplay } from "@/components/partner-access/room-team-display";
import { partnerKindLabel } from "@/lib/partner-access";
import { formatRelative } from "@/lib/utils";

type Params = Promise<{ id: string }>;

export default async function PartnerRoomPreviewPage({ params }: { params: Params }) {
  const user = await requireUser();
  const { id } = await params;

  const [detail, nextSteps, uploads] = await Promise.all([
    getPartnerAccessRoom({ workspaceId: user.workspaceId, roomId: id }),
    listPartnerNextStepsByRoom({ roomId: id }),
    listPartnerUploadsByRoom({ roomId: id }),
  ]);
  const messages = detail ? await listPartnerRoomMessages({ roomId: id }) : [];

  if (!detail) notFound();

  const { room } = detail;
  const shares = detail.shares.filter((s) => !s.revokedAt);
  const openSteps = nextSteps.filter((s) => !s.completedAt);
  const brandLogos = await resolveRoomBrandLogos({
    workspaceId: user.workspaceId,
    brandLobIds: room.brandLobIds ?? null,
    shares,
  });

  return (
    <main className="min-h-screen bg-[var(--bg-page)]">
      {/* Admin banner */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2.5 dark:border-amber-900 dark:bg-amber-950/40">
        <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
          <Eye className="h-4 w-4 shrink-0" />
          <span>
            Admin preview — a close approximation of the partner&rsquo;s room
            {room.passcodeHash
              ? " (they enter a 4-digit code first)"
              : ""}
            . The live page also offers self-identification and an interactive deck viewer.
          </span>
        </div>
        <Link
          href={`/partner-access/rooms/${id}`}
          className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
        >
          ← Back to room
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-5 md:px-8 md:py-8">
        <header className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <CoBrandLockup
                brandLogos={brandLogos}
                clientLogoUrl={detail.contact.logoUrl}
                clientName={detail.contact.name}
              />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{partnerKindLabel(room.partnerKind)}</Badge>
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                  <Lock className="h-3.5 w-3.5" />
                  Private access room
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
                {room.name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
                {room.welcomeMessage ?? "A curated view of the project materials, context, and next steps shared with you."}
              </p>
            </div>
            <div className="grid min-w-[220px] grid-cols-2 gap-2 lg:grid-cols-1">
              <Fact label="Shared files" value={shares.length} />
              {openSteps.length > 0 && <Fact label="Open actions" value={openSteps.length} />}
              <Fact label="Last update" value={formatRelative(room.updatedAt)} />
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {/* Shared materials */}
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
                  <p className="text-sm text-[var(--muted-foreground)]">No active materials shared.</p>
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
                              </p>
                            </div>
                          </div>
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
                        <div className="flex shrink-0 items-center gap-2">
                          {share.permissions.includes("download") && (
                            <Button variant="outline" size="sm" disabled>
                              <Download className="h-4 w-4" />
                              Download
                            </Button>
                          )}
                          {share.kindSnapshot === "link" && share.urlSnapshot && (
                            <Button asChild variant="outline" size="sm">
                              <a href={share.urlSnapshot} target="_blank" rel="noopener noreferrer">
                                <ArrowUpRight className="h-4 w-4" />
                                Open
                              </a>
                            </Button>
                          )}
                        </div>
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
                {messages.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    No messages yet.
                  </p>
                ) : (
                  <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {messages.map((message) => {
                      const fromPartner = message.authorKind === "partner";
                      return (
                        <li
                          key={message.id}
                          className={fromPartner ? "flex justify-end" : "flex"}
                        >
                          <div
                            className={`max-w-[85%] rounded-lg px-3 py-2 ${
                              fromPartner
                                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                                : "bg-[var(--secondary)]"
                            }`}
                          >
                            <div
                              className={`text-[11px] ${
                                fromPartner
                                  ? "text-[var(--primary-foreground)] opacity-70"
                                  : "text-[var(--muted-foreground)]"
                              }`}
                            >
                              {message.authorName ?? (fromPartner ? "Partner" : "The team")} ·{" "}
                              {formatRelative(message.createdAt)}
                            </div>
                            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">
                              {message.body}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                  Composer visible to partner on the live link — not interactive in admin preview.
                </p>
              </div>
            </div>

            {/* Send files section */}
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
                <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--secondary)]/40 p-6 text-center opacity-60 select-none">
                  <Upload className="mx-auto h-6 w-6 text-[var(--muted-foreground)]" />
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                    Upload form visible to partner on the live link
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">Not interactive in admin preview</p>
                </div>
                {uploads.length > 0 && (
                  <div className="mt-4 border-t border-[var(--border)] pt-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">Previously sent</p>
                    <ul className="mt-2 space-y-1.5">
                      {uploads.map((u) => (
                        <li key={u.id} className="flex items-center gap-2 text-sm">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
                          <span className="truncate">{u.label || u.originalFilename}</span>
                          <span className="ml-auto shrink-0 text-xs text-[var(--muted-foreground)]">{formatRelative(u.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <RoomTeamDisplay
              team={detail.team.map((t) => ({
                id: t.id,
                displayName: t.displayName,
                title: t.title,
              }))}
            />
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <h2 className="text-base font-semibold">Room Status</h2>
              <div className="mt-3 space-y-3 text-sm">
                <RoomRow label="For" value={detail.contact.name ?? "Partner"} />
                {detail.contact.organization && (
                  <RoomRow label="Org" value={detail.contact.organization} />
                )}
                <RoomRow label="Access" value="Active" />
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-[var(--muted-foreground)]" />
                <h2 className="text-base font-semibold">Next Steps</h2>
                {openSteps.length > 0 && (
                  <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                    {openSteps.length} open
                  </span>
                )}
              </div>
              {nextSteps.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--muted-foreground)]">No next steps have been set yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {nextSteps.map((step) => (
                    <li key={step.id} className="flex items-start gap-2 rounded-lg border border-[var(--border)] p-3">
                      <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${step.completedAt ? "border-green-500 bg-green-500 text-white" : "border-[var(--border)]"}`}>
                        {step.completedAt && <span className="text-[10px]">✓</span>}
                      </div>
                      <div>
                        <p className={`text-sm ${step.completedAt ? "line-through text-[var(--muted-foreground)]" : ""}`}>{step.text}</p>
                        {step.dueAt && (
                          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Due {formatRelative(step.dueAt)}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">{label}</div>
      <div className="mt-1 text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

function RoomRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-2 last:border-0 last:pb-0">
      <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">{label}</span>
      <span className="max-w-[190px] text-right">{value}</span>
    </div>
  );
}
