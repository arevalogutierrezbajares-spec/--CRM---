"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

/**
 * 4-digit passcode gate for a protected access room. Auto-submits when the
 * fourth digit lands; refreshes the page on success so the server re-renders
 * the unlocked room.
 */
export function RoomGate({
  token,
  roomName,
}: {
  token: string;
  roomName: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  // Re-enable the input once a lockout window passes.
  useEffect(() => {
    if (!locked || retryAt === null) return;
    const id = setInterval(() => {
      if (Date.now() >= retryAt) {
        setLocked(false);
        setRetryAt(null);
        setError(null);
        inputRef.current?.focus();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [locked, retryAt]);

  async function submit(value: string) {
    if (checking || unlocked || locked || value.length !== 4) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/access/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: value }),
      });
      if (res.ok) {
        setUnlocked(true);
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        locked?: boolean;
        retryAt?: string;
      };
      if (data.locked) {
        setLocked(true);
        setRetryAt(data.retryAt ? new Date(data.retryAt).getTime() : Date.now() + 60_000);
      }
      setError(data.error ?? "That code didn't match. Try again.");
      setCode("");
      inputRef.current?.focus();
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  function handleChange(raw: string) {
    const next = raw.replace(/\D/g, "").slice(0, 4);
    setCode(next);
    if (error) setError(null);
    if (next.length === 4) void submit(next);
  }

  return (
    <main className="min-h-screen bg-[var(--bg-page)]">
      <div className="mx-auto grid min-h-screen w-full max-w-2xl place-items-center px-5 py-10">
        <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--secondary)]">
            <Lock className="h-5 w-5 text-[var(--muted-foreground)]" />
          </div>
          <h1 className="mt-4 text-xl font-semibold">{roomName}</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            This room is protected. Enter the 4-digit code you were given.
          </p>

          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(code);
            }}
          >
            <label htmlFor="room-passcode" className="sr-only">
              4-digit access code
            </label>
            <input
              ref={inputRef}
              id="room-passcode"
              autoFocus
              value={code}
              onChange={(event) => handleChange(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{4}"
              maxLength={4}
              disabled={checking || locked || unlocked}
              placeholder="••••"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "room-passcode-error" : undefined}
              className="w-40 rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
            />
            {error && (
              <p
                id="room-passcode-error"
                role="alert"
                className="mt-3 text-sm text-[var(--destructive)]"
              >
                {error}
              </p>
            )}
            {unlocked ? (
              <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                Unlocked — opening the room…
              </p>
            ) : checking ? (
              <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                Checking…
              </p>
            ) : null}
          </form>

          <p className="mt-5 text-xs text-[var(--muted-foreground)]">
            Don&rsquo;t have the code? Ask the person who sent you this link.
          </p>
        </div>
      </div>
    </main>
  );
}
