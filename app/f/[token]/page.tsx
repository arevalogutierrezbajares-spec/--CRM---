import { Lock } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Retired surface. The F&F Pitch Feedback walkthrough was replaced by private
 * Share & Track rooms (/access/[token]). Links already sent land here and show
 * a calm notice instead of a 404. No data is read; the route stays public so
 * the message is reachable without a login.
 */
export default function RetiredPitchFeedbackPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-page)]">
      <div className="mx-auto grid min-h-screen w-full max-w-2xl place-items-center px-5 py-10">
        <div className="w-full rounded-xl bg-[var(--card)] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.12),inset_0_0_0_1px_var(--border)]">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--secondary)]">
            <Lock className="h-5 w-5 text-[var(--muted-foreground)]" />
          </div>
          <h1 className="mt-4 text-xl font-semibold">This link has moved</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">
            The private review you were sent is no longer here. Ask the person
            who shared it for their latest link — they can send you an updated
            one in a moment.
          </p>
        </div>
      </div>
    </main>
  );
}
