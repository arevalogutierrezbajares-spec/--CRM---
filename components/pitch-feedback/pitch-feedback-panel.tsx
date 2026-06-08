import type React from "react";
import { Brain, CheckCircle2, Clock, Eye, MessageSquareText, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatRelative } from "@/lib/utils";
import type { PitchFeedbackContactOverview } from "@/db/queries/pitch-feedback";
import { SendInviteDialog } from "./send-invite-dialog";
import { PitchFeedbackInviteActions } from "./pitch-feedback-actions";

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

export function PitchFeedbackPanel({
  contactId,
  contactName,
  overview,
}: {
  contactId: string;
  contactName: string;
  overview: PitchFeedbackContactOverview;
}) {
  const latest = overview.invites[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <MessageSquareText className="h-4 w-4" />
            Pitch Feedback
          </span>
          <Button asChild variant="ghost" size="sm" className="h-7 px-2">
            <a href="/pitch-feedback">Open</a>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <SendInviteDialog
          contactId={contactId}
          contactName={contactName}
          campaigns={overview.campaigns}
        />

        {!latest ? (
          <div className="rounded-md border border-dashed border-[var(--border)] p-3">
            <p className="text-sm font-medium">No review link yet.</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
              Generate a unique private walkthrough from this contact. Opens,
              progress, feedback, and AI insight will roll up here.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <SummaryTile
                icon={<Send className="h-3.5 w-3.5" />}
                label="Status"
                value={<Badge variant={statusVariant(latest.status)}>{latest.status}</Badge>}
              />
              <SummaryTile
                icon={<Eye className="h-3.5 w-3.5" />}
                label="Views"
                value={<span className="tabular-nums">{latest.viewCount}</span>}
              />
              <SummaryTile
                icon={<Clock className="h-3.5 w-3.5" />}
                label="Last viewed"
                value={formatRelative(latest.lastViewedAt)}
              />
              <SummaryTile
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label="Progress"
                value={<span className="tabular-nums">{latest.completionPercent}%</span>}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{latest.campaignName}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    Sent {formatRelative(latest.sentAt)} · opened {formatRelative(latest.firstOpenedAt)}
                  </p>
                </div>
                <Badge variant={sentimentVariant(latest.latestInsight?.sentiment)}>
                  {latest.latestInsight?.supportLevel ?? "pending"}
                </Badge>
              </div>

              {latest.latestInsight ? (
                <div className="rounded-md bg-[var(--ai-bg)] p-3 text-sm shadow-[inset_0_0_0_1px_var(--ai-border)]">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--ai-text)]">
                    <Brain className="h-3.5 w-3.5" />
                    AI read
                  </div>
                  <p className="line-clamp-3 leading-5 text-[var(--ai-subtext)]">
                    {latest.latestInsight.summary}
                  </p>
                </div>
              ) : (
                <p className="text-xs leading-5 text-[var(--muted-foreground)]">
                  {latest.responseCount > 0
                    ? `${latest.responseCount} response${latest.responseCount === 1 ? "" : "s"} captured. Generate the AI read from details or this panel.`
                    : "No feedback submitted yet."}
                </p>
              )}

              <PitchFeedbackInviteActions
                inviteId={latest.id}
                contactId={contactId}
                canSummarize={latest.responseCount > 0}
                revoked={Boolean(latest.revokedAt)}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-[var(--background)] p-2 shadow-[inset_0_0_0_1px_var(--border)]">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}
