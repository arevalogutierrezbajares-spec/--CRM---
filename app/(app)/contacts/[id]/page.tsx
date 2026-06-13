import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DbBanner } from "@/components/db-banner";
import { ContactAvatar } from "@/components/contacts/avatar";
import { ContactLogoUploader } from "@/components/contacts/contact-logo-uploader";
import { TouchForm } from "@/components/touches/touch-form";
import { TouchList } from "@/components/touches/touch-list";
import { VoiceRecorder } from "@/components/touches/voice-recorder";
import { ReintroButton } from "@/components/brain/reintro-button";
import { WarmPath } from "@/components/network/warm-path";
import { findWarmPath } from "@/db/queries/warm-path";
import { ReciprocityCard } from "@/components/reciprocity/reciprocity-card";
import { reciprocityFor } from "@/db/queries/reciprocity";
import { getContact } from "@/db/queries/contacts";
import { listPartnerAccessForContact } from "@/db/queries/partner-access";
import { listPartnerNextSteps } from "@/db/queries/partner-next-steps";
import { listPartnerUploads } from "@/db/queries/partner-uploads";
import { PartnerAccessPanel } from "@/components/partner-access/partner-access-panel";
import { listPitchFeedbackForContact } from "@/db/queries/pitch-feedback";
import { PitchFeedbackPanel } from "@/components/pitch-feedback/pitch-feedback-panel";
import { listTouchesForContact } from "@/db/queries/touches";
import { listMeetingsForContact } from "@/db/queries/meetings";
import { safeRead, isDbConfigured } from "@/lib/db-status";
import { archiveContact, unarchiveContact } from "../actions";
import { formatRelative, formatDateTime } from "@/lib/utils";

type Params = Promise<{ id: string }>;

export default async function ContactDetailPage(props: { params: Params }) {
  const user = await requireUser();
  const { id } = await props.params;

  // Fetch the contact first so the partner-access query can include the
  // organization's shared room for a linked person.
  const contactRes = await safeRead(
    () => getContact({ id, workspaceId: user.workspaceId }),
    null,
  );
  const orgContactId = contactRes.data?.primaryOrgId ?? undefined;

  const [touchesRes, warmPathRes, reciprocityRes, meetingsRes, accessRes, pitchFeedbackRes] = await Promise.all([
    safeRead(() => listTouchesForContact({ contactId: id, workspaceId: user.workspaceId }), []),
    safeRead(
      () => findWarmPath({ workspaceId: user.workspaceId, toContactId: id }),
      null as Awaited<ReturnType<typeof findWarmPath>>,
    ),
    safeRead(
      () => reciprocityFor({ workspaceId: user.workspaceId, contactId: id }),
      {
        initiatedByMe: 0,
        initiatedByThem: 0,
        total: 0,
        balance: "no-data" as const,
        ratio: 0,
      },
    ),
    safeRead(() => listMeetingsForContact({ contactId: id, workspaceId: user.workspaceId }), []),
    safeRead(
      () =>
        listPartnerAccessForContact({
          contactId: id,
          workspaceId: user.workspaceId,
          orgContactId,
        }),
      { rooms: [], shares: [] },
    ),
    safeRead(() => listPitchFeedbackForContact({ contactId: id, workspaceId: user.workspaceId }), {
      campaigns: [],
      invites: [],
    }),
  ]);

  // Build next-step and upload counts per room for the partner panel badges
  const roomIds = accessRes.data.rooms.map((r) => r.id);
  const [nextStepsByRoom, uploadsByRoom] = roomIds.length
    ? await Promise.all([
        Promise.all(roomIds.map((rid) =>
          listPartnerNextSteps({ workspaceId: user.workspaceId, roomId: rid })
            .then((steps) => [rid, steps.filter((s) => !s.completedAt).length] as const)
            .catch(() => [rid, 0] as const)
        )),
        Promise.all(roomIds.map((rid) =>
          listPartnerUploads({ workspaceId: user.workspaceId, roomId: rid })
            .then((ups) => [rid, ups.length] as const)
            .catch(() => [rid, 0] as const)
        )),
      ])
    : [[], []];

  const nextStepCountByRoom = Object.fromEntries(nextStepsByRoom);
  const uploadCountByRoom = Object.fromEntries(uploadsByRoom);

  if (contactRes.ok && !contactRes.data) notFound();
  const contact = contactRes.data;

  async function archive() {
    "use server";
    await archiveContact(id);
  }
  async function unarchive() {
    "use server";
    await unarchiveContact(id);
  }

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        action={
          <div className="flex items-center gap-2">
            <ReintroButton contactId={id} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/contacts/${id}/edit`}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
            {contact?.archived ? (
              <form action={unarchive}>
                <Button type="submit" variant="ghost" size="sm">
                  Unarchive
                </Button>
              </form>
            ) : (
              <form action={archive}>
                <Button type="submit" variant="ghost" size="sm">
                  Archive
                </Button>
              </form>
            )}
          </div>
        }
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-4 w-4" /> All contacts
        </Link>

        {!contactRes.ok && (
          <div className="mt-4">
            <DbBanner error={contactRes.error} />
          </div>
        )}

        {contact && (
          <>
            <header className="mt-4 mb-6 flex items-start gap-3">
              <ContactAvatar
                name={contact.name}
                type={contact.type}
                logoUrl={contact.effectiveLogoUrl}
                size={44}
              />
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {contact.name}
                  </h1>
                  <Badge variant="outline">{contact.relationshipType}</Badge>
                  {contact.archived && <Badge variant="warning">archived</Badge>}
                </div>
                {contact.org ? (
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    <Link
                      href={`/contacts/${contact.org.id}`}
                      className="hover:text-[var(--foreground)] hover:underline"
                    >
                      {contact.org.name}
                    </Link>
                  </p>
                ) : (
                  contact.organization && (
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                      {contact.organization}
                    </p>
                  )
                )}
              </div>
            </header>

            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Log a touch</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isDbConfigured() ? (
                      <div className="space-y-4">
                        <TouchForm contactId={contact.id} />
                        <div className="border-t border-[var(--border)] pt-4">
                          <VoiceRecorder contactId={contact.id} />
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--muted-foreground)]">
                        Database not connected — finish AGB-000A to enable
                        touch logging.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Timeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!touchesRes.ok ? (
                      <DbBanner error={touchesRes.error} />
                    ) : (
                      <TouchList touches={touchesRes.data} />
                    )}
                  </CardContent>
                </Card>

                {/* Meetings with this contact */}
                {meetingsRes.ok && meetingsRes.data.length > 0 && (
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                      <CardTitle>Meetings</CardTitle>
                      <Link
                        href={`/meetings/new?attendee=${id}`}
                        className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      >
                        + Schedule
                      </Link>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ul className="divide-y divide-[var(--border)]">
                        {meetingsRes.data.map((m) => (
                          <li key={m.id} className="flex items-start justify-between gap-2 px-6 py-2.5">
                            <div className="min-w-0">
                              <Link
                                href={`/meetings/${m.id}`}
                                className="text-sm font-medium hover:underline"
                              >
                                {m.title}
                              </Link>
                              <div className="text-xs text-[var(--muted-foreground)]">
                                {formatDateTime(m.scheduledAt)}
                                {m.attendeeCount > 1 && ` · ${m.attendeeCount} attendees`}
                              </div>
                              {m.minutes?.trim() && (
                                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-[var(--muted-foreground)]">
                                  {m.minutes.trim()}
                                </p>
                              )}
                            </div>
                            {m.openActionItems > 0 && (
                              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                {m.openActionItems} open AI{m.openActionItems === 1 ? "" : "s"}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>

              <aside className="space-y-6">
                <WarmPath path={warmPathRes.data} />
                <ReciprocityCard data={reciprocityRes.data} />
                <PitchFeedbackPanel
                  contactId={contact.id}
                  contactName={contact.name}
                  overview={pitchFeedbackRes.data}
                />
                <PartnerAccessPanel
                  access={accessRes.data}
                  contact={{
                    id: contact.id,
                    name: contact.name,
                    organization: contact.organization,
                  }}
                  roomContact={
                    contact.org
                      ? {
                          id: contact.org.id,
                          name: contact.org.name,
                          organization: null,
                        }
                      : undefined
                  }
                  orgName={contact.org?.name ?? null}
                  nextStepCountByRoom={nextStepCountByRoom}
                  uploadCountByRoom={uploadCountByRoom}
                />
                {contact.type === "org" && contact.members.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Team · {contact.members.length}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      {contact.members.map((m) => (
                        <Link
                          key={m.id}
                          href={`/contacts/${m.id}`}
                          className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-[var(--secondary)]"
                        >
                          <ContactAvatar name={m.name} type={m.type} size={22} />
                          <span className="truncate">{m.name}</span>
                        </Link>
                      ))}
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>Logo</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ContactLogoUploader
                      contactId={contact.id}
                      contactName={contact.name}
                      logoUrl={contact.logoUrl}
                      inheritedLogoUrl={
                        !contact.logoUrl && contact.org?.logoUrl
                          ? contact.org.logoUrl
                          : null
                      }
                      inheritedFromName={
                        !contact.logoUrl && contact.org?.logoUrl ? contact.org.name : null
                      }
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Channels</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {contact.channels.length === 0 && (
                      <p className="text-sm text-[var(--muted-foreground)]">
                        No channels.
                      </p>
                    )}
                    {contact.channels.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <div>
                          <div className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                            {c.kind}
                          </div>
                          <div>{c.value}</div>
                        </div>
                        {c.isPrimary && (
                          <Badge variant="outline" className="text-xs">
                            primary
                          </Badge>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Tags</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {contact.tags.length === 0 ? (
                      <p className="text-sm text-[var(--muted-foreground)]">
                        No tags.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {contact.tags.map((t) => (
                          <Badge key={t.id} variant="secondary">
                            {t.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <Row label="Last touch" value={formatRelative(contact.lastTouchAt)} />
                    <Row
                      label="Intro chain"
                      value={contact.introChainFromText ?? "—"}
                    />
                    <Row label="Notes path" value={contact.notesPath ?? "—"} />
                    <Separator />
                    <Row
                      label="Created"
                      value={formatRelative(contact.createdAt)}
                    />
                  </CardContent>
                </Card>
              </aside>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </span>
      <span className="truncate text-right">{value}</span>
    </div>
  );
}
