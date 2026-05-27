"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { AIInsightCard, type AIAction } from "../shared/ai-insight-card";
import { SectionLabel } from "../shared/section-label";

interface AIAssistPanelProps {
  scope: "daily" | "weekly";
}

export function AIAssistPanel({ scope }: AIAssistPanelProps) {
  const [actions, setActions] = useState<AIAction[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const fetchActions = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/dashboard/ai-actions?scope=${scope}${force ? "&refresh=1" : ""}`,
          { cache: force ? "no-store" : "default" },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? `Request failed (${res.status})`);
          setActions([]);
          return;
        }
        const data: { actions: AIAction[] } = await res.json();
        setActions(data.actions);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
        setActions([]);
      } finally {
        setLoading(false);
      }
    },
    [scope],
  );

  useEffect(() => {
    fetchActions(false);
  }, [fetchActions]);

  const visible = (actions ?? []).filter((a) => !dismissedIds.has(a.id));

  function handleAction(action: AIAction, button: string) {
    const b = button.toLowerCase();
    if (b.includes("dismiss") || b.includes("snooze")) {
      setDismissedIds((prev) => new Set(prev).add(action.id));
    }
    // Other actions are surfaced as suggestions only — wire to deeper flows later
  }

  return (
    <div
      className="rounded-lg border-l-[3px] border-y border-r p-3"
      style={{
        background: "var(--ai-bg)",
        borderLeftColor: "var(--purple-mid)",
        borderTopColor: "var(--ai-border)",
        borderRightColor: "var(--ai-border)",
        borderBottomColor: "var(--ai-border)",
      }}
    >
      <SectionLabel
        icon={Sparkles}
        right={
          <button
            type="button"
            disabled={loading}
            onClick={() => fetchActions(true)}
            className="inline-flex items-center gap-1 text-tiny text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      >
        <span style={{ color: "var(--ai-text)" }}>AI assist</span>
      </SectionLabel>

      {loading && actions === null && (
        <p className="text-[12px] py-2 text-text-secondary">
          Reading your activity…
        </p>
      )}

      {error && (
        <p className="text-[12px] py-2 text-amber-text">
          {error}
        </p>
      )}

      {actions !== null && visible.length === 0 && !loading && (
        <p className="text-[12px] py-2 text-text-secondary">
          Nothing for me to flag right now — all clear.
        </p>
      )}

      {visible.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((a) => (
            <AIInsightCard key={a.id} action={a} onAction={handleAction} />
          ))}
        </div>
      )}
    </div>
  );
}
