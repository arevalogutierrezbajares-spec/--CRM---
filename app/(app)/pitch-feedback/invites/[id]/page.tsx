import Link from "next/link";
import type React from "react";
import { notFound } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Brain,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  MessageSquareText,
  Send,
  ShieldCheck,
} from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DbBanner } from "@/components/db-banner";
import { PitchFeedbackInviteActions } from "@/components/pitch-feedback/pitch-feedback-actions";
import { getPitchFeedbackInviteDetail } from "@/db/queries/pitch-feedback";
import type { PitchFeedbackSection } from "@/lib/pitch-feedback/types";
import { requireUser } from "@/lib/current-user";
import { safeRead } from "@/lib/db-status";
import { formatDate, formatRelative } from "@/lib/utils";

type Params = Promise<{ id: string }>;

function statusVariant(status: string) {
  if (status === "completed") return "success";
  if (status === "revoked" || status === "expired") return "danger";
  if (status === "opened" || status === "in_progress") return "warning";
  return "outline";
}

function sentimentVariant(sentiment?: string | null) {
  if (sentiment === "positive") return "success";
  if (sentiment === "negative" || sentiment === "mixed") return "warning";
  return "outline";
}

function labelize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function responseText(value: Record<string, unknown>) {
  if (typeof value.text === "string") return value.text;
  if (typeof value.reaction === "string") return value.reaction;
  if (typeof value.score === "number") return `${value.score}/10`;
  return JSON.stringify(value);
}

function promptLabel(section: PitchFeedbackSection | undefined, promptKey: string) {
  return section?.prompts.find((prompt) => prompt.key === promptKey)?.label ?? promptKey;
}

export default async function PitchFeedbackInvitePage(props: { params: Params }) {
  const user = await requireUser();
  const { id } = await props.params;
  const detailRes = await safeRead(
    () => getPitchFeedbackInviteDetail({ workspaceId: user.workspaceId, inviteId: id }),
    null,
  );

  if (detailRes.ok && !detailRes.data) notFound();

  const detail = detailRes.data;
  if (!detail) {
    const error = detailRes.ok ? "Invite not found" : detailRes.error;
    return (
      <>
        <TopBar email={user.email} displayName={user.displayName} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
          <DbBanner error={error} />
        </main>
      </>
    );
  }

  const sections = detail.invite.sectionsSnapshot as PitchFeedbackSection[];
  const sectionByKey = new Map(sections.map((section) => [section.key, section]));
  const groupedSections = sections
    .map((section) => ({
      section,
      responses: detail.responses.filter(
        (response) => response.sectionKey === section.key,
      ),
    }))
    .filter((group) => group.responses.length > 0);

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        title="Pitch Feedback"
      />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-6 py-6">
        <Link
          href="/pitch-feedback"
          className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Pitch Feedback
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(detail.invite.status)}>
                {labelize(detail.invite.status)}
              </Badge>
              {detail.latestInsight && (
                <Badge variant={sentimentVariant(detail.latestInsight.sentiment)}>
                  {detail.latestInsight.supportLevel}
                </Badge>
              )}
              <Badge variant="outline">v{detail.invite.campaignVersion}</Badge>
            </div>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">
              {detail.contact.name}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
              Feedback for {detail.campaign.name}
              {detail.contact.organization ? ` · ${detail.contact.organization}` : ""}.
            </p>
          </div>
          <PitchFeedbackInviteActions
            inviteId={detail.invite.id}
            contactId={detail.contact.id}
            canSummarize={detail.responses.length > 0}
            revoked={Boolean(detail.invite.revokedAt)}
          />
        </div>

        {!detailRes.ok && <DbBanner error={detailRes.error} />}

        <div className="grid gap-3 md:grid-cols-5">
          <Summary label="Progress" value={`${detail.invite.completionPercent}%`} />
          <Summary label="Views" value={String(detail.invite.viewCount)} />
          <Summary label="Responses" value={String(detail.responses.length)} />
          <Summary label="Opened" value={formatRelative(detail.invite.firstOpenedAt)} />
          <Summary label="Completed" value={formatRelative(detail.invite.completedAt)} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            {detail.latestInsight && (
              <Card className="bg-[var(--ai-bg)] shadow-[inset_0_0_0_1px_var(--ai-border)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-[var(--ai-text)]">
                    <Brain className="h-4 w-4" />
                    AI Read
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-[var(--ai-subtext)]">
                  <p className="text-sm leading-6">{detail.latestInsight.summary}</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    <InsightList
                      title="Positive signals"
                      items={detail.latestInsight.positiveSignals}
                    />
                    <InsightList
                      title="Objections"
                      items={detail.latestInsight.objections}
                    />
                    <InsightList
                      title="Confusion"
                      items={detail.latestInsight.confusionPoints}
                    />
                  </div>
                  {detail.latestInsight.recommendedFollowup && (
                    <div className="rounded-lg bg-[var(--card)] p-3 text-sm leading-6 shadow-[inset_0_0_0_1px_var(--ai-border)]">
                      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--ai-text)]">
                        Recommended next ask
                      </div>
                      {detail.latestInsight.recommendedFollowup}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4" />
                  Responses
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detail.responses.length === 0 ? (
                  <EmptyState
                    title="No feedback yet"
                    body="Once the recipient responds, answers will be grouped by the section they were viewing."
                  />
                ) : (
                  <div className="space-y-4">
                    {groupedSections.map(({ section, responses }) => (
                      <section
                        key={section.key}
                        className="rounded-lg border border-[var(--border)] p-4"
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                              {section.eyebrow ?? section.key}
                            </div>
                            <h2 className="mt-1 text-base font-semibold">
                              {section.title}
                            </h2>
                          </div>
                          <Badge variant="outline">{responses.length} answers</Badge>
                        </div>
                        <div className="mt-3 space-y-3">
                          {responses.map((response) => (
                            <div
                              key={response.id}
                              className="rounded-md bg-[var(--secondary)] p-3"
                            >
                              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
                                <Badge variant="outline">
                                  {labelize(response.responseType)}
                                </Badge>
                                <span>
                                  {promptLabel(sectionByKey.get(response.sectionKey), response.promptKey)}
                                </span>
                                <span>· {formatRelative(response.createdAt)}</span>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                                {responseText(response.value)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
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
                    title="No events"
                    body="Invite creation, opens, saves, completion, and AI events will appear here."
                  />
                ) : (
                  <ul className="space-y-3">
                    {detail.events.map((event) => (
                      <li
                        key={event.id}
                        className="rounded-lg border border-[var(--border)] p-3"
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-sm font-medium">
                            {labelize(event.eventType)}
                          </div>
                          <div className="text-xs text-[var(--muted-foreground)]">
                            {formatRelative(event.createdAt)}
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
                          {event.sectionKey && <span>Section {event.sectionKey}</span>}
                          {Object.keys(event.metadata ?? {}).length > 0 && (
                            <code className="rounded bg-[var(--secondary)] px-1.5 py-0.5">
                              {JSON.stringify(event.metadata)}
                            </code>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Invite Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ProfileRow
                  label="Contact"
                  value={
                    <Link
                      href={`/contacts/${detail.contact.id}`}
                      className="font-medium hover:underline"
                    >
                      {detail.contact.name}
                    </Link>
                  }
                />
                <ProfileRow label="Campaign" value={detail.campaign.name} />
                <ProfileRow label="Channel" value={labelize(detail.invite.channel)} />
                <ProfileRow label="Sent" value={formatRelative(detail.invite.sentAt)} />
                <ProfileRow
                  label="Last viewed"
                  value={formatRelative(detail.invite.lastViewedAt)}
                />
                <ProfileRow label="Expires" value={formatDate(detail.invite.expiresAt)} />
                <ProfileRow
                  label="Revoked"
                  value={formatRelative(detail.invite.revokedAt)}
                />
                <div className="rounded-lg bg-[var(--secondary)] p-3 text-xs leading-5 text-[var(--muted-foreground)]">
                  Raw public tokens are shown once during generation and are not
                  stored. Internal tracking stays tied to this contact and invite.
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Campaign Snapshot
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2">
                  {sections.map((section, index) => (
                    <li
                      key={section.key}
                      className="flex items-start gap-2 rounded-lg bg-[var(--secondary)] p-3"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--card)] text-xs font-medium tabular-nums shadow-[inset_0_0_0_1px_var(--border)]">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="line-clamp-1 text-sm font-medium">
                          {section.title}
                        </div>
                        <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {section.prompts.length} prompt
                          {section.prompts.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  const icon =
    label === "Completed" ? (
      <CheckCircle2 className="h-3.5 w-3.5" />
    ) : label === "Opened" || label === "Views" ? (
      <Eye className="h-3.5 w-3.5" />
    ) : label === "Responses" ? (
      <Send className="h-3.5 w-3.5" />
    ) : (
      <Clock className="h-3.5 w-3.5" />
    );

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        {icon}
        {label}
      </div>
      <div className="mt-2 truncate text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function InsightList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg bg-[var(--card)] p-3 shadow-[inset_0_0_0_1px_var(--ai-border)]">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--ai-text)]">
        {title}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-xs">None detected.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs leading-5">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
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
    <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-2 last:border-b-0 last:pb-0">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="min-w-0 text-right">{value}</span>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--border)] p-5">
      <div className="text-sm font-medium">{title}</div>
      <p className="mt-2 max-w-prose text-sm leading-6 text-[var(--muted-foreground)]">
        {body}
      </p>
    </div>
  );
}
