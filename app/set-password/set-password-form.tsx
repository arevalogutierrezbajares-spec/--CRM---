"use client";

import { useState } from "react";
import { setPassword } from "@/app/actions/auth";
import { isValidPassword, PASSWORD_RULE } from "@/lib/auth/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SetPasswordForm({ email }: { email: string }) {
  const [password, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  const ready = isValidPassword(password) && password === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidPassword(password)) return setError(PASSWORD_RULE);
    if (password !== confirm) return setError("The two passwords don't match.");

    setStatus("saving");
    const fd = new FormData();
    fd.set("password", password);
    fd.set("confirm", confirm);
    const res = await setPassword(fd);
    if (res.ok) {
      window.location.href = "/";
    } else {
      setStatus("idle");
      setError(res.error ?? "Could not set your password.");
    }
  }

  return (
    <div className="w-[min(380px,calc(100vw-2rem))] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-7 text-[var(--text-primary)] shadow-2xl">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Set your password</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Email verified for <strong>{email}</strong>. Choose a password — you&apos;ll use it
          to sign in from now on.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setError(null);
              setPwd(e.target.value);
            }}
            placeholder="6–10 letters & numbers"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setError(null);
              setConfirm(e.target.value);
            }}
            placeholder="Re-enter password"
          />
        </div>

        <p className="text-tiny text-[var(--text-tertiary)]">{PASSWORD_RULE}</p>

        <Button type="submit" className="w-full" loading={status === "saving"} disabled={!ready}>
          Save password &amp; continue
        </Button>

        {error && (
          <div className="rounded-md border border-[var(--red-mid)]/30 bg-[var(--red-bg)] p-3 text-sm text-[var(--red-text)]">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
