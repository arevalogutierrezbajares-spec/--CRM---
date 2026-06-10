import Link from "next/link";
import { CheckSquare, ChevronRight, DoorOpen, Eye, FileUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

export function MeetingPartnerRooms({ rooms }: { rooms: RoomSummary[] }) {
  if (rooms.length === 0) return null;

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
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
