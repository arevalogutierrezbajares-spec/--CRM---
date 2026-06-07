import { headers } from "next/headers";
import { Lock, MessageSquareText } from "lucide-react";
import {
  getPublicPitchFeedbackInviteByToken,
  recordPublicPitchFeedbackOpen,
} from "@/db/queries/pitch-feedback";
import { PitchFeedbackPlayer } from "@/components/pitch-feedback/recipient/pitch-player";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

export default async function PitchFeedbackPublicPage({
  params,
}: {
  params: Params;
}) {
  const { token } = await params;
  const headerStore = await headers();
  const access = await getPublicPitchFeedbackInviteByToken({ token }).catch(
    () => null,
  );
  if (!access) return <UnavailableReview />;

  const opened = await recordPublicPitchFeedbackOpen({
    token,
    userAgent: headerStore.get("user-agent"),
    ip:
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerStore.get("x-real-ip"),
    referrer: headerStore.get("referer"),
  }).catch(() => null);

  if (!opened) return <UnavailableReview />;

  return (
    <PitchFeedbackPlayer
      token={token}
      sessionId={opened.session.id}
      campaign={opened.campaign}
      contact={opened.contact}
      invite={{
        id: opened.invite.id,
        status: opened.invite.status,
        completionPercent: opened.invite.completionPercent,
        currentSectionKey: opened.invite.currentSectionKey,
        personalization: opened.invite.personalization,
      }}
      sections={opened.invite.sectionsSnapshot}
      initialResponses={opened.responses}
    />
  );
}

function UnavailableReview() {
  return (
    <main className="min-h-screen bg-[var(--bg-page)]">
      <div className="mx-auto grid min-h-screen w-full max-w-2xl place-items-center px-5 py-10">
        <div className="w-full rounded-xl bg-[var(--card)] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.12),inset_0_0_0_1px_var(--border)]">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--secondary)]">
            <Lock className="h-5 w-5 text-[var(--muted-foreground)]" />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Review unavailable</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">
            This private review link may have expired, been revoked, or been
            replaced. Ask the person who sent it for the latest link.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-[var(--secondary)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
            <MessageSquareText className="h-3.5 w-3.5" />
            AGB CRM private feedback
          </div>
        </div>
      </div>
    </main>
  );
}
