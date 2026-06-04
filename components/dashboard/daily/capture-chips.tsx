"use client";

import { useState } from "react";
import { X, User, FolderGit2, FileText, Users } from "lucide-react";
import type { PickedEntity } from "@/components/ui/mention-input";
import type { MemberOption } from "@/components/town-hall/types";
import { personInBody, refInBody } from "@/lib/nlp/mention-tokens";

/** "@all" still present in the body? */
function allInBody(body: string): boolean {
  return /(^|\s)@all\b/i.test(body);
}

type Doc = { linkId: string; label: string };
type Proj = { refId: string; label: string };

/**
 * Tracks the @people / #project / @document picks made in a quick-add combobox
 * and reconciles them against the live text — so a pick whose token the user
 * deleted (or left over from a previous capture) is dropped, never silently
 * assigning/notifying the wrong person. Shared by the action-item + task cards.
 */
export function useCapturePicks() {
  const [people, setPeople] = useState<MemberOption[]>([]);
  const [project, setProject] = useState<Proj | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [all, setAll] = useState(false);

  function onPick(e: PickedEntity) {
    if (e.kind === "all") {
      setAll(true);
    } else if (e.kind === "person") {
      setPeople((p) => (p.some((x) => x.userId === e.userId) ? p : [...p, { userId: e.userId, displayName: e.label }]));
    } else if (e.ref.refType === "project") {
      setProject({ refId: e.ref.refId, label: e.ref.label });
    } else if (e.ref.refType === "doc") {
      setDocs((d) => (d.some((x) => x.linkId === e.ref.refId) ? d : [...d, { linkId: e.ref.refId, label: e.ref.label }]));
    }
  }

  function reset() {
    setPeople([]);
    setProject(null);
    setDocs([]);
    setAll(false);
  }

  /** Keep only picks whose token is still present in `body`. */
  function reconcile(body: string) {
    const livePeople = people.filter((p) => personInBody(body, p.displayName));
    const liveProject = project && refInBody(body, "#", project.label) ? project : null;
    const liveDocs = docs.filter((d) => refInBody(body, "@", d.label));
    return {
      assigneeUserId: livePeople[0]?.userId ?? null,
      assigneeName: livePeople[0]?.displayName ?? null,
      mentionUserIds: livePeople.map((p) => p.userId),
      projectId: liveProject?.refId ?? null,
      docRefs: liveDocs.map((d) => ({ linkId: d.linkId, label: d.label })),
      notifyAll: all && allInBody(body),
    };
  }

  return { people, project, docs, all, onPick, reset, reconcile, setPeople, setProject, setDocs, setAll };
}

export type CapturePicks = ReturnType<typeof useCapturePicks>;

const CHIP = "flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-tiny text-text-secondary";

/** Shows who/what will be attached to the capture, with one-click removal. */
export function CaptureChips({ picks }: { picks: CapturePicks }) {
  const { people, project, docs, all } = picks;
  if (people.length === 0 && !project && docs.length === 0 && !all) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {all && (
        <span className={`${CHIP} border border-[var(--gold)] text-gold`}>
          <Users size={11} />
          Everyone
          <button type="button" aria-label="Remove everyone" onClick={() => picks.setAll(false)} className="text-text-tertiary hover:text-[var(--red-text)]">
            <X size={11} />
          </button>
        </span>
      )}
      {people.map((p, i) => (
        <span key={p.userId} className={CHIP}>
          <User size={11} className="text-text-tertiary" />
          {p.displayName}
          {i === 0 && <span className="text-tiny text-gold">owner</span>}
          <button
            type="button"
            aria-label={`Remove ${p.displayName}`}
            onClick={() => picks.setPeople((prev) => prev.filter((x) => x.userId !== p.userId))}
            className="text-text-tertiary hover:text-[var(--red-text)]"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      {project && (
        <span className={CHIP}>
          <FolderGit2 size={11} className="text-text-tertiary" />
          {project.label}
          <button type="button" aria-label="Remove project" onClick={() => picks.setProject(null)} className="text-text-tertiary hover:text-[var(--red-text)]">
            <X size={11} />
          </button>
        </span>
      )}
      {docs.map((d) => (
        <span key={d.linkId} className={CHIP}>
          <FileText size={11} className="text-text-tertiary" />
          {d.label}
          <button
            type="button"
            aria-label={`Remove ${d.label}`}
            onClick={() => picks.setDocs((prev) => prev.filter((x) => x.linkId !== d.linkId))}
            className="text-text-tertiary hover:text-[var(--red-text)]"
          >
            <X size={11} />
          </button>
        </span>
      ))}
    </div>
  );
}
