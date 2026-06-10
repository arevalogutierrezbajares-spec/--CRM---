"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  assignRoomTeamMemberAction,
  removeRoomTeamMemberAction,
} from "@/app/(app)/partner-access/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TeamMemberRow = {
  id: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  title: string | null;
};

export type WorkspaceMemberOption = {
  userId: string;
  displayName: string | null;
  email: string;
};

function initials(name: string | null, email: string | null) {
  const base = name?.trim() || email || "?";
  return base.slice(0, 1).toUpperCase();
}

/** Owner control: choose which teammates show up for this client + their title. */
export function RoomTeamManager({
  roomId,
  team,
  workspaceMembers,
}: {
  roomId: string;
  team: TeamMemberRow[];
  workspaceMembers: WorkspaceMemberOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [userId, setUserId] = useState("");
  const [title, setTitle] = useState("");

  const assignedIds = new Set(team.map((t) => t.userId));
  const available = workspaceMembers.filter((m) => !assignedIds.has(m.userId));

  function assign(uid: string, t: string) {
    if (!uid) return;
    startTransition(async () => {
      const res = await assignRoomTeamMemberAction({
        roomId,
        userId: uid,
        title: t.trim() || null,
      });
      if (res.ok) {
        setUserId("");
        setTitle("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function remove(teamId: string) {
    startTransition(async () => {
      const res = await removeRoomTeamMemberAction({ roomId, teamId });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-3">
      {team.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No teammates assigned yet. Add who the client should see as their point
          of contact.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {team.map((m) => (
            <li key={m.id} className="flex items-center gap-2.5 rounded-md border border-[var(--border)] p-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--secondary)] text-sm font-medium text-[var(--secondary-foreground)]">
                {initials(m.displayName, m.email)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.displayName ?? m.email}</div>
                <div className="truncate text-xs text-[var(--muted-foreground)]">
                  {m.title || "Add a title below"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(m.id)}
                disabled={pending}
                aria-label="Remove teammate"
                className="text-[var(--muted-foreground)] transition hover:text-[var(--destructive)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 ? (
        <div className="space-y-2 rounded-md border border-[var(--border)] p-2.5">
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Add a teammate…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.displayName ?? m.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (e.g. Account Lead) — optional"
              aria-label="Title"
              className="h-9"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  assign(userId, title);
                }
              }}
            />
            <Button type="button" size="sm" disabled={pending || !userId} onClick={() => assign(userId, title)}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      ) : team.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
          <UserRound className="h-3.5 w-3.5" /> Everyone on your team is assigned.
        </p>
      ) : null}
    </div>
  );
}
