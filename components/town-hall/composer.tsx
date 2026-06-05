"use client";

import { useState } from "react";
import { Send, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MentionInput, type MentionSources, type PickedEntity } from "@/components/ui/mention-input";
import { personInBody, refInBody } from "@/lib/nlp/mention-tokens";
import { createPostAction } from "@/app/(app)/town-hall/actions";
import { DEMO_TOUR_TOWN_HALL_POSTED_EVENT } from "@/lib/demo-tour";
import type { MemberOption, RefObject } from "./types";

/**
 * Town Hall composer — now backed by the shared keyboard-driven MentionInput
 * (↑↓/Enter/Tab/Esc to pick @people, #projects and @documents). ⌘/Ctrl+↵ posts.
 */
export function Composer({
  members,
  objects,
  docs = [],
  onPosted,
  parentPostId,
  placeholder,
}: {
  members: MemberOption[];
  objects: RefObject[];
  docs?: RefObject[];
  onPosted: () => void;
  parentPostId?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [alsoWA, setAlsoWA] = useState(false);
  const [pickedMentions, setPickedMentions] = useState<MemberOption[]>([]);
  const [pickedRefs, setPickedRefs] = useState<RefObject[]>([]);
  const [pickedAll, setPickedAll] = useState(false);

  const sources: MentionSources = { people: members, projects: objects, docs };

  function onPick(e: PickedEntity) {
    if (e.kind === "all") {
      setPickedAll(true);
    } else if (e.kind === "person") {
      setPickedMentions((p) =>
        p.some((m) => m.userId === e.userId) ? p : [...p, { userId: e.userId, displayName: e.label }],
      );
    } else {
      setPickedRefs((p) =>
        p.some((r) => r.refId === e.ref.refId && r.refType === e.ref.refType) ? p : [...p, e.ref],
      );
    }
  }

  async function submit() {
    const body = text.trim();
    if (!body || submitting) return;
    // Keep only picks whose token literal still appears in the body.
    // "@all" expands to every teammate.
    const broadcast = pickedAll && /(^|\s)@all\b/i.test(body);
    if (broadcast && !confirm("Notify the whole team?")) return;
    setSubmitting(true);
    try {
      const mentionUserIds = broadcast
        ? members.map((m) => m.userId)
        : pickedMentions.filter((m) => personInBody(body, m.displayName)).map((m) => m.userId);
      const refs = pickedRefs
        .filter((r) => refInBody(body, r.refType === "project" ? "#" : "@", r.label))
        .map((r) => ({ refType: r.refType, refId: r.refId, label: r.label }));

      const res = await createPostAction({ body, mentionUserIds, refs, parentPostId, alsoWhatsApp: alsoWA });
      if (!res.ok) {
        toast.error(res.error || "Could not post");
        return;
      }
      setText("");
      setPickedMentions([]);
      setPickedRefs([]);
      setPickedAll(false);
      setAlsoWA(false);
      if (res.notified > 0) {
        toast.success(
          `Posted · notified ${res.notified}${res.waSent > 0 ? ` · ${res.waSent} WhatsApp DM${res.waSent > 1 ? "s" : ""}` : ""}`,
        );
      }
      window.dispatchEvent(new CustomEvent(DEMO_TOUR_TOWN_HALL_POSTED_EVENT));
      onPosted();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-3" style={{ borderColor: "var(--border)" }}>
      <MentionInput
        multiline
        rows={3}
        value={text}
        onChange={setText}
        onPick={onPick}
        onSubmit={submit}
        sources={sources}
        aria-label="Write a Town Hall update"
        placeholder={placeholder ?? "Share an update… @mention people, #reference a project. ⌘↵ to post."}
        inputClassName="w-full resize-none rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-[13px] leading-relaxed placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setAlsoWA((v) => !v)}
          title="Also send this to everyone's WhatsApp"
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-tiny transition-colors ${
            alsoWA
              ? "border-[var(--green-mid)] text-[var(--green-text)]"
              : "border-[var(--border)] text-text-tertiary hover:text-text-secondary"
          }`}
        >
          <MessageCircle size={12} /> WhatsApp
        </button>
        <Button size="sm" onClick={() => void submit()} loading={submitting} disabled={!text.trim()}>
          <Send className="h-3.5 w-3.5" /> {parentPostId ? "Reply" : "Post"}
        </Button>
      </div>
    </div>
  );
}
