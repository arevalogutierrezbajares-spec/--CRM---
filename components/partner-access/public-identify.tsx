"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";

/**
 * Optional self-identification for room visitors. Entirely voluntary — adds
 * the visitor to the room's member list so the owner sees who is engaging.
 */
export function PublicIdentify({
  token,
  identifiedAs,
}: {
  token: string;
  identifiedAs: { email: string; name: string | null } | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (identifiedAs) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-[var(--muted-foreground)]" />
          <h2 className="text-base font-semibold">You</h2>
        </div>
        <p className="mt-2 truncate text-sm">
          {identifiedAs.name ? `${identifiedAs.name} · ` : ""}
          {identifiedAs.email}
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Your activity in this room is shared with the team.
        </p>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !email.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/access/${token}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
        }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Could not save. Try again.");
    } catch {
      setError("Could not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center gap-2">
        <UserRound className="h-4 w-4 text-[var(--muted-foreground)]" />
        <h2 className="text-base font-semibold">Introduce yourself</h2>
      </div>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        Optional — lets the team know who&rsquo;s viewing and reply to you directly.
      </p>
      <form onSubmit={submit} className="mt-3 space-y-2">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          aria-label="Your email"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name (optional)"
          aria-label="Your name"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        {error && (
          <p role="alert" className="text-xs text-[var(--destructive)]">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={saving || !email.trim()}
          className="w-full rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)] transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
