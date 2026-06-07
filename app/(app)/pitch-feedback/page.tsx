import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Eye,
  MessageSquareText,
  Send,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DbBanner } from "@/components/db-banner";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import {
  ensureDefaultPitchFeedbackCampaign,
  listPitchFeedbackDashboard,
  type PitchFeedbackDashboardInviteListItem,
} from "@/db/queries/pitch-feedback";
import { requireUser } from "@/lib/current-user";
import { safeRead } from "@/lib/db-status";
import { formatRelative } from "@/lib/utils";

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

function metrics(invites: PitchFeedbackDashboardInviteListItem[]) {
  const sent = invites.filter((invite) => invite.sentAt).length;
  const opened = invites.filter((invite) => invite.firstOpenedAt).length;
  const active = invites.filter((invite) =>
    ["opened", "in_progress"].includes(invite.status),
  ).length;
  const completed = invites.filter((invite) => invite.status === "completed").length;
  const responses = invites.reduce((sum, invite) => sum + invite.responseCount, 0);
  const avgProgress = invites.length
    ? Math.round(
        invites.reduce((sum, invite) => sum + invite.completionPercent, 0) /
          invites.length,
      )
    : 0;

  return { sent, opened, active, completed, responses, avgProgress };
}

export default async function PitchFeedbackPage() {
  const user = await requireUser();
  const res = await safeRead(async () => {
    await ensureDefaultPitchFeedbackCampaign({
      workspaceId: user.workspaceId,
      actorId: user.id,
    });
    return listPitchFeedbackDashboard({ workspaceId: user.workspaceId });
  }, { campaigns: [], invites: [] });
  const data = res.data;
  const totals = metrics(data.invites);

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        title="Pitch Feedback"
      />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-6 py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              F&F Pitch Feedback
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
              Private contact-linked walkthroughs, opens, responses, AI reads,
              and follow-up signals in one CRM loop.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/contacts">
              <UsersRound className="h-4 w-4" />
              Choose contact
            </Link>
          </Button>
        </div>

        {!res.ok && <DbBanner error={res.error} />}

        <div className="grid gap-3 md:grid-cols-6">
          <Summary label="Invites" value={data.invites.length} />
          <Summary label="Sent" value={totals.sent} />
          <Summary label="Opened" value={totals.opened} />
          <Summary label="In progress" value={totals.active} />
          <Summary label="Completed" value={totals.completed} />
          <Summary label="Responses" value={totals.responses} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Campaigns
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.campaigns.length === 0 ? (
                  <EmptyState
                    title="No campaigns"
                    body="Open any contact and create the first private review link."
                  />
                ) : (
                  <ul className="space-y-2">
                    {data.campaigns.map((campaign) => {
                      const invites = data.invites.filter(
                        (invite) => invite.campaignId === campaign.id,
                      );
                      const campaignTotals = metrics(invites);
                      return (
                        <li
                          key={campaign.id}
                          className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">
                                {campaign.name}
                              </div>
                              <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                                {labelize(campaign.audience)} · v{campaign.version}
                              </div>
                            </div>
                            <Badge variant={campaign.status === "active" ? "success" : "outline"}>
                              {campaign.status}
                            </Badge>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--secondary)]">
                            <div
                              className="h-full rounded-full bg-[var(--primary)]"
                              style={{ width: `${campaignTotals.avgProgress}%` }}
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                            <span>{invites.length} invited</span>
                            <span className="tabular-nums">
                              {campaignTotals.avgProgress}% avg progress
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Follow-Up Queue
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.invites.filter((invite) => invite.latestInsight).length === 0 ? (
                  <EmptyState
                    title="No AI reads yet"
                    body="Completed reviews generate a concise support level, objections, and recommended next ask."
                  />
                ) : (
                  <ul className="space-y-3">
                    {data.invites
                      .filter((invite) => invite.latestInsight)
                      .slice(0, 6)
                      .map((invite) => (
                        <li
                          key={invite.id}
                          className="rounded-lg bg-[var(--ai-bg)] p-3 shadow-[inset_0_0_0_1px_var(--ai-border)]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              href={`/pitch-feedback/invites/${invite.id}`}
                              className="min-w-0 truncate text-sm font-medium text-[var(--ai-text)] hover:underline"
                            >
                              {invite.contactName}
                            </Link>
                            <Badge variant={sentimentVariant(invite.latestInsight?.sentiment)}>
                              {invite.latestInsight?.supportLevel}
                            </Badge>
                          </div>
                          <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--ai-subtext)]">
                            {invite.latestInsight?.recommendedFollowup ??
                              invite.latestInsight?.summary}
                          </p>
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="h-4 w-4" />
                Invite Ledger
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.invites.length === 0 ? (
                <EmptyState
                  title="No invites yet"
                  body="Start from a contact detail page. Each generated link is unique, private, and tracked back to that contact."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-left text-sm">
                    <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                      <tr>
                        <th className="py-2 pr-4 font-medium">Contact</th>
                        <th className="py-2 pr-4 font-medium">Campaign</th>
                        <th className="py-2 pr-4 font-medium">Status</th>
                        <th className="py-2 pr-4 font-medium">Progress</th>
                        <th className="py-2 pr-4 font-medium">Views</th>
                        <th className="py-2 pr-4 font-medium">Feedback</th>
                        <th className="py-2 pr-4 font-medium">AI read</th>
                        <th className="py-2 font-medium">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {data.invites.map((invite) => (
                        <tr key={invite.id} className="align-top">
                          <td className="py-3 pr-4">
                            <Link
                              href={`/contacts/${invite.contactId}`}
                              className="font-medium hover:underline"
                            >
                              {invite.contactName}
                            </Link>
                            {invite.contactOrganization && (
                              <div className="text-xs text-[var(--muted-foreground)]">
                                {invite.contactOrganization}
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <Link
                              href={`/pitch-feedback/invites/${invite.id}`}
                              className="max-w-[240px] truncate font-medium hover:underline"
                            >
                              {invite.campaignName}
                            </Link>
                            <div className="text-xs text-[var(--muted-foreground)]">
                              {invite.channel} · v{invite.campaignVersion}
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <Badge variant={statusVariant(invite.status)}>
                              {labelize(invite.status)}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4">
                            <div className="w-28">
                              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                                <span>{invite.currentSectionKey ?? "start"}</span>
                                <span className="tabular-nums">
                                  {invite.completionPercent}%
                                </span>
                              </div>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--secondary)]">
                                <div
                                  className="h-full rounded-full bg-[var(--primary)]"
                                  style={{
                                    width: `${invite.completionPercent}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-4 tabular-nums">{invite.viewCount}</td>
                          <td className="py-3 pr-4 tabular-nums">
                            {invite.responseCount}
                          </td>
                          <td className="py-3 pr-4">
                            {invite.latestInsight ? (
                              <Badge variant={sentimentVariant(invite.latestInsight.sentiment)}>
                                {invite.latestInsight.supportLevel}
                              </Badge>
                            ) : (
                              <span className="text-xs text-[var(--muted-foreground)]">
                                pending
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-[var(--muted-foreground)]">
                            {formatRelative(invite.updatedAt)}
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
  const icon =
    label === "Completed" ? (
      <CheckCircle2 className="h-3.5 w-3.5" />
    ) : label === "Opened" ? (
      <Eye className="h-3.5 w-3.5" />
    ) : label === "Sent" ? (
      <Send className="h-3.5 w-3.5" />
    ) : label === "In progress" ? (
      <Clock className="h-3.5 w-3.5" />
    ) : (
      <MessageSquareText className="h-3.5 w-3.5" />
    );

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        {icon}
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
      <p className="mt-2 max-w-prose text-sm leading-6 text-[var(--muted-foreground)]">
        {body}
      </p>
    </div>
  );
}
