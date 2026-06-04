"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import * as Y from "yjs";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { SupabaseYjsProvider } from "@/lib/project-docs/supabase-provider";
import { toBase64 } from "@/lib/project-docs/yjs-base64";
import { fromBase64 } from "@/lib/project-docs/yjs-base64";
import { saveDocContentAction } from "@/app/(app)/projects/docs-actions";
import { updateLinkAction } from "@/app/(app)/projects/actions";

type SaveState = "idle" | "saving" | "saved";

/** Deterministic, readable cursor color from the user's id. */
function colorFromId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 55%)`;
}

export function DocEditor({
  projectId,
  docId,
  initialTitle,
  initialYdoc,
  userId,
  userName,
}: {
  projectId: string;
  docId: string;
  initialTitle: string;
  initialYdoc: string | null;
  userId: string;
  userName: string;
}) {
  const userColor = useMemo(() => colorFromId(userId), [userId]);

  // Seed the Yjs doc from the saved snapshot before the provider connects, so
  // even the first opener starts from persisted content.
  const doc = useMemo(() => {
    const d = new Y.Doc();
    if (initialYdoc) {
      try {
        Y.applyUpdate(d, fromBase64(initialYdoc));
      } catch {
        /* corrupt snapshot — start blank rather than crash */
      }
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const provider = useMemo(
    () => new SupabaseYjsProvider(`project-doc:${docId}`, doc, { name: userName, color: userColor }),
    [doc, docId, userName, userColor],
  );

  const editor = useCreateBlockNote(
    {
      collaboration: {
        provider,
        fragment: doc.getXmlFragment("document-store"),
        user: { name: userName, color: userColor },
      },
    },
    [provider],
  );

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [peers, setPeers] = useState<{ name: string; color: string }[]>(() =>
    Array.from(provider.awareness.getStates().values())
      .map((s) => s.user as { name: string; color: string } | undefined)
      .filter((u): u is { name: string; color: string } => Boolean(u)),
  );
  const [title, setTitle] = useState(initialTitle);
  const savedTitle = useRef(initialTitle);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist the doc. `indicate=false` skips setState (used on unmount).
  const save = useCallback(
    async (indicate: boolean) => {
      const ydoc = toBase64(Y.encodeStateAsUpdate(doc));
      let text = "";
      try {
        text = await editor.blocksToMarkdownLossy(editor.document);
      } catch {
        /* markdown mirror is best-effort */
      }
      if (indicate) setSaveState("saving");
      const res = await saveDocContentAction({ linkId: docId, ydoc, text });
      if (indicate) setSaveState(res.ok ? "saved" : "idle");
    },
    [doc, editor, docId],
  );

  // Autosave on local edits (debounced). Remote updates carry origin=provider
  // and are persisted by whoever made them, so we skip those here.
  useEffect(() => {
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === provider) return;
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void save(true), 1500);
    };
    doc.on("update", onUpdate);
    return () => {
      doc.off("update", onUpdate);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void save(false); // flush on leave
    };
  }, [doc, provider, save]);

  // Live presence (who else is here).
  useEffect(() => {
    const aw = provider.awareness;
    const sync = () => {
      setPeers(
        Array.from(aw.getStates().values())
          .map((s) => s.user as { name: string; color: string } | undefined)
          .filter((u): u is { name: string; color: string } => Boolean(u)),
      );
    };
    aw.on("change", sync);
    return () => aw.off("change", sync);
  }, [provider]);

  // Tear down the realtime channel when leaving.
  useEffect(() => () => provider.destroy(), [provider]);

  function commitTitle() {
    const next = title.trim();
    if (!next || next === savedTitle.current) {
      setTitle(savedTitle.current);
      return;
    }
    savedTitle.current = next;
    void updateLinkAction({ projectId, linkId: docId, label: next });
  }

  // De-dupe presence avatars by name for the header.
  const uniquePeers = Array.from(new Map(peers.map((p) => [p.name + p.color, p])).values());

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <header className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5">
        <Link
          href={`/projects/${projectId}`}
          className="shrink-0 rounded p-1 text-text-tertiary hover:text-text-primary hover:bg-surface"
          aria-label="Back to project"
        >
          <ArrowLeft size={16} />
        </Link>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-label="Document title"
          className="min-w-0 flex-1 bg-transparent text-base font-medium text-text-primary outline-none"
        />

        <div className="flex -space-x-1.5">
          {uniquePeers.map((p, i) => (
            <span
              key={i}
              title={p.name}
              className="grid h-6 w-6 place-items-center rounded-full border border-[var(--background)] text-[10px] font-medium text-white"
              style={{ background: p.color }}
            >
              {p.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>

        <span className="flex w-16 shrink-0 items-center justify-end gap-1 text-tiny text-text-tertiary">
          {saveState === "saving" ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Saving
            </>
          ) : saveState === "saved" ? (
            <>
              <Check size={12} /> Saved
            </>
          ) : null}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto py-4">
        <BlockNoteView editor={editor} />
      </div>
    </div>
  );
}
