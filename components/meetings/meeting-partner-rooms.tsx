"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  CheckSquare,
  ChevronRight,
  DoorOpen,
  Eye,
  FileUp,
  Send,
  Sparkles,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { shareMeetingMinutesToRoom } from "@/app/(app)/meetings/actions";

type RoomSummary = {
  id: string;
  name: string;
  status: string;
  partnerKind: string | null;
  contactName: string | null;
  openSteps: number;
  uploads: number;
};

function statusVariant(status: string) {
  if (status === "active") return "success" as const;
  if (status === "paused" || status === "draft") return "warning" as const;
  if (status === "revoked") return "danger" as const;
  return "outline" as const;
}

export function MeetingPartnerRooms({
  rooms,
  meetingId,
  hasMinutes,
}: {
  rooms: RoomSummary[];
  meetingId?: string;
  hasMinutes?: boolean;
}) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (rooms.length === 0) return null;

  function share(roomId: string, mode: "raw" | "brief") {
    if (!meetingId) return;
    setBusy(roomId);
    startTransition(async () => {
      const res = await shareMeetingMinutesToRoom(meetingId, roomId, mode);
      setBusy(null);
      setOpenFor(null);
      if (res.ok) {
        toast.success(
          mode === "brief" && res.usedAi
            ? "Shared a client-brief of the minutes to the room"
            : "Shared the minutes to the room",
        );
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DoorOpen className="h-4 w-4" />
          Partner Rooms
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rooms.map((room) => (
          <div key={room.id} className="rounded-md border border-[var(--border)] p-2.5">
            <Link href={`/partner-access/rooms/${room.id}`} className="block hover:underline">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{room.name}</div>
                  {room.contactName && (
                    <div className="text-xs text-[var(--muted-foreground)]">{room.contactName}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant={statusVariant(room.status)}>{room.status}</Badge>
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                </div>
              </div>
            </Link>
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
              {room.openSteps > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  <CheckSquare className="h-2.5 w-2.5" />{room.openSteps} open
                </span>
              )}
              {room.uploads > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-[var(--secondary)] px-1.5 py-0.5">
                  <FileUp className="h-2.5 w-2.5" />{room.uploads} sent
                </span>
              )}
              <Link
                href={`/partner-access/rooms/${room.id}/preview`}
                target="_blank"
                className="ml-auto inline-flex items-center gap-1 hover:text-[var(--foreground)]"
              >
                <Eye className="h-2.5 w-2.5" /> Preview
              </Link>
            </div>

            {/* Share minutes — one click, with raw vs AI client-brief. */}
            {meetingId && hasMinutes && room.status !== "revoked" && (
              <div className="mt-2 border-t border-[var(--border)] pt-2">
                {openFor === room.id ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy === room.id}
                      onClick={() => share(room.id, "raw")}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-[var(--secondary)] disabled:opacity-50"
                    >
                      <FileText className="h-3 w-3" /> As-is
                    </button>
                    <button
                      type="button"
                      disabled={busy === room.id}
                      onClick={() => share(room.id, "brief")}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-[var(--secondary)] disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3" /> AI client-brief
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenFor(null)}
                      className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenFor(room.id)}
                    className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  >
                    <Send className="h-3 w-3" /> Share minutes
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
