import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CaptureSettingsCard } from "@/components/settings/capture-settings-card";
import { getWorkspaceRetentionDays } from "@/db/queries/capture-sessions";
import { getLatestHelperRelease } from "@/lib/capture/downloads";
import { safeRead } from "@/lib/db-status";
import { Download, Headphones } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CapturePage() {
  const user = await requireUser();
  const retentionDays = (
    await safeRead(() => getWorkspaceRetentionDays(user.workspaceId), 30)
  ).data;
  const release = await getLatestHelperRelease().catch(() => null);

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <header className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Headphones className="h-6 w-6 text-[var(--muted-foreground)]" /> Call Capture
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Record both sides of your calls — WhatsApp, Zoom, Meet, FaceTime,
            phone-via-Continuity — straight from your Mac, even with headphones.
            Each call is transcribed and filed to{" "}
            <a href="/record" className="underline hover:text-[var(--foreground)]">
              Record Call
            </a>{" "}
            with a brief and action items.
          </p>
        </header>

        {/* 1 — Download */}
        <Card>
          <CardHeader>
            <CardTitle>1 · Download the Mac Helper</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {release ? (
              <>
                <a
                  href="/api/capture/download"
                  className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
                >
                  <Download className="h-4 w-4" /> Download AGBCaptureHelper
                </a>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Version {release.version} ·{" "}
                  {(release.bytes / 1024 / 1024).toFixed(1)} MB · macOS 14+ (Apple
                  Silicon &amp; Intel).
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                No build published yet. The workspace owner publishes one with{" "}
                <code>macos-helper/scripts/release.sh</code>.
              </p>
            )}
          </CardContent>
        </Card>

        {/* 2 — Install + permissions */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>2 · Install &amp; grant permissions (once)</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
              <li>Unzip and move <strong>AGBCaptureHelper.app</strong> to your Applications folder.</li>
              <li>
                <strong>First open:</strong> right-click the app → <strong>Open</strong> →{" "}
                <strong>Open anyway</strong>. (It&apos;s internally signed, so macOS
                asks the first time.) It runs in the menu bar with a small floating
                <em> AGB Capture</em> panel — no Dock icon.
              </li>
              <li>
                Grant <strong>Microphone</strong> and <strong>Screen &amp; System Audio
                Recording</strong> when asked (System Settings → Privacy &amp;
                Security). These capture your voice and the other person&apos;s. If
                it asks you to quit &amp; reopen, do it.
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* 3 — Connect (token) */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>3 · Connect it to the CRM</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              Mint a token below, copy it, and paste it into the Helper&apos;s{" "}
              <strong>Configure…</strong> panel (menu-bar icon → Configure). The CRM
              URL is <code>{process.env.NEXT_PUBLIC_SITE_URL ?? "your CRM URL"}</code>.
              Hit <strong>Test Connection</strong> — it should go green.
            </p>
            <CaptureSettingsCard initialRetentionDays={retentionDays} />
          </CardContent>
        </Card>

        {/* 4 — Use */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>4 · Record a call</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
              <li>Start any call (WhatsApp / Zoom / Meet / FaceTime). Headphones are fine.</li>
              <li>
                Click the red <strong>● Start Recording</strong> button in the floating
                panel (or <strong>⌘⇧R</strong>).
              </li>
              <li>Talk. A live transcript window fills in as you go.</li>
              <li>
                Click <strong>■ Stop Recording</strong> when you hang up — calls don&apos;t
                always auto-detect their end, so stop it yourself.
              </li>
              <li>
                It files to <a href="/record" className="underline">Record Call</a> with
                both voices, a brief, and action items.
              </li>
            </ol>
            <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3 text-xs text-[var(--muted-foreground)]">
              <p className="mb-1 font-medium text-[var(--foreground)]">Notes</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Recording announces nothing — get consent where required.</li>
                <li>Call audio auto-deletes after the retention window; transcripts are kept.</li>
                <li>On a flaky network, uploads queue safely on disk and finish when it steadies.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
