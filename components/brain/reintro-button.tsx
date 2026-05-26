"use client";

import { useState, useTransition } from "react";
import { Copy, MessageCircleMore, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { generateReintro } from "@/app/(app)/brain/actions";

export function ReintroButton({ contactId }: { contactId: string }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await generateReintro(contactId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDraft(res.draft);
      setUsingFallback(res.usingFallback);
      setOpen(true);
    });
  }

  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't access clipboard");
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={generate}
        disabled={pending}
      >
        <Sparkles className="h-4 w-4" />
        {pending ? "Drafting…" : "Draft re-intro"}
      </Button>
      {open && draft && (
        <Card className="mt-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageCircleMore className="h-4 w-4" /> Re-intro draft
              {usingFallback && (
                <span className="text-xs text-[var(--health-amber)]">
                  · boilerplate (no AI)
                </span>
              )}
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Dismiss"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[140px] text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={copy}>
                <Copy className="h-4 w-4" /> Copy
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={generate}
                disabled={pending}
              >
                Regenerate
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {error && (
        <p className="mt-2 text-xs text-[var(--destructive)]">{error}</p>
      )}
    </>
  );
}
