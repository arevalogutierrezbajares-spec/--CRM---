"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Download, FileSignature, Loader2, XCircle } from "lucide-react";
import {
  getSignedPdfUrlAction,
  requestSignatureAction,
  voidSignatureRequestAction,
} from "@/app/(app)/partner-access/actions";

export type SignableEntry = {
  targetKind: "share" | "item";
  targetId: string;
  title: string;
};

export type SignatureRequestView = {
  id: string;
  targetKind: string;
  targetId: string;
  title: string;
  status: string; // pending | signed | voided
  message: string | null;
  signerName: string | null;
  signerEmail: string | null;
  signedAt: string | null;
  documentSha256: string | null;
  ip: string | null;
  hasSignedPdf: boolean;
};

/**
 * Owner panel: request a signature on any repository entry, void pending
 * requests, and read the audit record (signer, server timestamp, doc hash,
 * IP) once signed.
 */
export function RoomSignaturesManager({
  roomId,
  entries,
  requests,
}: {
  roomId: string;
  entries: SignableEntry[];
  requests: SignatureRequestView[];
}) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Server props + local deltas (requested/voided this session).
  const [localRequests, setLocalRequests] = useState<SignatureRequestView[]>([]);
  const [voidedNow, setVoidedNow] = useState<Set<string>>(new Set());

  const allRequests = [
    ...localRequests,
    ...requests.filter((r) => !localRequests.some((l) => l.id === r.id)),
  ]
    .map((r) => (voidedNow.has(r.id) ? { ...r, status: "voided" } : r))
    .filter((r) => r.status !== "voided");

  const activeTargets = new Set(allRequests.map((r) => `${r.targetKind}:${r.targetId}`));
  const available = entries.filter((e) => !activeTargets.has(`${e.targetKind}:${e.targetId}`));

  function request() {
    setError(null);
    const entry = available.find((e) => `${e.targetKind}:${e.targetId}` === selected);
    if (!entry) {
      setError("Pick a document first.");
      return;
    }
    startTransition(async () => {
      const res = await requestSignatureAction({
        roomId,
        targetKind: entry.targetKind,
        targetId: entry.targetId,
        title: entry.title,
        message: message.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLocalRequests((prev) => [
        {
          id: res.requestId,
          targetKind: entry.targetKind,
          targetId: entry.targetId,
          title: entry.title,
          status: "pending",
          message: message.trim() || null,
          signerName: null,
          signerEmail: null,
          signedAt: null,
          documentSha256: null,
          ip: null,
          hasSignedPdf: false,
        },
        ...prev,
      ]);
      setSelected("");
      setMessage("");
    });
  }

  function voidRequest(id: string) {
    startTransition(async () => {
      const res = await voidSignatureRequestAction({ roomId, requestId: id });
      if (res.ok) setVoidedNow((prev) => new Set(prev).add(id));
      else setError(res.error);
    });
  }

  function downloadSigned(id: string) {
    startTransition(async () => {
      const res = await getSignedPdfUrlAction({ roomId, requestId: id });
      if (res.ok) window.open(res.url, "_blank", "noopener");
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      {allRequests.length === 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">
          No signature requests yet. Pick a repository document below — the
          guest signs from their phone and the server records name, timestamp,
          document hash, and IP.
        </p>
      )}

      {allRequests.length > 0 && (
        <ul className="space-y-2">
          {allRequests.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.title}</p>
                {r.status === "signed" ? (
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    Signed by <span className="font-medium">{r.signerName}</span>
                    {r.signerEmail ? ` <${r.signerEmail}>` : ""} ·{" "}
                    {r.signedAt
                      ? new Date(r.signedAt).toLocaleString("en-US", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          timeZoneName: "short",
                        })
                      : ""}
                    {r.ip ? ` · IP ${r.ip}` : ""}
                    {r.documentSha256 ? ` · SHA-256 ${r.documentSha256.slice(0, 12)}…` : ""}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                    Awaiting signature
                  </p>
                )}
              </div>
              {r.status === "signed" ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Signed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                  <FileSignature className="h-3.5 w-3.5" />
                  Pending
                </span>
              )}
              {r.status === "signed" && r.hasSignedPdf && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => downloadSigned(r.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--secondary)] disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Signed PDF
                </button>
              )}
              {r.status === "pending" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => voidRequest(r.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--secondary)] disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Void
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-dashed border-[var(--border)] p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          Request a signature
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="Document to sign"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] sm:flex-1"
          >
            <option value="">Choose a document…</option>
            {available.map((e) => (
              <option key={`${e.targetKind}:${e.targetId}`} value={`${e.targetKind}:${e.targetId}`}>
                {e.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !selected}
            onClick={request}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
            Request
          </button>
        </div>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Optional note for the signer (shown in the signing sheet)"
          className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
