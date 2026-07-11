"use client";

/**
 * The recipient-facing demo access block. Shows the demo-account credentials
 * with one-tap copy and a prominent "Launch demo" button. Self-contained copy
 * feedback (local state, no sonner) so it renders identically on the public
 * /demo/<token> page — which has no app Toaster mounted — and inside a partner
 * room. Used by app/demo/[token]/page.tsx and the partner room page.
 */

import { useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, User } from "lucide-react";

export type DemoAccessCardProps = {
  label: string;
  description?: string | null;
  url?: string | null;
  username?: string | null;
  password?: string | null;
  accessNotes?: string | null;
  /** "page" = standalone /demo page (larger); "room" = embedded card. */
  variant?: "page" | "room";
};

export function DemoAccessCard({
  label,
  description,
  url,
  username,
  password,
  accessNotes,
  variant = "page",
}: DemoAccessCardProps) {
  const hasCreds = Boolean(username || password);
  const big = variant === "page";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 md:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--primary)]/10">
          <KeyRound className="h-5 w-5 text-[var(--primary)]" />
        </span>
        <div className="min-w-0">
          <h2
            className={`font-semibold tracking-tight ${big ? "text-xl" : "text-base"}`}
          >
            {label}
          </h2>
          {description && (
            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
              {description}
            </p>
          )}
        </div>
      </div>

      {hasCreds && (
        <div className="mt-5 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Tu cuenta de demostración
          </p>
          {username && (
            <CredRow icon={<User className="h-3.5 w-3.5" />} label="Usuario" value={username} />
          )}
          {password && (
            <CredRow
              icon={<KeyRound className="h-3.5 w-3.5" />}
              label="Contraseña"
              value={password}
              secret
            />
          )}
        </div>
      )}

      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary-foreground)] shadow-sm transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          style={{
            background:
              "linear-gradient(135deg, var(--primary), color-mix(in oklab, var(--primary) 78%, #000))",
          }}
        >
          Abrir el demo
          <ExternalLink className="h-4 w-4" />
        </a>
      )}

      {accessNotes && (
        <p className="mt-4 rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)]/40 px-3 py-2.5 text-[13px] leading-6 text-[var(--muted-foreground)]">
          {accessNotes}
        </p>
      )}
    </div>
  );
}

function CredRow({
  icon,
  label,
  value,
  secret = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  secret?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(!secret);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setRevealed(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked — reveal so the value can be copied by hand.
      setRevealed(true);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)]/50 px-3 py-2">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--secondary)] text-[var(--muted-foreground)]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
          {label}
        </div>
        <button
          type="button"
          onClick={secret && !revealed ? () => setRevealed(true) : copy}
          className="block max-w-full truncate text-left font-mono text-sm text-[var(--foreground)] hover:text-[var(--primary)]"
          title={revealed ? "Copiar" : "Mostrar"}
        >
          {revealed ? value : "••••••••"}
        </button>
      </div>
      <button
        type="button"
        onClick={copy}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
        aria-label={`Copiar ${label.toLowerCase()}`}
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 text-emerald-500" /> Copiado
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" /> Copiar
          </>
        )}
      </button>
    </div>
  );
}
