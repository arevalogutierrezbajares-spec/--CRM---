"use client";

import { useState, useTransition } from "react";
import { SmilePlus } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toggleReactionAction } from "@/app/(app)/town-hall/actions";
import type { PostReactionView } from "@/db/queries/town-hall";

const QUICK = ["👍", "🎉", "❤️", "🔥", "✅", "👀", "🙏", "😂"];

export function PostReactions({
  postId,
  reactions,
  onChanged,
}: {
  postId: string;
  reactions: PostReactionView[];
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  function react(emoji: string) {
    setOpen(false);
    start(async () => {
      try {
        const res = await toggleReactionAction({ postId, emoji });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        onChanged();
      } catch {
        toast.error("Couldn't update reaction — try again.");
      }
    });
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={pending}
          onClick={() => react(r.emoji)}
          className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] tabular-nums transition-colors ${
            r.mine
              ? "border-[var(--blue-text)] bg-[var(--blue-bg,rgba(40,110,240,0.1))] text-[var(--blue-text)]"
              : "border-[var(--border)] text-text-secondary hover:bg-surface"
          }`}
        >
          <span>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Add reaction"
            className="rounded-full border border-[var(--border)] p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-surface focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <SmilePlus size={12} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-1">
          <div className="flex gap-0.5">
            {QUICK.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => react(e)}
                className="rounded p-1 text-[15px] hover:bg-surface"
              >
                {e}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
