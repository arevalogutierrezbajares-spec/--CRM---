"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Plus, ShieldOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type TokenRow = {
  id: string;
  name: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

/**
 * Call Capture settings (CALL-CAPTURE-MODULE-V1): Helper token mint/revoke
 * (NFR-CALL-SEC-2) + audio retention window (FR-CALL-RET-1).
 */
export function CaptureSettingsCard({
  initialRetentionDays,
  initialStoreCallAudio,
}: {
  initialRetentionDays: number;
  initialStoreCallAudio: boolean;
}) {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [minted, setMinted] = useState<{ token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retention, setRetention] = useState(String(initialRetentionDays));
  const [retentionSaved, setRetentionSaved] = useState(false);
  const [storeAudio, setStoreAudio] = useState(initialStoreCallAudio);
  const [storeAudioBusy, setStoreAudioBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/capture/tokens");
    if (res.ok) {
      const body = (await res.json()) as { tokens: TokenRow[] };
      setTokens(body.tokens);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function mint() {
    setBusy(true);
    try {
      const res = await fetch("/api/capture/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Mac Helper" }),
      });
      if (res.ok) {
        const body = (await res.json()) as { token: string };
        setMinted({ token: body.token });
        setCopied(false);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this Helper token? The Helper will stop uploading until reconfigured.")) return;
    await fetch(`/api/capture/tokens/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function toggleStoreAudio(next: boolean) {
    setStoreAudioBusy(true);
    const prev = storeAudio;
    setStoreAudio(next); // optimistic
    try {
      const res = await fetch("/api/capture/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeCallAudio: next }),
      });
      if (!res.ok) setStoreAudio(prev); // revert on failure
    } catch {
      setStoreAudio(prev);
    } finally {
      setStoreAudioBusy(false);
    }
  }

  async function saveRetention() {
    const days = Number(retention);
    if (!Number.isInteger(days) || days < 1 || days > 365) return;
    const res = await fetch("/api/capture/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retentionDays: days }),
    });
    if (res.ok) {
      setRetentionSaved(true);
      setTimeout(() => setRetentionSaved(false), 2000);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Call capture</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Mac Helper tokens</p>
            <Button size="sm" onClick={mint} disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              New token
            </Button>
          </div>

          {minted && (
            <div className="mb-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3">
              <p className="mb-1 text-xs font-medium text-emerald-700">
                Copy this token now — it won&apos;t be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-[var(--muted)]/40 px-2 py-1 text-xs">
                  {minted.token}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await navigator.clipboard.writeText(minted.token);
                    setCopied(true);
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {tokens === null ? (
            <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              No tokens yet. Mint one, then paste it into the Helper&apos;s
              Configure… panel (see macos-helper/README.md).
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {tokens.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className={t.revokedAt ? "line-through opacity-50" : ""}>
                      {t.name}
                    </span>
                    <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                      {t.revokedAt
                        ? "revoked"
                        : t.lastUsedAt
                          ? `last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                          : "never used"}
                    </span>
                  </span>
                  {!t.revokedAt && (
                    <Button size="sm" variant="ghost" onClick={() => revoke(t.id)}>
                      <ShieldOff className="h-4 w-4" /> Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={storeAudio}
              disabled={storeAudioBusy}
              onChange={(e) => toggleStoreAudio(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-none accent-[var(--primary)]"
            />
            <span>
              <span className="text-sm font-medium">
                Store call audio in the CRM
              </span>
              <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
                On: audio is saved for in-app playback (then auto-deleted per the
                retention window below). Off (transcript-only): calls are still
                transcribed, but no audio is stored — no storage cost.
              </span>
            </span>
          </label>
          {!storeAudio && (
            <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700">
              Transcript-only is on. Turn on “keep audio on this Mac” in the Mac
              Helper first, or call audio won&apos;t be saved anywhere — only the
              transcript and brief.
            </p>
          )}
        </div>

        <div className={storeAudio ? "" : "opacity-50"}>
          <p className="mb-1 text-sm font-medium">Audio retention</p>
          <p className="mb-2 text-xs text-[var(--muted-foreground)]">
            {storeAudio
              ? "Call audio is deleted automatically after this many days; transcripts and briefs are kept permanently."
              : "Not applicable while transcript-only is on — no audio is stored to expire."}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={365}
              value={retention}
              disabled={!storeAudio}
              onChange={(e) => setRetention(e.target.value)}
              className="w-24 rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm disabled:opacity-50"
            />
            <span className="text-sm text-[var(--muted-foreground)]">days</span>
            <Button size="sm" onClick={saveRetention} disabled={!storeAudio}>
              {retentionSaved ? <Check className="h-4 w-4" /> : "Save"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
