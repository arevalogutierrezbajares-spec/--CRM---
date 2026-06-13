import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveCallRecorder } from "@/components/voice/live-call-recorder";

export default async function RecordCallPage() {
  const user = await requireUser();
  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <Link
          href="/meetings"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-4 w-4" /> All meetings
        </Link>

        <header className="mb-6 mt-4">
          <h1 className="text-2xl font-semibold tracking-tight">Record a call</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Put the call on speaker, hit record, and watch the transcript build
            live. Stop always saves the full transcript + brief, creates action
            items, and files the call as a meeting — linked to a contact if you
            name one. Find it afterwards under Meetings.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Live transcription</CardTitle>
          </CardHeader>
          <CardContent>
            <LiveCallRecorder />
          </CardContent>
        </Card>

        <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm text-[var(--muted-foreground)]">
          <p className="mb-1 font-medium text-[var(--foreground)]">Notes</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Needs <code>DEEPGRAM_API_KEY</code> (streaming transcript) and{" "}
              <code>ANTHROPIC_API_KEY</code> (brief + action items).
            </li>
            <li>
              Full-call capture (WhatsApp / Zoom / Meet / phone-via-Continuity,
              both voices, headphones included) runs through the Mac Helper —
              mint a token in Settings → Call capture, see{" "}
              <code>macos-helper/README.md</code>. Helper calls file as meetings
              automatically with speaker-attributed transcripts.
            </li>
            <li>Recording announces nothing — get consent where required.</li>
          </ul>
        </div>
      </main>
    </>
  );
}
