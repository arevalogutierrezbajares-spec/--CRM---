"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Mic,
  Square,
  Check,
  Loader2,
  AlertCircle,
  CalendarClock,
  ListChecks,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type State = "idle" | "connecting" | "recording" | "saving" | "done" | "error";
type Lang = "es" | "en" | "multi";

type SaveResult = {
  recordingId: string;
  meetingId: string | null;
  title: string;
  brief: string;
  actionItemCount: number;
  contact: { id: string; name: string } | null;
  contactAmbiguous?: boolean;
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

function fmtTime(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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
  // Live level visualizer.
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const drawingRef = useRef(false);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => teardown(), []);

  // Keep the live transcript scrolled to the newest line.
  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [finals, interim]);

  function teardown() {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    drawingRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      nodeRef.current?.disconnect();
    } catch {}
    try {
      analyserRef.current?.disconnect();
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
    analyserRef.current = null;
    streamRef.current = null;
    ctxRef.current = null;
    wsRef.current = null;
  }

  function drawWaveform() {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (canvas && analyser) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        const cssW = canvas.clientWidth;
        const cssH = canvas.clientHeight;
        if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
          canvas.width = Math.round(cssW * dpr);
          canvas.height = Math.round(cssH * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        const bins = analyser.frequencyBinCount;
        const data = new Uint8Array(bins);
        analyser.getByteFrequencyData(data);

        // Resolve the CSS accent (set via the canvas's text color) to rgb so
        // canvas always gets a paintable colour regardless of token format.
        const color = getComputedStyle(canvas).color || "#888";
        ctx.fillStyle = color;

        const bars = 56;
        const gap = 3;
        const bw = Math.max(2, (cssW - gap * (bars - 1)) / bars);
        const mid = cssH / 2;
        const usable = Math.floor(bins * 0.62);
        for (let i = 0; i < bars; i++) {
          const idx = Math.floor((i / bars) * usable);
          const v = data[idx] / 255; // 0..1
          const h = Math.max(2, v * v * cssH * 0.92);
          const x = i * (bw + gap);
          ctx.globalAlpha = 0.3 + v * 0.7;
          const y = mid - h / 2;
          const r = Math.min(bw / 2, h / 2);
          if (typeof ctx.roundRect === "function") {
            ctx.beginPath();
            ctx.roundRect(x, y, bw, h, r);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, bw, h);
          }
        }
        ctx.globalAlpha = 1;
      }
    }
    rafRef.current = requestAnimationFrame(drawWaveform);
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
        tickRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
      }
      if (!drawingRef.current) {
        drawingRef.current = true;
        rafRef.current = requestAnimationFrame(drawWaveform);
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

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      analyserRef.current = analyser;

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
          language: lang,
        }),
      });
      const body = (await r.json()) as SaveResult & {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || !body.ok) throw new Error(body.error || `Save failed (${r.status})`);
      setResult({
        recordingId: body.recordingId,
        meetingId: body.meetingId,
        title: body.title,
        brief: body.brief,
        actionItemCount: body.actionItemCount,
        contact: body.contact,
        contactAmbiguous: body.contactAmbiguous,
      });
      setState("done");
      router.refresh(); // the call now appears under Meetings
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setState("error");
    }
  }

  const recording = state === "recording";
  const connecting = state === "connecting";
  const saving = state === "saving";
  const liveText = [...finals, interim].filter(Boolean).join(" ");

  // ── Result view ───────────────────────────────────────────────────────────
  if (state === "done" && result) {
    const contactLine = result.contact
      ? `Logged to ${result.contact.name}`
      : result.contactAmbiguous
        ? "That name matched several contacts — saved without a link"
        : contactName.trim()
          ? "No contact matched that name — saved without a link"
          : "No contact attached";
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-[var(--health-green)]/30 bg-[var(--health-green)]/10 p-4">
          <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--health-green)]/20 text-[var(--health-green)]">
            <Check className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold leading-tight">{result.title}</p>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              Filed in {fmtTime(elapsed)} · {result.actionItemCount} action item
              {result.actionItemCount === 1 ? "" : "s"} · {contactLine}
            </p>
          </div>
        </div>

        {result.brief && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/15 p-4">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Brief
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--foreground)]">
              {result.brief}
            </pre>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {result.meetingId && (
            <Button type="button" size="sm" onClick={() => router.push(`/meetings/${result.meetingId}`)}>
              <CalendarClock className="h-4 w-4" /> View meeting
            </Button>
          )}
          {result.actionItemCount > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={() => router.push("/action-items")}>
              <ListChecks className="h-4 w-4" /> Action items
            </Button>
          )}
          {result.contact && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => router.push(`/contacts/${result.contact!.id}`)}
            >
              <UserRound className="h-4 w-4" /> Open contact
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setResult(null);
              setState("idle");
              setElapsed(0);
              setFinals([]);
            }}
          >
            <Mic className="h-4 w-4" /> Record another
          </Button>
        </div>
      </div>
    );
  }

  // ── Recorder stage ────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-b from-[var(--muted)]/20 to-transparent px-6 py-9">
        {/* status pill */}
        <div
          className={`mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            recording
              ? "border-[var(--destructive)]/40 bg-[var(--destructive)]/10 text-[var(--destructive)]"
              : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)]"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              recording ? "animate-pulse bg-[var(--destructive)]" : "bg-[var(--muted-foreground)]/50"
            }`}
          />
          {connecting
            ? "Connecting…"
            : recording
              ? "Recording live"
              : saving
                ? "Filing your call…"
                : "Ready to record"}
        </div>

        {/* timer (only once a session is live) */}
        {(recording || saving) && (
          <div className="mb-5 font-mono text-4xl tabular-nums tracking-tight text-[var(--foreground)]">
            {fmtTime(elapsed)}
          </div>
        )}

        {/* central button + pulsing ring */}
        <div className="relative grid place-items-center">
          {recording && (
            <span className="absolute inline-flex h-24 w-24 animate-ping rounded-full bg-[var(--destructive)]/25" />
          )}
          <button
            type="button"
            onClick={recording ? stop : connecting || saving ? undefined : start}
            disabled={connecting || saving}
            aria-label={recording ? "Stop and file recording" : "Start recording"}
            className={`relative grid h-20 w-20 place-items-center rounded-full text-white shadow-lg outline-none transition-all duration-200 focus-visible:ring-4 focus-visible:ring-[var(--primary)]/40 disabled:opacity-70 ${
              recording
                ? "bg-[var(--destructive)] hover:scale-105 active:scale-95"
                : "bg-[var(--primary)] hover:scale-105 active:scale-95"
            }`}
          >
            {connecting || saving ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : recording ? (
              <Square className="h-7 w-7 fill-current" />
            ) : (
              <Mic className="h-8 w-8" />
            )}
          </button>
        </div>

        {/* caption */}
        <p className="mt-5 text-center text-sm text-[var(--muted-foreground)]">
          {recording ? "Tap to stop & file" : saving ? "Generating brief + action items" : "Tap to start — put the call on speaker"}
        </p>

        {/* live waveform (collapses to nothing when idle) */}
        <canvas
          ref={canvasRef}
          aria-hidden
          className={`w-full max-w-md text-[var(--primary)] transition-all duration-300 ${
            recording ? "mt-6 h-16 opacity-100" : "h-0 opacity-0"
          }`}
        />
      </div>

      {/* settings (hidden while live) */}
      {!recording && !saving && !connecting && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">
              Language
            </span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40"
              aria-label="Transcription language"
            >
              <option value="es">Spanish</option>
              <option value="en">English</option>
              <option value="multi">Multilingual</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">
              Attach to contact <span className="font-normal opacity-70">(optional)</span>
            </span>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. Karen Brewer"
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40"
            />
          </label>
        </div>
      )}

      {/* live transcript */}
      {(recording || liveText) && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Live transcript
            </span>
            {recording && (
              <span className="text-[11px] text-[var(--muted-foreground)]/70">
                {finals.length} line{finals.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div
            ref={transcriptScrollRef}
            className="max-h-60 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--muted)]/15 p-4 text-sm leading-relaxed"
          >
            {liveText ? (
              <>
                <span>{finals.join(" ")} </span>
                <span className="text-[var(--muted-foreground)]">{interim}</span>
              </>
            ) : (
              <span className="inline-flex items-center gap-2 text-[var(--muted-foreground)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--muted-foreground)]/60" />
                Listening…
              </span>
            )}
          </div>
        </div>
      )}

      {/* error */}
      {error && state === "error" && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-[var(--destructive)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[var(--foreground)]">{error}</p>
            <Button type="button" size="sm" variant="outline" className="mt-3" onClick={start}>
              <Mic className="h-4 w-4" /> Try again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
