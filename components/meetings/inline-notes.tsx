"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseActionItems } from "@/lib/validation/meeting";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface InlineNotesProps {
  meetingId: string;
  field: "agenda" | "minutes";
  initialValue: string | null;
  placeholder?: string;
  showActionItems?: boolean;
  linkedProjectId?: string | null;
}

export function InlineNotes({
  meetingId,
  field,
  initialValue,
  placeholder,
  showActionItems = false,
  linkedProjectId,
}: InlineNotesProps) {
  const [value, setValue] = useState(initialValue ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [preview, setPreview] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestValueRef = useRef(value);

  // Keep ref in sync so the flush callback always sees the latest value.
  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  const save = useCallback(
    async (text: string) => {
      setStatus("saving");
      try {
        const res = await fetch(`/api/meetings/${meetingId}/notes`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, value: text }),
        });
        if (!res.ok) throw new Error("save failed");
        setStatus("saved");
        setSavedAt(new Date());
      } catch {
        setStatus("error");
      }
    },
    [meetingId, field],
  );

  const scheduleAutoSave = useCallback(
    (text: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        save(text);
      }, 2000);
    },
    [save],
  );

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        save(latestValueRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-resize textarea
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [value, preview, resize]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    setValue(text);
    setStatus("idle");
    resize();
    scheduleAutoSave(text);
  }

  const actionItems = showActionItems ? parseActionItems(value) : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <StatusLabel status={status} savedAt={savedAt} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1 px-2 text-xs text-[var(--muted-foreground)] sm:h-6"
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? (
            <>
              <EyeOff className="h-3 w-3" /> Edit
            </>
          ) : (
            <>
              <Eye className="h-3 w-3" /> Preview
            </>
          )}
        </Button>
      </div>

      {preview ? (
        <div
          className="min-h-[80px] whitespace-pre-wrap text-sm leading-relaxed"
          style={{ wordBreak: "break-word" }}
        >
          {value || (
            <span className="text-[var(--muted-foreground)] italic">
              {placeholder ?? "Nothing written yet."}
            </span>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          placeholder={placeholder ?? "Start typing…"}
          rows={4}
          className="w-full resize-none overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]/10 px-3 py-2 text-sm leading-relaxed placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] transition-colors"
          style={{ minHeight: "80px" }}
        />
      )}

      {showActionItems && actionItems.length > 0 && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/20 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Detected action items
          </p>
          <ul className="space-y-1 text-sm">
            {actionItems.map((it, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 text-[var(--muted-foreground)]">☐</span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
          {!linkedProjectId && (
            <p className="mt-2 text-xs text-[var(--health-amber)]">
              Link a project to spawn these as milestones.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusLabel({
  status,
  savedAt,
}: {
  status: SaveStatus;
  savedAt: Date | null;
}) {
  if (status === "saving") {
    return (
      <span className="text-xs text-[var(--muted-foreground)] animate-pulse">
        Saving…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="text-xs text-red-500">Failed to save</span>
    );
  }
  if (status === "saved" && savedAt) {
    return (
      <span className="text-xs text-[var(--muted-foreground)]">
        Saved <RelativeTime date={savedAt} />
      </span>
    );
  }
  return <span className="text-xs text-[var(--muted-foreground)]" />;
}

function RelativeTime({ date }: { date: Date }) {
  const [label, setLabel] = useState(() => formatAgo(date));

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setLabel(formatAgo(date));
    });
    const id = setInterval(() => setLabel(formatAgo(date)), 15_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, [date]);

  return <>{label}</>;
}

function formatAgo(date: Date): string {
  const secs = Math.round((Date.now() - date.getTime()) / 1000);
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}
