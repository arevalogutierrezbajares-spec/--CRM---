"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Clock,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  HeartHandshake,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { generateReintro } from "@/app/(app)/brain/actions";
import { logReconnectTouch } from "./actions";
import type { ReconnectCandidate } from "@/db/queries/reconnect";

function reason(c: ReconnectCandidate): string {
  if (c.daysSince === null) return "Never contacted";
  if (c.daysSince === 1) return "Last touch yesterday";
  return `Last touch ${c.daysSince} days ago`;
}

export function ReconnectCards({
  candidates,
}: {
  candidates: ReconnectCandidate[];
}) {
  const [items, setItems] = useState(candidates);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [fallback, setFallback] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, "draft" | "save" | undefined>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function setBusyFor(id: string, v: "draft" | "save" | undefined) {
    setBusy((prev) => ({ ...prev, [id]: v }));
  }

  function draft(id: string) {
    setBusyFor(id, "draft");
    startTransition(async () => {
      const res = await generateReintro(id);
      if (res.ok) {
        setDrafts((prev) => ({ ...prev, [id]: res.draft }));
        setFallback((prev) => ({ ...prev, [id]: res.usingFallback }));
      } else {
        toast.error(res.error);
      }
      setBusyFor(id, undefined);
    });
  }

  function save(id: string, name: string) {
    setBusyFor(id, "save");
    startTransition(async () => {
      const res = await logReconnectTouch(id, drafts[id] ?? "Reconnected");
      if (res.ok) {
        setItems((prev) => prev.filter((c) => c.id !== id));
        toast.success(`Logged — ${name} is no longer cold`);
      } else {
        toast.error(res.error);
        setBusyFor(id, undefined);
      }
    });
  }

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(drafts[id] ?? "");
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — the user can still select the text */
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-[var(--border)] py-12 text-center">
        <HeartHandshake size={26} className="text-text-tertiary" />
        <p className="text-sm text-text-secondary">
          You&apos;re all caught up — no warm contacts have gone cold.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((c) => {
        const d = drafts[c.id];
        const state = busy[c.id];
        return (
          <div
            key={c.id}
            className="rounded-lg border border-[var(--border)] bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-medium text-text-primary">
                    {c.name}
                  </span>
                  <span className="shrink-0 rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-tertiary">
                    {c.relationshipType}
                  </span>
                </div>
                {c.organization && (
                  <div className="truncate text-[13px] text-text-secondary">
                    {c.organization}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-tiny text-text-tertiary">
                <Clock size={12} />
                {reason(c)}
              </div>
            </div>

            {d !== undefined && (
              <div className="mt-3 space-y-1.5">
                <Textarea
                  value={d}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))
                  }
                  rows={4}
                  className="text-[13px]"
                  aria-label={`Re-intro draft for ${c.name}`}
                />
                {fallback[c.id] && (
                  <p className="text-tiny text-text-tertiary">
                    Boilerplate template — set ANTHROPIC_API_KEY for an AI-drafted opener.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => copy(c.id)}>
                    {copied === c.id ? <Check size={13} /> : <Copy size={13} />}
                    {copied === c.id ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => draft(c.id)}
                    disabled={state === "draft"}
                  >
                    <Sparkles size={13} />
                    {state === "draft" ? "Drafting…" : "Regenerate"}
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              <Link
                href={`/contacts/${c.id}`}
                className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
              >
                <ExternalLink size={13} />
                Open contact
              </Link>
              <div className="flex gap-2">
                {d === undefined && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => draft(c.id)}
                    disabled={state === "draft"}
                  >
                    <Sparkles size={13} />
                    {state === "draft" ? "Drafting…" : "Draft opener"}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => save(c.id, c.name)}
                  disabled={state === "save"}
                >
                  {state === "save" ? "Saving…" : "Mark reached out"}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
