"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

interface SyncResult {
  sectionsScanned: number;
  tasksSeen: number;
  tasksInserted: number;
  tasksUpdated: number;
  tasksDeletedStale: number;
  errors: string[];
  scannedAt: string;
}

interface SyncButtonProps {
  lastSyncIso: string | null;
}

function formatAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export function SyncButton({ lastSyncIso }: SyncButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/overlord/sync", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Sync failed (${res.status})`);
        setRunning(false);
        return;
      }
      const data: SyncResult = await res.json();
      setResult(data);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-tiny text-text-tertiary">
        Last sync · {formatAgo(lastSyncIso)}
      </div>
      <button
        type="button"
        onClick={handleSync}
        disabled={running || isPending}
        className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-[12px] text-text-primary hover:bg-surface disabled:opacity-50 transition-colors"
        style={{ borderColor: "var(--border-default)" }}
      >
        <RefreshCw
          size={12}
          className={running || isPending ? "animate-spin" : ""}
        />
        {running ? "Syncing…" : "Sync now"}
      </button>
      {result && (
        <span className="text-tiny text-text-secondary">
          {result.tasksUpdated + result.tasksInserted} tasks ·{" "}
          {result.sectionsScanned} sections
          {result.errors.length > 0 && (
            <span className="text-red-text"> · {result.errors.length} errors</span>
          )}
        </span>
      )}
      {error && <span className="text-tiny text-red-text">{error}</span>}
    </div>
  );
}
