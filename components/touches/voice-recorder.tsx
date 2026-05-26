"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pickRecorderMime, recorderFilename } from "@/lib/recorder";

type State = "idle" | "recording" | "uploading" | "error";

export function VoiceRecorder({
  contactId,
  projectId,
}: {
  contactId: string;
  projectId?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
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
      tickRef.current = window.setInterval(
        () => setElapsed((e) => e + 1),
        1000,
      );
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
    fd.append("contactId", contactId);
    if (projectId) fd.append("projectId", projectId);
    try {
      const r = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `Upload failed (${r.status})`,
        );
      }
      setState("idle");
      setElapsed(0);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setState("error");
    }
  }

  return (
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
          {state === "uploading" ? "Transcribing…" : "Record voice memo"}
        </Button>
      )}
      <p className="text-xs text-[var(--muted-foreground)]">
        Browser records → Whisper transcribes → Touch is created with the
        transcript. Needs <code>OPENAI_API_KEY</code>.
      </p>
      {error && (
        <p className="basis-full text-sm text-[var(--destructive)]">{error}</p>
      )}
    </div>
  );
}
