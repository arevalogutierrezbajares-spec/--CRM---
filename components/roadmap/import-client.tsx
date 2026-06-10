"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  applyRoadmapImport,
  previewRoadmapImport,
  type ApplyResult,
  type ImportPreview,
} from "@/app/(app)/roadmap/actions";
import type { EntityChange, FieldChange } from "@/lib/roadmap-md";

/** PR-style staged import (FR-RMD-3/4/8/9/10/12). Nothing is written until
 *  the operator applies; archives + probable-updates start unchecked; field
 *  conflicts preselect the CRM value (CRM-wins). */
export function ImportClient() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [accepted, setAccepted] = useState<Record<number, boolean>>({});
  // conflict resolution per "changeIdx:field" — true = take the FILE value
  const [takeFile, setTakeFile] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [pending, startTransition] = useTransition();

  const changes = useMemo(() => preview?.diff?.changes ?? [], [preview]);

  const onPreview = () =>
    startTransition(async () => {
      setResult(null);
      const p = await previewRoadmapImport(text);
      setPreview(p);
      const init: Record<number, boolean> = {};
      (p.diff?.changes ?? []).forEach((c, i) => {
        init[i] = c.defaultAccepted;
      });
      setAccepted(init);
      setTakeFile({});
    });

  const onApply = () =>
    startTransition(async () => {
      const toApply = changes
        .map((c, i) => ({ c, i }))
        .filter(({ i }) => accepted[i])
        .map(({ c, i }) => {
          if (!c.fields) return c;
          // Conflicted fields only ship when the operator chose the file value;
          // unconflicted changed fields always ship (FR-RMD-8).
          const fields = c.fields.filter(
            (f) => !f.conflict || takeFile[`${i}:${f.field}`],
          );
          return { ...c, fields };
        })
        .filter(
          (c) =>
            c.changeType === "create" ||
            c.changeType === "archive" ||
            (c.fields && c.fields.length > 0),
        );
      const r = await applyRoadmapImport({ accepted: toApply });
      setResult(r);
      if (r.ok) {
        setPreview(null);
        setText("");
      }
    });

  const counts = useMemo(() => {
    const acc = { create: 0, update: 0, "probable-update": 0, archive: 0 };
    changes.forEach((c, i) => {
      if (accepted[i]) acc[c.changeType]++;
    });
    return acc;
  }, [changes, accepted]);

  /* ── Result screen ── */
  if (result?.ok) {
    return (
      <div
        className="rounded-lg border bg-card p-5 space-y-2"
        style={{ borderColor: "var(--border-default)" }}
      >
        <p className="text-[14px] font-medium">Import applied — plan v{result.version}</p>
        <p className="text-[13px] text-text-secondary">
          {result.applied?.creates ?? 0} created · {result.applied?.updates ?? 0} updated ·{" "}
          {result.applied?.archives ?? 0} archived
        </p>
        <Link href="/roadmap" className="text-[13px] underline">
          Back to roadmap
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Paste box (FR-RMD-3 — paste is the primary motion) */}
      {!preview?.ok && (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Paste a Roadmap-MD document here — e.g. the output of "Copy for AI" after editing it in any AI tool, or a hand-written plan:\n\n## My initiative\n- Owner: @tomas\n- [ ] First task due:2026-07-01`}
            rows={14}
            className="w-full rounded-lg border bg-card p-3 text-[13px] font-mono"
            style={{ borderColor: "var(--border-default)" }}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onPreview}
              disabled={pending || text.trim().length === 0}
              className="rounded-md border px-3 py-1.5 text-[13px] font-medium hover:bg-surface disabled:opacity-50"
              style={{ borderColor: "var(--border-default)" }}
            >
              {pending ? "Computing diff…" : "Preview changes"}
            </button>
            <span className="text-[12px] text-text-tertiary">
              Nothing is written until you review and apply.
            </span>
          </div>
          {preview && !preview.ok && (
            <p className="text-[13px]" style={{ color: "var(--red-mid)" }}>
              {preview.error}
            </p>
          )}
          {result && !result.ok && (
            <p className="text-[13px]" style={{ color: "var(--red-mid)" }}>
              {result.error}
            </p>
          )}
        </div>
      )}

      {/* Diff preview */}
      {preview?.ok && preview.diff && (
        <div className="space-y-3">
          {/* Staleness banner (FR-RMD-9) */}
          {preview.stale && (
            <div
              className="rounded-md border px-3 py-2 text-[13px]"
              style={{
                borderColor: "var(--amber-mid)",
                background: "color-mix(in oklab, var(--amber-mid) 10%, transparent)",
              }}
            >
              This file is based on plan v{preview.diff.baseVersion} — the CRM is at v
              {preview.currentVersion}. Conflicts below default to the CRM value.
            </div>
          )}
          {preview.diff.baseVersion === null && (
            <div className="rounded-md border px-3 py-2 text-[12.5px] text-text-secondary"
              style={{ borderColor: "var(--border-default)" }}>
              No plan version header found — comparing against current state directly.
            </div>
          )}

          {/* Parse report (FR-RMD-11) + unknown owners (FR-RMD-12) + bad tokens */}
          {(preview.diff.issues.length > 0 ||
            preview.diff.unknownOwners.length > 0 ||
            preview.diff.unmatchedTokens.length > 0) && (
            <div
              className="rounded-md border px-3 py-2 text-[12.5px] text-text-secondary space-y-1"
              style={{ borderColor: "var(--border-default)" }}
            >
              {preview.diff.unknownOwners.length > 0 && (
                <p>
                  Unknown owners (imported unassigned):{" "}
                  {preview.diff.unknownOwners.map((o) => `@${o}`).join(", ")}
                </p>
              )}
              {preview.diff.unmatchedTokens.length > 0 && (
                <p>Unrecognized IDs (lines skipped): {preview.diff.unmatchedTokens.join(", ")}</p>
              )}
              {preview.diff.issues.map((iss, i) => (
                <p key={i}>
                  Line {iss.line}: {iss.message}
                </p>
              ))}
            </div>
          )}

          {changes.length === 0 ? (
            <p className="text-[13px] text-text-secondary">
              No changes — the document matches the current roadmap.
            </p>
          ) : (
            <div
              className="rounded-lg border bg-card divide-y"
              style={{ borderColor: "var(--border-default)" }}
            >
              {changes.map((c, i) => (
                <ChangeRow
                  key={i}
                  change={c}
                  checked={!!accepted[i]}
                  onToggle={() => setAccepted((a) => ({ ...a, [i]: !a[i] }))}
                  takeFile={takeFile}
                  idx={i}
                  onResolve={(field, file) =>
                    setTakeFile((t) => ({ ...t, [`${i}:${field}`]: file }))
                  }
                />
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onApply}
              disabled={pending || changes.length === 0}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
              style={{ background: "var(--blue-mid)" }}
            >
              {pending
                ? "Applying…"
                : `Apply ${counts.create} creates · ${counts.update + counts["probable-update"]} updates · ${counts.archive} archives`}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-[13px] text-text-secondary hover:text-text-primary"
            >
              Back to paste
            </button>
          </div>
          {result && !result.ok && (
            <p className="text-[13px]" style={{ color: "var(--red-mid)" }}>
              {result.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const TYPE_META: Record<
  EntityChange["changeType"],
  { label: string; color: string }
> = {
  create: { label: "CREATE", color: "var(--green-mid)" },
  update: { label: "UPDATE", color: "var(--blue-mid)" },
  "probable-update": { label: "PROBABLE UPDATE", color: "var(--amber-mid)" },
  archive: { label: "ARCHIVE?", color: "var(--red-mid)" },
};

function ChangeRow({
  change,
  checked,
  onToggle,
  takeFile,
  idx,
  onResolve,
}: {
  change: EntityChange;
  checked: boolean;
  onToggle: () => void;
  takeFile: Record<string, boolean>;
  idx: number;
  onResolve: (field: string, file: boolean) => void;
}) {
  const meta = TYPE_META[change.changeType];
  return (
    <div className="px-3 py-2.5" style={{ borderColor: "var(--border-default)" }}>
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" checked={checked} onChange={onToggle} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-tiny font-semibold tracking-wide rounded px-1.5 py-0.5"
              style={{
                color: meta.color,
                background: `color-mix(in oklab, ${meta.color} 12%, transparent)`,
              }}
            >
              {meta.label}
            </span>
            <span className="text-tiny uppercase text-text-tertiary">{change.kind}</span>
            <span className="text-[13px] font-medium truncate">{change.title}</span>
          </div>

          {change.changeType === "probable-update" && (
            <p className="text-[12px] text-text-tertiary mt-0.5">
              ID missing in file — matched by title. Confirm to apply as an update.
            </p>
          )}

          {change.fields && change.fields.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {change.fields.map((f) => (
                <FieldRow
                  key={f.field}
                  f={f}
                  resolved={takeFile[`${idx}:${f.field}`] ?? false}
                  onResolve={(file) => onResolve(f.field, file)}
                />
              ))}
            </div>
          )}
        </div>
      </label>
    </div>
  );
}

function fmt(v: FieldChange["from"]): string {
  if (v === null) return "—";
  if (typeof v === "boolean") return v ? "done" : "open";
  return String(v);
}

function FieldRow({
  f,
  resolved,
  onResolve,
}: {
  f: FieldChange;
  resolved: boolean;
  onResolve: (file: boolean) => void;
}) {
  if (!f.conflict) {
    return (
      <p className="text-[12.5px] text-text-secondary">
        <span className="text-text-tertiary">{f.field}:</span>{" "}
        <span className="line-through opacity-60">{fmt(f.from)}</span> → {fmt(f.to)}
      </p>
    );
  }
  // Conflict: CRM also changed this field since the base — CRM preselected.
  return (
    <div
      className="rounded-md border px-2 py-1.5 text-[12.5px]"
      style={{ borderColor: "var(--amber-mid)" }}
    >
      <p className="text-text-secondary mb-1">
        <span className="font-medium">{f.field}</span> changed in BOTH places (was{" "}
        {fmt(f.conflict.baseValue)}):
      </p>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={!resolved} onChange={() => onResolve(false)} />
          Keep CRM: <span className="font-medium">{fmt(f.from)}</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={resolved} onChange={() => onResolve(true)} />
          Take file: <span className="font-medium">{fmt(f.to)}</span>
        </label>
      </div>
    </div>
  );
}
