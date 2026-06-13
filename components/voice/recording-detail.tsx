"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  Check,
  Clock,
  Headphones,
  Loader2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Utterance = {
  speaker: string;
  channel: number;
  start: number;
  end: number;
  text: string;
};

type RecordingDetail = {
  id: string;
  title: string;
  brief: string | null;
  transcript: string;
  durationSecs: number | null;
  createdAt: string;
  utterances: Utterance[] | null;
  channels: number;
  sourceApp: string | null;
  partial: boolean;
  suspectFlags: string[];
  consentNote: string | null;
  contactId: string | null;
  contactName: string | null;
  contactAmbiguous: boolean;
  meetingId: string | null;
  meetingTitle: string | null;
  hasAudio: boolean;
  audioPurgeAt: string | null;
  audioPurgedAt: string | null;
};

function fmtTs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const FLAG_COPY: Record<string, string> = {
  founder_channel_silent:
    "Your side of this call is near-silent — the microphone may have been muted or mis-routed.",
  participant_channel_silent:
    "The participants' side is near-silent — system audio may not have been captured.",
};

export function RecordingDetail({ id }: { id: string }) {
  const router = useRouter();
  const [rec, setRec] = useState<RecordingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [consentDraft, setConsentDraft] = useState("");
  const [editingConsent, setEditingConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/voice/recording/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as RecordingDetail;
        if (!cancelled) {
          setRec(body);
          setTitleDraft(body.title);
          setConsentDraft(body.consentNote ?? "");
        }
      } catch {
        if (!cancelled) setError("Could not load this recording.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetch(`/api/voice/recording/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (
      !window.confirm(
        "Permanently delete this call? Audio, transcript, and brief are removed. This cannot be undone.",
      )
    ) {
      return;
    }
    setDeleting(true);
    const res = await fetch(`/api/voice/recording/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/meetings");
    else setDeleting(false);
  }

  if (error) {
    return <p className="text-sm text-[var(--destructive)]">{error}</p>;
  }
  if (!rec) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading recording…
      </p>
    );
  }

  const founderLabel = "You";
  const participantLabel = rec.contactName ?? "Participant";

  return (
    <div className="space-y-6">
      {/* Title + actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-lg font-semibold"
                maxLength={120}
                autoFocus
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={async () => {
                  await patch({ title: titleDraft });
                  setRec({ ...rec, title: titleDraft });
                  setEditingTitle(false);
                }}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingTitle(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <span className="truncate">{rec.title}</span>
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                aria-label="Edit title"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </h2>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted-foreground)]">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(rec.createdAt).toLocaleString()}
            </span>
            {rec.durationSecs ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {Math.round(rec.durationSecs / 60)} min
              </span>
            ) : null}
            {rec.sourceApp && <span>via {rec.sourceApp}</span>}
            {rec.meetingId && (
              <Link
                href={`/meetings/${rec.meetingId}`}
                className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
              >
                <CalendarClock className="h-3 w-3" />
                {rec.meetingTitle ?? "View meeting"}
              </Link>
            )}
            {rec.partial && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600">
                partial — recovered after an interruption
              </span>
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-[var(--destructive)]"
          onClick={onDelete}
          disabled={deleting}
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Delete
        </Button>
      </div>

      {/* Ambiguous contact match (FR-CALL-DST-4) */}
      {rec.contactAmbiguous && !rec.contactId && (
        <div className="rounded-md border border-sky-500/40 bg-sky-500/10 p-3 text-sm text-sky-700">
          A name was mentioned that matched more than one contact, so this call
          isn&apos;t linked yet. Edit the title or open the contact to link it
          manually.
        </div>
      )}

      {/* Suspect-capture warnings (FR-CALL-OPS-4) */}
      {rec.suspectFlags.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          {rec.suspectFlags.map((f) => (
            <p key={f} className="flex items-start gap-2 text-sm text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
              {FLAG_COPY[f] ?? f}
            </p>
          ))}
        </div>
      )}

      {/* Audio playback + retention state (FR-CALL-ACC-3, RET-2) */}
      <div className="rounded-md border border-[var(--border)] p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          <Headphones className="h-3.5 w-3.5" /> Audio
        </div>
        {rec.hasAudio ? (
          <>
            <audio controls preload="none" className="w-full" src={`/api/voice/recording/${rec.id}/audio`} />
            {rec.audioPurgeAt && (
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                Audio auto-deletes on {fmtDate(rec.audioPurgeAt)} per the retention
                policy. The transcript and brief are kept permanently.
              </p>
            )}
          </>
        ) : rec.audioPurgedAt ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Audio expired on {fmtDate(rec.audioPurgedAt)} per the retention policy.
            The transcript below is permanent.
          </p>
        ) : rec.sourceApp ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Audio wasn&apos;t stored in the CRM (transcript-only mode). If the Mac
            Helper kept a local copy, it&apos;s in your Call Recordings folder on
            that Mac. The transcript below is permanent.
          </p>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            No audio stored for this recording (live-transcribed call).
          </p>
        )}
      </div>

      {/* Brief */}
      {rec.brief && (
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Brief
          </div>
          <pre className="whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--muted)]/20 p-3 font-sans text-sm leading-relaxed">
            {rec.brief}
          </pre>
        </div>
      )}

      {/* Dialogue transcript (FR-CALL-ATT-2) */}
      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          Transcript
        </div>
        {rec.utterances && rec.utterances.length > 0 ? (
          <div className="max-h-[32rem] space-y-2 overflow-y-auto rounded-md border border-[var(--border)] p-3">
            {rec.utterances.map((u, i) => {
              const isFounder = u.speaker === "founder";
              return (
                <div key={i} className={`flex ${isFounder ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                      isFounder
                        ? "bg-[var(--primary)]/10 text-[var(--foreground)]"
                        : "bg-[var(--muted)]/40 text-[var(--foreground)]"
                    }`}
                  >
                    <div className="mb-0.5 flex items-baseline gap-2 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                      <span className="font-semibold">
                        {isFounder ? founderLabel : participantLabel}
                      </span>
                      <span>{fmtTs(u.start)}</span>
                    </div>
                    {u.text}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--muted)]/20 p-3 text-sm leading-relaxed">
            {rec.transcript}
          </p>
        )}
      </div>

      {/* Consent posture note (FR-CALL-RET-5) */}
      <div className="rounded-md border border-[var(--border)] p-3">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          Consent note
        </div>
        {editingConsent ? (
          <div className="space-y-2">
            <input
              value={consentDraft}
              onChange={(e) => setConsentDraft(e.target.value)}
              placeholder='e.g. "Participant informed verbally at call start"'
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
              maxLength={500}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={saving}
                onClick={async () => {
                  await patch({ consentNote: consentDraft || null });
                  setRec({ ...rec, consentNote: consentDraft || null });
                  setEditingConsent(false);
                }}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingConsent(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingConsent(true)}
            className="text-left text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            {rec.consentNote ?? "Add a note about how consent was handled →"}
          </button>
        )}
      </div>
    </div>
  );
}
