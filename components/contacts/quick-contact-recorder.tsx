"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Square, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pickRecorderMime, recorderFilename } from "@/lib/recorder";

type State = "idle" | "recording" | "uploading" | "done" | "error";

type Extracted = {
  name: string;
  organization: string | null;
  relationship: string;
  notes: string;
};

export function QuickContactRecorder() {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; extracted: Extracted } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    setError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickRecorderMime();
      if (!mime) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("Audio recording isn't supported in this browser.");
      }
      const mr = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = upload;
      mr.start();
      setState("recording");
      setElapsed(0);
      tickRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone access denied");
      setState("error");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setState("uploading");
  }

  async function upload() {
    const type = chunksRef.current[0]?.type ?? "audio/webm";
    const blob = new Blob(chunksRef.current, { type });
    chunksRef.current = [];
    const fd = new FormData();
    fd.append("audio", blob, recorderFilename(type));
    try {
      const r = await fetch("/api/voice/quick-contact", {
        method: "POST",
        body: fd,
      });
      const body = (await r.json()) as
        | { ok: true; contactId: string; extracted: Extracted }
        | { ok: false; error?: string; detail?: string };
      if (!r.ok || !("ok" in body) || !body.ok) {
        const message =
          ("error" in body && body.error) ||
          ("detail" in body && body.detail) ||
          `Upload failed (${r.status})`;
        throw new Error(message as string);
      }
      setResult({ id: body.contactId, extracted: body.extracted });
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setState("error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {state === "recording" ? (
          <Button type="button" variant="destructive" onClick={stop}>
            <Square className="h-4 w-4" /> Stop ({elapsed}s)
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={start}
            disabled={state === "uploading"}
          >
            <Mic className="h-4 w-4" />
            {state === "uploading"
              ? "Transcribing + extracting…"
              : state === "done"
                ? "Record another"
                : "Record"}
          </Button>
        )}
        <p className="text-xs text-[var(--muted-foreground)]">
          Needs <code>OPENAI_API_KEY</code>. With <code>ANTHROPIC_API_KEY</code> set,
          Claude extracts name + org + relationship; otherwise we use the first
          sentence as the name and you edit on the detail page.
        </p>
      </div>

      {error && (
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      )}

      {result && (
        <div className="rounded-md border border-[var(--health-green)]/40 bg-[var(--health-green)]/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--health-green)]">
            <Check className="h-4 w-4" /> Contact created
          </div>
          <dl className="grid grid-cols-[100px_1fr] gap-y-1 text-sm">
            <dt className="text-[var(--muted-foreground)]">Name</dt>
            <dd>{result.extracted.name}</dd>
            {result.extracted.organization && (
              <>
                <dt className="text-[var(--muted-foreground)]">Org</dt>
                <dd>{result.extracted.organization}</dd>
              </>
            )}
            <dt className="text-[var(--muted-foreground)]">Relationship</dt>
            <dd>{result.extracted.relationship}</dd>
          </dl>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => router.push(`/contacts/${result.id}`)}
            >
              Open contact
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => router.push(`/contacts/${result.id}/edit`)}
            >
              Edit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
