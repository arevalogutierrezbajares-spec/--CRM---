"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Mic, RotateCcw, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { requestAgentTurn, clearAgentConversation } from "@/app/actions/agent";
import { DEMO_TOUR_AGENT_REPLIED_EVENT } from "@/lib/demo-tour";

type Message = {
  id: string;
  role: "user" | "agent";
  text: string;
  toolCalls?: string[];
  tokensIn?: number;
  tokensOut?: number;
  error?: boolean;
};

const SUGGESTED_PROMPTS = [
  "what should I focus on today",
  "my reminders",
  "who is anabella",
  "recap",
];

export function AgentChat({ userDisplayName }: { userDisplayName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  function append(msg: Omit<Message, "id">) {
    setMessages((prev) => [...prev, { ...msg, id: crypto.randomUUID() }]);
  }

  async function send(text: string) {
    const body = text.trim();
    if (!body || pending) return;

    append({ role: "user", text: body });
    setInput("");

    startTransition(async () => {
      try {
        const result = await requestAgentTurn(body);
        if (result.ok) {
          append({
            role: "agent",
            text: result.reply,
            toolCalls: result.toolCalls,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
          });
          window.dispatchEvent(new CustomEvent(DEMO_TOUR_AGENT_REPLIED_EVENT));
        } else {
          append({
            role: "agent",
            text: result.reply || `Something went wrong: ${result.error}`,
            error: true,
          });
        }
      } catch (e) {
        append({
          role: "agent",
          text: `Network error — ${e instanceof Error ? e.message : "couldn't reach the agent"}. Check your connection and try again.`,
          error: true,
        });
      }
    });
  }

  function pickMime(): string {
    // Browser-by-browser MIME fallback. iOS Safari notably doesn't expose
    // audio/webm — it only does audio/mp4. An empty string lets the browser
    // pick its own default, which Whisper handles fine.
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  }

  async function startRecording() {
    // Guard against the touchstart+mousedown double-fire on touch devices,
    // and against double-clicks generally.
    if (recording || transcribing || pending) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (chunksRef.current.length === 0) {
          append({
            role: "agent",
            text: "No audio captured — try holding the mic button a bit longer.",
            error: true,
          });
          return;
        }
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        const ext = (mime || "audio/webm").includes("mp4") ? "mp4" : "webm";
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.set("audio", blob, `voice.${ext}`);
          const resp = await fetch("/api/agent/transcribe", { method: "POST", body: fd });
          if (resp.status === 401) {
            append({
              role: "agent",
              text: "Your session expired — refresh the page and sign back in.",
              error: true,
            });
            return;
          }
          const json = (await resp.json()) as { ok: boolean; text?: string; error?: string };
          if (json.ok && json.text?.trim()) {
            // Feed the transcript straight into the conversation
            await send(json.text);
          } else if (json.ok) {
            append({
              role: "agent",
              text: "I didn't catch anything — try recording again, a bit louder or closer to the mic.",
              error: true,
            });
          } else {
            append({
              role: "agent",
              text: `Couldn't transcribe: ${json.error ?? "unknown error"}`,
              error: true,
            });
          }
        } catch (e) {
          append({
            role: "agent",
            text: `Voice upload failed: ${e instanceof Error ? e.message : "network error"}`,
            error: true,
          });
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (e) {
      append({
        role: "agent",
        text: `Mic access failed: ${e instanceof Error ? e.message : String(e)}`,
        error: true,
      });
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    setRecording(false);
  }

  async function clearConversation() {
    if (!confirm("Clear this conversation? The bot will start fresh next message.")) return;
    await clearAgentConversation();
    setMessages([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-page)]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-3">
        <div>
          <h1 className="text-base font-semibold">Agent</h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Talk to your CRM. Same brain as the WhatsApp bot.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearConversation}
          disabled={pending || messages.length === 0}
          aria-label="Clear conversation"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Clear
        </Button>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.length === 0 && (
            <div className="space-y-4 py-12 text-center">
              <p className="text-sm text-[var(--text-secondary)]">
                Hi {userDisplayName.split(" ")[0]}. Try one of these or type your own:
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:border-[var(--border-emphasis)] hover:bg-[var(--bg-surface)] transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {pending && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--text-secondary)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Thinking…
            </div>
          )}

          {transcribing && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--text-secondary)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Transcribing voice…
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-[var(--border)] bg-[var(--bg-card)] px-6 py-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message, or hold the mic to talk…"
            rows={1}
            maxLength={4000}
            className="min-h-[40px] resize-none"
            disabled={pending || recording || transcribing}
            aria-label="Message"
          />
          <Button
            variant="outline"
            size="icon"
            onMouseDown={(e) => {
              // Prevent the synthetic mousedown after touchstart on hybrid
              // devices — we already started via onTouchStart.
              if (recording) return;
              e.preventDefault();
              startRecording();
            }}
            onMouseUp={stopRecording}
            onMouseLeave={recording ? stopRecording : undefined}
            onTouchStart={(e) => {
              e.preventDefault();
              startRecording();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              stopRecording();
            }}
            disabled={pending || transcribing}
            aria-label={recording ? "Release to stop recording" : "Hold to record voice"}
            className={recording ? "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/30" : ""}
          >
            {recording ? (
              <Square className="h-4 w-4 fill-current" aria-hidden="true" />
            ) : (
              <Mic className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
          <Button
            onClick={() => send(input)}
            disabled={!input.trim() || pending || recording || transcribing}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <p className="mx-auto mt-2 max-w-2xl text-[10px] text-[var(--text-tertiary)]">
          Enter sends · Shift+Enter newline · Hold mic to record voice (release to send)
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] space-y-1 rounded-[var(--radius)] px-4 py-2.5 text-sm ${
          isUser
            ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
            : message.error
              ? "border border-[var(--red-mid)]/30 bg-[var(--red-bg)] text-[var(--red-text)]"
              : "border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]"
        }`}
      >
        <div className="whitespace-pre-wrap leading-relaxed">{message.text}</div>
        {!isUser && (message.toolCalls?.length || message.tokensIn) ? (
          <div className="flex flex-wrap items-center gap-3 pt-1 text-[10px] text-[var(--text-tertiary)]">
            {message.toolCalls?.length ? (
              <span className="font-mono" title="Tools called">
                ⚙ {message.toolCalls.join(", ")}
              </span>
            ) : null}
            {message.tokensIn ? (
              <span className="font-mono" title="Tokens in / out">
                {message.tokensIn} in · {message.tokensOut} out
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
