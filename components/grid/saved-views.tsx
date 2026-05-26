"use client";

import { useEffect, useState } from "react";
import {
  useRouter,
  usePathname,
  useSearchParams,
} from "next/navigation";
import { Bookmark, Save, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type View = { name: string; query: string };

const KEY_PREFIX = "agb.savedViews.";

export function SavedViews({ namespace }: { namespace: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [views, setViews] = useState<View[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const key = KEY_PREFIX + namespace;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      setViews(raw ? (JSON.parse(raw) as View[]) : []);
    } catch {
      setViews([]);
    }
  }, [key]);

  function persist(next: View[]) {
    setViews(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  }

  function applyView(query: string) {
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function deleteView(viewName: string) {
    persist(views.filter((v) => v.name !== viewName));
    toast.success(`Removed view "${viewName}"`);
  }

  function saveView() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const query = sp.toString();
    const next = [
      ...views.filter((v) => v.name !== trimmed),
      { name: trimmed, query },
    ];
    persist(next);
    setOpen(false);
    setName("");
    toast.success(`Saved view "${trimmed}"`);
  }

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label="Saved views"
            data-testid="saved-views-trigger"
          >
            <Bookmark className="h-4 w-4" /> Views
            {views.length > 0 && (
              <span className="ml-1 text-xs text-[var(--muted-foreground)]">
                {views.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Saved views</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {views.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-[var(--muted-foreground)]">
              No saved views yet.
            </div>
          )}
          {views.map((v) => (
            <DropdownMenuItem
              key={v.name}
              className="flex items-center justify-between gap-2"
              onSelect={(e) => {
                e.preventDefault();
                applyView(v.query);
              }}
            >
              <span className="truncate">{v.name}</span>
              <button
                type="button"
                aria-label={`Delete view ${v.name}`}
                className="text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteView(v.name);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              // Close the dropdown and open the dialog. Letting Radix close
              // the menu naturally avoids the trigger button getting stuck in
              // a half-open state if the user re-clicks Views.
              setOpen(true);
            }}
          >
            <Save className="h-4 w-4" /> Save current as view…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>
              Captures the current sort, filters, group-by, and tag. Stored in
              this browser only.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveView();
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="view-name">Name</Label>
              <Input
                id="view-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Hot leads · Caney"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                Save view
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
