"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/**
 * Client-only loader for the collaborative editor. BlockNote's
 * `useCreateBlockNote` touches `window` at render, so it cannot be
 * server-rendered — a hard GET of /lob/[id]/docs/[docId] (e.g. opening a
 * doc-comment notification's WhatsApp deep-link in a fresh tab) would 500.
 * Deferring to the client keeps the route hard-loadable; the comments panel
 * beside it still server-renders normally.
 */
export const DocEditor = dynamic(() => import("./doc-editor").then((m) => m.DocEditor), {
  ssr: false,
  loading: () => (
    <div className="grid h-[calc(100vh-3rem)] place-items-center text-text-tertiary">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  ),
});
