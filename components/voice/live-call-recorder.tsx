"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Square, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type State = "idle" | "connecting" | "recording" | "saving" | "done" | "error";
type Lang = "es" | "en" | "multi";

type SaveResult = {
  title: string;
  brief: string;
  actionItemCount: number;
  contact: { id: string; name: string } | null;
};

// Deepgram tries 'token' first (the documented browser subprotocol); if the
// handshake fails before opening we retry with 'bearer' so it works regardless
// of how the account/token is provisioned.
const AUTH_SCHEMES = ["token", "bearer"] as const;

function dgQuery(lang: Lang, sampleRate: number): string {
  const base =
    `encoding=linear16&sample_rate=${sampleRate}&channels=1` +
    `&smart_format=true&interim_results=true&punctuate=true`;
  if (lang === "multi") return `${base}&model=nova-3&language=multi`;
  return `${base}&model=nova-2&language=${lang}`;
}

export function LiveCallRecorder() {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [lang, setLang] = useState<Lang>("es");
  const [contactName, setContactName] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [finals, setFinals] = useState<string[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const tickRef = useRef<number | null>(null);
  // Refs so WebSocket handlers never read stale React state.
  const finalsRef = useRef<string[]>([]);
  const interimRef = useRef("");
  const openedRef = useRef(false);
  const stoppingRef = useRef(false);
  const schemeIdxRef = useRef(0);

  useEffect(() => () => teardown(), []);

  function teardown() {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    try {
      nodeRef.current?.disconnect();
    } catch {}
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      if (ctxRef.current && ctxRef.current.state !== "closed")
        void ctxRef.current.close();
    } catch {}
    try {
      if (wsRef.current && wsRef.current.readyState <= 1) wsRef.current.close();
    } catch {}
    nodeRef.current = null;
    streamRef.current = null;
    ctxRef.current = null;
    wsRef.current = null;
  }

  function openSocket(token: string, sampleRate: number) {
    const scheme = AUTH_SCHEMES[schemeIdxRef.current];
    const url = `wss://api.deepgram.com/v1/listen?${dgQuery(lang, sampleRate)}`;
    const ws = new WebSocket(url, [scheme, token]);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      openedRef.current = true;
      setState("recording");
      if (tickRef.current === null) {
        tickRef.current = window.setInterval(
          () => setElapsed((s) => s + 1),
          1000,
        );
      }
    };

    ws.onmessage = (ev) => {
      let data: {
        channel?: { alternatives?: Array<{ transcript?: string }> };
        is_final?: boolean;
      };
      try {
        data = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      const text = data.channel?.alternatives?.[0]?.transcript ?? "";
      if (!text) return;
      if (data.is_final) {
        finalsRef.current = [...finalsRef.current, text];
        interimRef.current = "";
        setFinals(finalsRef.current);
        setInterim("");
      } else {
        interimRef.current = text;
        setInterim(text);
      }
    };

    ws.onerror = () => {
      // Let onclose decide messaging/retry — onerror has no useful detail.
    };

    ws.onclose = (ev) => {
      if (stoppingRef.current) return;
      // Handshake failed before opening → try the alternate auth scheme once.
      if (!openedRef.current && schemeIdxRef.current < AUTH_SCHEMES.length - 1) {
        schemeIdxRef.current += 1;
        openSocket(token, sampleRate);
        return;
      }
      if (ev.code !== 1000) {
        setError(
          openedRef.current
            ? `Live connection dropped (${ev.code}${ev.reason ? `: ${ev.reason}` : ""}).`
            : `Couldn't authenticate to Deepgram (${ev.code}${ev.reason ? `: ${ev.reason}` : ""}). Check DEEPGRAM_API_KEY and that the plan allows streaming.`,
        );
        setState("error");
        teardown();
      }
    };
  }

  async function start() {
    setError(null);
    setResult(null);
    setFinals([]);
    setInterim("");
    setElapsed(0);
    finalsRef.current = [];
    interimRef.current = "";
    openedRef.current = false;
    stoppingRef.current = false;
    schemeIdxRef.current = 0;
    setState("connecting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const tokRes = await fetch("/api/voice/live-token", { method: "POST" });
      const tok = (await tokRes.json()) as { token?: string; error?: string };
      if (!tokRes.ok || !tok.token) {
        throw new Error(tok.error || `Token request failed (${tokRes.status})`);
      }

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      await ctx.audioWorklet.addModule("/dg-pcm-processor.js");
      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "dg-pcm-processor");
      nodeRef.current = node;
      source.connect(node);
      node.connect(ctx.destination); // keeps the graph pulling; emits silence

      node.port.onmessage = (e: MessageEvent) => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(e.data as ArrayBuffer);
      };

      openSocket(tok.token, Math.round(ctx.sampleRate));
    } catch (e) {
      teardown();
      setError(e instanceof Error ? e.message : "Could not start recording");
      setState("error");
    }
  }

  async function stop() {
    const seconds = elapsed;
    stoppingRef.current = true;
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "CloseStream" }));
      }
    } catch {}
    // brief grace period for the last finals to arrive
    await new Promise((r) => setTimeout(r, 600));
    teardown();

    const transcript = [...finalsRef.current, interimRef.current]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    setInterim("");
    if (!transcript) {
      setError("No speech captured.");
      setState("error");
      return;
    }

    setState("saving");
    try {
      const r = await fetch("/api/voice/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          durationSecs: seconds,
          contactName: contactName.trim() || undefined,
        }),
      });
      const body = (await r.json()) as SaveResult & {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || !body.ok) throw new Error(body.error || `Save failed (${r.status})`);
      setResult({
        title: body.title,
        brief: body.brief,
        actionItemCount: body.actionItemCount,
        contact: body.contact,
      });
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setState("error");
    }
  }

  const recording = state === "recording";
  const busy = state === "connecting" || state === "saving";
  const liveText = [...finals, interim].filter(Boolean).join(" ");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {recording ? (
          <Button type="button" variant="destructive" onClick={stop}>
            <Square className="h-4 w-4" /> Stop & file ({elapsed}s)
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={start} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            {state === "connecting"
              ? "Connecting…"
              : state === "saving"
                ? "Filing…"
                : state === "done"
                  ? "Record another"
                  : "Start recording"}
          </Button>
        )}

        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          disabled={recording || busy}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
          aria-label="Transcription language"
        >
          <option value="es">Spanish</option>
          <option value="en">English</option>
          <option value="multi">Multilingual</option>
        </select>

        <input
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          disabled={recording || busy}
          placeholder="Attach to contact (optional)"
          className="h-9 min-w-[200px] flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
        />
      </div>

      {recording && (
        <p className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--destructive)]" />
          Live — speak normally. Transcript builds below; Stop files the brief +
          action items.
        </p>
      )}

      {(recording || liveText) && state !== "done" && (
        <div className="max-h-72 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--muted)]/20 p-4 text-sm leading-relaxed">
          {liveText ? (
            <>
              <span>{finals.join(" ")} </span>
              <span className="text-[var(--muted-foreground)]">{interim}</span>
            </>
          ) : (
            <span className="text-[var(--muted-foreground)]">Listening…</span>
          )}
        </div>
      )}

      {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}

      {result && (
        <div className="rounded-md border border-[var(--health-green)]/40 bg-[var(--health-green)]/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--health-green)]">
            <Check className="h-4 w-4" /> Filed: {result.title}
          </div>
          {result.brief && (
            <pre className="mb-3 whitespace-pre-wrap font-sans text-sm text-[var(--foreground)]">
              {result.brief}
            </pre>
          )}
          <p className="text-sm text-[var(--muted-foreground)]">
            {result.actionItemCount} action item
            {result.actionItemCount === 1 ? "" : "s"} created
            {result.contact
              ? ` · logged to ${result.contact.name}`
              : contactName.trim()
                ? " · no unique contact match (not logged to a contact)"
                : ""}
            .
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" onClick={() => router.push("/action-items")}>
              View action items
            </Button>
            {result.contact && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => router.push(`/contacts/${result.contact!.id}`)}
              >
                Open contact
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
