"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  addExpectedGuestAction,
  removeRoomMemberAction,
  setRoomSeatLimitAction,
} from "@/app/(app)/partner-access/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { formatRelative } from "@/lib/utils";

export type RoomMemberRow = {
  id: string;
  displayName: string | null;
  email: string | null;
  roleLabel: string | null;
  claimedAt: string | null;
  lastViewedAt: string | null;
};

/**
 * Owner control over who can enter a room: a seat cap, pre-added expected guests
 * (claimed by email on sign-in), and the live roster of claimed + invited people.
 */
export function RoomGuestsManager({
  roomId,
  seatLimit,
  members,
}: {
  roomId: string;
  seatLimit: number | null;
  members: RoomMemberRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [editingSeats, setEditingSeats] = useState(false);
  const [seatInput, setSeatInput] = useState(String(seatLimit ?? ""));

  const claimed = members.filter((m) => m.email);
  const invited = members.filter((m) => !m.email);

  function addGuest() {
    const value = name.trim();
    if (!value) return;
    startTransition(async () => {
      const res = await addExpectedGuestAction({ roomId, name: value });
      if (res.ok) {
        setName("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function saveSeatLimit(next: number | null) {
    startTransition(async () => {
      const res = await setRoomSeatLimitAction({ roomId, seatLimit: next });
      if (res.ok) {
        toast.success(next === null ? "Seat limit removed" : `Seat limit set to ${next}`);
        setEditingSeats(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function remove(memberId: string) {
    startTransition(async () => {
      const res = await removeRoomMemberAction({ roomId, memberId });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      {/* Seats */}
      <div className="rounded-md border border-[var(--border)] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm">
            <span className="font-medium">
              {claimed.length}
              {seatLimit !== null ? ` / ${seatLimit}` : ""} signed in
            </span>
            <span className="ml-1 text-[var(--muted-foreground)]">
              {seatLimit === null ? "· unlimited seats" : "seats"}
            </span>
          </div>
          {!editingSeats && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => {
                setSeatInput(String(seatLimit ?? ""));
                setEditingSeats(true);
              }}
            >
              {seatLimit === null ? "Limit seats" : "Edit"}
            </Button>
          )}
        </div>
        {editingSeats && (
          <div className="mt-2 flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={1000}
              value={seatInput}
              onChange={(e) => setSeatInput(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 5"
              aria-label="Seat limit"
              className="w-24"
            />
            <Button
              type="button"
              size="sm"
              disabled={pending || !seatInput}
              onClick={() => saveSeatLimit(Number(seatInput))}
            >
              Save
            </Button>
            {seatLimit !== null && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => saveSeatLimit(null)}
              >
                Remove limit
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditingSeats(false)}
            >
              Cancel
            </Button>
          </div>
        )}
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          {seatLimit === null
            ? "Set a seat limit to require guests to sign in with their email."
            : "Guests sign in with their email on the room's sign-in screen."}
        </p>
      </div>

      {/* Add expected guest */}
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          Invite a guest by name
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addGuest();
              }
            }}
            placeholder="Guest name"
            aria-label="Guest name"
          />
          <Button type="button" size="sm" disabled={pending || !name.trim()} onClick={addGuest}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          They&rsquo;ll pick their name on sign-in and attach their own email.
        </p>
      </div>

      {/* Roster */}
      {members.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No guests yet. Add expected names above, or share the link and let them sign in.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {claimed.map((m) => (
            <MemberRow key={m.id} member={m} onRemove={remove} pending={pending} claimed />
          ))}
          {invited.map((m) => (
            <MemberRow key={m.id} member={m} onRemove={remove} pending={pending} claimed={false} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MemberRow({
  member,
  onRemove,
  pending,
  claimed,
}: {
  member: RoomMemberRow;
  onRemove: (id: string) => void;
  pending: boolean;
  claimed: boolean;
}) {
  return (
    <li className="flex items-start gap-2 rounded-md border border-[var(--border)] p-2.5">
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
          claimed ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-[var(--secondary)] text-[var(--muted-foreground)]"
        }`}
      >
        {claimed ? <Check className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {member.displayName ?? member.email ?? "Guest"}
          {member.roleLabel && (
            <span className="ml-1 text-xs font-normal text-[var(--muted-foreground)]">
              · {member.roleLabel}
            </span>
          )}
        </div>
        <div className="truncate text-xs text-[var(--muted-foreground)]">
          {claimed ? (
            <>
              {member.email}
              {member.lastViewedAt ? ` · last seen ${formatRelative(member.lastViewedAt)}` : ""}
            </>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> invited — not signed in yet
            </span>
          )}
        </div>
      </div>
      <ConfirmDialog
        title={claimed ? "Remove this guest?" : "Remove this invite?"}
        description={
          claimed
            ? "They'll lose access on their next visit unless they sign in again (and a seat is free)."
            : "The pre-added name will be removed from the sign-in list."
        }
        confirmLabel="Remove"
        destructive
        onConfirm={() => onRemove(member.id)}
        trigger={(open) => (
          <button
            type="button"
            onClick={open}
            disabled={pending}
            aria-label="Remove"
            className="mt-0.5 text-[var(--muted-foreground)] transition hover:text-[var(--destructive)]"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      />
    </li>
  );
}
