"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveReviewAction } from "@/app/(app)/review/actions";

/**
 * The notes + save island for the weekly review. Persists notes and a snapshot
 * of the agenda (so a saved review is a searchable record of that week's state).
 */
export function ReviewNotes({
  weekOf,
  initialNotes,
  snapshot,
}: {
  weekOf: string;
  initialNotes: string;
  snapshot: unknown;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    const res = await saveReviewAction({ weekOf, notes, snapshot });
    setSaving(false);
    if (res.ok) toast.success("Review saved");
    else toast.error(res.error);
  }

  return (
    <div className="space-y-2">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Decisions made, issues solved, headlines, to-dos assigned…"
        rows={5}
        className="w-full resize-y rounded-lg border border-[var(--border)] bg-card p-3 text-[13px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-[var(--blue-text)]"
      />
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={save} loading={saving}>
          <Save size={14} /> Save review
        </Button>
      </div>
    </div>
  );
}
