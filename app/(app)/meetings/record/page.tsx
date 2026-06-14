import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { LiveCallRecorder } from "@/components/voice/live-call-recorder";

export default async function RecordCallPage() {
  const user = await requireUser();
  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-xl flex-1 px-6 py-8">
        <Link
          href="/meetings"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-4 w-4" /> All meetings
        </Link>

        <header className="mb-6 mt-4">
          <h1 className="text-2xl font-semibold tracking-tight">Record a call</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Put the call on speaker and hit record. Stopping files the full
            transcript, an AI brief, and action items as a meeting — linked to a
            contact if you name one.
          </p>
        </header>

        <LiveCallRecorder />

        <details className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--muted)]/15 p-4 text-sm text-[var(--muted-foreground)]">
          <summary className="cursor-pointer font-medium text-[var(--foreground)]">
            How it works &amp; full-call capture
          </summary>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>
              This in-browser recorder captures your microphone and needs{" "}
              <code>DEEPGRAM_API_KEY</code> (live transcript) and{" "}
              <code>ANTHROPIC_API_KEY</code> (brief + action items).
            </li>
            <li>
              To capture <em>both</em> sides of WhatsApp / Zoom / Meet / phone
              calls (even with headphones), use the Mac Helper — mint a token in
              Settings → Call Capture. Those calls file as meetings automatically
              with speaker-attributed transcripts.
            </li>
            <li>Recording announces nothing — get consent where required.</li>
          </ul>
        </details>
      </main>
    </>
  );
}
