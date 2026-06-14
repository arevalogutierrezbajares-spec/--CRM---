import Link from "next/link";
import { Download } from "lucide-react";
import { CaptureSettingsCard } from "@/components/settings/capture-settings-card";

/**
 * Call Capture setup guide + controls, rendered inside a Settings →
 * Configurations section. Migrated from the old standalone /capture page:
 * what it does, the one-time Mac Helper install, connecting it with a token,
 * and how to record a call. The token mint/retention/audio controls live in
 * <CaptureSettingsCard> at the bottom.
 */
export function CallCaptureConfig({
  download,
  siteUrl,
  retentionDays,
  storeCallAudio,
}: {
  download: { version: string; bytes: number } | null;
  siteUrl: string;
  retentionDays: number;
  storeCallAudio: boolean;
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
        Record both sides of your calls — WhatsApp, Zoom, Meet, FaceTime,
        phone-via-Continuity — straight from your Mac, even with headphones. Each
        call is transcribed and filed to{" "}
        <Link href="/meetings" className="underline hover:text-[var(--foreground)]">
          Meetings
        </Link>{" "}
        with a brief and action items.
      </p>

      {/* 1 — Download */}
      <Step n={1} title="Download the Mac Helper">
        {download ? (
          <div className="space-y-2">
            <a
              href="/api/capture/download"
              className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
            >
              <Download className="h-4 w-4" /> Download AGBCaptureHelper
            </a>
            <p className="text-xs text-[var(--muted-foreground)]">
              Version {download.version} ·{" "}
              {(download.bytes / 1024 / 1024).toFixed(1)} MB · macOS 14+ (Apple
              Silicon &amp; Intel).
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            No build published yet. The workspace owner publishes one with{" "}
            <code>macos-helper/scripts/release.sh</code>.
          </p>
        )}
      </Step>

      {/* 2 — Install + permissions */}
      <Step n={2} title="Install & grant permissions (once)">
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Unzip and move <strong>AGBCaptureHelper.app</strong> to your
            Applications folder.
          </li>
          <li>
            <strong>First open:</strong> right-click the app → <strong>Open</strong>{" "}
            → <strong>Open anyway</strong>. (It&apos;s internally signed, so macOS
            asks the first time.) It runs in the menu bar with a small floating
            <em> AGB Capture</em> panel — no Dock icon.
          </li>
          <li>
            Grant <strong>Microphone</strong> and{" "}
            <strong>Screen &amp; System Audio Recording</strong> when asked (System
            Settings → Privacy &amp; Security). These capture your voice and the
            other person&apos;s. If it asks you to quit &amp; reopen, do it.
          </li>
        </ol>
      </Step>

      {/* 3 — Connect (token) */}
      <Step n={3} title="Connect it to the CRM">
        <p className="text-sm text-[var(--muted-foreground)]">
          Mint a token below, copy it, and paste it into the Helper&apos;s{" "}
          <strong>Configure…</strong> panel (menu-bar icon → Configure). The CRM
          URL is <code>{siteUrl}</code>. Hit <strong>Test Connection</strong> — it
          should go green.
        </p>
        <div className="mt-3">
          <CaptureSettingsCard
            initialRetentionDays={retentionDays}
            initialStoreCallAudio={storeCallAudio}
          />
        </div>
      </Step>

      {/* 4 — Use */}
      <Step n={4} title="Record a call">
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            Start any call (WhatsApp / Zoom / Meet / FaceTime). Headphones are
            fine.
          </li>
          <li>
            Click the red <strong>● Start Recording</strong> button in the floating
            panel (or <strong>⌘⇧R</strong>).
          </li>
          <li>Talk. A live transcript window fills in as you go.</li>
          <li>
            Click <strong>■ Stop Recording</strong> when you hang up — calls
            don&apos;t always auto-detect their end, so stop it yourself.
          </li>
          <li>
            It files to{" "}
            <Link href="/meetings" className="underline">
              Meetings
            </Link>{" "}
            with both voices, a brief, and action items.
          </li>
        </ol>
        <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3 text-xs text-[var(--muted-foreground)]">
          <p className="mb-1 font-medium text-[var(--foreground)]">Notes</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Recording announces nothing — get consent where required.</li>
            <li>
              Call audio auto-deletes after the retention window; transcripts are
              kept.
            </li>
            <li>
              On a flaky network, uploads queue safely on disk and finish when it
              steadies.
            </li>
          </ul>
        </div>
      </Step>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[var(--muted)] text-sm font-semibold text-[var(--foreground)]">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="mb-2 text-sm font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}
