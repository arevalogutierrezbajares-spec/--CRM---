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
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Record a call</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Put the call on speaker, hit record, and watch the transcript build
            live. Stop files a brief and creates action items — and logs the call
            to a contact if you name one.
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
              For VoIP calls, route system audio to the mic (BlackHole) or put the
              call on speaker.
            </li>
            <li>Recording announces nothing — get consent where required.</li>
          </ul>
        </div>
      </main>
    </>
  );
}
