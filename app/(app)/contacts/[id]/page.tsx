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
import { TouchForm } from "@/components/touches/touch-form";
import { TouchList } from "@/components/touches/touch-list";
import { VoiceRecorder } from "@/components/touches/voice-recorder";
import { ReintroButton } from "@/components/brain/reintro-button";
import { WarmPath } from "@/components/network/warm-path";
import { findWarmPath } from "@/db/queries/warm-path";
import { ReciprocityCard } from "@/components/reciprocity/reciprocity-card";
import { reciprocityFor } from "@/db/queries/reciprocity";
import { getContact } from "@/db/queries/contacts";
import { listTouchesForContact } from "@/db/queries/touches";
import { safeRead, isDbConfigured } from "@/lib/db-status";
import { archiveContact, unarchiveContact } from "../actions";
import { formatRelative } from "@/lib/utils";

type Params = Promise<{ id: string }>;

export default async function ContactDetailPage(props: { params: Params }) {
  const user = await requireUser();
  const { id } = await props.params;

  const [contactRes, touchesRes, warmPathRes, reciprocityRes] = await Promise.all([
    safeRead(() => getContact({ id, ownerId: user.id }), null),
    safeRead(() => listTouchesForContact({ contactId: id, ownerId: user.id }), []),
    safeRead(
      () => findWarmPath({ ownerId: user.id, toContactId: id }),
      null as Awaited<ReturnType<typeof findWarmPath>>,
    ),
    safeRead(
      () => reciprocityFor({ ownerId: user.id, contactId: id }),
      {
        initiatedByMe: 0,
        initiatedByThem: 0,
        total: 0,
        balance: "no-data" as const,
        ratio: 0,
      },
    ),
  ]);

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
            <header className="mt-4 mb-6">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {contact.name}
                </h1>
                <Badge variant="outline">{contact.relationshipType}</Badge>
                {contact.archived && <Badge variant="warning">archived</Badge>}
              </div>
              {contact.organization && (
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {contact.organization}
                </p>
              )}
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
              </div>

              <aside className="space-y-6">
                <WarmPath path={warmPathRes.data} />
                <ReciprocityCard data={reciprocityRes.data} />
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
