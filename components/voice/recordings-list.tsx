"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  FileText,
  Headphones,
  Loader2,
  User,
} from "lucide-react";
import type { CallRecordingListItem } from "@/db/queries/call-recordings";

function fmtDuration(secs: number | null): string {
  if (!secs || secs <= 0) return "";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

function fmtWhen(d: Date): string {
  return new Date(d).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RecordingsList({
  recordings,
}: {
  recordings: CallRecordingListItem[];
}) {
  if (recordings.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No recordings yet. Your saved calls — transcript, brief, and action items
        — will appear here.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-[var(--border)]">
      {recordings.map((r) => (
        <RecordingRow key={r.id} rec={r} />
      ))}
    </ul>
  );
}

function RecordingRow({ rec }: { rec: CallRecordingListItem }) {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && transcript === null) {
      setLoading(true);
      try {
        const res = await fetch(`/api/voice/recording/${rec.id}`);
        const body = (await res.json()) as { transcript?: string };
        setTranscript(body.transcript ?? "(transcript unavailable)");
      } catch {
        setTranscript("(could not load transcript)");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <li className="py-3">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-start gap-3 text-left"
      >
        <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-md bg-[var(--muted)] text-[var(--muted-foreground)]">
          <FileText className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{rec.title}</span>
            {rec.actionItemCount > 0 && (
              <span className="flex-none rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
                {rec.actionItemCount} task{rec.actionItemCount === 1 ? "" : "s"}
              </span>
            )}
            {rec.hasAudio && (
              <Headphones
                className="h-3.5 w-3.5 flex-none text-[var(--muted-foreground)]"
                aria-label="Audio available"
              />
            )}
            {rec.partial && (
              <span className="flex-none rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600">
                partial
              </span>
            )}
            {rec.suspectFlags.length > 0 && (
              <AlertTriangle
                className="h-3.5 w-3.5 flex-none text-amber-600"
                aria-label="Capture warning — open for details"
              />
            )}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--muted-foreground)]">
            <span>{fmtWhen(rec.createdAt)}</span>
            {fmtDuration(rec.durationSecs) && (
              <span>· {fmtDuration(rec.durationSecs)}</span>
            )}
            {rec.contactId && rec.contactName ? (
              <Link
                href={`/contacts/${rec.contactId}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 hover:text-[var(--foreground)] hover:underline"
              >
                <User className="h-3 w-3" /> {rec.contactName}
              </Link>
            ) : (
              <span>· not linked to a contact</span>
            )}
            {rec.sourceApp && <span>· via {rec.sourceApp}</span>}
            <Link
              href={`/record/${rec.id}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:text-[var(--foreground)] hover:underline"
            >
              · open →
            </Link>
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 flex-none text-[var(--muted-foreground)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="mt-3 space-y-3 pl-11">
          {rec.brief && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                Brief
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm text-[var(--foreground)]">
                {rec.brief}
              </pre>
            </div>
          )}
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Transcript
            </div>
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </p>
            ) : (
              <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--muted)]/20 p-3 text-sm leading-relaxed">
                {transcript}
              </p>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
