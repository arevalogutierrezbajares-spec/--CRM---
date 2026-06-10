"use client";

import { useState, useTransition } from "react";
import { updateInitiativeSuccessCriteria } from "@/app/(app)/roadmap/actions";

/** Inline-editable success criteria (FR-PRG-2). Lives only on roadmap-module
 *  surfaces (INV-7); everywhere else initiatives render read-only. */
export function SuccessCriteriaEditor({
  initiativeId,
  value,
}: {
  initiativeId: string;
  value: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="block w-full text-left group"
        title="Click to edit success criteria"
      >
        {value ? (
          <p className="text-[13px] text-text-primary whitespace-pre-wrap leading-relaxed group-hover:opacity-80">
            {value}
          </p>
        ) : (
          <p className="text-[12.5px] text-text-tertiary italic group-hover:text-text-secondary">
            How will you know this initiative succeeded? Click to define.
          </p>
        )}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        autoFocus
        className="w-full rounded-md border bg-card p-2 text-[13px]"
        style={{ borderColor: "var(--border-default)" }}
        placeholder="e.g. 3 paying posadas live on the new flow"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await updateInitiativeSuccessCriteria(initiativeId, draft);
              setEditing(false);
            })
          }
          className="rounded-md px-2.5 py-1 text-[12.5px] font-medium text-white disabled:opacity-50"
          style={{ background: "var(--blue-mid)" }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(value ?? "");
            setEditing(false);
          }}
          className="text-[12.5px] text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
